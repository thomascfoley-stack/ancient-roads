import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as budget from '@/lib/teacher/teach-budget';

const REPO = path.join(__dirname, '..');

function routeMaxDurationBinding(rel: string): string | undefined {
  const src = readFileSync(path.join(REPO, rel), 'utf8');
  return src.match(/export const maxDuration = (\w+)/)?.[1];
}

describe('teach compose retry budget', () => {
  it('ask routes bind maxDuration to ASK_MAX_DURATION_SEC (not an independent literal)', () => {
    for (const rel of ['src/app/api/ask/route.ts', 'src/app/api/ask/stream/route.ts']) {
      const src = readFileSync(path.join(REPO, rel), 'utf8');
      expect(src, rel).toContain("from '@/lib/teacher/teach-budget'");
      expect(routeMaxDurationBinding(rel), rel).toBe('ASK_MAX_DURATION_SEC');
    }
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
