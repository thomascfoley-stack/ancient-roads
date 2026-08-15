import { logEvent } from '@/lib/observability';
import type { TeachMeta } from '@/lib/teacher/teach';

/** Shared ask_outcome payload — both /api/ask routes must use this. Carries the B1 stage
 *  timings (plan 2026-08-13) flattened for log querying: where the seconds went, per ask,
 *  retries visible as arrays — the measurement run reads THESE lines. No question text. */
export function logAskOutcome(
  kind: string,
  ms: number,
  meta: Pick<TeachMeta, 'attempts' | 'firstCheck' | 'voices' | 'traditions' | 'stageMs' | 'coldStart'>,
): void {
  const stage = meta.stageMs;
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
  });
}
