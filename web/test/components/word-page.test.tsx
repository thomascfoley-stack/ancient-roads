// @vitest-environment jsdom
//
// OPTION D — THE WORD AS A DESTINATION (owner ruling 2026-08-21: "…then D"). /word/[strongs]
// is a deep-linkable page for one original word: definition, KJV usage, and the FULL
// concordance — the concordance stance applied to a single word. It is also the
// "reference-pane UX" the owner ruling holding the five lexicon works staged has been waiting
// for (DECISIONS: "Lexicons stay staged until the reference-pane UX ships"), so the page names
// those works as coming — a roadmap fact, not a fake control. What is pinned:
//
//   * A valid key renders the entry: headword, transliteration, pronunciation, definition,
//     KJV usage, the Strong's chip, and the concordance count.
//   * The param is normalized (g2316 → G2316) — a shared lowercase link must not 404.
//   * An invalid key says so plainly; it never renders an empty entry as if the word existed.
//   * The held reference works are named as COMING — no control pretends they serve today.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockParams: Record<string, string> = { strongs: 'G2316' };
let mockSearch = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useSearchParams: () => mockSearch,
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

import WordPage from '@/app/word/[strongs]/page';

const LEX = {
  G2316: {
    lemma: 'θεός', translit: 'theós', pron: "theh'-os",
    def: 'a deity, especially the supreme Divinity', derivation: 'of uncertain affinity',
    kjv: 'God, god(-ly, -ward)',
  },
};
const BUCKET = { G2316: { count: 3, verseIds: [43001001, 43001018, 43003016] } };

beforeEach(() => {
  mockParams = { strongs: 'G2316' };
  mockSearch = new URLSearchParams();
  vi.stubGlobal('fetch', (url: string) => {
    const body = url.includes('/lexicon/greek') ? LEX : url.includes('/concordance/') ? BUCKET : {};
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as unknown as Response);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Option D — /word/[strongs]', () => {
  it('renders the full entry: headword, sounds, senses, and the concordance', async () => {
    render(<WordPage />);

    expect(await screen.findByText('θεός')).toBeTruthy();
    expect(screen.getByText(/theós/)).toBeTruthy();
    expect(screen.getByText(/theh'-os/)).toBeTruthy();
    expect(screen.getByText(/supreme Divinity/)).toBeTruthy();
    expect(screen.getByText(/god\(-ly, -ward\)/)).toBeTruthy();
    expect(screen.getAllByText('G2316').length).toBeGreaterThan(0);
    // ConcordanceList's own count line, driven by the mocked bucket.
    expect(await screen.findByText(/appears in 3 verses/i)).toBeTruthy();
  });

  it('normalizes a lowercase key — shared links must not care about case', async () => {
    mockParams = { strongs: 'g2316' };
    render(<WordPage />);
    expect(await screen.findByText('θεός')).toBeTruthy();
  });

  it('an invalid key says so plainly', async () => {
    mockParams = { strongs: 'X99' };
    render(<WordPage />);
    expect(await screen.findByText(/isn.t a strong.s number/i)).toBeTruthy();
    expect(screen.queryByText('θεός')).toBeNull();
  });

  it('names the held reference works as coming — a roadmap fact, never a dead control', async () => {
    render(<WordPage />);
    await screen.findByText('θεός');
    expect(screen.getByText(/BDB/)).toBeTruthy();
    expect(screen.getByText(/coming/i)).toBeTruthy();
    // No link/button pretends those entries serve today.
    expect(screen.queryByRole('link', { name: /BDB/i })).toBeNull();
  });
});
