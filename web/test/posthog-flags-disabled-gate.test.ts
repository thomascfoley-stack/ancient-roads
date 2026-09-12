// THE GATE-REDIRECT VARIANT of the flags-path leak guard. posthog-flags-disabled.test.ts covers
// the directly-shared `/ask?q=…` deep link. This file covers the OTHER question-bearing entry URL —
// the `/gate?next=%2Fask%3Fq%3D…` redirect every UNAUTHENTICATED external deep-linker lands on.
//
// middleware.ts 307-redirects an unauthenticated `GET /ask?q=…` to `/gate?next=${encodeURIComponent('/ask?q=…')}`
// because `/ask` is not in the public tier (gate.ts). That redirect URL is itself question-bearing,
// and it is the predominant production path for an external deep-linker. The only difference from
// the primary test is the URL form: the browser's `location.href` percent-encodes the `next` param,
// so the question reaches PostHog percent-encoded (nested) rather than verbatim.
//
// The fix under test (`advanced_disable_feature_flags: true`) stops /flags at the source
// regardless of the URL form — reloadFeatureFlags early-returns before the body is ever built, so
// the question never leaves whether it is verbatim, single-encoded, or nested-encoded. This test
// pins that for the gate form specifically, so a regression that re-enables /flags cannot hide
// behind "but the gate URL is a different shape".
//
// RED-PROOF: remove `advanced_disable_feature_flags: true` and a POST /flags/?v=2 fires carrying
// `next=%2Fask%3Fq%3DWhat%20did%20Calvin%20say%20about%20grace` inside $initial_current_url.

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const QUESTION = 'What did Calvin say about grace';
// The gate URL encodes the WHOLE `/ask?q=…` path inside `next`, so the question is percent-encoded
// (the `?` and `=` of the inner query become %3F and %3D under the outer param's encoding).
const NEXT = encodeURIComponent(`/ask?q=${QUESTION}`); // %2Fask%3Fq%3DWhat%20did%20Calvin%20say%20about%20grace
const PAGE_URL = `https://ancientpaths.app/gate?next=${NEXT}`;
const SANITIZED_URL = 'https://ancientpaths.app/gate';
const TOKEN = 'phc_test_key';

describe('posthog never fires POST /flags — the /gate?next=… redirect path', () => {
  it('no /flags request fires when the first-visit URL is the gate redirect; the question never leaves', async () => {
    vi.stubGlobal('location', new URL(PAGE_URL));

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
        person_profiles: 'identified_only',
        autocapture: false,
        disable_session_recording: true,
        capture_pageview: 'history_change',
        sanitize_properties: stripProductText,
        advanced_disable_feature_flags: true,
        capture_exceptions: false,
        disable_compression: true,
        request_queue_config: { flush_interval_ms: 0 },
      });
      await settle();
      posthog.reloadFeatureFlags();
      await settle();
      posthog.reset();
      await settle();
      posthog.identify('opaque-user-id-99');
      await settle();
      posthog.capture('question_asked', { is_followup: false });
      posthog.capture('$pageview', {});
      await settle(50);
    } finally {
      unsub();
      posthog.reset();
    }

    // PRIMARY GUARD: no /flags request. Red on unfixed code — the gate URL leaks in
    // $initial_current_url as `next=%2Fask%3Fq%3D…`.
    const flagsRequests = calls.filter((c) => /\/flags\b/.test(c.url));
    expect(flagsRequests, 'no POST /flags should fire for the gate-redirect path')
      .toEqual([]);

    // BELT-AND-BRACES: no outbound body carries the question in either the raw phrase or the
    // percent-encoded `next=` form. The gate path percent-encodes the query, so assert on BOTH the
    // raw QUESTION and the nested-encoded NEXT — the latter is what production's /flags body would
    // literally contain if the guard regressed.
    for (const c of calls) {
      expect(c.body, `${c.method} ${c.url} body leaked the reader question`).not.toContain(QUESTION);
      expect(c.body, `${c.method} ${c.url} body leaked the gate-smuggled question`).not.toContain(`next=${NEXT}`);
    }

    // CONTROL: capture still alive and the /e/ sanitizer still strips the gate's `next` param.
    const pageview = captured.find((e) => e.event === '$pageview');
    const custom = captured.find((e) => e.event === 'question_asked');
    expect(pageview, 'a $pageview was captured — capture is not over-disabled').toBeTruthy();
    expect(custom, 'a question_asked event was captured — capture is not over-disabled').toBeTruthy();
    for (const ev of captured) {
      for (const [k, v] of Object.entries(ev.properties)) {
        if (typeof v !== 'string') continue;
        expect(v, `${ev.event}.${k} leaked the reader question on the /e/ path`).not.toContain(QUESTION);
        expect(v, `${ev.event}.${k} leaked the gate-smuggled question on the /e/ path`).not.toContain(NEXT);
      }
    }
    expect(pageview!.properties.$current_url).toBe(SANITIZED_URL);
    expect(custom!.properties.$current_url).toBe(SANITIZED_URL);
  });
});
