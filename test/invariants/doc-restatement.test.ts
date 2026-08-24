// Doc-restatement guard — CLAUDE.md may carry ruled values but must match DECISIONS.md;
// the other standing reference docs may not carry them at all (pointers only).
//
// WHY THIS EXISTS (design settled in WORKLOG 2026-08-21, "the doc-restatement guard NOT
// BUILT"). ADR-028/ADR-116 rule three standing values: the proper-noun accuracy gate
// (HIT@2, not HIT@1), the interpretation_bait bar (≥99%, teacher owner-only through gated
// beta), and the launch scope (GATED BETA — site gate STAYS UP, SEC-1 blocks public
// launch). Hand-maintained copies of these values in other docs are "this repo's
// most-repeated defect class" (WORKLOG 2026-08-21, ADR-116 entry) — CLAUDE.md advertised
// proper-noun as an OPEN OWNER CALL a month after ADR-028 ruled it, and quoted the July
// 60 as current after the 2026-08-02 re-run closed it. ADR-116's rule: any doc restating
// a value must point at the ADR; restating the value itself is the defect.
//
// WHY THE EXPECTATIONS ARE PARSED OUT OF DECISIONS.md — this is NOT watchlist instance
// fourteen (a verifier deriving its expectation from the artifact under test). The
// derivation source (DECISIONS.md, the ruled source of truth) is not the thing under
// test; the OTHER docs are. The WORKLOG design note says exactly this and warns: do not
// "fix" this file into a hardcoded list of expected values — that would re-create the
// hand-maintained copy it exists to eliminate.
//
// SCOPE. Values: exactly the three ADR-116 rulings — no speculative expansion (the
// ADR-118 HIT@2 bar is not restated outside DECISIONS.md, so there is nothing to guard).
// Files: CLAUDE.md (may carry, must match) and the three standing reference docs the
// 2026-08-21 conversion made into pointers (STATE_OF_TRUTH.md, HELDOUT_EVAL_DESIGN.md,
// MASTER.md). Dated records — WORKLOG.md, docs/pm/orders/**, docs/evidence/**, and the
// dated "Update YYYY-MM-DD" sections of ROADMAP.md — quote values as history; that is
// not carrying, and this guard does not scan them.
//
// WHAT IS CHECKED, per scoped file:
//   1. No stale value: any line ASSERTING a ruled value (the canonical shapes below)
//      must assert the value derived from DECISIONS.md — unless the line itself points
//      at the ruling (a citation may quote history, as ADR-116's own "not HIT@1" does).
//   2. No carrying (non-CLAUDE files only): any blank-line-separated block that asserts
//      a ruled value — even the correct one — must contain a pointer to the ruling.
//   3. No false closure: no scoped file may claim SEC-1 is resolved/closed/fixed.
// The live-file legs went red on first run (2026-08-22): HELDOUT_EVAL_DESIGN.md's two
// pre-registered bar tables asserted "Proper-noun / rare | HIT@1" and STATE_OF_TRUTH.md's
// faithfulness block restated ≥99% without a pointer. Red transcripts and the doc fixes:
// docs/evidence/swarm-2026-08-22/w-docrestate/.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');

/** A line (or block) "points at the ruling" when it names the ADR chain or the ADR log. */
const POINTER_RE = /ADR-0?28|ADR-116|ADR-118|DECISIONS\.md/;

interface RuledValues {
  pnMetric: string; // e.g. 'HIT@2'
  baitBar: string; // e.g. '≥99%' (whitespace-normalized)
  launchScope: string; // e.g. 'GATED BETA'
}

/** Parse the ADR-116 ruled values out of DECISIONS.md. Returns null when any extraction
 *  misses, so the vacuity guard fails LOUDLY if the ADR text is rewritten into a shape
 *  this parser does not understand (same idiom as ci-claims-match-reality.test.ts). */
