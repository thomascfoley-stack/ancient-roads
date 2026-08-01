import { describe, expect, it } from 'vitest';
import * as budget from '@/lib/teacher/teach-budget';

describe('teach compose retry budget', () => {
  // REMOVED 2026-08-01: "ask routes bind maxDuration to ASK_MAX_DURATION_SEC (not an independent
  // literal)". That assertion was correct in intent and made the product UNBUILDABLE.
  //
  // Next 16 statically analyses route segment config and rejects a non-literal export:
  // `next build` exited 1 with "Invalid segment configuration export detected", naming no route.
  // So this test enforced the identifier binding while the framework required a literal, and the
  // two could not both be satisfied. Nothing in CI builds the app, so the test stayed green and the
  // build stayed broken -- neither signal ever met the other.
  //
  // The invariant it protected is REAL and is not dropped: maxDuration is the Vercel function
  // ceiling, ASK_MAX_DURATION_SEC is the in-process budget, and they must be one number.
  // `test/ask-max-duration-literal.test.ts` (repo root) now asserts the stronger property --
  // the export IS a numeric literal AND that literal equals ASK_MAX_DURATION_SEC -- which catches
  // drift in both directions and is compatible with the build. Deleted rather than mirrored.
  it('the seconds/ms constants are one number', () => {
    expect(budget.ASK_MAX_DURATION_SEC * 1000).toBe(budget.ASK_MAX_DURATION_MS);
  });

  it('fits under the platform ceiling with a non-zero pipeline reserve', () => {
    expect(budget.PIPELINE_RESERVE_MS).toBeGreaterThan(0);
    expect(budget.teachBudgetFits(budget.ASK_MAX_DURATION_MS)).toBe(true);
    const timeout = budget.composeTimeoutMs(budget.ASK_MAX_DURATION_MS);
    expect(timeout).toBeGreaterThanOrEqual(budget.MIN_COMPOSE_TIMEOUT_MS);
    const used = budget.PIPELINE_RESERVE_MS + budget.COMPOSE_ATTEMPTS * timeout;
    expect(used).toBeLessThanOrEqual(budget.ASK_MAX_DURATION_MS);
  });

  it('teachBudgetFits rejects ceilings that cannot fit the reserve', () => {
    expect(budget.teachBudgetFits(0)).toBe(false);
    expect(budget.teachBudgetFits(-99999)).toBe(false);
    expect(budget.teachBudgetFits(budget.PIPELINE_RESERVE_MS)).toBe(false);
    expect(budget.teachBudgetFits(60_000)).toBe(false);
  });

  it('RED when attempt count is seeded too high for the compose budget', () => {
    expect(budget.teachBudgetFitsWithAttempts(budget.ASK_MAX_DURATION_MS, budget.COMPOSE_ATTEMPTS)).toBe(true);
    expect(budget.teachBudgetFitsWithAttempts(budget.ASK_MAX_DURATION_MS, 51)).toBe(false);
  });

  it('RED when pipeline reserve is seeded to zero', () => {
    expect(budget.teachBudgetFitsWithAttempts(budget.ASK_MAX_DURATION_MS, budget.COMPOSE_ATTEMPTS, 0)).toBe(false);
  });

  it('RED when embed timeout consumes the entire reserve leaving no retrieval slack', () => {
    expect(budget.EMBED_TIMEOUT_MS).toBeLessThan(budget.PIPELINE_RESERVE_MS);
    expect(budget.PIPELINE_RESERVE_MS - budget.EMBED_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
