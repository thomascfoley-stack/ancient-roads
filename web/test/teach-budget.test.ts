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
  it('the seconds/ms constants are one number, PINNED', () => {
    // This was `ASK_MAX_DURATION_SEC * 1000 === ASK_MAX_DURATION_MS`, and teach-budget.ts:5
    // DEFINES ASK_MAX_DURATION_MS as exactly that expression — the same value on both sides of
    // the assertion, which cannot fail (2026-08-02 audit, T10). Pinning the literal is what makes
    // drift visible: change the ceiling and this goes red, which is the point of a ceiling test.
    expect(budget.ASK_MAX_DURATION_SEC).toBe(300);
    expect(budget.ASK_MAX_DURATION_MS).toBe(300_000);
  });

  it('fits under the platform ceiling with a non-zero pipeline reserve', () => {
    expect(budget.PIPELINE_RESERVE_MS).toBeGreaterThan(0);
    expect(budget.teachBudgetFits(budget.ASK_MAX_DURATION_MS)).toBe(true);
    const timeout = budget.composeTimeoutMs(budget.ASK_MAX_DURATION_MS);
    expect(timeout).toBeGreaterThanOrEqual(budget.MIN_COMPOSE_TIMEOUT_MS);
    // NOT `RESERVE + ATTEMPTS * composeTimeoutMs(C) <= C` — that is the algebraic identity
    // R + N*floor((C-R)/N) <= C, true for every input, and it restates the last line of
    // teachBudgetFitsWithAttempts which the assertion two lines above already covers. Pin the
    // real numbers instead, so a change to the reserve or the attempt count has to be noticed.
    expect(budget.PIPELINE_RESERVE_MS).toBe(90_000);
    expect(budget.COMPOSE_ATTEMPTS).toBe(3);
    const used = budget.PIPELINE_RESERVE_MS + budget.COMPOSE_ATTEMPTS * timeout;
    expect(used).toBeLessThanOrEqual(budget.ASK_MAX_DURATION_MS);
    // ...and leave real headroom rather than merely fitting.
    expect(budget.ASK_MAX_DURATION_MS - used).toBeLessThan(budget.COMPOSE_ATTEMPTS);
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
    // The second assertion used to be `RESERVE - EMBED > 0`, which is the first one restated.
    // Replaced with a real floor: retrieval, rerank and the verifier all run inside what is left.
    expect(budget.EMBED_TIMEOUT_MS).toBeLessThan(budget.PIPELINE_RESERVE_MS);
    expect(budget.PIPELINE_RESERVE_MS - budget.EMBED_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });
});
