// The check that would have caught `chesterton-preexistence`.
//
// THE INCIDENT (2026-08-19). A GK Chesterton work sat PUBLISHED and SERVING on production — 25
// embedding rows — while `MUST_NOT_SERVE_AUTHORS` already named him. The veto was blind because it
// spells him `GK Chesterton` (the `commentary_entries` format) and `sources.author` stores
// `Chesterton, Gilbert Keith`. It was found by accident while preparing an unrelated copy batch.
//
// The failure is the repo's own recurring one — an expected set typed by hand in ONE format,
// guarding data written in ANOTHER — and it was introduced by the very tranche that closed §17.10.
import { describe, expect, it } from 'vitest';
import { isMustNotServeAuthor, MUST_NOT_SERVE_AUTHORS } from '@/lib/legal-corpus';
import {
  ADR112_CUTOFF_YEAR,
  MUST_NOT_SERVE_SURNAMES,
  MUST_NOT_SERVE_WORK_EXCEPTIONS,
  auditServedWorks,
  authorLooksMustNotServe,
  isRulingAdmittedWork,
} from '@/lib/must-not-serve-audit';

describe('MUST_NOT_SERVE — format-agnostic audit', () => {
  it('catches the exact string the shipped veto missed', () => {
    // The bug, pinned. If this ever goes false the audit is blind again.
    expect(authorLooksMustNotServe('Chesterton, Gilbert Keith')).toBe(true);
    // CONTROL — and this is the point of the whole module. The shipped guard STILL returns false
    // here, by design: widening it is a migration (its rendering is the live index predicate), and
    // ADR-112 made Chesterton per-work anyway. This asserts the gap is real rather than imagined,
    // so if someone later closes it properly this test fails LOUDLY and gets deleted on purpose.
    expect(isMustNotServeAuthor('Chesterton, Gilbert Keith')).toBe(false);
  });

  it('catches the other format variants an author string arrives in', () => {
    for (const a of ['G.K. Chesterton', 'CHESTERTON, G. K.', 'Chesterton', 'Lewis, Clive Staples', 'Tolkien, J.R.R.']) {
      expect(authorLooksMustNotServe(a), `missed: ${a}`).toBe(true);
    }
  });

  it('does not fire on unrelated authors', () => {
    for (const a of ['John Calvin', 'Matthew Henry', 'Adam Clarke', 'Augustine of Hippo', 'Lewisham Parish', null, '']) {
      expect(authorLooksMustNotServe(a), `false positive: ${a}`).toBe(false);
    }
  });

  // THE COVERAGE GUARD. This is what stops MUST_NOT_SERVE_SURNAMES becoming another
  // hand-maintained set nobody enforces: add a name to the veto and forget a token here, and this
  // goes red. Derived from the constant, never re-typed.
  it.each(MUST_NOT_SERVE_AUTHORS.map((n) => [n]))('every veto name is reachable: %s', (name) => {
    expect(
      authorLooksMustNotServe(name),
      `"${name}" is on MUST_NOT_SERVE_AUTHORS but no token in MUST_NOT_SERVE_SURNAMES matches it — `
        + 'the audit cannot see this author in any format',
    ).toBe(true);
  });

  it('ADR-112: pre-1931 Chesterton is admitted, 1931-or-later and unknown are not', () => {
    expect(isRulingAdmittedWork('chesterton-orthodoxy')).toBe(true);   // 1908
    expect(isRulingAdmittedWork('chesterton-everlasting')).toBe(true); // 1925
    expect(isRulingAdmittedWork('chesterton-aquinas')).toBe(false);    // 1933 — excluded BY the rule
    expect(isRulingAdmittedWork('chesterton-preexistence')).toBe(false); // undated — fail closed
    // Every exception must actually satisfy the rule it cites. A typo'd year that sneaks a
    // post-cutoff work onto the list would otherwise be invisible.
    for (const [slug, year] of Object.entries(MUST_NOT_SERVE_WORK_EXCEPTIONS)) {
      expect(year, `${slug} is on the admitted list with year ${year}`).toBeLessThan(ADR112_CUTOFF_YEAR);
    }
  });

  it('the audit flags a serving vetoed work and stays quiet on an admitted one', () => {
    const rows = [
      { slug: 'chesterton-preexistence', author: 'Chesterton, Gilbert Keith', served: 25 },  // the incident
      { slug: 'chesterton-orthodoxy', author: 'Chesterton, Gilbert Keith', served: 900 },    // ADR-112 admits
      { slug: 'chesterton-aquinas', author: 'Chesterton, Gilbert Keith', served: 400 },      // 1933
      { slug: 'calvin-calcom01', author: 'John Calvin', served: 1023 },                      // unrelated
      { slug: 'chesterton-wisdom', author: 'Chesterton, Gilbert Keith', served: 0 },         // staged, not serving
    ];
    expect(auditServedWorks(rows).map((r) => r.slug)).toEqual(['chesterton-preexistence', 'chesterton-aquinas']);
  });
});
