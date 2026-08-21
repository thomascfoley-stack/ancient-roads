// @vitest-environment jsdom
//
// The draft-check panel (docs/MY_WORKS_DRAFT_AND_METADATA_DESIGN.md §1): paste → check →
// overlaps + tradition voices, with the no-Scripture and error paths ending in sentences.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));

import { MyWorksClient } from '../../src/components/my-works';

const DOC = { id: 'doc-1', title: 'My sermon on John 10', status: 'ready', createdAt: '2026-08-17T00:00:00.000Z', byteSize: 4096 };

function stub(draftResponse: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/api/user-corpus/draft-check')) return draftResponse();
    if (u.includes('/api/user-corpus/documents')) return Response.json({ documents: [DOC] });
    return Response.json({});
  }));
}

async function openAndCheck() {
  render(<MyWorksClient />);
  await screen.findByText('My sermon on John 10');
  fireEvent.click(screen.getByText('Check a draft'));
  fireEvent.change(screen.getByLabelText('Draft to check'), { target: { value: 'All things work together for good…' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check this draft' }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('My Works — the draft check', () => {
  it('renders overlaps and tradition voices', async () => {
    stub(async () => Response.json({
      detection: { translation: 'kjv', confidence: 0.9, totalHits: 40 },
      ranges: [{ start: 45008028, end: 45008028, channel: 'uncited' }],
      overlaps: [{ range: { start: 45008028, end: 45008028 }, documents: [{ documentId: 'doc-1', title: 'My sermon on John 10', channel: 'uncited', matchCount: 5 }] }],
      gaps: { voices: [{ author: 'John Gill', work: 'Exposition', tradition: 'Baptist', verseId: 45008028, rangesHit: 1 }], authorCount: 1, rangesConsidered: 1 },
    }));
    await openAndCheck();
    await screen.findByText('Where you have preached this ground');
    expect(screen.getAllByText(/My sermon on John 10/).length).toBeGreaterThan(1);
    await screen.findByText(/John Gill/);
  });

  it('a draft with no Scripture gets the honest empty state', async () => {
    stub(async () => Response.json({
      detection: { translation: 'kjv', confidence: 0.5, totalHits: 0 },
      ranges: [], overlaps: [], gaps: { voices: [], authorCount: 0, rangesConsidered: 0 },
    }));
    await openAndCheck();
    await screen.findByText(/No quoted Scripture was found/);
  });

  it('an error envelope ends in a sentence, and the page survives', async () => {
    stub(async () => Response.json({ error: { code: 'RATE_LIMIT_MINUTE', message: 'Too many checks. Wait a moment.' } }, { status: 429 }));
    await openAndCheck();
    await screen.findByText(/Too many checks/);
    expect(screen.getByRole('heading', { name: 'My Works' })).toBeTruthy();
  });
});
