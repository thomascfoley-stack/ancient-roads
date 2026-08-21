// @vitest-environment jsdom
//
// THE REFERENCE SHELF ON /word (owner ruling 2026-08-21: "do it and then ship them";
// docs/WORD_REFERENCE_PANE_DESIGN.md). Published lexicon works' articles render on the word
// page, quoted and attributed — and serving stays DB-gated, so the section is driven entirely
// by what the API returns. What is pinned:
//
//   * Articles render with ATTRIBUTION (author — title) and the article body; BDB's internal
//     bracket codes are stripped from the DISPLAYED heading only.
//   * With articles present, the "coming" roadmap strip does NOT render (the works present
//     speak for themselves; no hand-maintained missing-list — the watchlist class).
//   * With no articles (nothing published yet, or the fetch failed), the strip stays and the
//     page renders exactly as before — the flip is what lights the section, nothing else.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockParams: Record<string, string> = { strongs: 'H430' };
const mockSearch = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useSearchParams: () => mockSearch,
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

import WordPage from '@/app/word/[strongs]/page';

const LEX = { H430: { lemma: 'אֱלֹהִים', translit: 'ʼĕlôhîym', pron: 'el-o-heem', def: 'gods in the ordinary sense', derivation: '', kjv: 'God, gods' } };
const BUCKET = { H430: { count: 3, verseIds: [1001001, 1001026, 2020002] } };
const ARTICLES = {
  articles: [{
    work: { slug: 'bdb-lexicon', title: 'Brown-Driver-Briggs Hebrew and English Lexicon (1906)', author: 'Brown, Driver & Briggs', license: 'CC BY' },
    heading: 'H430 אֱלֹהִים [p.cj.ai]',
    body: 'אֱלֹהִים n.m. God, gods — the plural of majesty…',
    ordinal: 412,
  }],
};

let articlesBody: unknown = ARTICLES;

beforeEach(() => {
  mockParams = { strongs: 'H430' };
  articlesBody = ARTICLES;
  vi.stubGlobal('fetch', (url: string) => {
    const body = url.includes('/articles') ? articlesBody
      : url.includes('/lexicon/hebrew') ? LEX
      : url.includes('/concordance/') ? BUCKET : {};
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as unknown as Response);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('the reference shelf on /word', () => {
  it('renders the article, attributed, with the bracket code stripped from the shown heading', async () => {
    render(<WordPage />);

    expect(await screen.findByText(/Brown, Driver & Briggs/)).toBeTruthy();
    expect(screen.getByText(/Brown-Driver-Briggs Hebrew and English Lexicon/)).toBeTruthy();
    expect(screen.getByText(/plural of majesty/)).toBeTruthy();
    // The displayed article heading drops "[p.cj.ai]" but keeps the headword.
    const shown = screen.getByText(/H430 אֱלֹהִים/);
    expect(shown.textContent).not.toMatch(/\[p\.cj\.ai\]/);
    // Articles present → the roadmap strip is gone.
    expect(screen.queryByText(/coming to this page/i)).toBeNull();
  });

  it('with nothing published, the strip stays and nothing pretends otherwise', async () => {
    articlesBody = { articles: [] };
    render(<WordPage />);

    expect(await screen.findByText('אֱלֹהִים')).toBeTruthy();
    expect(screen.getByText(/coming to this page/i)).toBeTruthy();
    expect(screen.queryByText(/Brown, Driver & Briggs/)).toBeNull();
  });
});
