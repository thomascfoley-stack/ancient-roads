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
    const spenders = listApiRouteFiles().filter((f) => routeSpendsMoney(f));
    expect(spenders.length).toBeGreaterThan(0);

    // Routes whose transitive reach is real but whose only use of the paid closure is a read.
    // Module-level reach over-approximates (routeSpendsMoney's header): the documents LIST route
    // imports queue.ts for queueStats() and never kicks the drain. Each exemption is
    // SELF-INVALIDATING — the regex names every call that would turn reach into spend, and the
    // loop below fails the route the moment one appears, so this cannot rot into a bare
    // allowlist (the watchlist's first artefact class).
    const REACHES_BUT_DOES_NOT_SPEND = new Map<string, RegExp>([
      ['user-corpus/documents/route.ts', /\bdrain\s*\(|\bembedChunks\s*\(|\bteach\s*\(/],
    ]);

    const failures: string[] = [];
    for (const file of spenders) {
      const src = readRouteSource(file);
      const route = relRoute(file);
      const isEvalHarness = route.startsWith('eval/bait/');
      const code = codeOnly(src);

      const spendCalls = REACHES_BUT_DOES_NOT_SPEND.get(route);
      if (spendCalls) {
        if (spendCalls.test(code)) {
          failures.push(`${route}: exempted as reach-without-spend, but now CALLS a paid path — remove the exemption and add a per-user rate limiter`);
        }
        continue;
      }

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
      // `guardUser()` counts as calling `requireUser()`, because it IS one plus more:
      // route-guard.ts:35 calls requireUser() and route-guard.ts:40-41 then enforces the
      // user-corpus allowlist, returning 403. Treating the wrapper as un-gated would have pushed
      // whoever hit this toward inlining requireUser beside guardUser — two auth paths on one
      // route — which is worse than the thing this leg exists to prevent. Recognised 2026-08-17
      // when the money predicate was widened to embeddings and correctly pulled
      // /api/user-corpus/search into the spender set for the first time.
      const authIdx = Math.max(callIndex(code, 'requireUser'), callIndex(code, 'guardUser'));
      // ANY per-user limiter, not `checkAskRateLimit` specifically. The property this leg names is
      // "metered before it spends"; hardcoding one limiter's name made the predicate narrower than
      // the property — the same defect that let /api/user-corpus/search go unmetered in the first
      // place (`routeSpendsMoney` matched `teach()` alone). That route now calls
      // `checkCorpusSearchRateLimit`, which is deliberately a DIFFERENT bucket: charging an
      // embedding search against the ask quota would let a reader exhaust their questions by
      // searching their own uploads. Matched by SHAPE so a future limiter is covered on arrival —
      // the previous version SAID "matched by shape" over a two-name list, and the third limiter
      // (checkCorpusUploadRateLimit, H5) would have arrived uncovered. The lookahead excludes the
      // per-IP fail-OPEN throttles (gate, auth): those are availability guards, not per-user
      // meters, and counting one would let a spender pass on a limiter that allows on outage.
      const rlIdx = code.search(/\bcheck(?!Gate|Auth)\w+RateLimit\s*\(/);

      if (authIdx < 0) {
        failures.push(`${route}: never CALLS requireUser() (import alone does not gate)`);
      } else if (teachIdx >= 0 && authIdx > teachIdx) {
        failures.push(`${route}: requireUser() is called AFTER teach() — money spent before auth`);
      }
      if (rlIdx < 0) {
        failures.push(`${route}: never CALLS a per-user rate limiter (import alone does not gate)`);
      } else if (teachIdx >= 0 && rlIdx > teachIdx) {
        failures.push(`${route}: the rate limiter is called AFTER the spend — money spent before limit`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('classifies routes that reach a paid module TRANSITIVELY (H5: upload spends through the drain)', () => {
    // The 2026-08-20 uploader deep dive, H5: `routeSpendsMoney` graded the ROUTE FILE's text, so
    // /api/user-corpus/upload — which reaches embedChunks through @/lib/user-corpus/queue's
    // drain() — classified as non-spending and this suite never examined the product's largest
    // spender. The predicate now resolves local imports transitively.
    const spenders = listApiRouteFiles().filter((f) => routeSpendsMoney(f)).map(relRoute);
    expect(spenders).toContain('user-corpus/upload/route.ts');
    // The retry route re-embeds the WHOLE document through the same drain (and resets attempts,
    // so MAX_ATTEMPTS is not a spend ceiling).
    expect(spenders).toContain('user-corpus/documents/[id]/route.ts');
    // Direct spenders must survive the widening.
    expect(spenders).toContain('user-corpus/search/route.ts');
    expect(spenders).toContain('ask/route.ts');
  });

  it('documents all API routes (coverage anchor)', () => {
    const routes = listApiRouteFiles().map(relRoute);
    expect(routes).toContain('ask/route.ts');
    expect(routes).toContain('ask/stream/route.ts');
    expect(routes).toContain('eval/bait/route.ts');
    expect(routes).toContain('search/commentaries/route.ts');
  });
});
