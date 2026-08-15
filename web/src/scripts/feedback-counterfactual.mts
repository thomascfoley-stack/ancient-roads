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
// Run (from web/), dev DB:
//   NODE_OPTIONS=--conditions=react-server npx tsx src/scripts/feedback-counterfactual.mts
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

const rows: { q: string; firstCheck?: string; armA: ArmResult; armB: ArmResult }[] = [];

for (const [i, q] of QUESTIONS.entries()) {
  const vec = await embedQuery(q);
  const retrieval = await retrieveCommentary(vec, RETRIEVE_K, { query: q });
  if (retrieval.length === 0) { console.log(`${i + 1} SKIP (no retrieval) ${q}`); continue; }

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
    console.log(`${String(i + 1).padStart(2)} attempt0-passed  ${q}`);
    rows.push({ q, armA: { recovered: true }, armB: { recovered: true } });
    continue;
  }
  const firstCheck = a0.violations[0]?.check;

  // ARM A — informed retry (what production does today).
  const armA = await runOnce(systemPrompt, withFeedback(userPrompt, a0.violations), lookup, ctx, attributions);
  // ARM B — uninformed re-roll: identical original prompt, no feedback block.
  const armB = await runOnce(systemPrompt, userPrompt, lookup, ctx, attributions);

  rows.push({
    q, firstCheck,
    armA: { recovered: armA.ok, check: armA.violations[0]?.check },
    armB: { recovered: armB.ok, check: armB.violations[0]?.check },
  });
  console.log(
    `${String(i + 1).padStart(2)} rejected(${firstCheck}) → informed=${armA.ok ? 'RECOVERED' : 'failed(' + armA.violations[0]?.check + ')'} · uninformed=${armB.ok ? 'RECOVERED' : 'failed(' + armB.violations[0]?.check + ')'}  ${q}`,
  );
}

const contested = rows.filter((r) => r.firstCheck !== undefined);
const aRec = contested.filter((r) => r.armA.recovered).length;
const bRec = contested.filter((r) => r.armB.recovered).length;

console.log('\n=== COUNTERFACTUAL (verdict 2026-08-15 §4) ===');
console.log(`questions where attempt 0 was rejected (the comparison set): ${contested.length}`);
console.log(`  informed retry (feedback appended)  recovered: ${aRec}/${contested.length}`);
console.log(`  uninformed re-roll (no feedback)    recovered: ${bRec}/${contested.length}`);
console.log(`\nattempt0 passed outright (excluded from comparison): ${rows.length - contested.length}`);
console.log('\nREAD THIS BEFORE CONCLUDING: n is tiny and compose is stochastic. A difference of one');
console.log('or two here is noise, not a finding. This run can only support a strong claim if the');
console.log('gap is large; otherwise it says "not distinguishable at this n", which is itself the');
console.log('answer to whether 9/13 licensed the doc\'s claim that feedback "is doing real work".');
console.log(`\nJSON ${JSON.stringify(rows)}`);
