// Verdict 2026-08-15 §4: does the violation FEEDBACK cause retry recovery, or do retries just
// succeed anyway?
//
// The design doc rejected a blind parallel race because informed retries recover 9/13. That 9 is
// ARITHMETIC (13 retried − 4 fell back), not an observation, and it shows retries succeed — not
// that feedback is why. This measures the counterfactual arm.
//
// METHOD, and why it is not a copy of the thing under test: every primitive is imported from the
// real pipeline — buildSystemPrompt, buildUserPrompt, compose, normalizeContract, verifyV1,
// buildCorpusLookup, selectVoices' inputs via retrieveCommentary. The ONLY thing reimplemented is
// the attempt loop itself, because the loop is the independent variable: arm A appends the
// `--- PREVIOUS ATTEMPT REJECTED ---` block exactly as teach.ts:263-265 does, arm B appends
// nothing. Same question, same retrieval, same seed conditions, both arms in the same process.
//
// v2 (2026-08-15): REPETITIONS + paired analysis. v1 ran one rep per question, got 6 usable
// pairs, and established nothing. Sample size, decision rules and the "null means undetermined,
// not disproven" caveat are PRE-REGISTERED in
// docs/evidence/ask-latency/counterfactual-v2-PRE-REGISTRATION.md — read it before the numbers.
//
// Run (from web/), dev DB:
//   NODE_OPTIONS=--conditions=react-server REPS=15 npx tsx src/scripts/feedback-counterfactual.mts
import { embedQuery, compose } from '@/lib/teacher/deepinfra';
import { retrieveCommentary } from '@/lib/teacher/retrieve';
import { buildCorpusLookup } from '@/lib/teacher/corpus';
import { normalizeContract } from '@/lib/teacher/normalize-contract';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/teacher/prompt';
import { verifyV1 } from '@/verifier/v1';
import type { Violation } from '@/verifier/types';

// The 13 questions that needed a retry in the 25-question production run
// (docs/evidence/ask-latency/prod-25-measurement-2026-08-15.json, rows with attempts > 1).
const QUESTIONS = [
  'Explain Romans 8:28',
  'What does Ephesians 2:8-9 teach?',
  'What is the meaning of Isaiah 53:5?',
  'What is justification by faith?',
  'What does Scripture teach about prayer?',
  'What does Scripture teach about suffering?',
  'What happens in the Sermon on the Mount?',
  'Explain the parable of the sower',
  'Who was Josephus?',
  'What does Song of Solomon 4:14 mean?',
  'What does Hebrews 11 teach about faith?',
  'What is the argument of Romans 5?',
  'What does Galatians teach about the law?',
];

const RETRIEVE_K = 6;
const COMPOSE_VOICES = 5;

// teach.ts:263-265, verbatim in shape — arm A's only difference from arm B.
const withFeedback = (userPrompt: string, violations: Violation[]): string =>
  `${userPrompt}\n\n--- PREVIOUS ATTEMPT REJECTED ---\nViolations found:\n${violations
    .map((v) => `- [${v.check}] ${v.message}`)
    .join('\n')}\n\nFix these violations and respond again with valid JSON.`;

type ArmResult = { recovered: boolean; check?: string };

async function runOnce(systemPrompt: string, prompt: string, lookup: Awaited<ReturnType<typeof buildCorpusLookup>>, ctx: { sectionIds: number[]; traditions: string[] }, attributions: Parameters<typeof normalizeContract>[1]) {
  const raw = await compose(systemPrompt, prompt, { timeoutMs: 120_000 });
  let parsed: unknown;
  try {
    parsed = normalizeContract(JSON.parse(raw), attributions);
  } catch {
    return { ok: false as const, violations: [{ check: 'json_parse', message: 'Response is not valid JSON' }] };
  }
  const res = await verifyV1(parsed, lookup, ctx);
  return res.ok ? { ok: true as const, violations: [] as Violation[] } : { ok: false as const, violations: res.violations };
}

const REPS = Number(process.env.REPS ?? 15);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const rows: { q: string; rep: number; firstCheck?: string; armA: ArmResult; armB: ArmResult }[] = [];

// One unit of work = one (question, repetition). Bounded concurrency keeps ~375 compose calls
// inside a sane wall clock without hammering the provider.
const units: { q: string; rep: number }[] = [];
for (const q of QUESTIONS) for (let rep = 0; rep < REPS; rep++) units.push({ q, rep });

