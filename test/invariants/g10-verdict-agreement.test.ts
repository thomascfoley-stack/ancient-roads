// THE VERDICT LINE MUST REPORT WHAT G10 DID — deep audit follow-on, found by running A5.
//
// THE DEFECT, measured on the committed checkpoint. `.cutover-checkpoint.json` carried
// `baseline.regression.unitOrdinal: null` — the key PRESENT, the value null. Two places then
// answered "is there a baseline?" differently:
//
//   g10()            `!base`                            null -> TRUE  -> baselining, asserts nothing
//   the verdict      `stored.unitOrdinal === undefined` null -> FALSE -> "compared"
//
// So G10 surveyed while the final line printed `✓ REGRESSION GATE PASSED` with NO qualifier — a
// gate reporting that it ratcheted when it had not, in the one gate A5 exists to un-skip. It is
// the watchlist's "a verdict computed separately from the report of that verdict", and the
// checkpoint that triggers it is the one committed in this repo.
//
// The fix is structural: g10() records whether it compared, and the verdict READS that instead of
// re-deriving it from the checkpoint shape. This file pins both halves — the null/undefined
// equivalence, and the fact that the verdict is derived from the flag and not from `stored`.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeOnly } from '../../scripts/lib/source-scan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GATE = path.join(REPO, 'scripts/cutover-regression-gate.mts');

const code = () => codeOnly(readFileSync(GATE, 'utf8'));

describe('g10 and the verdict agree on whether a baseline existed', () => {
  it('the verdict is derived from what g10 did, not from the checkpoint shape', () => {
    // SEED: restore `stored.unitOrdinal === undefined` in the verdict -> RED.
    const c = code();
    expect(c, 'g10 no longer records whether it compared').toMatch(/g10Ratcheted\s*=\s*result\.ok\s*&&\s*base\s*!=\s*null/);
    expect(c, 'the verdict re-derives "compared" from the checkpoint instead of reading g10Ratcheted')
      .toMatch(/const compared\s*=\s*!CAPTURE\s*&&[^;]*g10Ratcheted/);
    expect(c, 'the verdict re-derives "baselining" from the checkpoint instead of reading g10Ratcheted')
      .toMatch(/const g10Baselining\s*=\s*!CAPTURE\s*&&\s*!g10Ratcheted/);
    // The specific comparison that caused the split must be gone from the verdict block.
    expect(c, 'the === undefined test is back — null and undefined disagree again')
      .not.toMatch(/stored\.unitOrdinal\s*===\s*undefined/);
  });

  it('a stored null and an absent key are the same thing to both readers', () => {
    // The property, exercised rather than asserted about source text: `!base` and `base != null`
    // must agree for undefined, null and a real object. They did not before — that IS the bug.
    // SEED: change `base != null` to `base !== undefined` -> RED on the null case.
    const src = code();
    const m = src.match(/g10Ratcheted\s*=\s*result\.ok\s*&&\s*(base\s*!=\s*null)/);
    expect(m, 'could not find the baseline test to exercise').not.toBeNull();
    // The shipped expression, with `result.ok` as a parameter rather than a constant — which also
    // covers the case the original missed: an instrument that FAILED has not ratcheted either.
    const ratcheted = (resultOk: boolean, base: unknown) => resultOk && base != null;
    const g10SeesBaseline = (base: unknown) => Boolean(base); // g10's own `!base` branch, inverted
    for (const [label, base] of [
      ['absent', undefined],
      ['stored null — the committed checkpoint', null],
      ['a real baseline', { publishedWorks: 6, nulls: 0, rollupDigest: 'x' }],
    ] as const) {
      expect(ratcheted(true, base), `${label}: the verdict and g10 disagree`).toBe(g10SeesBaseline(base));
    }
    // A failed instrument never counts as a ratchet, whatever the checkpoint holds.
    expect(ratcheted(false, { publishedWorks: 6, nulls: 0, rollupDigest: 'x' })).toBe(false);
  });
});
