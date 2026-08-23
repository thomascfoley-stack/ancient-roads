// @vitest-environment jsdom
// HistoryResults renderer — the honesty strip, the framing string, the deep-link contract, and
// the fixed labels (HISTORY_RETRIEVAL_DESIGN §5 stage 2). Red-proof is by MUTATION of the
// component's framing string (see commit).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryResults, type HistoryPayload } from '@/components/history-results';

afterEach(cleanup);

const SECTION = {
  sectionId: 7, ordinal: 42, headingPath: ['Antiquities', 'Book 15', 'Ch. 1'],
  period: [1, 100] as [number, number], excerpt: 'Herod rebuilt the temple with great cost.',
  matched: ['entity' as const],
};
const BASE: HistoryPayload = {
  interpretation: { entities: [{ slug: 'herod', label: 'Herod' }], period: null },
  closest: { ...SECTION, work: { slug: 'josephus-whiston', title: 'Works', author: 'Josephus' } },
  results: [{ work: { slug: 'josephus-whiston', title: 'Works', author: 'Josephus' }, periodSpan: [1, 100], sections: [SECTION] }],
  coverage: { works: 1, sections: 4112 },
};

describe('HistoryResults', () => {
  it('renders the fixed closest-match label and the coverage footer — templates, never prose', () => {
    render(<HistoryResults data={BASE} query="tell me about Herod" threadId="t-1" />);
    expect(screen.getByText('Closest match to your question')).toBeTruthy();
    expect(screen.getByText(/Searched 1 items · 4,112 sections/)).toBeTruthy();
  });

  it('deep links use the established /work/{slug}#s{ordinal} contract and carry the thread + encoded query', () => {
    // `fq=` joined the contract with the study entrance (order 2026-08-20-historians-study-
    // entrance): it is what lets the reader's return strip name the study. Asserted as the FULL
    // href, not a prefix match, so a param dropped in either direction goes red here. The query
    // carries a space AND an ampersand so a dropped encodeURIComponent corrupts the href visibly
    // (deep-audit test-honesty finding 4 — "q" was encoding-invariant).
    render(<HistoryResults data={BASE} query="faith & works" threadId="t-1" />);
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h === '/work/josephus-whiston?from=hist:t-1&fq=faith%20%26%20works#s42')).toBe(true);
  });

  it('toggling an entity chip frames counts as "within these results" — the cap-honesty string', () => {
    render(<HistoryResults data={BASE} query="q" threadId={null} />);
    expect(screen.queryByText('(within these results)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Herod', pressed: true }));
    expect(screen.getByText('(within these results)')).toBeTruthy();
  });

  it('zero interpretation matches shows the fixed no-match line, not silence', () => {
    render(<HistoryResults
      data={{ ...BASE, interpretation: { entities: [], period: null } }}
      query="q" threadId={null}
    />);
    expect(screen.getByText('No known people or places matched — showing text matches.')).toBeTruthy();
  });

  it('zero results shows the honest empty state naming the served coverage', () => {
    render(<HistoryResults
      data={{ ...BASE, closest: null, results: [], coverage: { works: 33, sections: 0 } }}
      query="q" threadId={null}
    />);
    expect(screen.getByText(/Nothing in the 33 served history items matches this\./)).toBeTruthy();
  });

  it('the copied citation derives from the source record — author, title, heading; never a hardcoded host (W-SEC-CCEL)', () => {
    // The button appended a hardcoded " (CCEL)" to every citation while the served shelf is
    // not all CCEL (josephus-whiston is CrossWire on dev — evidence under
    // docs/evidence/swarm-2026-08-22/w-sec-ccel/). GO_LIVE A5: attribute to the author,
    // never a host. RED-PROOF: restore ` (CCEL)` in cite() -> the not.toMatch below goes RED.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<HistoryResults data={BASE} query="q" threadId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy citation' }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toBe('Josephus, Works, Antiquities — Book 15 — Ch. 1');
    expect(copied).not.toMatch(/CCEL|ccel\.org|crosswire/i);
  });
});
