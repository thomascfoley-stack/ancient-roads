// @vitest-environment jsdom
//
// D17 (2026-08-20 uploader deep dive) — the merged search surface's works rows.
//
// §7 requires user results "labelled as theirs (doc + date)". `UserHit.createdAt` was on the wire
// and never rendered, and the rows carried no ownership label at all — resting entirely on group
// membership, which vanishes the moment a row is read out of context (screen reader, screenshot,
// a collapsed group reopened later). One date via the same when() the prayers rows use, one small
// "yours" label in the register-label position.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WorksGroupRows } from '../../src/components/search-groups';
import type { UserHit } from '../../src/lib/user-corpus/search';

afterEach(cleanup);

const HIT: UserHit = {
  documentId: 'doc-1',
  sectionId: 's-1',
  title: 'On the Good Shepherd',
  heading: 'II. The hireling',
  ordinal: 3,
  text: 'The hireling fleeth, because he is an hireling.',
  score: 0.9,
  createdAt: '2026-08-17T00:00:00.000Z',
};

describe('WorksGroupRows — doc + date labelling (D17)', () => {
  it('renders the document date via when()', () => {
    render(<WorksGroupRows rows={[HIT]} />);
    // en-US, { day: 'numeric', month: 'long', year: 'numeric' } — the prayers rows' format,
    // twelve lines below in the same file. Computed through Intl rather than hard-coded,
    // because toLocaleDateString renders in the MACHINE's timezone.
    const expected = new Date(HIT.createdAt).toLocaleDateString('en-US', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    expect(screen.getByText(new RegExp(expected))).toBeTruthy();
  });

  it('carries a small ownership label', () => {
    render(<WorksGroupRows rows={[HIT]} />);
    expect(screen.getByText(/yours/i)).toBeTruthy();
  });

  it('still renders title, heading and excerpt', () => {
    render(<WorksGroupRows rows={[HIT]} />);
    expect(screen.getByText('On the Good Shepherd')).toBeTruthy();
    expect(screen.getByText(/II\. The hireling/)).toBeTruthy();
    expect(screen.getByText(/fleeth/)).toBeTruthy();
  });
});
