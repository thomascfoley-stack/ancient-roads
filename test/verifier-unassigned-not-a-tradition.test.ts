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
import { createMemoryCorpus } from '../src/verifier/memory-corpus';
import type { CorpusLookup } from '../src/verifier/types';
import type { Violation } from '../src/verifier/types';
import { CHRYSOSTOM_BODY, HENRY_BODY, corpus, retrieval, validResponse } from './fixtures';

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

// `reference` IS NOT A TRADITION either (deep-audit 2026-09-07, H-5). Reference works —
// dictionaries, lexicons, edited sets — are not a tradition a voice can belong to; they are
// apparatus. The d703a15 backfill keyed 60 works `reference`, 36 of them `source_type: father`
// (the Schaff ANF/NPNF patristic sets, inside the /ask pool), and the floor counted them: ONE
// church tradition + a dictionary cleared a gate that exists to require two traditions, and the
// same father served as `patristic` + `reference` (Schaff-edited) satisfied the floor against
// himself. These legs pin the fix against the shipped verifyV1 with attribution-consistent
// corpora, so `ok: true` legs mean the WHOLE gate passed, not just the absence of one check.
describe('the diversity floor counts traditions, not reference apparatus', () => {
  // The fixture sections with caller-chosen tradition keys, so voice attributions MATCH their
  // sections (no attribution_mismatch noise) and only the diversity floor is under test.
  const corpusKeyed = (chrysostomTradition: string, henryTradition: string): CorpusLookup =>
    createMemoryCorpus({
      sections: [
        {
          id: 48210,
          body: CHRYSOSTOM_BODY,
          origin: 'corpus',
          heading: 'Homily 19 on Ephesians',
          source: { id: 7, author: 'John Chrysostom', title: 'Homilies on Ephesians', tradition: chrysostomTradition },
          verses: { start: 49005018, end: 49005018 },
        },
        {
          id: 51002,
          body: HENRY_BODY,
          origin: 'corpus',
          heading: 'Ephesians 5',
          source: { id: 12, author: 'Matthew Henry', title: 'Complete Commentary', tradition: henryTradition },
          verses: { start: 49005018, end: 49005018 },
        },
      ],
      translations: [{ slug: 'web', isActive: true, licensedForDisplay: true }],
    });

  const responseKeyed = (chrysostomTradition: string, henryTradition: string) => {
    const r = validResponse();
    for (const block of r.blocks) {
      if (block.type !== 'voice') continue;
      block.attribution.tradition = block.section_id === 48210 ? chrysostomTradition : henryTradition;
    }
    return r;
  };

  it('ONE church tradition + a `reference` work FAILS the floor (the H-5 bug)', async () => {
    // SEED: drop 'reference' from NOT_A_TRADITION -> used = {reformed, reference} = 2 -> the
    // floor PASSES and this leg goes red. Retrieval offers a third real tradition so the floor
    // is engaged (available = 2 after the exclusion); the answer used reformed + a dictionary.
    const result = await verifyV1(
      responseKeyed('reference', 'reformed'),
      corpusKeyed('reference', 'reformed'),
      { ...retrieval, traditions: ['reformed', 'reference', 'patristic'] },
    );
    expect(spansTraditions(violations(result)), 'one tradition + apparatus counted as two traditions').toBe(true);
  });

  it('TWO genuinely different traditions still PASS — the fix is not a blanket refusal', async () => {
    const result = await verifyV1(
      responseKeyed('baptist', 'reformed'),
      corpusKeyed('baptist', 'reformed'),
      { ...retrieval, traditions: ['baptist', 'reformed'] },
    );
    expect(result).toEqual({ ok: true });
  });

  it('[reformed, unassigned] stand-down is UNCHANGED — available = 1, the floor stands down', async () => {
    // Same shape as the patristic/unassigned leg above, asserted through a clean corpus so the
    // whole gate returns ok: the floor must not demand a second tradition retrieval never had.
    const result = await verifyV1(
      responseKeyed('unassigned', 'reformed'),
      corpusKeyed('unassigned', 'reformed'),
      { ...retrieval, traditions: ['reformed', 'unassigned'] },
    );
    expect(result).toEqual({ ok: true });
  });

  it('[reformed, reference] stand-down: reference alone never ENGAGES the floor', async () => {
    // The available-side half of the exclusion: retrieval that offered only a tradition and a
    // dictionary never had two traditions to require — same stand-down rule as `unassigned`.
    const result = await verifyV1(
      responseKeyed('reference', 'reformed'),
      corpusKeyed('reference', 'reformed'),
      { ...retrieval, traditions: ['reformed', 'reference'] },
    );
    expect(result).toEqual({ ok: true });
  });
});
