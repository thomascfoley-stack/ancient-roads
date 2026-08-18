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

  it('the client sends no product text: autocapture, pageviews and replay are all off', () => {
    // Each of these defaults to ON in posthog-js, so absence is not safety — the explicit
    // `false` is the mechanism, and this is what pins it.
    expect(CLIENT, 'autocapture ships $el_text — study titles, uploaded filenames').toMatch(/autocapture:\s*false/);
    expect(CLIENT, '$current_url carries /ask?q=<the reader\'s question>').toMatch(/capture_pageview:\s*false/);
    expect(CLIENT, 'replay records rendered page text, not just inputs').toMatch(/disable_session_recording:\s*true/);
  });

  it('the client strips query strings off every event, not just pageviews', () => {
    // `$current_url` rides EVERY event, so capture_pageview:false is necessary and not sufficient.
    expect(CLIENT).toMatch(/sanitize_properties:\s*stripProductText/);
    expect(CLIENT).toMatch(/\$current_url/);
    expect(CLIENT).toMatch(/\$el_text/);
  });

  it('the client dials PostHog directly, never through our origin', () => {
    expect(CLIENT, "api_host must be PostHog's own origin, not '/ingest'").toMatch(/api_host:\s*POSTHOG_HOST/);
    expect(CLIENT).not.toMatch(/api_host:\s*['"]\/ingest/);
  });
});
