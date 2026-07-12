// Layer 1 — wallet invariant: no route that spends on embeddings/LLM is unauthenticated
// or unrate-limited. Enumerate from the filesystem so new money-spending routes fail CI.

import { describe, expect, it } from 'vitest';
import { listApiRouteFiles, readRouteSource, relRoute, routeSpendsMoney } from '../helpers/routes';

describe('Layer 1 — wallet invariant', () => {
  it('every money-spending API route is gated before teach()', () => {
    const spenders = listApiRouteFiles().filter((f) => routeSpendsMoney(readRouteSource(f)));
    expect(spenders.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const file of spenders) {
      const src = readRouteSource(file);
      const route = relRoute(file);
      const isEvalHarness = route.startsWith('eval/bait/');

      if (isEvalHarness) {
        if (!src.includes("process.env.NODE_ENV === 'production'")) {
          failures.push(`${route}: eval harness must 404 in production`);
        }
        if (!src.includes('EVAL_HARNESS_SECRET')) {
          failures.push(`${route}: eval harness must require EVAL_HARNESS_SECRET`);
        }
        if (!src.includes('timingSafeEqual')) {
          failures.push(`${route}: eval harness must compare bearer token in constant time`);
        }
        continue;
      }

      if (!src.includes('requireUser')) {
        failures.push(`${route}: missing requireUser before teach()`);
      }
      if (!src.includes('checkAskRateLimit')) {
        failures.push(`${route}: missing checkAskRateLimit before teach()`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('documents all API routes (coverage anchor)', () => {
    const routes = listApiRouteFiles().map(relRoute);
    expect(routes).toContain('ask/route.ts');
    expect(routes).toContain('ask/stream/route.ts');
    expect(routes).toContain('eval/bait/route.ts');
    expect(routes).toContain('search/commentaries/route.ts');
  });
});
