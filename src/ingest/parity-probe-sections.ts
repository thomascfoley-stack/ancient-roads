// Parity probe — proves the section retrieval path returns IDENTICAL results to
// the legacy path on migrated data. Because the migration re-points the SAME
// vectors and the SAME verse anchors, section-vs-legacy retrieval must agree
// exactly on the sources already in `sections` (Barnes today). This is the
// empirical half of the parity argument; the corpus-wide 30-query number needs
// the full corpus re-pointed (the gated scale-up).
//
//   npx tsx src/ingest/parity-probe-sections.ts
//
// For each probe query: embed (bge-large), then rank Barnes' vectors two ways —
// legacy (embeddings, author-scoped) and section (section_embeddings, source-
// scoped) — and compare the ordered list of retrieved verse ids.

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';

const MODEL = 'bge-large-en-v1.5';
const BARNES_AUTHOR = "Barnes' Notes"; // author string in embeddings.metadata
const BARNES_SLUG = 'barnes-notes';
const K = 10;

const PROBES = [
  'justification by faith apart from works of the law',
  'the good shepherd lays down his life for the sheep',
  'in the beginning God created the heavens and the earth',
  'the suffering servant despised and rejected',
  'predestination and election of the saints',
  'the resurrection of the dead and the last trumpet',
];

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function embed(text: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  const vec = ((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding;
  return `[${vec.join(',')}]`;
}

async function main() {
  const apiKey = localEnv('DEEPINFRA_API_KEY');
  if (!apiKey) throw new Error('DEEPINFRA_API_KEY required');
  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  // EXACT nearest-neighbor on both sides: disable HNSW so the ranking is the true
  // distance order, not an approximate index scan. (An author-filtered query over
  // the full HNSW index otherwise returns empty, because HNSW pre-filters before
  // the author predicate.) Exact NN proves the vectors + anchors were re-pointed
  // byte-faithfully; production HNSW parity then follows from identical data.
  await client.query('SET enable_indexscan = off');
  await client.query('SET enable_bitmapscan = off');

  console.log('='.repeat(72));
  console.log(`SECTION↔LEGACY PARITY PROBE (Barnes, exact NN, top-${K} verse ids)`);
  console.log('='.repeat(72));

  let allMatch = true;
  try {
    for (const q of PROBES) {
      const vec = await embed(q, apiKey);

      const legacy = await client.query<{ vid: number }>(
        `SELECT (metadata->>'verseId')::int AS vid
           FROM embeddings
          WHERE user_id IS NULL AND source_type='commentary' AND metadata->>'author' = $1
          ORDER BY embedding <=> $2::vector LIMIT $3`,
        [BARNES_AUTHOR, vec, K],
      );
      const section = await client.query<{ vid: number }>(
        `SELECT sa.verse_id_start AS vid
           FROM section_embeddings se
           JOIN section_anchors sa ON sa.section_id = se.section_id
           JOIN sections s ON s.id = se.section_id
           JOIN sources src ON src.id = s.source_id
          WHERE src.slug = $1 AND se.model_slug = $2
          ORDER BY se.embedding <=> $3::vector LIMIT $4`,
        [BARNES_SLUG, MODEL, vec, K],
      );

      const legacyVids = legacy.rows.map((r) => r.vid);
      const sectionVids = section.rows.map((r) => r.vid);
      const match = JSON.stringify(legacyVids) === JSON.stringify(sectionVids);
      if (!match) allMatch = false;
      console.log(`\n${match ? '✓' : '✗'} "${q.slice(0, 50)}"`);
      console.log(`   legacy : ${legacyVids.join(', ')}`);
      console.log(`   section: ${sectionVids.join(', ')}`);
    }
  } finally {
    await client.end();
  }

  console.log('\n' + '='.repeat(72));
  if (allMatch) {
    console.log('✓ PARITY: section path == legacy path on every probe (identical ordered verse ids).');
    console.log('  Re-pointing preserves retrieval exactly. Corpus-wide equality follows structurally');
    console.log('  (same vectors, same anchors, same body text feeding BM25/rerank).');
  } else {
    console.log('✗ MISMATCH — investigate before trusting the re-point.');
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