let done = 0;
async function runUnit({ q, rep }: { q: string; rep: number }) {
  const vec = await embedQuery(q);
  const retrieval = await retrieveCommentary(vec, RETRIEVE_K, { query: q });
  if (retrieval.length === 0) { return; }

  const voices = retrieval.slice(0, COMPOSE_VOICES);
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(q, voices);
  const lookup = buildCorpusLookup(voices);
  const attributions = voices.map((r) => ({
    author: r.metadata.author, work: r.metadata.sourceTitle, slug: r.metadata.work,
    tradition: r.metadata.tradition ?? 'unknown', body: r.content,
  }));
  const ctx = { sectionIds: voices.map((_, n) => n + 1), traditions: [...new Set(voices.map((r) => r.metadata.tradition ?? 'unknown'))] };

  // Attempt 0 — shared premise for both arms. If it passes, this question contributes nothing
  // to the comparison (it never needed a retry this time) and is reported as such.
  const a0 = await runOnce(systemPrompt, userPrompt, lookup, ctx, attributions);
  if (a0.ok) {
    rows.push({ q, rep, armA: { recovered: true }, armB: { recovered: true } });
    return;
  }
  const firstCheck = a0.violations[0]?.check;

  // ARM A — informed retry (what production does today).
  const armA = await runOnce(systemPrompt, withFeedback(userPrompt, a0.violations), lookup, ctx, attributions);
  // ARM B — uninformed re-roll: identical original prompt, no feedback block.
  const armB = await runOnce(systemPrompt, userPrompt, lookup, ctx, attributions);

  rows.push({
    q, rep, firstCheck,
    armA: { recovered: armA.ok, check: armA.violations[0]?.check },
    armB: { recovered: armB.ok, check: armB.violations[0]?.check },
  });
}

// Bounded-concurrency pool over the units.
const queue = [...units];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const u = queue.shift();
      if (!u) return;
      try { await runUnit(u); } catch (e) { console.error(`unit failed (${u.q} rep${u.rep}):`, (e as Error).message); }
      if (++done % 20 === 0) console.log(`  …${done}/${units.length} units done`);
    }
  }),
);

const contested = rows.filter((r) => r.firstCheck !== undefined);
const aRec = contested.filter((r) => r.armA.recovered).length;
const bRec = contested.filter((r) => r.armB.recovered).length;

// PAIRED analysis (pre-registration: McNemar on discordant pairs). Both arms share the SAME
// attempt-0 rejection, so concordant pairs carry no information about the difference — only the
// pairs where exactly one arm recovered do.
const bOnly = contested.filter((r) => !r.armA.recovered && r.armB.recovered).length;
const aOnly = contested.filter((r) => r.armA.recovered && !r.armB.recovered).length;
const discordant = aOnly + bOnly;

// Exact two-sided binomial p over the discordant pairs (McNemar exact), computed inline so this
// pulls in no dependency.
function binomP(k: number, n: number): number {
  if (n === 0) return 1;
  let total = 0;
  const half = Math.pow(0.5, n);
  for (let i = 0; i <= k; i++) {
    let c = 1;
    for (let j = 0; j < i; j++) c = (c * (n - j)) / (j + 1);
    total += c;
  }
  return Math.min(1, 2 * total * half);
}
const pval = binomP(Math.min(aOnly, bOnly), discordant);

console.log('\n=== COUNTERFACTUAL v2 (verdict 2026-08-15 4) ===');
console.log(`units run: ${rows.length} (${QUESTIONS.length} questions x ${REPS} reps)`);
console.log(`attempt-0 REJECTED (the usable pairs): ${contested.length}`);
console.log(`attempt-0 passed outright (no comparison possible): ${rows.length - contested.length}`);
console.log(`\n  informed retry (feedback appended)  recovered: ${aRec}/${contested.length}`);
console.log(`  uninformed re-roll (no feedback)    recovered: ${bRec}/${contested.length}`);
console.log(`\nPAIRED (McNemar exact):`);
console.log(`  informed-only recoveries : ${aOnly}`);
console.log(`  uninformed-only          : ${bOnly}`);
console.log(`  discordant pairs         : ${discordant}`);
console.log(`  exact two-sided p        : ${pval.toFixed(4)}  ${pval < 0.05 ? '<- SIGNIFICANT at 0.05' : '(not significant)'}`);
console.log(`\nPRE-REGISTERED READING: significant + informed ahead -> the doc's rejection of a blind`);
console.log(`parallel race is CONFIRMED. Significant + uninformed ahead -> feedback is harmful and`);
console.log(`the race becomes preferred. NULL -> undetermined at large-effect power; a moderate or`);
console.log(`small effect is NOT excluded, and no step-2 design may cite either arm as support.`);

const byQ = new Map<string, Set<string>>();
for (const r of contested) {
  if (!byQ.has(r.q)) byQ.set(r.q, new Set());
  byQ.get(r.q)!.add(r.firstCheck!);
}
const unstable = [...byQ.entries()].filter(([, codes]) => codes.size > 1);
console.log(`\nFAILURE-CODE STABILITY: ${unstable.length}/${byQ.size} questions drew MORE THAN ONE first-check across reps.`);
for (const [q, codes] of unstable) console.log(`  ${[...codes].join(', ')}  <- ${q}`);
console.log(`(If non-zero, step 2 MUST aggregate counts over repeated asks, never one code per question.)`);

const codeCounts = contested.reduce<Record<string, number>>((acc, r) => { acc[r.firstCheck!] = (acc[r.firstCheck!] ?? 0) + 1; return acc; }, {});
console.log(`\nfirst-check counts over ALL ${contested.length} rejections: ${JSON.stringify(codeCounts)}`);
console.log(`\nJSON ${JSON.stringify(rows)}`);
