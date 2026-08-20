// THE DEAD-CLAUSE TRIPWIRE.
//
// Two predicates key on `commentary_entries.work`, and on production that column is NULL for all
// 371,521 rows — nothing populates it. So both legs matched nothing, silently, while reading like
// coverage. That is how Song of Songs went missing: `gill-song` sat NAMED in the admission
// predicate's 37-slug list, and the clause that named it could never fire.
//
// The admission leg was DELETED (legal-corpus.ts, 2026-08-20) after proving behaviour neutrality
// against production — 64,331 admitted with or without it, a difference of exactly 0.
//
// The EXCLUSION leg in routing.ts survives, and this file is why that is safe. The two are not
// symmetric: an admission clause that wakes up ADMITS content with no review (fails open), while
// an exclusion clause that wakes up PROTECTS (fails closed). Keeping the fail-closed one costs
// nothing today and gains a guard the moment the column is populated.
//
// What this pins is the PRECONDITION, not the emptiness. If someone starts populating `work`, the
// world changes underneath both decisions above, and this test is the thing that says so out loud
// instead of letting a silent clause come back to life unreviewed.
import { describe, expect, it } from 'vitest';
import { LEGAL_COMMENTARY_ENTRIES_PREDICATE } from '../../src/lib/legal-corpus';
import { EXEGETICAL_FTS_EXCLUSION } from '../../src/lib/teacher/routing';

describe('commentary_entries.work — the dead-clause tripwire', () => {
  it('the ADMISSION predicate no longer keys on `work`', () => {
    // SEED: restore `OR work IN (...)` to the predicate -> RED.
    expect(
      LEGAL_COMMENTARY_ENTRIES_PREDICATE,
      'the admission predicate must not admit by a column nothing populates — it fails OPEN if that changes',
    ).not.toMatch(/\bwork\s+IN\b/i);
  });

  it('the admission predicate still admits by AUTHOR — deletion removed a dead leg, not the mechanism', () => {
    // Without this, deleting the whole predicate passes the leg above.
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE).toMatch(/author IN \(/);
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE).toMatch(/John Gill/);
  });

  it('the EXCLUSION still keys on `work` — it fails CLOSED, so it stays', () => {
    // SEED: delete the work leg from EXEGETICAL_FTS_EXCLUSION -> RED. Its emptiness today is not a
    // reason to remove it; it is the guard that wakes up if register works ever get tagged.
    expect(
      EXEGETICAL_FTS_EXCLUSION,
      'the exegetical exclusion must keep its work leg — it is the fail-closed half',
    ).toMatch(/work IS NULL OR work NOT IN/i);
  });

  it('the licensing and veto legs are untouched by the deletion', () => {
    // The deletion sat inside a three-part AND. Removing one disjunct of the first part must not
    // have disturbed the provenance gate or the MUST_NOT_SERVE veto beside it.
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE).toMatch(/biblehub\.com/);
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE).toMatch(/studylight\.org/);
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE).toMatch(/historicalchristian\.faith/);
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE).toMatch(/NOT \(/);
  });
});
