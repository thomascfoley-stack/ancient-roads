// @vitest-environment jsdom

// /home DOWNLOADED THE WHOLE YEAR TO RENDER ONE MORNING.
//
// TodayView fetched `/devotional/morning-evening.json` (1.42 MB) and
// `/devotional/daily-light.json` (0.82 MB) on every load and used ONE day-key out of 366 from
// each — 4,056 bytes of 1,489,403, or 0.27%. Measured across all 732 day-halves, the fixed
// devotional cost was 2.24 MB before the commentary chapter (p50 0.99 MB, p90 3.08 MB, max
// 9.15 MB for Psalm 119) was added on top: a p50 first paint of 3.24 MB and a worst case of
// 11.40 MB, all of it fetched and JSON.parse'd on the main thread while the screen said
// "Opening today's page…". Parse itself is cheap (12 ms for the 9 MB file, node/desktop) — the
// block is the transfer, which is why it reads as a ~30-second hang on a phone and not on a
// laptop.
//
// The fix is the pattern the corpus already uses (`/commentaries/<slug>/<chapter>.json`,
// lib/bible.ts fetchCommentary): one static file per day, CDN-cacheable, so the client asks for
// the day it is actually rendering. It stays CLIENT-side, because the day and the AM/PM half key
// off the reader's LOCAL clock and a server renders in UTC.
//
// The two sources stay SEPARATE FILES on purpose: today-view.tsx degrades them independently
// ("a missing file must never cost the reader the rest of the page"), and one combined file
// would couple those failures.

import { act, cleanup, render } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const here = join(fileURLToPath(import.meta.url), '..');
const devotional = join(here, '..', '..', 'public', 'devotional');

interface Entry { [k: string]: unknown }
type YearFile = Record<string, { am?: Entry; pm?: Entry }>;

const readYear = (name: string) =>
  JSON.parse(readFileSync(join(devotional, `${name}.json`), 'utf8')) as YearFile;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('/home asks for the day it is rendering, not the year', () => {
  it('never fetches the whole-year devotional files', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        // Everything 404s: the assertion is about what was REQUESTED, and TodayView is built to
        // degrade to absence, so a page of misses is a legitimate render.
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
      }),
    );

    const { TodayView } = await import('@/components/today-view');
    render(<TodayView />);
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    // The 2.24 MB of waste, by name.
    expect(urls, 'the 1.42 MB whole-year Spurgeon file must not be on the /home critical path')
      .not.toContain('/devotional/morning-evening.json');
    expect(urls, 'the 0.82 MB whole-year Daily Light file must not be on the /home critical path')
      .not.toContain('/devotional/daily-light.json');

    // ...and what it asks for instead is keyed to a single MM-DD, both sources still separate.
    const dayScoped = urls.filter((u) => /^\/devotional\/[a-z-]+\/\d{2}-\d{2}\.json$/.test(u));
    expect(dayScoped, `expected two day-scoped devotional fetches, got ${JSON.stringify(urls)}`)
      .toHaveLength(2);
    expect(new Set(dayScoped.map((u) => u.split('/')[2])), 'one file per source, kept separate')
      .toEqual(new Set(['morning-evening', 'daily-light']));
  });

  it('asks for the reader’s LOCAL day, not UTC', async () => {
    // 2026-03-15 21:30 local. In any timezone west of UTC this instant is already the 16th in
    // UTC, so a UTC-derived key would ask for 03-16 and serve the wrong morning.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15, 21, 30, 0));

    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
      }),
    );

    const { TodayView } = await import('@/components/today-view');
    render(<TodayView />);
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    expect(urls).toContain('/devotional/morning-evening/03-15.json');
    expect(urls).toContain('/devotional/daily-light/03-15.json');
  });
});

describe('the biggest payload on /home is cacheable', () => {
  it('/commentaries/* carries a Cache-Control, like /devotional/* already does', async () => {
    // next.config.ts caches `/devotional/:path*` and says why: "~2.3MB together… without this
    // they revalidate on every visit — real egress money on a static asset". Every word of that
    // is MORE true of the commentary chapters, which the same /home mount also fetches and which
    // are BIGGER — p50 0.99 MB, p90 3.08 MB, 9.15 MB for Psalm 119 — and they had no
    // Cache-Control at all. The smaller payload was cached and the larger one was not.
    const { default: config } = await import('@/../next.config');
    const headers = await config.headers!();
    const rule = headers.find((h) => h.source.startsWith('/commentaries'));
    expect(rule, 'no /commentaries rule in next.config.ts headers()').toBeTruthy();
    const cache = rule!.headers.find((h) => h.key.toLowerCase() === 'cache-control');
    expect(cache, '/commentaries/* must not revalidate a multi-megabyte file every visit').toBeTruthy();
    expect(cache!.value).toMatch(/max-age=\d+/);
  });
});

describe('the per-day split is lossless and small', () => {
  for (const source of ['morning-evening', 'daily-light'] as const) {
    it(`${source}: every day of the year has its file, byte-identical to the year file`, () => {
      const year = readYear(source);
      const keys = Object.keys(year);
      expect(keys.length, 'the year file should still hold all 366 day-keys').toBe(366);

      const missing: string[] = [];
      const differing: string[] = [];
      for (const key of keys) {
        const path = join(devotional, source, `${key}.json`);
        if (!existsSync(path)) { missing.push(key); continue; }
        const split: unknown = JSON.parse(readFileSync(path, 'utf8'));
        // Not "looks similar" — the same value. A split that quietly drops `attribution` would
        // strip the licence line off verbatim text, which is the one thing this repo cannot ship.
        if (JSON.stringify(split) !== JSON.stringify(year[key])) differing.push(key);
      }
      expect(missing, `days with no per-day file: ${missing.slice(0, 5).join(', ')}`).toEqual([]);
      expect(differing, `days whose per-day file differs: ${differing.slice(0, 5).join(', ')}`).toEqual([]);
    });

    it(`${source}: no day file is anywhere near the whole-year payload`, () => {
      const year = readYear(source);
      const CAP = 64 * 1024; // a day is ~2-4 KB; the year files are 0.82 MB and 1.42 MB.
      const oversized: string[] = [];
      let measured = 0;
      for (const key of Object.keys(year)) {
        const path = join(devotional, source, `${key}.json`);
        if (!existsSync(path)) continue;
        measured++;
        const bytes = Buffer.byteLength(readFileSync(path));
        if (bytes > CAP) oversized.push(`${key} (${bytes} bytes)`);
      }
      // Without this line the loop measures nothing when the split does not exist and the test
      // reports green — the exact vacuous pass this repo audits its own suite for.
      expect(measured, 'no per-day file was measured, so the size bound proved nothing').toBe(366);
      expect(oversized, `day files over 64 KB: ${oversized.slice(0, 5).join(', ')}`).toEqual([]);
    });
  }
});
