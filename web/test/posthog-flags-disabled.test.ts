// THE FLAGS-PATH LEAK GUARD. The capture path (`POST /e/`) is covered by
// posthog-session-entry-url-leak.test.ts and analytics-url-sanitizer.test.ts — both read the
// pre-send payload via `posthog.on('eventCaptured')`, which fires only on the /e/ path that
// `sanitize_properties` runs on. This file exists because there is a SECOND outbox the sanitizer
// never touches: the feature-flags request (`POST /flags/?v=2`).
//
// posthog-js auto-fires /flags on init (via RemoteConfigLoader → ensureFlagsLoaded →
// reloadFeatureFlags → _callFlagsEndpoint), and the body carries
// `person_properties.$initial_current_url` — location.href frozen on the reader's FIRST
// persistence-fresh page. sanitize_properties is invoked only inside the /e/ capture pipeline
// (posthog-core.js), never in posthog-featureflags.js, so a question-bearing first page
// (`/ask?q=…`, or the `/gate?next=%2Fask%3Fq=…` redirect every unauthenticated deep-linker bounces
// through) ships the reader's question to PostHog along a vector no sanitizer sees. That is the
// same audit defect #3 instrumentation-client.ts's header records as closed; the flags path
// reopened it.
//
// THE FIX under test: instrumentation-client.ts sets `advanced_disable_feature_flags: true`,
// which maps to `featureFlagsDisabled` (feature-flags-config.js). `reloadFeatureFlags` (and the
// `_callFlagsEndpoint` it debounces into) early-returns at the very top when it is true, so no
// /flags request fires — on init, on the 5-minute periodic refresh, or on identify()/reset(),
// which both call reloadFeatureFlags. No product code reads a flag (a grep for
// getFeatureFlag/isFeatureEnabled/onFeatureFlags/reloadFeatureFlags across web/src returns
// nothing) and the owner ruling "after-the-fact analytics only, never embedded in the product"
// means nothing depends on the surveys/web-experiments extensions /flags feeds, so disabling
// /flags costs the product nothing.
//
// This test loads the REAL posthog-js, points it at a question-bearing first-visit URL the way a
// directly-shared /ask?q=… deep link would, pre-sets `_POSTHOG_REMOTE_CONFIG` so init takes the
// NATURAL remote-config path (the production path — not a reset() artifact), and then HAMMERS
// every code path that would fire /flags: the init-triggered ensureFlagsLoaded, an explicit
// reloadFeatureFlags(), reset(), and identify(). The fix must hold on all of them.
//
// RED-PROOF. Remove `advanced_disable_feature_flags: true` from instrumentation-client.ts (or
// from the init config below) and this goes red: a POST to /flags/?v=2 appears in the recorded
// fetch calls, carrying `q=<question>` inside `$initial_current_url`. That is the bug this test
// exists to prevent regressing.

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const QUESTION = 'What did Calvin say about grace';
const ENCODED = encodeURIComponent(QUESTION); // 'What%20did%20Calvin%20say%20about%20grace'
const PAGE_URL = `https://ancientpaths.app/ask?q=${ENCODED}`;
const SANITIZED_URL = 'https://ancientpaths.app/ask';
const TOKEN = 'phc_test_key';

