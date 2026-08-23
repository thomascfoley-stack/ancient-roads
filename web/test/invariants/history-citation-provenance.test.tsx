// @vitest-environment jsdom
// THE COPIED CITATION'S PROVENANCE TAG IS DERIVED FROM THE SOURCE RECORD, NEVER HARDCODED
// (WORKLOG 2026-08-21 deferred security finding: "`(CCEL)` hardcoded provenance"). The
// copy-citation button attributed EVERY history work to CCEL — false for any non-CCEL work,
// e.g. josephus-whiston, whose sources.provenance points at CrossWire. The tag now arrives as
// work.provenanceHost, derived server-side from sources.provenance->>'url' (see
// history-provenance-host.test.ts for the derivation half).
//
// RED-PROOF: restore the hardcoded ` (CCEL)` in history-results.tsx cite() and both tests go
// red — the first because '(CCEL)' reappears, the second because a tagless legacy payload
// still gains the CCEL tag. Mutation transcript: docs/evidence/swarm-2026-08-22/w-sec-ccel/.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryResults, type HistoryPayload } from '@/components/history-results';

afterEach(cleanup);

const writeText = vi.fn<(t: string) => Promise<void>>().mockResolvedValue(undefined);
beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

const SECTION = {
  sectionId: 7, ordinal: 42, headingPath: ['Antiquities', 'Book 15', 'Ch. 1'],
  period: [1, 100] as [number, number], excerpt: 'Herod rebuilt the temple with great cost.',
  matched: ['entity' as const],
};
const payload = (work: HistoryPayload['results'][number]['work']): HistoryPayload => ({
  interpretation: { entities: [{ slug: 'herod', label: 'Herod' }], period: null },
  closest: { ...SECTION, work },
  results: [{ work, periodSpan: [1, 100], sections: [SECTION] }],
  coverage: { works: 1, sections: 4112 },
});

describe('copy citation — the provenance tag is the work’s own, derived from the source record', () => {
  it('a CrossWire-provenanced work cites CrossWire, never the old hardcoded CCEL', async () => {
    render(<HistoryResults
      data={payload({ slug: 'josephus-whiston', title: 'Works', author: 'Josephus', provenanceHost: 'crosswire.org' })}
      query="herod" threadId={null}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy citation' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = writeText.mock.calls[0][0];
    expect(text).toContain('(crosswire.org)');
    expect(text).not.toContain('(CCEL)');
  });

  it('a legacy payload with no provenanceHost (threads persisted before the field) gets NO tag — never an invented one', async () => {
    render(<HistoryResults
      data={payload({ slug: 'schaff-hcc1', title: 'History of the Christian Church', author: 'Schaff, Philip' })}
      query="herod" threadId={null}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy citation' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe('Schaff, Philip, History of the Christian Church, Antiquities — Book 15 — Ch. 1');
  });
});
