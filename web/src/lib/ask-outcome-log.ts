import { logEvent } from '@/lib/observability';
import type { TeachMeta } from '@/lib/teacher/teach';

/** Shared ask_outcome payload — both /api/ask routes must use this. */
export function logAskOutcome(
  kind: string,
  ms: number,
  meta: Pick<TeachMeta, 'attempts' | 'firstCheck' | 'voices' | 'traditions'>,
): void {
  logEvent('ask_outcome', {
    kind,
    ms,
    attempts: meta.attempts,
    ...(meta.firstCheck ? { firstCheck: meta.firstCheck } : {}),
    voices: meta.voices,
    traditions: meta.traditions,
  });
}
