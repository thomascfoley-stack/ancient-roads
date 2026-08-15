// B2 measurement (plan 2026-08-13): where do the seconds go in /ask?
// Drives the REAL teach() — embed → retrieve → lanes → compose → verify → retry — against the
// dev database and the live providers, and prints one row per ask with the B1 stage timings.
// Cold start is measured by the module-level counter inside teach.ts (first ask in a process).
//
// Run (from web/, and note BOTH env files — the DB url is the repo root's, the provider key is
// web's — and that .env.local quotes its values, so strip the quotes):
//   NODE_OPTIONS=--conditions=react-server npx tsx src/scripts/measure-ask-stages.mts
// The condition flag is required: teach.ts imports `server-only`, which throws outside Next
// unless the react-server export condition is on.
//
// WHAT THIS DOES NOT MEASURE: production. This runs one long-lived local process against the
// dev database; production is serverless over a much larger corpus, and the only prod datapoint
// this repo carries (C2, 2026-08-07) is an order of magnitude slower. Label any result from
// this harness with the environment it ran in.
import { teach } from '@/lib/teacher/teach';

type Row = {
  n: number; q: string; category: string; kind: string; coldStart: boolean;
  totalMs: number; embed: number; retrieve: number; lanes: number;
  compose: number[]; verify: number[]; attempts: number;
};

// 10 questions, the plan's mix: 4 verse-ref, 3 topical, 3 pericope.
const QUESTIONS: Array<{ q: string; category: string }> = [
  { q: 'What does John 3:16 mean?', category: 'verse-ref' },
  { q: 'Explain Romans 8:28', category: 'verse-ref' },
  { q: 'What is said about Psalm 23:1?', category: 'verse-ref' },
  { q: 'Commentary on Genesis 1:1', category: 'verse-ref' },
  { q: 'What is justification by faith?', category: 'topical' },
  { q: 'What does Scripture teach about prayer?', category: 'topical' },
  { q: 'What is the doctrine of the atonement?', category: 'topical' },
  { q: 'What happens in the Sermon on the Mount?', category: 'pericope' },
  { q: 'Explain the parable of the prodigal son', category: 'pericope' },
  { q: 'What happens at the raising of Lazarus?', category: 'pericope' },
];

const rows: Row[] = [];

for (const [i, { q, category }] of QUESTIONS.entries()) {
  const t0 = Date.now();
  const { result, meta } = await teach(q);
  const wall = Date.now() - t0;
  const s = meta.stageMs;
  rows.push({
    n: i + 1, q, category, kind: result.kind, coldStart: meta.coldStart ?? false,
    totalMs: s?.total ?? wall, embed: s?.embed ?? -1, retrieve: s?.retrieve ?? -1,
    lanes: s?.lanes ?? -1, compose: s?.compose ?? [], verify: s?.verify ?? [],
    attempts: meta.attempts,
  });
  const r = rows[rows.length - 1]!;
  console.log(
    `${String(r.n).padStart(2)} ${r.category.padEnd(10)} ${r.kind.padEnd(9)} ` +
      `total=${(r.totalMs / 1000).toFixed(1)}s embed=${r.embed} retrieve=${r.retrieve} ` +
      `lanes=${r.lanes} compose=[${r.compose.join(',')}] verify=[${r.verify.join(',')}] ` +
      `attempts=${r.attempts}${r.coldStart ? ' COLD' : ''}`,
  );
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

const totals = rows.map((r) => r.totalMs);
const composeTotals = rows.map((r) => sum(r.compose));
const verifyTotals = rows.map((r) => sum(r.verify));
const retrieveTotals = rows.map((r) => r.retrieve);
const embedTotals = rows.map((r) => r.embed);
const laneTotals = rows.map((r) => r.lanes);
const grand = sum(totals);

console.log('\n=== AGGREGATE (n=%d) ===', rows.length);
console.log(`total     p50=${(median(totals) / 1000).toFixed(1)}s  max=${(Math.max(...totals) / 1000).toFixed(1)}s`);
console.log(`embed     p50=${median(embedTotals)}ms   share=${pct(sum(embedTotals), grand)}`);
console.log(`retrieve  p50=${median(retrieveTotals)}ms   share=${pct(sum(retrieveTotals), grand)}`);
console.log(`lanes     p50=${median(laneTotals)}ms   share=${pct(sum(laneTotals), grand)}`);
console.log(`compose   p50=${median(composeTotals)}ms   share=${pct(sum(composeTotals), grand)}`);
console.log(`verify    p50=${median(verifyTotals)}ms   share=${pct(sum(verifyTotals), grand)}`);
console.log(`\nPRE-REGISTERED RULE 1 — compose+verify share of total: ${pct(sum(composeTotals) + sum(verifyTotals), grand)} (trigger at 60%)`);
console.log(`PRE-REGISTERED RULE 2 — retrieve p50: ${(median(retrieveTotals) / 1000).toFixed(1)}s (trigger at 15s)`);
console.log(`\nJSON ${JSON.stringify(rows)}`);
