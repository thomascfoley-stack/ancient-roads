// History frozen-eval runner — HISTORY_RETRIEVAL_DESIGN §7, quality-slice §4-5.
//
//   cd web && node --env-file=.env.local node_modules/.bin/tsx src/scripts/history-eval-run.mts <label>
//
// The frozen set is HASH-VERIFIED AT RUNTIME (CLAUDE.md: "frozen eval sets actually hash-verified
// at runtime") — a drifted set refuses to run rather than quietly measuring something else.
// Output is written WHOLE to docs/evidence/history-eval/, never piped (the 2026-08-19 truncation
// lesson, twice paid).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { searchHistory } from '../lib/history-search-db.js';
import { getDb } from '../lib/db.js';

const label = process.argv[2] ?? 'run';
const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = path.join(ROOT, 'docs/evidence/history-eval');
const body = readFileSync(path.join(DIR, 'frozen-v1.json'), 'utf8');
const want = readFileSync(path.join(DIR, 'frozen-v1.sha256'), 'utf8').trim();
const got = createHash('sha256').update(body.replace(/\n$/, '')).digest('hex');
if (got !== want) {
  console.error(`STOP: frozen-v1.json sha256 ${got.slice(0, 16)}… != recorded ${want.slice(0, 16)}…. The set drifted; refusing to measure.`);
  process.exit(2);
}
interface Q { id: string; kind: string; query: string; expectEntity?: string; expectPeriod?: [number, number] }
const SET = JSON.parse(body) as { queries: Q[]; preRegisteredBars: Record<string, string> };

const lines: string[] = [];
const say = (s: string): void => { lines.push(s); console.log(s); };
say(`history frozen-v1 baseline — ${new Date().toISOString()} — set sha256 ${got.slice(0, 16)}…`);

const sql = getDb();
const tally = { control: [0, 0], entity: [0, 0], period: [0, 0], 'entity+period': [0, 0] } as Record<string, [number, number]>;

for (const q of SET.queries) {
  const r = await searchHistory(q.query);
  const ents = r.interpretation.entities.map((e) => e.slug);
  const per = r.interpretation.period;

  let entityOk: boolean | null = null;
  if (q.expectEntity) {
    // "top result group contains a section anchored to the expected entity" — checked against the
    // anchors table, not against the interpretation echoing itself.
    const top = r.results[0];
    let anchored = false;
    if (top) {
      const ids = top.sections.map((s) => s.sectionId);
      const hit = (await sql.query(
        `SELECT 1 FROM section_history_anchors WHERE section_id = ANY($1) AND entity_slug = $2 LIMIT 1`,
        [ids, q.expectEntity],
      )) as unknown[];
      anchored = hit.length > 0;
    }
    entityOk = ents.includes(q.expectEntity) && anchored;
  }
  const periodOk: boolean | null = q.expectPeriod
    ? per !== null && per.start === q.expectPeriod[0] && per.end === q.expectPeriod[1]
    : null;

  let pass: boolean;
  if (q.kind === 'control') pass = ents.length === 0 && per === null;
  else if (q.kind === 'entity') pass = entityOk === true;
  else if (q.kind === 'period') pass = periodOk === true;
  else pass = entityOk === true && periodOk === true;

  tally[q.kind]![1] += 1;
  if (pass) tally[q.kind]![0] += 1;
  say(`  ${pass ? '✓' : '✗'} [${q.kind.padEnd(13)}] ${q.id}  entities=[${ents.join(',')}] period=${per ? `${per.start}..${per.end}` : '-'} groups=${r.results.length}  — ${q.query}`);
}

say('\nkind            pass/n   pre-registered bar');
say(`  control       ${tally.control[0]}/${tally.control[1]}      4/4 zero-match (no noise argument)`);
say(`  entity        ${tally.entity[0]}/${tally.entity[1]}      >=6/8`);
say(`  period        ${tally.period[0]}/${tally.period[1]}      4/4 exact parse`);
say(`  entity+period ${tally['entity+period']![0]}/${tally['entity+period']![1]}      >=3/4`);
const holds = tally.control[0] === tally.control[1] && tally.entity[0] >= 6 && tally.period[0] === tally.period[1] && tally['entity+period']![0] >= 3;
say(`\nBARS ${holds ? 'HOLD' : 'BREACHED'}`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(DIR, `${label}-${stamp}.log`);
writeFileSync(out, `${lines.join('\n')}\n`);
say(`\nwritten whole: ${out}`);
process.exit(holds ? 0 : 1);
