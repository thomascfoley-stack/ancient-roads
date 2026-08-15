// STEP 2 of the PM verdict (2026-08-15): count the failure codes, with a denominator that
// matches what the instrument actually records.
//
// WHAT THIS FIXES, precisely. The design doc's table reported codes as "most common / present /
// present" — adjectives over a JSON that carried the counts — under a stated denominator ("all 25
// asks' rejected attempts", 23 of them) that no cell counted, because the old instrument recorded
// ONE code per QUESTION from its FIRST rejected attempt only (13 codes). Three defects: unused
// counts, a denominator the instrument could not see, and a bundling that hid the second-strongest
// signal. This tool exists so none of the three can recur:
//
//   1. It COUNTS. No adjectives.
//   2. It prints EVERY denominator it uses, and never mixes them silently: attempts, violations,
//      and questions are three different populations and are reported as three different tables.
//   3. It aggregates over REPEATED asks of the same question, because the v1 counterfactual
//      measured per-question codes to be UNSTABLE run-to-run (the same question drew
//      anchor_offbase once and schema another time). One code per question would be coding noise.
//
// INPUT: newline-delimited JSON `ask_outcome` log lines (the shape ask-outcome-log.ts emits), or
// the counterfactual/bait run JSON. Reads stdin or a file path argv[2].
//
//   npx tsx src/scripts/failure-code-census.mts <path-to-jsonl-or-json>
//
// It deliberately does NOT recommend a fix. Per the verdict, step 3 is a separate proposal
// written against these counts.

import { readFileSync } from 'node:fs';

type Violation = { check: string; message?: string; span?: string };
type Rejection = { attempt: number; violations: Violation[] };
type Record_ = { question?: string; q?: string; rejections?: Rejection[]; rejectionDetail?: string; kind?: string };

const path = process.argv[2];
const raw = path ? readFileSync(path, 'utf8') : readFileSync(0, 'utf8');

// Accept either a JSON array or NDJSON of log lines.
const records: Record_[] = (() => {
  const t = raw.trim();
  if (t.startsWith('[')) return JSON.parse(t) as Record_[];
  return t.split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line) as Record_]; } catch { return []; }
  });
})();

// Normalize: rejectionDetail is the JSON-string form the production log emits.
const rows = records.map((r) => {
  let rejections: Rejection[] = r.rejections ?? [];
  if (rejections.length === 0 && typeof r.rejectionDetail === 'string') {
    try { rejections = JSON.parse(r.rejectionDetail) as Rejection[]; } catch { /* leave empty */ }
  }
  return { question: r.question ?? r.q ?? '(unknown)', kind: r.kind, rejections };
});

const withRejections = rows.filter((r) => r.rejections.length > 0);
const allAttempts = withRejections.flatMap((r) => r.rejections);
const allViolations = allAttempts.flatMap((a) => a.violations);

console.log('=== FAILURE-CODE CENSUS (verdict step 2) ===\n');
console.log('DENOMINATORS — three different populations, never mixed:');
console.log(`  asks recorded                : ${rows.length}`);
console.log(`  asks with >=1 rejection      : ${withRejections.length}`);
console.log(`  REJECTED ATTEMPTS            : ${allAttempts.length}   <- the honest denominator for "how often does a check fire"`);
console.log(`  individual VIOLATIONS        : ${allViolations.length}   <- one attempt can carry many`);

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);
const tally = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

// TABLE 1 — per rejected ATTEMPT, counting each check at most once per attempt. This is the
// "why did this attempt fail" view and the one a fix should be scoped by.
console.log(`\n--- Table 1: checks per REJECTED ATTEMPT (denominator ${allAttempts.length}) ---`);
console.log('    a check is counted once per attempt even if it fires many times in it');
const perAttempt = tally(allAttempts.flatMap((a) => [...new Set(a.violations.map((v) => v.check))]));
for (const [check, n] of perAttempt) console.log(`  ${String(n).padStart(4)}  ${pct(n, allAttempts.length).padStart(6)}  ${check}`);

// TABLE 2 — raw violation instances. Diverges from table 1 exactly when a single attempt emits
// the same check repeatedly, which is itself a signal (see the note printed below).
console.log(`\n--- Table 2: individual VIOLATIONS (denominator ${allViolations.length}) ---`);
for (const [check, n] of tally(allViolations.map((v) => v.check))) console.log(`  ${String(n).padStart(4)}  ${pct(n, allViolations.length).padStart(6)}  ${check}`);

// The divergence between the two tables, named explicitly so nobody reads table 2 as table 1.
const multiFire = allAttempts.filter((a) => new Set(a.violations.map((v) => v.check)).size < a.violations.length);
console.log(`\n  attempts emitting the SAME check more than once: ${multiFire.length}/${allAttempts.length} (${pct(multiFire.length, allAttempts.length)})`);
if (multiFire.length > 0) {
  const worst = multiFire.map((a) => ({ n: a.violations.length, check: tally(a.violations.map((v) => v.check))[0]! })).sort((x, y) => y.n - x.n)[0]!;
  console.log(`  worst single attempt: ${worst.n} violations, dominated by '${worst.check[0]}' x${worst.check[1]}`);
  console.log('  -> a repeated check inside ONE attempt is a STRUCTURAL failure (every block wrong the');
  console.log('     same way), not a near-miss. Table 2 over-weights these; Table 1 is the fair view.');
}

// TABLE 3 — per-question stability. The v1 counterfactual found codes vary run to run; if that
// holds here, any per-question labelling is coding noise and must not be used.
const byQuestion = new Map<string, string[]>();
for (const r of withRejections) {
  const codes = r.rejections.flatMap((a) => [...new Set(a.violations.map((v) => v.check))]);
  byQuestion.set(r.question, [...(byQuestion.get(r.question) ?? []), ...codes]);
}
const repeated = [...byQuestion.entries()].filter(([, c]) => c.length > 1);
const unstable = repeated.filter(([, c]) => new Set(c).size > 1);
console.log(`\n--- Table 3: per-question code STABILITY ---`);
console.log(`  questions with >1 recorded rejection : ${repeated.length}`);
console.log(`  of those, drawing MORE THAN ONE code : ${unstable.length}  (${pct(unstable.length, repeated.length)})`);
if (unstable.length > 0) {
  console.log('  -> codes are NOT a stable per-question property. Any diagnostic that labels a question');
  console.log('     once and treats it as THE reason is coding noise. Aggregate over repeats.');
  for (const [q, codes] of unstable.slice(0, 8)) console.log(`     ${[...new Set(codes)].join(', ')}  <- ${q.slice(0, 60)}`);
}

// Sample messages per check — the thing the design doc wanted to "go read", now free.
console.log(`\n--- Sample messages per check (what a fix would actually be written against) ---`);
for (const [check] of perAttempt.slice(0, 6)) {
  const samples = [...new Set(allViolations.filter((v) => v.check === check).map((v) => v.message ?? '').filter(Boolean))].slice(0, 3);
  console.log(`\n  [${check}]`);
  for (const s of samples) console.log(`    · ${s.slice(0, 160)}`);
}

console.log(`\nNOTE: this is a census, not a recommendation. Per the verdict, step 3 (a prompt,`);
console.log(`retrieval-context, or contract change) is a SEPARATE proposal written against these counts,`);
console.log(`and any difference small relative to these denominators establishes no ordering.`);
