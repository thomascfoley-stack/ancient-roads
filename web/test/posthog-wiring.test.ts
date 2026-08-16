// PostHog wiring (owner ruling O-2) — the three ways this integration silently dies:
//
//   1. middleware matcher sweeps /ingest into the site gate → every beacon 307s to /gate
//      and PostHog shows ZERO events with no error anywhere.
//   2. The /ingest rewrites are missing or point at the wrong host → same symptom.
//   3. NEXT_PUBLIC_POSTHOG_HOST stops reaching the rewrites (region move breaks silently).
//
// These are config-shape tests because the failures they catch are config-shaped. The
// behavioral twin (an event actually landing) requires a real project key — owner-side,
// per O-2: "alerting must be observed firing".
import { describe, expect, it, vi } from 'vitest';
import { config as middlewareConfig } from '@/middleware';

describe('posthog wiring — O-2', () => {
  it('the site gate does NOT touch /ingest (beacons would 307 to /gate and vanish)', () => {
    // The matcher strings Next accepts here are path-regexes; evaluate the real one.
    const re = new RegExp(`^${middlewareConfig.matcher[0]}$`);
    expect(re.test('/ingest/e/')).toBe(false);
    expect(re.test('/ingest/static/recorder.js')).toBe(false);
    // Control: an app route must still match, or the two assertions above prove nothing.
    expect(re.test('/ask')).toBe(true);
  });

  it('next.config reverse-proxies /ingest to PostHog, static leg first, slash redirect off', async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    delete process.env.CORPUS_CDN_BASE;
    const cfg = (await import('../next.config')).default;
    const rw = (await cfg.rewrites!()) as { beforeFiles: { source: string; destination: string }[] };
    expect(rw.beforeFiles[0]).toEqual({
      source: '/ingest/static/:path*',
      destination: 'https://us-assets.i.posthog.com/static/:path*',
    });
    expect(rw.beforeFiles[1]).toEqual({
      source: '/ingest/:path*',
      destination: 'https://us.i.posthog.com/:path*',
    });
    expect(cfg.skipTrailingSlashRedirect).toBe(true);
  });

  it('NEXT_PUBLIC_POSTHOG_HOST drives both legs (US→EU is a var change, not a code change)', async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';
    const cfg = (await import('../next.config')).default;
    const rw = (await cfg.rewrites!()) as { beforeFiles: { source: string; destination: string }[] };
    expect(rw.beforeFiles[0].destination).toBe('https://eu-assets.i.posthog.com/static/:path*');
    expect(rw.beforeFiles[1].destination).toBe('https://eu.i.posthog.com/:path*');
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  });

  it('the ingest legs survive the corpus CDN being configured (merge, not replace)', async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    process.env.CORPUS_CDN_BASE = 'https://example.blob.vercel-storage.com';
    const cfg = (await import('../next.config')).default;
    const rw = (await cfg.rewrites!()) as { beforeFiles: { source: string }[] };
    expect(rw.beforeFiles.map((r) => r.source)).toEqual([
      '/ingest/static/:path*',
      '/ingest/:path*',
      '/bible/:path*',
      '/commentaries/:path*',
      '/original/:path*',
    ]);
    delete process.env.CORPUS_CDN_BASE;
  });
});
