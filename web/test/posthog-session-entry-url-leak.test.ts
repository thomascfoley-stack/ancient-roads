// The sanitizer's unit tests (test/analytics-url-sanitizer.test.ts) call `stripProductText`
// on hand-built objects — so they can only ever assert on keys the sanitizer already knows
// about, which is exactly how `$session_entry_url` slipped past a hand-kept list in the first
// place. This file is the BELT-AND-BRACES test that test was missing: it loads the REAL
// posthog-js, points it at a question-bearing URL the way a reader's first page of a session
// would, fires the two representative events (a custom `question_asked` and a `$pageview`), and
// reads the exact payload that would be POSTed via `posthog.on('eventCaptured')`.
//
// What makes this a guard rather than a snapshot: it asserts that NO string property of ANY
// emitted event contains the seeded question — not `$current_url`, not `$session_entry_url`,
// not `title`, not any future key posthog-js starts attaching. So a future posthog-js rename
// that the sanitizer's regex misses turns this red instead of re-opening audit defect #3.
//
// On the unfixed code this fails: `$session_entry_url` carries `?q=<question>` verbatim for the
// whole session while `$current_url` beside it is sanitized to `/ask`. After the fix both are
// `/ask`.

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// The reader's question, as it would appear in the URL Bar. We assert no property contains
// EITHER form — the raw phrase (a decoded value) or the `encodeURIComponent` form (the verbatim
// substring posthog-js stores off `location.href`).
const QUESTION = 'What did Calvin say about grace';
const ENCODED = encodeURIComponent(QUESTION); // 'What%20did%20Calvin%20say%20about%20grace'
const PAGE_URL = `https://ancientpaths.app/ask?q=${ENCODED}`;
const SANITIZED_URL = 'https://ancientpaths.app/ask';

describe('posthog-js never ships the reader question — $session_entry_url included', () => {
  it('no string property of a custom event or $pageview carries the question', async () => {
    // browser-common's globals module captures `location` by reference at load time, so the
    // stub must be in place BEFORE posthog-js is imported — hence the dynamic import here, and
    // the single-test-file isolation that keeps the registry fresh.
    vi.stubGlobal('location', new URL(PAGE_URL));
    // Stop posthog's transport from making a real network call (jsdom would otherwise try to
    // POST to us.i.posthog.com). We only inspect the pre-send `eventCaptured` payload, so a
    // canned ok response is enough.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('ok'), json: () => Promise.resolve({}) }));

    const { stripProductText } = await import('@/instrumentation-client');
    const posthog = (await import('posthog-js')).default;

    const captured: Array<{ event: string; properties: Record<string, unknown> }> = [];
    posthog.init('phc_test_key', {
      api_host: 'https://us.i.posthog.com',
      // The production posture from instrumentation-client.ts: anonymous stays anonymous, the
      // two product-content channels stay off.
      person_profiles: 'identified_only',
      autocapture: false,
      disable_session_recording: true,
      // Deliberate divergences from production, none of which touch the SessionPropsManager
      // merge that attaches `$session_entry_url`: suppress autonomous events so the two
      // asserts below observe ONLY the events we fire; readable/synchronous transport so a
      // queued body is inspectable if needed.
      capture_pageview: false,
      capture_exceptions: false,
      disable_compression: true,
      request_queue_config: { flush_interval_ms: 0 },
      // The production sanitizer — the unit under test.
      sanitize_properties: stripProductText,
    });

    const unsub = posthog.on('eventCaptured', (data: unknown) => {
      const d = data as { event: string; properties: Record<string, unknown> };
      captured.push({ event: d.event, properties: d.properties ?? {} });
    });

    const priorTitle = document.title;
    try {
      // Mint a fresh session so the entry URL is exactly PAGE_URL (no leftover state). This is
      // the moment SessionPropsManager._onSessionIdCallback captures location.href as the
      // session's entry `u`, later re-emitted as $session_entry_url on every event.
      posthog.reset();
      posthog.capture('question_asked', { is_followup: false });
      // Seed document.title WITH the question so the $pageview path (which sets properties.title
      // = document.title) is exercised: if the sanitizer ever stops deleting `title`, the belt-
      // and-braces loop below catches the leak on a real event, not only in the unit test.
      document.title = QUESTION;
      // Explicit $pageview mirrors what capture_pageview:'history_change' emits on a client-side
      // nav; posthog-core sets properties['title'] = document.title on it.
      posthog.capture('$pageview', {});
    } finally {
      unsub();
      posthog.reset();
      document.title = priorTitle;
    }

    const custom = captured.find((e) => e.event === 'question_asked');
    const pageview = captured.find((e) => e.event === '$pageview');
    expect(custom, 'a question_asked event was captured').toBeTruthy();
    expect(pageview, 'a $pageview event was captured').toBeTruthy();

    // THE guard: no string property of ANY emitted event carries the question, in either form.
    // A future posthog-js key the sanitizer's regex misses lands on this line, not in
    // production.
    for (const ev of captured) {
      for (const [k, v] of Object.entries(ev.properties)) {
        if (typeof v !== 'string') continue;
        expect(v, `${ev.event}.${k} leaked the reader question`).not.toContain(QUESTION);
        expect(v, `${ev.event}.${k} leaked the reader question`).not.toContain(ENCODED);
      }
    }

    // The specific fix: $session_entry_url was the channel the hand-list missed. Pin it by name
    // on both event types, so a regression that re-introduces an unsanitized entry-URL key is
    // caught here even if the belt-and-braces loop above somehow missed it.
    expect(custom!.properties.$current_url).toBe(SANITIZED_URL);
    expect(custom!.properties.$session_entry_url).toBe(SANITIZED_URL);
    expect(pageview!.properties.$current_url).toBe(SANITIZED_URL);
    expect(pageview!.properties.$session_entry_url).toBe(SANITIZED_URL);

    // person_profiles:'identified_only' is NOT a gate on the session-props merge — the leak has
    // always persisted for anonymous events. Prove the events above were anonymous, so the
    // assertions above are known to hold in that case rather than behind identify().
    expect(custom!.properties.$is_identified).toBe(false);
  });
});
