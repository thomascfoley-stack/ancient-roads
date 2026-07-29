// Read-only diagnostic: measure the embedding-coverage gap against the real
// schema (commentary_entries → synthesized source_id → embeddings), and bucket
// the missing set by body length as a first-pass proxy for token size.
//
//   npx tsx src/ingest/measure-embedding-gap.ts
//
// Ground truth = Neon, queried directly. No writes.

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { MIN_BODY_LENGTH, synthesizeSourceId } from './source-id.js';

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function main() {
  const dbUrl = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
  if (!dbUrl) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  // 1. Embedded source_ids (the covered set).
  const { rows: emb } = await client.query(
    `SELECT source_id FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary'`,
  );
  const embedded = new Set(emb.map((r: { source_id: string }) => r.source_id));

  // 2. All eligible entries; compute the source_id the job would synthesize.
  const { rows: entries } = await client.query(
    `SELECT book, chapter, verse_start, verse_end, author, length(body) AS len
     FROM commentary_entries WHERE length(body) >= $1`,
    [MIN_BODY_LENGTH],
  );

  // 3. Collapse to unique target source_ids; a source_id is covered if ANY of
  //    its (entry_index-collapsed) rows is embedded.
  const targetLen = new Map<string, number>(); // source_id -> max body len among its rows
  let noSlug = 0;
  for (const r of entries) {
    const sid = synthesizeSourceId(r);
    if (sid === null) { noSlug++; continue; }
    targetLen.set(sid, Math.max(targetLen.get(sid) ?? 0, Number(r.len)));
  }

  const missing: { sid: string; len: number }[] = [];
  for (const [sid, len] of targetLen) {
    if (!embedded.has(sid)) missing.push({ sid, len });
  }

  // 4. Bucket missing by body length (proxy for token size; the singleton
  //    probe in the fix will give the authoritative >512-token split).
  const buckets = [
    { label: '<=1000 chars (truncated to full budget — should NOT fail on tokens)', lo: 0, hi: 1000 },
    { label: '1001-2000', lo: 1001, hi: 2000 },
    { label: '2001-4000', lo: 2001, hi: 4000 },
    { label: '4001-8000', lo: 4001, hi: 8000 },
    { label: '>8000', lo: 8001, hi: Infinity },
  ];
  const counts = buckets.map((b) => missing.filter((m) => m.len >= b.lo && m.len <= b.hi).length);

  console.log('='.repeat(70));
  console.log('EMBEDDING COVERAGE GAP (source of truth: Neon)');
  console.log('='.repeat(70));
  console.log(`Eligible entries (body >= ${MIN_BODY_LENGTH}):   ${entries.length}`);
  console.log(`  (rows with no book-slug mapping, skipped: ${noSlug})`);
  console.log(`Unique target source_ids (entry_index collapse): ${targetLen.size}`);
  console.log(`Embedded source_ids (in DB):                     ${embedded.size}`);
  console.log(`MISSING source_ids:                              ${missing.length}`);
  console.log('');
  console.log('Missing, bucketed by max body length (token-size proxy):');
  buckets.forEach((b, i) => console.log(`  ${String(counts[i]).padStart(7)}  ${b.label}`));
  console.log('');
  console.log('Interpretation: missing entries whose max body <= ~1000 chars are');
  console.log('almost certainly COLLATERAL (killed by a poisoned batch, not oversized).');
  console.log('Longer ones are candidate CULPRITS — the singleton probe confirms.');

  // ── verse-key pathology (§2, 2026-07-13) ──────────────────────────────────
  // CAUTION: the "MISSING source_ids" number above is NOT a teacher-coverage gap.
  // The embeddings for Barnes/Wesley/Calvin come from a SEPARATE crosswire (SWORD)
  // ingest ("Albert Barnes", per-verse keyed, NT-only), while commentary_entries
  // holds a DISJOINT biblehub ingest ("Barnes' Notes", whole-Bible, verse_start=
  // chapter). Different author strings + different keys ⇒ they never join, so this
  // tool reports the biblehub rows as "missing" even though the teacher is served
  // by the crosswire vectors. Do NOT read the gap as "N% of retrieval is missing".
  // The real defect the flag below surfaces is a SEARCH/READER citation bug (the
  // biblehub rows carry verse_start=chapter). See docs/CORPUS_VERSE_KEY_REPAIR.md.
  const { rows: patho } = await client.query(
    `SELECT author,
            count(*)::int AS entries,
            sum(CASE WHEN verse_start = chapter THEN 1 ELSE 0 END)::int AS vs_eq_chapter
     FROM commentary_entries
     WHERE length(body) >= $1 AND book BETWEEN 1 AND 66
     GROUP BY author
     HAVING sum(CASE WHEN verse_start = chapter THEN 1 ELSE 0 END) > count(*) / 2
     ORDER BY entries DESC`,
    [MIN_BODY_LENGTH],
  );
  if (patho.length) {
    console.log('');
    console.log('⚠️  verse_start = chapter (biblehub verse-key DATA BUG — SEARCH/reader mis-cites the verse):');
    for (const p of patho as { author: string; entries: number; vs_eq_chapter: number }[]) {
      console.log(`     ${p.author.padEnd(24)} ${p.vs_eq_chapter}/${p.entries} entries keyed to verse=chapter`);
    }
    console.log('     → fix per docs/CORPUS_VERSE_KEY_REPAIR.md (repair verse_start; teacher vectors are a separate, correctly-keyed crosswire ingest).');
  }

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
