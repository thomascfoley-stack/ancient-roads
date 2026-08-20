// `unassigned` IS NOT A TRADITION. It is the ABSENCE of one, and the diversity floor exists to
// measure tradition BREADTH — so counting the absence as a value is what let ONE MAN clear a gate
// that requires two.
//
// Measured on production 2026-08-19, after the bulk ingest: 301 served works / 356,167 rows carry
// `unassigned` (47% of everything served), because the ingest declared 840 manifest entries that
// way under a "Surname, Firstname" author convention, while the same people's earlier works use
// "Firstname Surname" with a real tradition. FIFTEEN people are served under both — Spurgeon
// across 68 such works, Calvin 53, Schaff 38, Owen 32. So an answer quoting Spurgeon twice
// reported two traditions and passed the floor.
//
// Fixing the DATA instead was measured and rejected: retrieval reads tradition out of
// `embeddings.metadata`, so it means rewriting 336,837 JSONB rows on a table carrying multiple
// multi-GB HNSW indexes — and it would STILL miss the people no name-matcher can safely join
// (`J.C. Ryle` / `Ryle, John Charles`; `B.W. Johnson` / `Johnson, Barton Warren`). The backfill is
// still worth doing for display and for genuine breadth. It is not what makes the gate honest.
import { describe, expect, it } from 'vitest';
import { verifyV1 } from '../src/verifier/v1';
import type { Violation } from '../src/verifier/types';
import { corpus, retrieval, validResponse } from './fixtures';

const violations = (r: Awaited<ReturnType<typeof verifyV1>>): Violation[] => (r.ok ? [] : r.violations);
const spansTraditions = (v: Violation[]) => v.some((x) => x.check === 'diversity_traditions');

describe('the diversity floor counts traditions, not the absence of one', () => {
  it('ONE author under a real tradition AND `unassigned` no longer clears the floor', async () => {
    // SEED: revert v1.ts to counting every normalized string -> this goes GREEN and the gate stays
    // fooled. This is the Spurgeon shape: `patristic` on one work, `unassigned` on the next.
    const r = validResponse() as unknown as { blocks: { attribution?: { tradition: string } }[] };
    // second voice: same corpus section set, but its tradition is the ingest's blank
    r.blocks[2]!.attribution!.tradition = 'unassigned';
    const result = await verifyV1(r, corpus, { ...retrieval, traditions: ['patristic', 'unassigned', 'reformed'] });
    expect(spansTraditions(violations(result)), 'a real tradition + a blank still counted as two').toBe(true);
  });

  it('TWO genuinely different traditions still pass — the fix is not a blanket refusal', async () => {
    // Without this leg, "always violate" satisfies the one above and breaks every honest answer.
    const result = await verifyV1(validResponse(), corpus, retrieval);
    expect(result).toEqual({ ok: true });
  });

  it('when only ONE real tradition was AVAILABLE, the floor stands down rather than failing', async () => {
    // The load-bearing half of dropping `unassigned` from the AVAILABLE side too. Retrieval that
    // offered only `patristic` + `unassigned` never had a second tradition to require. Demanding
    // one would fail the answer for a CORPUS GAP rather than a composition fault — and with 47% of
    // served rows `unassigned` today, that is a self-inflicted outage dressed as rigour.
    const r = validResponse() as unknown as { blocks: { attribution?: { tradition: string } }[] };
    r.blocks[2]!.attribution!.tradition = 'unassigned';
    const result = await verifyV1(r, corpus, { ...retrieval, traditions: ['patristic', 'unassigned'] });
    expect(spansTraditions(violations(result)), 'the gate demanded breadth the corpus never offered').toBe(false);
  });
});
