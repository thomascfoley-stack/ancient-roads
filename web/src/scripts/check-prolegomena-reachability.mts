// RIGOR CHECK (owner-required, work order Part 1 ruling 2): before suppressing the
// 95 Schaff-Prolegomena rows from the served pool, prove whether any FROZEN v4
// held-out query resolves into them. If none do, the suppression cannot move any
// v4 number and no held-out re-measure is required. If any do, STOP and report.
//
//   cd web && npx tsx --env-file=.env.local src/scripts/check-prolegomena-reachability.mts
//
// READ-ONLY. Runs the SHIPPED base-pool path (legalBasePool -> LEGAL_CORPUS_FILTER),
// not a lookalike, so the answer describes what production actually retrieves.
//
// Why the base pool and not the scored eval: the question is reachability into the
// CANDIDATE POOL, which is strictly wider than the scored top-K. If a row cannot
// enter the pool it cannot enter any downstream stage (rerank, diversity, floor),
// so a clean base pool is the STRONGER negative result.
//
// The target rows: metadata->>'work'='chrysostom-homilies' AND the writer's source
// section number <= 16 (source_id "father:chrysostom-homilies:<sec>[.<chunk>]").
// Sections 1-16 are Philip Schaff's Prolegomena (NPNF volume front matter);
// section 17+ is Chrysostom's own Homily 1 onward. See ADR-029.

import { neon } from '@neondatabase/serverless';
import { legalBasePool, CANDIDATE_POOL, HNSW_EF_SEARCH } from '../lib/teacher/routing';
import { FROZEN_V4 } from './heldout-v4-queries.mjs';

const apiKey = process.env.DEEPINFRA_API_KEY;
if (!apiKey) throw new Error('DEEPINFRA_API_KEY required (query embedding)');
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));

const PROLEGOMENA_MAX_SECTION = 16;

// Round 2 (--comparative-table): the SAME question for chrysostom's "Comparative Table of the
// Works of St. Chrysostom in the American and in Migne's Editions" — 6 rows of editor's
// edition-concordance (page ranges across two printings) stamped with Chrysostom's name.
// These are the ONLY rows in the round-2 suppression that sit inside the exegetical pool the
// frozen v4 eval measures, so they are the only ones that could owe a re-measure.
const COMPARATIVE_TABLE_RE = /Comparative Table of the Works/i;
const MODE_COMPARATIVE = process.argv.includes('--comparative-table');

/** True iff this source_id is one of the 95 Schaff-Prolegomena rows. */
function isProlegomena(sourceId: string): boolean {
  // "father:chrysostom-homilies:<sec>[.<chunk>]"
  const parts = sourceId.split(':');
  if (parts.length < 3 || parts[1] !== 'chrysostom-homilies') return false;
  const sec = Number(parts[2]!.split('.')[0]);
  return Number.isFinite(sec) && sec <= PROLEGOMENA_MAX_SECTION;
}

/** True iff this pool row is one of the 6 Comparative-Table rows (matched on its heading,
 *  the same key the round-2 suppression deletes by). */
function isComparativeTable(row: { source_id: string; metadata: unknown }): boolean {
  if (!row.source_id.includes('chrysostom-homilies')) return false;
  const h = (row.metadata as { heading?: string } | null)?.heading ?? '';
  return COMPARATIVE_TABLE_RE.test(h);
}

const isTarget = MODE_COMPARATIVE
  ? (r: { source_id: string; metadata: unknown }) => isComparativeTable(r)
  : (r: { source_id: string; metadata: unknown }) => isProlegomena(r.source_id);

async function embed(text: string): Promise<string> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'BAAI/bge-large-en-v1.5',
      input: [text.slice(0, 1800)],
      encoding_format: 'float',
    }),
  });
  if (!res.ok) throw new Error(`embed failed ${res.status}: ${await res.text()}`);
  return `[${((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding.join(',')}]`;
}

