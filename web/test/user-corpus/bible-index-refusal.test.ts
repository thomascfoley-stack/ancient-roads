// The missing-bible condition, on BOTH load paths, must surface as a typed
// `BibleIndexUnavailable` — never a raw `ENOENT` — so `processOne` can fail the document
// permanently with a recognisable reason instead of retrying a deployment fault three times.
//
// This is the probe the bug report asked for, asserting the FIXED contract. Before the fs→HTTP
// fix the detection path (`availableTranslations` → `readdirSync`, called first by
// `detectDocumentTranslation`) threw a RAW `ENOENT` because only `getAnchorIndex` was guarded.
// Now every missing-bible path is guarded.
//
// The two production shapes:
//  - CDN mode: `CORPUS_CDN_BASE` set, the Blob store answers (or does not). `fetch` is stubbed.
//  - local mode: `CORPUS_CDN_BASE` unset, `public/bible/` absent from the filesystem. `node:fs`
//    is stubbed to simulate that absence regardless of whether the dev tree has the gitignored
//    corpus symlink.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// File-wide: the local (fs) path always sees an ABSENT bible, the way a Vercel serverless
// function does (public/bible is excluded from the deploy bundle). The CDN legs below never
// touch fs — CORPUS_CDN_BASE routes them through fetch — so the mock is inert for them.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const enoent = (op: string) =>
    Object.assign(new Error(`ENOENT: no such file or directory, ${op}`), { code: 'ENOENT' });
  return {
    ...actual,
    existsSync: () => false,
    readdirSync: () => {
      throw enoent('scandir');
    },
    readFileSync: () => {
      throw enoent('open');
    },
  } as typeof import('node:fs');
});

const CDN = 'https://cdn.example.test';
let savedBase: string | undefined;

function notFound(): Response {
  return new Response('not found', { status: 404, statusText: 'Not Found' });
}

beforeEach(() => {
  savedBase = process.env.CORPUS_CDN_BASE;
  vi.resetModules();
});

afterEach(() => {
  if (savedBase === undefined) delete process.env.CORPUS_CDN_BASE;
  else process.env.CORPUS_CDN_BASE = savedBase;
  vi.unstubAllGlobals();
});

async function importIndex() {
  return import('../../src/lib/user-corpus/bible-index');
}

describe('CDN mode — missing bible surfaces as BibleIndexUnavailable, never raw ENOENT', () => {
  it('availableTranslations resolves to [] when no translation ships jhn (all probes 404)', async () => {
    process.env.CORPUS_CDN_BASE = CDN;
    vi.stubGlobal('fetch', vi.fn(async () => notFound()));
    const { availableTranslations } = await importIndex();
    expect(await availableTranslations()).toEqual([]);
  });

  it('detectDocumentTranslation — the FIRST fs touch processOne makes — rejects with BibleIndexUnavailable', async () => {
    // The exact regression: detection runs before anchoring, and its availableTranslations call
    // was the unguarded throw. A raw ENOENT here is the bug; BibleIndexUnavailable is the fix.
    process.env.CORPUS_CDN_BASE = CDN;
    vi.stubGlobal('fetch', vi.fn(async () => notFound()));
    const { detectDocumentTranslation, BibleIndexUnavailable } = await importIndex();
    await expect(detectDocumentTranslation('any document text')).rejects.toBeInstanceOf(BibleIndexUnavailable);
  });

  it('getAnchorIndex rejects with BibleIndexUnavailable', async () => {
    process.env.CORPUS_CDN_BASE = CDN;
    vi.stubGlobal('fetch', vi.fn(async () => notFound()));
    const { getAnchorIndex, BibleIndexUnavailable } = await importIndex();
    await expect(getAnchorIndex()).rejects.toBeInstanceOf(BibleIndexUnavailable);
  });

  it('getAnchorIndexFor(non- kjv) rejects with BibleIndexUnavailable when that translation is absent', async () => {
    process.env.CORPUS_CDN_BASE = CDN;
    vi.stubGlobal('fetch', vi.fn(async () => notFound()));
    const { getAnchorIndexFor, BibleIndexUnavailable } = await importIndex();
    await expect(getAnchorIndexFor('bsb')).rejects.toBeInstanceOf(BibleIndexUnavailable);
  });

  it('a 5xx on the translation probe rejects with BibleIndexUnavailable (a broken CDN, not a 404 gap)', async () => {
    process.env.CORPUS_CDN_BASE = CDN;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500, statusText: 'Internal Server Error' })));
    const { availableTranslations, BibleIndexUnavailable } = await importIndex();
    await expect(availableTranslations()).rejects.toBeInstanceOf(BibleIndexUnavailable);
  });

  it('a network throw on the bible fetch is wrapped as BibleIndexUnavailable, not leaked raw', async () => {
    process.env.CORPUS_CDN_BASE = CDN;
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));
    const { getAnchorIndex, BibleIndexUnavailable } = await importIndex();
    await expect(getAnchorIndex()).rejects.toBeInstanceOf(BibleIndexUnavailable);
  });

  it('a transient-looking rejection clears the cache so the next attempt rebuilds (no poisoned warm instance)', async () => {
    process.env.CORPUS_CDN_BASE = CDN;
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        throw new TypeError('fetch failed');
      }),
    );
    const { getAnchorIndex } = await importIndex();
    await expect(getAnchorIndex()).rejects.toThrow();
    await expect(getAnchorIndex()).rejects.toThrow();
    // Two separate builds: the rejected promise was evicted each time, so fetch was exercised
    // again rather than a cached rejection being re-thrown forever.
    expect(calls).toBeGreaterThan(1);
  });
});

describe('local mode — bible absent from the filesystem (the Vercel production shape, no CDN env)', () => {
  it('availableTranslations rejects with BibleIndexUnavailable, never raw ENOENT', async () => {
    delete process.env.CORPUS_CDN_BASE;
    const { availableTranslations, BibleIndexUnavailable } = await importIndex();
    await expect(availableTranslations()).rejects.toBeInstanceOf(BibleIndexUnavailable);
  });

  it('detectDocumentTranslation rejects with BibleIndexUnavailable', async () => {
    delete process.env.CORPUS_CDN_BASE;
    const { detectDocumentTranslation, BibleIndexUnavailable } = await importIndex();
    await expect(detectDocumentTranslation('any document text')).rejects.toBeInstanceOf(BibleIndexUnavailable);
  });

  it('getAnchorIndex rejects with BibleIndexUnavailable', async () => {
    delete process.env.CORPUS_CDN_BASE;
    const { getAnchorIndex, BibleIndexUnavailable } = await importIndex();
    await expect(getAnchorIndex()).rejects.toBeInstanceOf(BibleIndexUnavailable);
  });
});
