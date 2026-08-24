// W-ANN end-to-end floor-honesty check (PRE-REG bar N2, second clause).
//
//   cd web && NODE_OPTIONS=--conditions=react-server node --env-file=.env.local ../node_modules/tsx/dist/cli.mjs src/scripts/history-ann-e2e-check.mts
//
// READ-ONLY. Runs the SHIPPED searchHistory end-to-end on the pre-registered 12-probe set and
// verifies: (a) every probe now yields at least one result group (the RED state was the honest
// empty state for 6 of 12); (b) every section whose `matched` includes 'text' carries a real
// cosine >= HISTORY_TEXT_COSINE_FLOOR — the floor must judge the recovered rows, never wave
// them through. Cosines are recomputed with the same batch shape searchHistory itself uses.
import { getDb } from '../lib/db.js';
import { embedQuery } from '../lib/teacher/deepinfra.js';
import { searchHistory } from '../lib/history-search-db.js';
import { HISTORY_TEXT_COSINE_FLOOR } from '../lib/history-search.js';

const PROBES: string[] = [
  'the fall of Jerusalem in 70 AD',
  'the destruction of the second temple',
  'the siege of Masada',
  'the martyrdom of early Christians under Nero',
  'the conversion of Constantine',
  'the council of Nicaea and the Arian controversy',
  'the edict of Milan',
  'monasticism in the Egyptian desert',
  'the sack of Rome by the Visigoths',
  'Augustine of Hippo and his conversion',
  'the persecution of Christians under Diocletian',
  'the siege of Jerusalem by Titus',
];

const sql = getDb();
let failures = 0;
console.log(`floor=${HISTORY_TEXT_COSINE_FLOOR}`);
console.log('query | groups | sections | text_matched | min_text_cosine | verdict');

for (const q of PROBES) {
  const r = await searchHistory(q);
  const sections = r.results.flatMap((g) => g.sections);
  const textMatched = sections.filter((s) => s.matched.includes('text'));
  let minCos: number | null = null;
  if (textMatched.length > 0) {
    const vec = JSON.stringify(await embedQuery(q));
    const rows = (await sql.query(
      `SELECT he.section_id, 1 - (he.embedding <=> $1::vector) AS cosine
         FROM history_embeddings he WHERE he.section_id = ANY($2::bigint[])`,
      [vec, textMatched.map((s) => s.sectionId)],
    )) as { section_id: string; cosine: number }[];
    minCos = Math.min(...rows.map((x) => Number(x.cosine)));
  }
  const groupsOk = r.results.length > 0;
  const floorOk = minCos === null || minCos >= HISTORY_TEXT_COSINE_FLOOR;
  if (!groupsOk || !floorOk) failures += 1;
  console.log(
    `${JSON.stringify(q)} | ${r.results.length} | ${sections.length} | ${textMatched.length} | ${minCos === null ? '-' : minCos.toFixed(3)} | ${groupsOk && floorOk ? 'ok' : 'FAIL'}`,
  );
}
console.log(failures === 0 ? 'E2E PASS: all probes recover; every text-matched section is at/above the floor' : `E2E FAIL: ${failures} probe(s) failed`);
process.exit(failures === 0 ? 0 : 1);
