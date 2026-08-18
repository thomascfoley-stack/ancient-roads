// §17.10 EXIT TEST — the MUST_NOT_SERVE veto applies to the commentary_entries FTS surface.
//
// THE FINDING (2026-08-18 corpus-lane diagnosis §17.10). `commentary_entries` holds copyrighted
// and standing-MUST_NOT_SERVE material — Tyndale Study Notes 15,161 rows, Origen of Alexandria
// 2,672, CS Lewis 1,172, GK Chesterton 714, Douglas Wilson 16, JRR Tolkien 11. None of it is
// currently served, and the reason is the weak one: `LEGAL_COMMENTARY_ENTRIES_PREDICATE` is a
// POSITIVE allowlist, so those authors are excluded by **not being named on it**.
//
// `routing.ts` argues in its own comments that "unnamed" is strictly weaker than "unreachable",
// and this repo already has the stronger mechanism — `MUST_NOT_SERVE_AUTHORS`, described at
// legal-corpus.ts:141 as "an absolute veto". It simply was not wired to this surface. The veto
// existed, the FTS predicate never referenced it, and the only thing standing between a
// copyrighted author and `/api/search/commentaries` was the allowlist not mentioning them.
//
// WHAT WOULD HAVE BROKEN IT. Three ordinary, well-intentioned edits:
//   1. the A048 backfill filling `commentary_entries.work` (today entirely NULL, so the work-slug
//      leg admits nothing — the diagnosis names this backfill as the thing that changes it),
//   2. adding an author to PUBLISHED_WHOLE_BIBLE_AUTHORS who also appears on copyrighted rows,
//   3. a new OR leg on the predicate written without the veto in mind.
// After this change none of the three is sufficient: the veto is ANDed, so it survives any widening
// of the allowlist.
//
// BEHAVIOUR TODAY IS UNCHANGED, and that is provable rather than hopeful: the veto only removes
// rows the allowlist already refused, because no vetoed author is on the allowlist (asserted
// below). So this is a licensing belt, not a retrieval change, and carries no accuracy diagnostic.

import { describe, expect, it } from 'vitest';
import {
  LEGAL_COMMENTARY_ENTRIES_PREDICATE,
  MUST_NOT_SERVE_AUTHORS,
  PUBLISHED_WHOLE_BIBLE_AUTHORS,
  isMustNotServeAuthor,
} from '@/lib/legal-corpus';

describe('§17.10 — the MUST_NOT_SERVE veto reaches the commentary_entries FTS surface', () => {
  it('the predicate carries a veto leg at all', () => {
    expect(
      LEGAL_COMMENTARY_ENTRIES_PREDICATE,
      'the FTS predicate must AND in the MUST_NOT_SERVE veto — without it, a copyrighted author is '
        + 'excluded only by absence from the allowlist, which any widening of that list undoes',
    ).toMatch(/NOT\s*\(/i);
  });

  // The veto must name every vetoed author. Derived from the constant, so adding a name to
  // MUST_NOT_SERVE_AUTHORS and forgetting the SQL is a failure rather than a silent gap.
  it.each(MUST_NOT_SERVE_AUTHORS.map((a) => [a]))('vetoes %s by name in the SQL', (author) => {
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE).toContain(`'${author.replace(/'/g, "''")}'`);
  });

  // The TS guard and the SQL veto are two expressions of one ruling; if they drift, the surface
  // that uses the weaker one leaks. `isMustNotServeAuthor` also normalises ("Origen of Alexandria"
  // ~ "Origen") and buckets "Jerome's …", so the SQL needs the same two rules.
  it('the SQL mirrors the TS guard: first-token normalisation and the Jerome bucket', () => {
    expect(isMustNotServeAuthor('Origen of Alexandria')).toBe(true);
    expect(isMustNotServeAuthor("Jerome's Commentary on Jeremiah")).toBe(true);
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE, 'the SQL needs the Jerome-prefix rule the TS guard has')
      .toMatch(/Jerome/);
  });

  // THE PROOF THAT THIS CHANGES NOTHING TODAY. Every vetoed author is already absent from the
  // allowlist, so ANDing the veto removes rows that were already excluded. If this ever fails, the
  // veto has started doing real work and the change is no longer behaviour-preserving — which is
  // exactly when someone must look, rather than when it silently becomes a retrieval change.
  it('no vetoed author is on the allowlist, so the veto subtracts nothing that was served', () => {
    const overlap = PUBLISHED_WHOLE_BIBLE_AUTHORS.filter((a) => isMustNotServeAuthor(a));
    expect(
      overlap,
      'a MUST_NOT_SERVE author is also on the published allowlist — the veto now changes what is '
        + 'served, so this is a retrieval change and needs the accuracy diagnostic',
    ).toEqual([]);
  });

  // The veto must be a CONJUNCT. If it were an alternative, any allowlist leg would readmit.
  //
  // The first version of this assertion sliced from the veto to the end of the string and demanded
  // no `) OR ` appeared — and it failed against a correctly-ANDed veto, because the veto CONTAINS
  // alternatives of its own (the exact-name leg OR the two first-token legs OR the Jerome bucket).
  // A regex over the tail cannot tell "an OR inside the NOT(...)" from "an OR that readmits", so it
  // was measuring the wrong thing. What actually carries the property is the operator that
  // INTRODUCES the veto, which is one token and unambiguous.
  it('the veto is ANDed, not ORed — no allowlist leg can readmit a vetoed author', () => {
    expect(
      LEGAL_COMMENTARY_ENTRIES_PREDICATE,
      'the veto must be introduced by AND; as an alternative it would readmit everything it names',
    ).toMatch(/AND\s+NOT\s*\(/i);
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE).not.toMatch(/OR\s+NOT\s*\(\s*\n?\s*author IN/i);
  });
});
