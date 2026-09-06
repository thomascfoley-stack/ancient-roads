// PostHog wiring — analytics BESIDE the product, never inside it.
//
// REWRITTEN 2026-08-18 after the owner ruling ("it should never be embedded in the product") and
// the pre-deploy audit that found four HIGHs in the previous shape. The old version of this file
// asserted the OPPOSITE of what is now required: it pinned the same-origin `/ingest` reverse proxy
// in place, checked the static leg came first, and checked `skipTrailingSlashRedirect` was on. Each
// of those was a genuine guard for "the integration silently dies" — and together they welded in
// the mechanism that forwarded `site_gate` and the Neon Auth session cookie to a third party on
// every beacon, because Next's external rewrites copy request headers verbatim.
//
// So the guards here now protect the opposite property: that analytics CANNOT reach product data,
// and cannot borrow our origin. "It silently dies" is an accepted outcome — the owner said so in
// as many words — and is therefore deliberately NOT tested for.

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as middlewareConfig } from '@/middleware';

const CLIENT = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/instrumentation-client.ts'),
  'utf8',
);

describe('posthog wiring — analytics must not be embedded in the product', () => {
  it('no route is exempted from the site gate for analytics', () => {
    const re = new RegExp(`^${middlewareConfig.matcher[0]}$`);
    // The gate must now COVER /ingest — the opposite of what this file used to assert. If a
    // beacon path is ever exempted again, it is a hole in the wall punched in the matcher rather
    // than in `PUBLIC_PATHS`, which is where gate.ts says holes must be declared.
    expect(re.test('/ingest/e/'), '/ingest must be gated — it is not ours to exempt').toBe(true);
    // Control: the genuinely public/infra paths are still excluded, or the line above proves nothing.
    expect(re.test('/gate')).toBe(false);
    expect(re.test('/_next/static/x.js')).toBe(false);
    expect(re.test('/ask')).toBe(true);
  });

  it('next.config proxies NOTHING to a third party', async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    delete process.env.CORPUS_CDN_BASE;
    const cfg = (await import('../next.config')).default;
    const rw = (await cfg.rewrites!()) as { beforeFiles: { source: string; destination: string }[] };
    expect(rw.beforeFiles, 'with no corpus CDN configured there should be no rewrites at all').toEqual([]);
  });

  it('with the corpus CDN configured, every rewrite still points at OUR OWN store', async () => {
    vi.resetModules();
    process.env.CORPUS_CDN_BASE = 'https://example.public.blob.vercel-storage.com';
    const cfg = (await import('../next.config')).default;
    const rw = (await cfg.rewrites!()) as { beforeFiles: { source: string; destination: string }[] };
    delete process.env.CORPUS_CDN_BASE;
    expect(rw.beforeFiles.length).toBeGreaterThan(0);
    for (const r of rw.beforeFiles) {
      expect(r.destination, `rewrite to a non-corpus host: ${r.destination}`).toContain('blob.vercel-storage.com');
      expect(r.source, 'no analytics path may be rewritten').not.toMatch(/ingest/);
    }
  });

  it('the client sends no product text: autocapture and replay stay off', () => {
    // Each of these defaults to ON in posthog-js, so absence is not safety — the explicit
    // `false` is the mechanism, and this is what pins it. These two were the real leaks:
    // autocapture ships `$el_text` and replay ships the rendered screen.
    expect(CLIENT, 'autocapture ships $el_text — study titles, uploaded filenames').toMatch(/autocapture:\s*false/);
    expect(CLIENT, 'replay records rendered page text, not just inputs').toMatch(/disable_session_recording:\s*true/);
  });

  // THE PAGEVIEW ASSERTION WAS RETIRED HERE, 2026-08-24, and it is worth stating why rather than
  // just deleting a line. This file used to require `capture_pageview: false`, and its stated
  // reason was "$current_url carries /ask?q=<the reader's question>". The owner then asked for
  // DAU, 7-day churn, and campaign attribution — none of which can exist without an event per
  // visit. So the REQUIREMENT changed, by directive, and a guard that outlives its requirement is
  // just a green check standing in the way of the thing it was protecting against.
  //
  // What did NOT change is the property that reason names. It moved to a stronger mechanism: the
  // allowlist in `sanitizeUrl`, which drops `q` (and everything else unrecognised) off EVERY
  // event, and which is tested directly and adversarially in test/analytics-url-sanitizer.test.ts
  // — including the `/gate?next=%2Fask%3Fq%3D…` nesting the original audit named. A denylist
  // seeded in its place turns three of those tests red, that leak included.
  //
  // This is the same move this file's header records from 2026-08-18: rewritten to protect the
  // property, not adjusted to keep passing.
  it('the client sanitizes every event by ALLOWLIST — the mechanism that replaced pageviews-off', () => {
    expect(CLIENT).toMatch(/sanitize_properties:\s*stripProductText/);
    expect(CLIENT).toMatch(/\$current_url/);
    expect(CLIENT).toMatch(/\$el_text/);
    // The sanitizer must cover the $session_entry_* family. posthog-js's SessionPropsManager
    // attaches $session_entry_url (the entry page's full href, with ?q=<question>) to EVERY
    // event in a session, merged before sanitize_properties runs — the leak that reopened audit
    // defect #3. If the source's URL-key match ever shrinks back to a hand-list that omits it,
    // this goes red. The match is pinned to the actual CODE mechanism — the `(session_entry_)?`
    // alternation in the RegExp — rather than the bare word `session_entry`, which this file's
    // own JSDoc also mentions and which would therefore stay green on the reverted hand-list.
    expect(CLIENT, 'the sanitizer must match $session_entry_* keys by code, not just JSDoc')
      .toMatch(/\(session_entry_\)\?/);
    // An allowlist membership test, not a denylist comparison. If someone "fixes" a missing
    // parameter by switching to `k !== 'q'`, this goes red before the leak ships.
    expect(CLIENT, 'the URL filter must be an allowlist (CAMPAIGN_PARAMS.has), never a denylist')
      .toMatch(/CAMPAIGN_PARAMS\.has\(/);
    expect(CLIENT, 'a denylist on the query string is the exact defect the allowlist replaced')
      .not.toMatch(/k\s*!==\s*['"]q['"]/);
  });

  it('identity is bound by opaque user id — never an email', () => {
    // Churn cohorts need a stable person; they do not need PII, and this repo's standing rule is
    // that PII stays out of third-party systems. `identify(email)` would satisfy the first and
    // breach the second, silently.
    const raw = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/analytics.ts'),
      'utf8',
    );
    // COMMENTS STRIPPED FIRST — the same rule the migration-shape suites use. Without it this
    // asserts against prose: the file's own header explains that no `$set` is sent, and a
    // negative match would read that sentence as the very code it forbids. (Measured: it did.)
    const analytics = raw
      .replace(/\/\*[\s\S]*?\*\//g, '') // JSDoc blocks FIRST — the `$set` mention lives in one
      .split('\n')
      .map((line) => { const i = line.indexOf('//'); return i === -1 ? line : line.slice(0, i); })
      .join('\n');
    expect(analytics).toMatch(/posthog\.identify\(userId\)/);
    expect(analytics, 'no email may be passed to identify or set as a person property')
      .not.toMatch(/identify\([^)]*email/i);
    expect(analytics, 'no $set of personal data alongside identify').not.toMatch(/\$set\b/);
  });

  it('the client dials PostHog directly, never through our origin', () => {
    expect(CLIENT, "api_host must be PostHog's own origin, not '/ingest'").toMatch(/api_host:\s*POSTHOG_HOST/);
    expect(CLIENT).not.toMatch(/api_host:\s*['"]\/ingest/);
  });

  // K-1 (UX_REMEDIATION_PLAN.md) — the assertion this file spent seven `it()` blocks NOT making.
  //
  // Every other guard here checks something ABOUT the integration: that it is gated, not proxied,
  // not autocapturing, allowlist-sanitized, opaquely identified, direct-dialled. None of them
  // asked whether the browser is ALLOWED TO LOAD THE SCRIPT AT ALL — so this file was fully green
  // while PostHog was 100% dark in production: `script-src` omitted the assets host that
  // `connect-src` already named, i.e. the policy contradicted itself, and every SDK asset
  // (config.js, exception-autocapture.js, surveys.js) was blocked before `posthog.init` could run.
  //
  // "It silently dies" is an accepted outcome for the BEACON (see this file's header — owner
  // ruling). It is NOT an accepted outcome for the policy to forbid what it simultaneously
  // permits: that is a self-contradiction, not a trade-off, and it cost an unknown number of days
  // of data. Both directions are pinned below so it cannot regress either way.
  it('the CSP permits the PostHog SDK to LOAD, and still permits it to CONNECT', async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    const cfg = (await import('../next.config')).default;
    const headers = await cfg.headers!();
    const csp = headers
      .flatMap((h) => h.headers)
      .find((h) => h.key === 'Content-Security-Policy')?.value;
    expect(csp, 'no Content-Security-Policy header is emitted at all').toBeTruthy();

    const directive = (name: string) =>
      csp!.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';

    // The defaults, spelled out rather than recomputed from the source under test — recomputing
    // them here would let a wrong host in next.config make this test agree with it.
    const ASSETS = 'https://us-assets.i.posthog.com';
    const API = 'https://us.i.posthog.com';

    // The bug: assets host absent from script-src. This is the leg that goes RED on unfixed code.
    expect(directive('script-src'), `script-src must name ${ASSETS} or the SDK cannot load`)
      .toContain(ASSETS);
    // The other direction (DeepSeek's addition): connect-src must keep BOTH, so a future "tidy-up"
    // cannot fix the contradiction by deleting the connect entries instead.
    expect(directive('connect-src'), `connect-src must keep ${API}`).toContain(API);
    expect(directive('connect-src'), `connect-src must keep ${ASSETS}`).toContain(ASSETS);
  });
});
