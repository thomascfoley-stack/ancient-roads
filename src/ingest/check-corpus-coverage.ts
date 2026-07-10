// Gate A — Corpus coverage (completeness). FAIL LOUD.
//
//   npx tsx src/ingest/check-corpus-coverage.ts        (or: pnpm check:coverage)
//
// The corpus must be COMPLETELY embedded — no silent gap. This is the check that
// would have caught the 47k-row embedding loss: every eligible commentary entry
// must have a matching row in `embeddings`. Run it after every ingest batch and
// as the final publish gate; a source is not complete until its gap is 0.
//
// Ground truth = Neon, queried directly. Read-only (no writes). Exits non-zero
// with a per-source (per-author) breakdown when anything is missing, so it can
// gate an unattended ingest run.

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { BOOK_SLUGS, MIN_BODY_LENGTH, synthesizeSourceId } from './source-id.js';

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

async function main() {
  const dbUrl = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
  if (!dbUrl) throw new Error('DATABASE_URL is required (set it in the env or web/.env.local)');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
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
    console.log('GATE A — CORPUS COVERAGE (source of truth: Neon)');
    console.log('='.repeat(70));
    console.log(`Book-slug map entries:                            ${Object.keys(BOOK_SLUGS).length}`);
    console.log(`Eligible entries (body >= ${MIN_BODY_LENGTH}):              ${entries.length}`);
    console.log(`  (rows with no book-slug mapping, skipped:       ${noSlug})`);
    console.log(`Unique target source_ids:                         ${targetAuthor.size}`);
    console.log(`Embedded commentary source_ids (in DB):           ${embedded.size}`);
    console.log(`MISSING source_ids:                               ${missing}`);

    if (missing > 0) {
      console.log('');
      console.log('Per-source (author) missing counts:');
      const ranked = [...missingByAuthor.entries()].sort((a, b) => b[1] - a[1]);
      for (const [author, n] of ranked) {
        console.log(`  ${String(n).padStart(7)}  ${author}`);
      }
      console.log('');
      console.error(`\u2717 GATE A FAILED: ${missing} eligible source_ids are not embedded.`);
      console.error('  Do NOT publish / mark this corpus complete. Re-run the embed job to fill the gap.');
      process.exitCode = 1;
      return;
    }

    console.log('');
    console.log('\u2713 GATE A PASSED: every eligible source_id is embedded (gap = 0).');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
