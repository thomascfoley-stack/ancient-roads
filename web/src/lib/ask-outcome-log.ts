import { logEvent } from '@/lib/observability';
import type { TeachMeta } from '@/lib/teacher/teach';

/** Shared ask_outcome payload — both /api/ask routes must use this. Carries the B1 stage
 *  timings (plan 2026-08-13) flattened for log querying: where the seconds went, per ask,
 *  retries visible as arrays — the measurement run reads THESE lines. No question text. */
export function logAskOutcome(
  kind: string,
  ms: number,
  meta: Pick<TeachMeta, 'attempts' | 'firstCheck' | 'voices' | 'traditions' | 'stageMs' | 'coldStart' | 'rejections'>,
): void {
  const stage = meta.stageMs;
  // Verdict 2026-08-15 step 1. `firstCheck` above records ONE check name for the FIRST rejected
  // attempt only, so a 3-attempt question reported one code and the other two rejections were
  // invisible — which is why the failure-code table could only be written in adjectives. The full
  // set now rides along, already bounded by teach.ts (≤12 violations/attempt, ≤300 chars/field).
  // Serialized as one string: ObsFields is a flat scalar map, and a nested array would either
  // widen that contract for one caller or be silently dropped by JSON.stringify's field ordering.
  const rejections = meta.rejections ?? [];
  const rejectionCodes = rejections
    .map((r) => `${r.attempt}:${r.violations.map((v) => v.check).join(',')}`)
    .join(' | ');
  logEvent('ask_outcome', {
    kind,
    ms,
    attempts: meta.attempts,
    ...(meta.firstCheck ? { firstCheck: meta.firstCheck } : {}),
    voices: meta.voices,
    traditions: meta.traditions,
    ...(stage
      ? {
          embedMs: stage.embed,
          retrieveMs: stage.retrieve,
          lanesMs: stage.lanes,
          composeMs: stage.compose,
          composeMsTotal: stage.compose.reduce((a, b) => a + b, 0),
          verifyMs: stage.verify,
          verifyMsTotal: stage.verify.reduce((a, b) => a + b, 0),
          stageTotalMs: stage.total,
        }
      : {}),
    ...(meta.coldStart !== undefined ? { coldStart: meta.coldStart } : {}),
    ...(rejections.length > 0
      ? {
          rejectedAttempts: rejections.length,
          // Cheap to grep/group: "0:quote_verbatim,schema | 1:passages_grounded".
          rejectionCodes,
          // The full payload the diagnostic reads — message + span per violation.
          rejectionDetail: JSON.stringify(rejections),
        }
      : {}),
  });
}
