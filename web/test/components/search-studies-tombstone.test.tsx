// @vitest-environment jsdom
//
// THE TOMBSTONE ROW ON /search — the rendered-DOM leg of the 2026-08-17 pre-deploy audit's
// domain finding #2 (HIGH): /search's "Your studies" group rendered snapshotted corpus quotes
// through dangerouslySetInnerHTML with no servability re-check. The decision now happens
// server-side in searchStudies (see search-personal-servability.test.ts for the phase wiring
// and test/invariants/search-servability.test.ts for the live-DB proof); THIS suite proves what
// a reader actually gets from each decided shape, over the real component and real DOM — the
// catalog-row-affordances harness's reasoning: asserting over rendered output proves the
// affordance, where asserting over JSX shape would only prove an attribute is in a file.
//
// Pinned here:
//   T1  A snippet hit renders its sanitized ts_headline (<mark> restored, everything else
//       escaped) and links to the study.
//   T2  A tombstone hit renders attribution + the ONE shared TOMBSTONE_NOTICE (imported from
//       servability.ts, never re-worded), NO <mark>, and NO link to the withdrawn work —
//       the row's only link is the user's own study, which tombstones the block itself.
//   T3  The tombstone branch is PLAIN TEXT: hostile attribution strings render inert
//       (React-escaped), never as elements. Red-proof: switching the branch to
//       dangerouslySetInnerHTML turns T3 red (watched red 2026-08-17, reverted).
//   T4  Absent attribution degrades to 'Unknown source' — same fallback as the study editor's
//       AttributionLine and the export's attributionLine.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StudiesGroupRows } from '@/components/search-groups';
import { TOMBSTONE_NOTICE } from '@/lib/servability';
import type { StudySearchHit } from '@/lib/search-personal';

const SNIPPET_HIT: StudySearchHit = {
  studyId: '11111111-1111-4111-8111-111111111111',
  title: 'Grace study',
  state: 'snippet',
  snippet: 'saved by <mark>grace</mark> through faith',
};

const TOMBSTONE_HIT: StudySearchHit = {
  studyId: '22222222-2222-4222-8222-222222222222',
  title: 'Withdrawn work notes',
  state: 'tombstone',
  attribution: { author: 'QA Author', work_title: 'Withdrawn Work', reference: 'John 1:1' },
};

describe('StudiesGroupRows — snippet vs tombstone (audit 2026-08-17, domain lens #2)', () => {
  it('T1: a snippet hit renders the sanitized headline with its <mark>, linking to the study', () => {
    const { container } = render(<StudiesGroupRows rows={[SNIPPET_HIT]} />);
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('grace');
    expect(container.querySelector(`a[href="/studies/${SNIPPET_HIT.studyId}"]`)).not.toBeNull();
  });

  it('T2: a tombstone hit renders attribution + the shared notice — no quote markup, no work link', () => {
    const { container } = render(<StudiesGroupRows rows={[TOMBSTONE_HIT]} />);
    const text = container.textContent ?? '';
    expect(text).toContain('QA Author, Withdrawn Work (John 1:1)');
    expect(text).toContain(TOMBSTONE_NOTICE);
    expect(container.querySelector('mark'), 'no headline markup on a tombstone').toBeNull();
    // The one link is the user's own study; a tombstone offers NO route to the withdrawn work
    // (S-10's "no link", scoped to the work — the study link is the user's own doc).
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([`/studies/${TOMBSTONE_HIT.studyId}`]);
    expect(hrefs.some((h) => h?.includes('/work/'))).toBe(false);
  });

  it('T3: the tombstone branch is plain text — hostile attribution cannot become elements', () => {
    const hostile: StudySearchHit = {
      ...TOMBSTONE_HIT,
      attribution: { author: '<img src=x onerror=alert(1)>', work_title: '<script>bad()</script>' },
    };
    const { container } = render(<StudiesGroupRows rows={[hostile]} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    // The literal characters render inert — React escaped them, nothing parsed them as HTML.
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('T4: null attribution degrades to the shared Unknown-source fallback, notice intact', () => {
    const bare: StudySearchHit = { ...TOMBSTONE_HIT, attribution: null };
    const { container } = render(<StudiesGroupRows rows={[bare]} />);
    expect(container.textContent).toContain('Unknown source');
    expect(container.textContent).toContain(TOMBSTONE_NOTICE);
  });
});
