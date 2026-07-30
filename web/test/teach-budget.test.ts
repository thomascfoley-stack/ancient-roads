import { describe, expect, it } from 'vitest';
import {
  COMPOSE_ATTEMPTS,
  EMBED_TIMEOUT_MS,
  MAX_RETRIES,
  TEACH_MAX_DURATION_MS,
  composeTimeoutMs,
  teachBudgetFits,
} from '@/lib/teacher/teach-budget';

describe('teach compose retry budget', () => {
  it('(MAX_RETRIES+1) × compose_timeout + embed ≤ maxDuration', () => {
    expect(teachBudgetFits(TEACH_MAX_DURATION_MS)).toBe(true);
    expect(COMPOSE_ATTEMPTS).toBe(MAX_RETRIES + 1);
    expect(COMPOSE_ATTEMPTS * composeTimeoutMs() + EMBED_TIMEOUT_MS).toBeLessThanOrEqual(
      TEACH_MAX_DURATION_MS,
    );
  });

  it('goes RED when compose timeout exceeds budget (red-proof direction)', () => {
    const bloated = 120_000;
    expect(COMPOSE_ATTEMPTS * bloated + EMBED_TIMEOUT_MS).toBeGreaterThan(TEACH_MAX_DURATION_MS);
  });
});
