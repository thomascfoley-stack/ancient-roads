/** Compose retry budget — must fit inside Vercel maxDuration on ask routes. */

/** Single source of truth for ask route `maxDuration` (seconds). Routes import this. */
export const ASK_MAX_DURATION_SEC = 300;
export const ASK_MAX_DURATION_MS = ASK_MAX_DURATION_SEC * 1000;

export const MAX_RETRIES = 2;
export const EMBED_TIMEOUT_MS = 30_000;

/**
 * Non-compose pipeline reserve: embed + retrieval + rerank + verify + deadline slack.
 * No measured /ask p50/p95 timings exist in-repo (2026-07-30); 90s is a defensible
 * floor: 30s embed cap + ~60s for retrieval/rerank/verify on a slow path.
 */
export const PIPELINE_RESERVE_MS = 90_000;

/** Minimum per-attempt compose timeout — below this the retry ladder is not meaningful. */
export const MIN_COMPOSE_TIMEOUT_MS = 5_000;

/** Attempt count including the first try. */
export const COMPOSE_ATTEMPTS = MAX_RETRIES + 1;

/** Milliseconds available for all compose attempts after the pipeline reserve. */
export function composeBudgetMs(maxDurationMs = ASK_MAX_DURATION_MS): number {
  return maxDurationMs - PIPELINE_RESERVE_MS;
}

/** Per-compose timeout so all attempts fit inside the compose budget. */
export function composeTimeoutMs(maxDurationMs = ASK_MAX_DURATION_MS): number {
  const budget = composeBudgetMs(maxDurationMs);
  if (budget <= 0) return 0;
  return Math.floor(budget / COMPOSE_ATTEMPTS);
}

/** Parameterized fit check (used by tests to seed attempt counts). */
export function teachBudgetFitsWithAttempts(
  maxDurationMs: number,
  attempts: number,
  reserveMs = PIPELINE_RESERVE_MS,
): boolean {
  if (maxDurationMs <= reserveMs || reserveMs <= 0) return false;
  const budget = maxDurationMs - reserveMs;
  const timeout = budget <= 0 ? 0 : Math.floor(budget / attempts);
  if (timeout < MIN_COMPOSE_TIMEOUT_MS) return false;
  return reserveMs + attempts * timeout <= maxDurationMs;
}

/** True when reserve + all compose attempts fit under the platform ceiling. */
export function teachBudgetFits(maxDurationMs = ASK_MAX_DURATION_MS): boolean {
  return teachBudgetFitsWithAttempts(maxDurationMs, COMPOSE_ATTEMPTS);
}
