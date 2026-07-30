// Layer 1 — wallet invariant: no route that spends on embeddings/LLM is unauthenticated
// or unrate-limited. Enumerate from the filesystem so new money-spending routes fail CI.

import { describe, expect, it } from 'vitest';
import { listApiRouteFiles, readRouteSource, relRoute, routeSpendsMoney } from '../helpers/routes';

/** Strip comments so ordering reasons about CODE, not prose. Without this, a comment
 *  like `// verifier runs inside teach()` registers as a teach() "call" and produces a
 *  false ordering failure — the exact source-grep fragility this audit exists to catch.
 *  The `(^|[^:])` guard leaves `https://` URLs in string literals intact. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Index of the first CALL site of `name(` — NOT the bare import `{ name }`, which has
 *  no parens. Returns -1 if the function is imported but never actually called. This is
 *  the whole point: `src.includes('requireUser')` matched the import and passed even when
 *  the call was deleted or moved after the money was spent. */
function callIndex(src: string, name: string): number {
  return src.search(new RegExp(`\\b${name}\\s*\\(`));
}

describe('Layer 1 — wallet invariant', () => {
  it('every money-spending API route CALLS the gate before it spends (teach())', () => {
    const spenders = listApiRouteFiles().filter((f) => routeSpendsMoney(readRouteSource(f)));
    expect(spenders.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const file of spenders) {
      const src = readRouteSource(file);
      const route = relRoute(file);
      const isEvalHarness = route.startsWith('eval/bait/');
      const code = codeOnly(src);

      if (isEvalHarness) {
        if (!src.includes('EVAL_HARNESS_SECRET')) {
          failures.push(`${route}: eval harness must require EVAL_HARNESS_SECRET`);
        }
        if (!src.includes('timingSafeEqual')) {
          failures.push(`${route}: eval harness must compare bearer token in constant time`);
        }
        continue;
      }

      // Behavior the test NAME promises: auth + rate-limit are CALLED, and BEFORE teach()
      // spends. Presence of the import is not enough — a route that calls teach() first
      // has already burned the money by the time it authenticates.
      const teachIdx = code.search(/\bteach\s*\(/);
      const authIdx = callIndex(code, 'requireUser');
      const rlIdx = callIndex(code, 'checkAskRateLimit');

      if (authIdx < 0) {
        failures.push(`${route}: never CALLS requireUser() (import alone does not gate)`);
      } else if (teachIdx >= 0 && authIdx > teachIdx) {
        failures.push(`${route}: requireUser() is called AFTER teach() — money spent before auth`);
      }
      if (rlIdx < 0) {
        failures.push(`${route}: never CALLS checkAskRateLimit() (import alone does not gate)`);
      } else if (teachIdx >= 0 && rlIdx > teachIdx) {
        failures.push(`${route}: checkAskRateLimit() is called AFTER teach() — money spent before limit`);
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