describe('posthog never fires POST /flags — the reader question never leaves via the flags path', () => {
  it('no /flags request fires on init, reloadFeatureFlags, reset, or identify; /e/ capture stays clean', async () => {
    // browser-common's globals module captures `location` and `fetch` BY REFERENCE at load time, so
    // both stubs — and the in-page remote config — must be in place BEFORE posthog-js is imported.
    // Hence the dynamic import here, and the single-test-file isolation that keeps the registry
    // fresh (the same pattern posthog-session-entry-url-leak.test.ts relies on).
    vi.stubGlobal('location', new URL(PAGE_URL));

    // Record every outbound request posthog makes. The default transport in jsdom is `fetch`, so
    // stubbing globalThis.fetch intercepts both the /e/ capture batch and the /flags POST (if it
    // were to fire). `disable_compression: true` below makes every body a plaintext JSON string,
    // so the question — verbatim or percent-encoded — is grep-visible if a leak path emits it.
    const calls: Array<{ url: string; method: string; body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { method?: string; body?: unknown }) => {
        const body = init?.body;
        calls.push({
          url: String(url),
          method: init?.method ?? 'GET',
          body: body === undefined ? '' : typeof body === 'string' ? body : String(body),
        });
        return { ok: true, status: 200, text: () => Promise.resolve('ok'), json: () => Promise.resolve({}) } as Response;
      }),
    );

    // Simulate production's in-page remote config (WORKLOG.md K-1: `_POSTHOG_REMOTE_CONFIG` is
    // defined in-page). This makes init take the _onRemoteConfig → ensureFlagsLoaded path
    // SYNCHRONOUSLY rather than the script-injection path jsdom cannot complete, so the test
    // exercises the natural init trigger — not a reset() artifact. `hasFeatureFlags: true` ensures
    // the flags-load branch is taken (so the fix, not an absent branch, is what stops /flags).
    (window as unknown as { _POSTHOG_REMOTE_CONFIG?: Record<string, unknown> })._POSTHOG_REMOTE_CONFIG = {
      [TOKEN]: { config: { hasFeatureFlags: true } },
    };

    const { stripProductText } = await import('@/instrumentation-client');
    const posthog = (await import('posthog-js')).default;

    const captured: Array<{ event: string; properties: Record<string, unknown> }> = [];
    const unsub = posthog.on('eventCaptured', (data: unknown) => {
      const d = data as { event: string; properties: Record<string, unknown> };
      captured.push({ event: d.event, properties: d.properties ?? {} });
    });

    const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

    try {
      posthog.init(TOKEN, {
        api_host: 'https://us.i.posthog.com',
        ui_host: 'https://us.i.posthog.com',
        // The production posture from instrumentation-client.ts:
        person_profiles: 'identified_only',
        autocapture: false,
        disable_session_recording: true,
        capture_pageview: 'history_change',
        sanitize_properties: stripProductText,
        // THE FIX under test — stops reloadFeatureFlags (and the /flags POST it debounces into)
        // at the source. mirror whatever instrumentation-client.ts sets, or this test proves
        // nothing about production.
        advanced_disable_feature_flags: true,
        // Test-only wire-encoding/transparency divergences, none of which touch the flags path:
        capture_exceptions: false, // keep the assertion surface to pageview + the two events we fire
        disable_compression: true, // plaintext JSON bodies so the question is grep-visible if leaked
        request_queue_config: { flush_interval_ms: 0 }, // flush the /e/ batch promptly
      });

      // init → (remote config preset) → _onRemoteConfig → ensureFlagsLoaded → reloadFeatureFlags.
      // On the unfixed code reloadFeatureFlags debounces _callFlagsEndpoint into a 5ms setTimeout
      // and /flags fires here. Let that window elapse before hammering the other paths.
      await settle();

      // Every other code path that reaches /flags funnels through reloadFeatureFlags too, so each
      // is a separate red-proof leg: removing the guard lets /flags fire on that trigger.
      posthog.reloadFeatureFlags();
      await settle();
      // reset() calls reloadFeatureFlags (posthog-core.js:2828) — the deep-link/cookie-reset path.
      posthog.reset();
      await settle();
      // identify() calls reloadFeatureFlags on the anonymous→identified transition (line 2381) —
      // the path that retrospectively ties the leaked $initial_current_url to a user id.
      posthog.identify('opaque-user-id-42');
      await settle();

      // A representative custom event, plus the explicit pageview. Both go to /e/ (the sanitized
      // path) and prove the SDK is alive — the fix disabled FLAGS, not capture.
      posthog.capture('question_asked', { is_followup: false });
      document.title = QUESTION; // $pageview sets properties.title = document.title; sanitizer deletes it
      posthog.capture('$pageview', {});
      await settle(50);
    } finally {
      unsub();
      posthog.reset();
    }

    // PRIMARY GUARD: no /flags request fired on ANY trigger. This is the line that goes red the
    // moment `advanced_disable_feature_flags` is removed — a POST to /flags/?v=2 would appear
    // carrying `q=<question>` inside person_properties.$initial_current_url.
    const flagsRequests = calls.filter((c) => /\/flags\b/.test(c.url));
    expect(flagsRequests, 'no POST /flags should fire when advanced_disable_feature_flags is true')
      .toEqual([]);

    // BELT-AND-BRACES: across EVERY outbound request (not just /flags), no body carries the
    // question, in either the raw (decoded) or the encodeURIComponent form posthog-js stores off
    // location.href. A future code path that emits $initial_current_url outside both /flags and the
    // sanitized /e/ pipeline lands on these lines, not in production.
    for (const c of calls) {
      expect(c.body, `${c.method} ${c.url} body leaked the reader question`).not.toContain(QUESTION);
      expect(c.body, `${c.method} ${c.url} body leaked theEncoded reader question`).not.toContain(`q=${ENCODED}`);
    }

    // CONTROL: capture is still alive — the fix disabled flags, not the /e/ pipeline the file
    // header ties DAU/churn/attribution to. A $pageview and a question_asked event were captured.
    const pageview = captured.find((e) => e.event === '$pageview');
    const custom = captured.find((e) => e.event === 'question_asked');
    expect(pageview, 'a $pageview was captured — capture is not over-disabled').toBeTruthy();
    expect(custom, 'a question_asked event was captured — capture is not over-disabled').toBeTruthy();

    // CONTROL: the /e/ capture path the sanitizer DOES run on is still clean — the fix is
    // surgical (flags only) and did not regress the existing audit-defect-#3 closure. No string
    // property of any captured event carries the question, and $current_url is the sanitized URL.
    for (const ev of captured) {
      for (const [k, v] of Object.entries(ev.properties)) {
        if (typeof v !== 'string') continue;
        expect(v, `${ev.event}.${k} leaked the reader question on the /e/ path`).not.toContain(QUESTION);
        expect(v, `${ev.event}.${k} leaked theEncoded reader question on the /e/ path`).not.toContain(ENCODED);
      }
    }
    expect(pageview!.properties.$current_url).toBe(SANITIZED_URL);
    expect(custom!.properties.$current_url).toBe(SANITIZED_URL);
    // title was seeded WITH the question; the sanitizer deletes it (analytics-url-sanitizer.test.ts
    // pins this at unit level). Re-assert here so a regression that re-introduces an unsanitized
    // $pageview title is caught on a real event, not only in the unit test.
    expect(pageview!.properties).not.toHaveProperty('title');
  });
});
