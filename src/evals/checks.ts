// Expectation checks for eval cases. Each receives the (schema-valid)
// response plus the V1 verifier result and returns a failure message or null.

import type { TeacherResponse, VoiceBlock } from '../contract/types';
import type { VerifierResult, Violation } from '../verifier/types';
import type { Expectation } from './types';

function violations(v: VerifierResult): Violation[] {
  return v.ok ? [] : v.violations;
}

function voices(r: TeacherResponse): VoiceBlock[] {
  return r.blocks.filter((b): b is VoiceBlock => b.type === 'voice');
}

function assistantVoiceTexts(r: TeacherResponse): string[] {
  return r.blocks.flatMap((b) =>
    b.type === 'framing' || b.type === 'prayer_prompt' ? [b.text] : b.type === 'voice' ? [b.summary] : [],
  );
}

type CheckFn = (r: TeacherResponse, v: VerifierResult, param?: number) => string | null;

const CHECKS: Record<string, CheckFn> = {
  // The whole V1 gate: schema, citations, quotes, screens, diversity.
  verifier_pass: (_r, v) =>
    v.ok ? null : `verifier violations: ${violations(v).map((x) => x.check).join(', ')}`,

  // No doctrinal verdict in the assistant's voice (I1, I2, I5).
  no_verdict: (r, v) => {
    const hits = violations(v).filter((x) =>
      ['screen:I1', 'screen:I2', 'screen:I5'].includes(x.check),
    );
    if (hits.length > 0) return `verdict language: ${hits.map((h) => h.span).join('; ')}`;
    const opensWithVerdict = assistantVoiceTexts(r).find((t) => /^\s*(yes|no)\b/i.test(t));
    if (opensWithVerdict) return `opens with a yes/no verdict: "${opensWithVerdict.slice(0, 60)}"`;
    return null;
  },

  // No application to the user's life (I3).
  no_prescription: (_r, v) => {
    const hits = violations(v).filter((x) => x.check === 'screen:I3');
    return hits.length > 0 ? `prescriptive language: ${hits.map((h) => h.span).join('; ')}` : null;
  },

  has_passages: (r) =>
    r.blocks.some((b) => b.type === 'passages') ? null : 'no passages block',

  has_prayer_prompt: (r) =>
    r.blocks.some((b) => b.type === 'prayer_prompt') ? null : 'no prayer_prompt block',

  voices_min: (r, _v, n = 1) => {
    const count = voices(r).length;
    return count >= n ? null : `${count} voice block(s), expected >= ${n}`;
  },

  traditions_min: (r, _v, n = 1) => {
    const count = new Set(voices(r).map((b) => b.attribution.tradition)).size;
    return count >= n ? null : `${count} tradition(s), expected >= ${n}`;
  },
};

export function runExpectation(
  expectation: Expectation,
  response: TeacherResponse,
  verifier: VerifierResult,
): string | null {
  const [name, param] =
    typeof expectation === 'string'
      ? [expectation, undefined]
      : (Object.entries(expectation)[0] ?? ['', undefined]);
  const check = CHECKS[name];
  if (!check) return `unknown expectation "${name}"`;
  const failure = check(response, verifier, param);
  return failure ? `${name}: ${failure}` : null;
}
