// Gate A — Corpus coverage (completeness). FAIL LOUD.
//
//   npx tsx src/ingest/check-corpus-coverage.ts                    (or: pnpm check:coverage)
//   npx tsx src/ingest/check-corpus-coverage.ts --target=sections  (or: pnpm check:coverage:sections)
//
// The corpus must be COMPLETELY embedded — no silent gap. This is the check that
// would have caught the 47k-row embedding loss: every eligible unit must have a
// matching embedding row. Two targets during the sources/sections migration
// (dual-read): the legacy commentary_entries/embeddings corpus, and the new
// sections/section_embeddings model (--target=sections). Run after every ingest
// batch and as the final publish gate; a source is not complete until its gap is 0.
//
// Ground truth = Neon, queried directly. Read-only (no writes). Exits non-zero
// with a per-source breakdown when anything is missing, so it can gate an
// unattended ingest run.

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { BOOK_SLUGS, MIN_BODY_LENGTH, synthesizeSourceId } from './source-id.js';

// The pinned section-embedding model (ADR-005) — must match what the re-point
// backfill writes to section_embeddings.model_slug.
const SECTIONS_MODEL_SLUG = 'bge-large-en-v1.5';

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

interface EntryRow {
  book: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  author: string;
}

export interface CoverageResult {
  target: 'commentary' | 'sections';
  missing: number;
  perSource: Array<{ source: string; missing: number }>;
}

// Legacy target: commentary_entries vs embeddings (the current live retrieval corpus).
export async function checkCommentary(client: pg.Client): Promise<CoverageResult> {
  // Covered set: every commentary source_id that has an embedding.
  const { rows: emb } = await client.query<{ source_id: string }>(
    `SELECT source_id FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary'`,
  );
  const embedded = new Set(emb.map((r) => r.source_id));

  // Target set: every eligible entry's synthesized source_id (collapsed to
  // unique keys — a source_id is covered if ANY of its rows is embedded).
  const { rows: entries } = await client.query<EntryRow>(
    `SELECT book, chapter, verse_start, verse_end, author
     FROM commentary_entries WHERE length(body) >= $1`,
    [MIN_BODY_LENGTH],
  );

  const targetAuthor = new Map<string, string>(); // source_id -> author
  let noSlug = 0;
  for (const r of entries) {
    const sid = synthesizeSourceId(r);
    if (sid === null) { noSlug++; continue; }
    targetAuthor.set(sid, r.author);
  }

  // Anti-join: target keys with no embedding.
  const missingByAuthor = new Map<string, number>();
  let missing = 0;
  for (const [sid, author] of targetAuthor) {
    if (!embedded.has(sid)) {
      missing++;
      missingByAuthor.set(author, (missingByAuthor.get(author) ?? 0) + 1);
    }
  }

  console.log('='.repeat(70));
  console.log('GATE A — CORPUS COVERAGE (commentary_entries; source of truth: Neon)');
  console.log('='.repeat(70));
  console.log(`Book-slug map entries:                            ${Object.keys(BOOK_SLUGS).length}`);
  console.log(`Eligible entries (body >= ${MIN_BODY_LENGTH}):              ${entries.length}`);
  console.log(`  (rows with no book-slug mapping, skipped:       ${noSlug})`);
  console.log(`Unique target source_ids:                         ${targetAuthor.size}`);
  console.log(`Embedded commentary source_ids (in DB):           ${embedded.size}`);
  console.log(`MISSING source_ids:                               ${missing}`);

  const ranked = [...missingByAuthor.entries()].sort((a, b) => b[1] - a[1]);
  if (missing > 0) {
    console.log('');
    console.log('Per-source (author) missing counts:');
    for (const [author, n] of ranked) {
      console.log(`  ${String(n).padStart(7)}  ${author}`);
    }
    console.log('');
    console.error(`✗ GATE A FAILED: ${missing} eligible source_ids are not embedded.`);
    console.error('  Do NOT publish / mark this corpus complete. Re-run the embed job to fill the gap.');
  } else {
    console.log('');
    console.log('✓ GATE A PASSED: every eligible source_id is embedded (gap = 0).');
  }
  return { target: 'commentary', missing, perSource: ranked.map(([source, n]) => ({ source, missing: n })) };
}

// New target (--target=sections): sections vs section_embeddings, per source.
// A section of a non-quarantined source with no matching-model embedding is a gap
// (checked while 'staged' too, so completeness is proven BEFORE publish).
export async function checkSections(client: pg.Client): Promise<CoverageResult> {
  const { rows: missing } = await client.query<{ slug: string; missing: number }>(
    `SELECT src.slug, count(*)::int AS missing
       FROM sections s
       JOIN sources src ON src.id = s.source_id AND src.status <> 'quarantined'
       LEFT JOIN section_embeddings e ON e.section_id = s.id AND e.model_slug = $1
      WHERE e.section_id IS NULL
      GROUP BY src.slug ORDER BY missing DESC`,
    [SECTIONS_MODEL_SLUG],
  );
  const { rows: tot } = await client.query<{ sources: string; sections: string; embeddings: string }>(
    `SELECT (SELECT count(*) FROM sources WHERE status <> 'quarantined') AS sources,
            (SELECT count(*) FROM sections s JOIN sources src ON src.id = s.source_id AND src.status <> 'quarantined') AS sections,
            (SELECT count(*) FROM section_embeddings WHERE model_slug = $1) AS embeddings`,
    [SECTIONS_MODEL_SLUG],
  );

  const totalMissing = missing.reduce((a, m) => a + m.missing, 0);
  console.log('='.repeat(70));
  console.log('GATE A — SECTION COVERAGE (sources/sections; source of truth: Neon)');
  console.log('='.repeat(70));
  console.log(`Model slug:                                       ${SECTIONS_MODEL_SLUG}`);
  console.log(`Non-quarantined sources:                          ${tot[0]!.sources}`);
  console.log(`Sections (non-quarantined sources):               ${tot[0]!.sections}`);
  console.log(`Section embeddings (this model):                  ${tot[0]!.embeddings}`);
  console.log(`MISSING (sections with no embedding):             ${totalMissing}`);

  if (totalMissing > 0) {
    console.log('');
    console.log('Per-source missing counts:');
    for (const m of missing) console.log(`  ${String(m.missing).padStart(7)}  ${m.slug}`);
    console.log('');
    console.error(`✗ GATE A (sections) FAILED: ${totalMissing} sections have no ${SECTIONS_MODEL_SLUG} embedding.`);
    console.error('  Do NOT publish these sources. Re-point/re-embed to fill the gap.');
  } else {
    console.log('');
    console.log('✓ GATE A (sections) PASSED: every non-quarantined section is embedded (gap = 0).');
  }
  return { target: 'sections', missing: totalMissing, perSource: missing.map((m) => ({ source: m.slug, missing: m.missing })) };
}

async function main() {
  const target = process.argv.includes('--target=sections') ? 'sections' : 'commentary';
  const dbUrl = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
  if (!dbUrl) throw new Error('DATABASE_URL is required (set it in the env or web/.env.local)');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const result = target === 'sections' ? await checkSections(client) : await checkCommentary(client);
    if (result.missing > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

// Runnable gate when invoked directly; importable (checkCommentary/checkSections) from gate-ingest.
if (process.argv[1] && /check-corpus-coverage/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
