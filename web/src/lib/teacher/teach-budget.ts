/** Compose retry budget — must fit inside Vercel maxDuration on ask routes. */
export const MAX_RETRIES = 2;
export const EMBED_TIMEOUT_MS = 30_000;
export const TEACH_MAX_DURATION_MS = 300_000;

/** Attempt count including the first try. */
export const COMPOSE_ATTEMPTS = MAX_RETRIES + 1;

/**
 * Per-compose timeout derived so (attempts × compose) + embed fits maxDuration.
 * Retrieval and verify time share the remaining slack; the deadline in teach() enforces
 * landing in fallback before the platform kills the function.
 */
export function composeTimeoutMs(maxDurationMs = TEACH_MAX_DURATION_MS): number {
  const budget = maxDurationMs - EMBED_TIMEOUT_MS;
  return Math.floor(budget / COMPOSE_ATTEMPTS);
}

export function teachBudgetFits(maxDurationMs = TEACH_MAX_DURATION_MS): boolean {
  return COMPOSE_ATTEMPTS * composeTimeoutMs(maxDurationMs) + EMBED_TIMEOUT_MS <= maxDurationMs;
}