async function main() {
  // Sanity: the target set must be non-empty, or a clean result is meaningless
  // (a check that cannot fail proves nothing — false-confidence-audit rule).
  const target = MODE_COMPARATIVE
    ? ((await sql.query(
        `SELECT COUNT(*)::int AS n FROM embeddings
          WHERE user_id IS NULL AND metadata->>'work'='chrysostom-homilies'
            AND metadata->>'heading' ~* 'Comparative Table of the Works'`,
      )) as Array<{ n: number }>)
    : ((await sql.query(
        `SELECT COUNT(*)::int AS n FROM embeddings
          WHERE user_id IS NULL AND metadata->>'work'='chrysostom-homilies'
            AND split_part(split_part(source_id,':',3),'.',1)::int <= $1`,
        [PROLEGOMENA_MAX_SECTION],
      )) as Array<{ n: number }>);
  const targetCount = target[0]!.n;
  console.log(MODE_COMPARATIVE
    ? `target rows (Comparative Table of the Works, by heading): ${targetCount}`
    : `target rows (Schaff Prolegomena, sections 1-${PROLEGOMENA_MAX_SECTION}): ${targetCount}`);
  if (targetCount === 0) throw new Error('target set is EMPTY — the check would pass vacuously; abort');

  // Positive control: prove the detector fires. Embed text taken from the target itself;
  // if THAT does not surface a target row, the check is blind and a clean run over v4 would
  // be meaningless.
  const controlText = MODE_COMPARATIVE
    ? 'Comparative Table of the Works of St. Chrysostom in the American and in Migne\'s Editions. '
      + 'Anglo-american edition, Græco-latin edition, Homily concerning Lowliness of Mind, pages 145-155.'
    : 'Prolegomena. The Life and Work of St. John Chrysostom by Philip Schaff. '
      + 'Editions of Chrysostom\'s works, the Benedictine edition reprinted at Venice, Migne Patrologia Graeca.';
  const controlPool = await legalBasePool(sql, await embed(controlText), CANDIDATE_POOL, HNSW_EF_SEARCH);
  const controlHits = controlPool.filter((r) => isTarget(r));
  console.log(`positive control: ${controlHits.length} target row(s) in a ${controlPool.length}-row pool`
    + (controlHits[0] ? ` (top hit ${controlHits[0].source_id} score=${controlHits[0].score.toFixed(4)})` : ''));
  if (controlHits.length === 0) {
    throw new Error('POSITIVE CONTROL FAILED — detector never fires, so a clean v4 run proves nothing; abort');
  }

  // The actual question: does any FROZEN v4 query reach them?
  console.log(`\nrunning ${FROZEN_V4.length} FROZEN_V4 queries through legalBasePool `
    + `(pool=${CANDIDATE_POOL}, ef_search=${HNSW_EF_SEARCH})…\n`);

  const hits: Array<{ id: string; cat: string; query: string; sourceId: string; rank: number; score: number }> = [];
  let poolRowsScanned = 0;

  for (const q of FROZEN_V4) {
    const pool = await legalBasePool(sql, await embed(q.query), CANDIDATE_POOL, HNSW_EF_SEARCH);
    poolRowsScanned += pool.length;
    pool.forEach((r, i) => {
      if (isTarget(r)) {
        hits.push({ id: q.id, cat: q.cat, query: q.query, sourceId: r.source_id, rank: i + 1, score: r.score });
      }
    });
  }

  console.log(`queries run:        ${FROZEN_V4.length}`);
  console.log(`pool rows scanned:  ${poolRowsScanned}`);
  console.log(`target hits:        ${hits.length}`);

  if (hits.length === 0) {
    console.log(`\n✓ CLEAN — no FROZEN v4 query reaches any of the ${targetCount} target rows.`);
    console.log('  Suppressing them cannot change any v4 number, so NO held-out re-measure is required.');
  } else {
    console.log('\n✗ REACHABLE — these v4 queries pull target rows into the candidate pool:');
    for (const h of hits) {
      console.log(`   ${h.id} [${h.cat}] rank=${h.rank} score=${h.score.toFixed(4)} ${h.sourceId}`);
      console.log(`      query: ${h.query}`);
    }
    console.log('\n  A held-out re-measure IS required. STOP and report to the owner before suppressing.');
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