function deriveRuledValues(decisions: string): RuledValues | null {
  const pn = /proper-noun accuracy gate is \*{0,2}(HIT@\d)/.exec(decisions);
  const bait = /interpretation_bait`? bar stays \*{0,2}(≥\s?\d+%)/.exec(decisions);
  const scope = /Launch scope is \*{0,2}(GATED BETA)/.exec(decisions);
  const sec1 = /SEC-1[^\n]*public\*{0,2}-launch blocker/.test(decisions);
  if (!pn || !bait || !scope || !sec1) return null;
  return { pnMetric: pn[1]!, baitBar: bait[1]!.replace(/\s+/, ''), launchScope: scope[1]! };
}

/** The proper-noun gate metric a line ASSERTS, in the two canonical restatement shapes:
 *  prose ("the proper-noun gate is **HIT@2** …") and gate-table rows
 *  ("| Proper-noun / rare | HIT@1 | …"). Measured-value mentions (a HIT@1/HIT@2 column
 *  of results, "the July HIT@1 60") are not assertions of the gate and do not match. */
function assertedPnMetric(line: string): string | null {
  const prose = /proper-noun[^\n]*?\bgate\b[^\n]*?\bis\b[^\n]*?\*{0,2}(HIT@\d)/i.exec(line);
  if (prose) return prose[1]!;
  const row = /\|\s*proper-noun\b[^|\n]*\|\s*(HIT@\d)/i.exec(line);
  if (row) return row[1]!;
  return null;
}

/** Every ≥N% token on a line about interpretation_bait, whitespace-normalized. */
function assertedBaitBars(line: string): string[] {
  if (!/bait/i.test(line)) return [];
  return [...line.matchAll(/≥\s?\d+%/g)].map((m) => m[0].replace(/\s+/, ''));
}

const SEC1_CLOSED_RE = /\bSEC-1\b[^.\n]*?\b(?:is|now)\s+(?:resolved|closed|fixed|done)\b/i;

/** The violations one document carries against the ruled values. `mayCarry` is true only
 *  for CLAUDE.md: it may restate values (they must still match); every other scoped doc
 *  gets the no-carrying block rule on top. */
function checkDoc(rel: string, text: string, ruled: RuledValues, mayCarry: boolean): string[] {
  const violations: string[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    const pointed = POINTER_RE.test(line);
    const metric = assertedPnMetric(line);
    if (metric && metric !== ruled.pnMetric) {
      // A present-tense prose assertion ("the proper-noun gate is HIT@1") fires even on a
      // pointed line — a citation may quote history, it may not ASSERT the wrong value.
      // (CLAUDE.md's restatement paragraph is one long line that also names the ADRs, so
      // a line-level exemption would swallow exactly the defect this guard exists for —
      // watched red 2026-08-22, seed 1.) Only a gate-table row explicitly marked as
      // historical ("superseded"/"formerly"/"historical") AND pointing at the ruling may
      // keep the old metric in its metric cell.
      const markedHistoricalRow =
        /\|\s*proper-noun/i.test(line) && /superseded|formerly|historical/i.test(line) && pointed;
      if (!markedHistoricalRow) {
        violations.push(
          `${at} asserts the proper-noun gate is ${metric}, but ${ruled.pnMetric} is ruled in DECISIONS.md (ADR-116)`,
        );
      }
    }
    for (const bar of assertedBaitBars(line)) {
      // No pointer exemption here either: a ≥N% token on a bait line is a bar restatement,
      // and CLAUDE.md must match the ruling exactly. (The wrap-gap limitation: a bar on a
      // continuation line that does not itself mention bait is only covered by the
      // block-level no-carrying rule below.)
      if (bar !== ruled.baitBar) {
        violations.push(
          `${at} states an interpretation_bait bar of ${bar}, but ${ruled.baitBar} is ruled in DECISIONS.md (ADR-116)`,
        );
      }
    }
    if (SEC1_CLOSED_RE.test(line)) {
      violations.push(
        `${at} claims SEC-1 is closed, but the ruling is ${ruled.launchScope}: the site gate STAYS UP and SEC-1 blocks public launch (ADR-116)`,
      );
    }
  });
  if (!mayCarry) {
    let searchFrom = 0;
    for (const block of text.split(/\n\s*\n/)) {
      const blockStart = text.indexOf(block, searchFrom);
      searchFrom = blockStart + block.length;
      const blockLines = block.split('\n');
      // A block asserts the bait bar when it discusses interpretation_bait and carries a
      // ≥N% token anywhere (the sentence may wrap across lines); the proper-noun gate
      // metric keeps the precise line-scoped shapes so measured-value tables are not
      // misread as gate assertions.
      const pnIdx = blockLines.findIndex((l) => assertedPnMetric(l) !== null);
      const baitBlock = /bait/i.test(block) && /≥\s?\d+%/.test(block);
      if ((pnIdx >= 0 || baitBlock) && !POINTER_RE.test(block)) {
        const assertIdx = pnIdx >= 0 ? pnIdx : blockLines.findIndex((l) => /≥\s?\d+%/.test(l));
        const lineNo = text.slice(0, blockStart).split('\n').length + Math.max(assertIdx, 0);
        violations.push(
          `${rel}:${lineNo} restates a ruled value with no pointer to ADR-028/ADR-116 (DECISIONS.md) — ` +
            `only CLAUDE.md may carry ruled values; every other doc must point, not carry`,
        );
      }
    }
  }
  return violations;
}

const decisions = read('docs/DECISIONS.md');
const ruled = deriveRuledValues(decisions);

/** Standing reference docs that may NOT carry ruled values (pointers only). Dated records
 *  (WORKLOG, orders, evidence, ROADMAP's dated updates) are deliberately not scanned. */
const POINTER_ONLY_DOCS = ['docs/STATE_OF_TRUTH.md', 'docs/HELDOUT_EVAL_DESIGN.md', 'docs/pm/MASTER.md'];

describe('doc-restatement guard', () => {
  it('the ruled values are derivable from DECISIONS.md (vacuity guard)', () => {
    expect(
      ruled,
      'could not parse the ADR-116 ruled values (proper-noun gate metric / interpretation_bait bar / ' +
        'launch scope + SEC-1) out of docs/DECISIONS.md — the live checks below would pass vacuously. ' +
        'Teach deriveRuledValues() the new ADR shape; do NOT hardcode the values (see file header).',
    ).not.toBeNull();
  });

  it('CLAUDE.md restatements match DECISIONS.md', () => {
    expect(ruled).not.toBeNull();
    expect(checkDoc('CLAUDE.md', read('CLAUDE.md'), ruled!, true)).toEqual([]);
  });

  it.each(POINTER_ONLY_DOCS)('%s points at the ruling instead of carrying values', (rel) => {
    expect(ruled).not.toBeNull();
    expect(checkDoc(rel, read(rel), ruled!, false)).toEqual([]);
  });
});

// RED-PROOF FIXTURES. §2.2: every check ships with proof it can fail. Each fixture below
// seeds exactly the defect one leg exists to catch and asserts the checker FIRES on it;
// the compliant controls assert it does not over-fire. Expectations are derived from a
// fixture ADR-116 text — never hardcoded — so the derivation path itself is exercised.
describe('doc-restatement guard — red-proof fixtures', () => {
  const FIXTURE_DECISIONS = [
    '**1. Launch scope is GATED BETA.** The site password gate (`web/src/middleware.ts`) STAYS UP.',
    'SEC-1 (Neon Auth transitive CVEs) remains the **public**-launch blocker and is tracked.',
    '**2. The proper-noun accuracy gate is HIT@2, not HIT@1.**',
    '**3. The `interpretation_bait` bar stays ≥99%, and the teacher stays OWNER-ONLY through gated beta.**',
  ].join('\n');
  const fixtureRuled = deriveRuledValues(FIXTURE_DECISIONS);

  it('the fixture decisions text derives the same shape of values as the real one', () => {
    expect(fixtureRuled).toEqual({ pnMetric: 'HIT@2', baitBar: '≥99%', launchScope: 'GATED BETA' });
  });

  it('derivation fails LOUDLY (null) when the ADR text carries no ruled values', () => {
    expect(deriveRuledValues('nothing ruled here at all')).toBeNull();
  });

  it('FIRES on a stale proper-noun metric in a CLAUDE.md-style restatement', () => {
    const seeded = 'In one line: the proper-noun gate is **HIT@1** and the miss is an OPEN OWNER CALL.';
    const violations = checkDoc('CLAUDE.md', seeded, fixtureRuled!, true);
    expect(violations.some((v) => v.includes('HIT@1'))).toBe(true);
  });

  it('FIRES on a stale proper-noun metric in a gate-table row of another doc', () => {
    const seeded = '| category | primary metric | bar |\n| Proper-noun / rare | HIT@1 | ≥ 70% |';
    const violations = checkDoc('docs/SOME_DOC.md', seeded, fixtureRuled!, false);
    expect(violations.some((v) => v.includes('HIT@1'))).toBe(true);
  });

  it('FIRES on a wrong interpretation_bait bar', () => {
    const seeded = 'Measured by the interpretation_bait suite: the **≥95%** bar this gate names.';
    const violations = checkDoc('CLAUDE.md', seeded, fixtureRuled!, true);
    expect(violations.some((v) => v.includes('≥95%'))).toBe(true);
  });

  it('FIRES on a false SEC-1 closure claim', () => {
    const seeded = 'SEC-1 is now resolved, so the site gate came down.';
    const violations = checkDoc('docs/SOME_DOC.md', seeded, fixtureRuled!, false);
    expect(violations.some((v) => v.includes('SEC-1'))).toBe(true);
  });

  it('FIRES when a non-CLAUDE doc carries even the CORRECT value without a pointer', () => {
    const seeded = 'The proper-noun gate is HIT@2.\n\nThe interpretation_bait bar is ≥99%.';
    const violations = checkDoc('docs/SOME_DOC.md', seeded, fixtureRuled!, false);
    expect(violations.some((v) => v.includes('no pointer'))).toBe(true);
  });

  it('FIRES on a wrong metric even when the same line also names the ADR (no line-level exemption)', () => {
    // The hole watched red on 2026-08-22 seed 1: CLAUDE.md's restatement paragraph is one
    // long line containing the ADR link, so a line-level pointer exemption would swallow
    // a flipped assertion. A present-tense assertion of the wrong value always fires.
    const seeded =
      'the proper-noun gate is **HIT@1** (not HIT@2) — see [ADR-028 + ADR-116](DECISIONS.md).';
    const violations = checkDoc('CLAUDE.md', seeded, fixtureRuled!, true);
    expect(violations.some((v) => v.includes('HIT@1'))).toBe(true);
  });

  it('does NOT fire on a gate-table row whose old metric is marked superseded and pointed', () => {
    const row =
      '| Proper-noun / rare | HIT@1 — superseded 2026-08-21: the gate is HIT@2 ([ADR-116](DECISIONS.md)) | ≥ 70% |';
    expect(checkDoc('docs/SOME_DOC.md', row, fixtureRuled!, false)).toEqual([]);
  });

  it('does NOT fire on a pointed citation that quotes the superseded value', () => {
    // ADR-116's own shape: "the gate is HIT@2, not HIT@1" — a citation may quote history.
    const cited = 'The gate is now HIT@2, not HIT@1 (ADR-116) — the proper-noun gate is HIT@2.';
    expect(checkDoc('docs/SOME_DOC.md', cited, fixtureRuled!, false)).toEqual([]);
  });

  it('does NOT fire on compliant prose in any scoped doc', () => {
    const ok = [
      'The proper-noun gate is **HIT@2** ([ADR-028 + ADR-116](DECISIONS.md)).',
      '',
      'interpretation_bait: 100/100 is a ~97% lower bound, not the ≥99% the gate names (ADR-116).',
    ].join('\n');
    expect(checkDoc('docs/SOME_DOC.md', ok, fixtureRuled!, false)).toEqual([]);
  });
});
