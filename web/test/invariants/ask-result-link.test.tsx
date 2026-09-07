// @vitest-environment jsdom
//
// A RESULT OPENS THE BOOK AT THE QUOTED SECTION, WITH A WAY BACK. Owner, 2026-09-06: "clicking
// into commentary goes into the EXACT spot that is listed in the search", and "make it clear how
// to go back to the original search". Cards used to link to the desk (`/desk?p=work:<slug>`), which
// opens every work at section 1 and knows nothing about the ask.
//
// The contract is History mode's (history-results.tsx): `/work/<slug>?from=ask:<threadId>&fq=<q>#s<n>`.
// The ordinal comes from `metadata.sectionOrdinal` (resolved server-side at ask time) or, for
// register works, from the sourceId itself (`sermon:<slug>:<ordinal>[.<chunk>]`). A row that cannot
// be located links to the work with no fragment — never `#sundefined`.
//
// SEED: point `readerHref` back at `deskHref` -> every leg RED.

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient, type InitialThread } from '../../src/components/ask-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});

const THREAD = 'a1b2c3d4-0000-4000-8000-000000000001';
const Q = 'faith & works';
const FQ = encodeURIComponent(Q);

const henry = {
  sourceId: 'commentary:jas:2:17-17:Matthew Henry',
  score: 0.9,
  content: 'Faith without works is dead: a faith that does nothing is no living faith.',
  metadata: { author: 'Matthew Henry', sourceTitle: 'Commentary on the Whole Bible', tradition: 'nonconformist', work: 'matthew-henry', verseId: 59002017, verseEnd: 59002017, sectionOrdinal: 1234 },
};
const gill = {
  sourceId: 'commentary:jas:2:18-18:John Gill',
  score: 0.8,
  content: 'Shew me thy faith without thy works.',
  metadata: { author: 'John Gill', sourceTitle: 'Exposition of the New Testament', tradition: 'baptist', work: 'john-gill', verseId: 59002018, verseEnd: 59002018 },
};
const sermon = {
  sourceId: 'sermon:spurgeon-sermons:412.2',
  content: 'A faith that never works is a faith that never was.',
  metadata: { author: 'Charles Spurgeon', sourceTitle: 'Metropolitan Tabernacle Pulpit', work: 'spurgeon-sermons', register: 'sermon' },
};

function hrefsOf(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') ?? '');
}

describe('result links', () => {
  it('a fallback thread links each row to the book at its section, carrying the way back', () => {
    const thread: InitialThread = {
      id: THREAD,
      turns: [{
        question: Q,
        askedAt: '2026-09-01T00:00:00.000Z',
        result: { kind: 'fallback', retrieval: [henry, gill], violations: [], sermons: [sermon] },
        withdrawnIds: [],
      }],
    };
    const { container } = render(<AskClient initialThread={thread} />);
    const hrefs = hrefsOf(container);

    expect(hrefs).toContain(`/work/spurgeon-sermons?from=ask:${THREAD}&fq=${FQ}#s412`);
    expect(hrefs).toContain(`/work/matthew-henry?from=ask:${THREAD}&fq=${FQ}#s1234`);
    expect(hrefs).toContain(`/work/john-gill?from=ask:${THREAD}&fq=${FQ}`);
    expect(hrefs.some((h) => /#s(null|undefined|NaN)$/.test(h)), 'an unlocated row must not mint a broken fragment').toBe(false);
    expect(hrefs.some((h) => h.startsWith('/desk')), 'results must not open the desk any more').toBe(false);
  });

  it('a composed voice resolves through its retrieval row to that row\'s section', () => {
    const thread: InitialThread = {
      id: THREAD,
      turns: [{
        question: Q,
        askedAt: '2026-09-01T00:00:00.000Z',
        result: {
          kind: 'composed',
          retrieval: [{ ...henry, metadata: { ...henry.metadata, sectionOrdinal: 77 } }],
          response: {
            blocks: [
              { type: 'framing', text: 'One voice.' },
              { type: 'voice', attribution: { author: 'Matthew Henry', work: 'Commentary on the Whole Bible', slug: 'matthew-henry', tradition: 'nonconformist', year: 1710 }, quote: 'a faith that does nothing is no living faith' },
            ],
          },
        },
        withdrawnIds: [],
      }],
    };
    const { container } = render(<AskClient initialThread={thread} />);
    expect(hrefsOf(container)).toContain(`/work/matthew-henry?from=ask:${THREAD}&fq=${FQ}#s77`);
  });
});
