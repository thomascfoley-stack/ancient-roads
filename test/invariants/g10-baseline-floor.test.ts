// G10 HAS A COMMITTED BASELINE, SO IT CANNOT SILENTLY RETURN TO SURVEY MODE.
//
// FOUND BY RUNNING A5 (2026-08-02). G10's whole purpose is to ratchet the published cohort's
// unit_ordinal rollup digest against a stored reading. Its baseline lived in
// `.cutover-checkpoint.json`, which is GITIGNORED (`.gitignore:47`) and which AGENTS.md records
// being clobbered by concurrent sessions twice. On a fresh clone there is no baseline, G10 takes
// its "BASELINING — survey, not ratchet" branch, and the gate still ends in a green line.
//
// The checkpoint on this machine carried `unitOrdinal: null` — so G10 had been surveying, not
// ratcheting, for the whole of the cutover era. A5's run is the reading that fills it.
//
// `docs/evidence/g10-unit-ordinal-baseline.json` is the COMMITTED floor, the same pattern as
// `docs/evidence/corpus-manifest-*.json` for the corpus ratchet: the checkpoint still wins when it
// carries a reading, and this is what survives a clone. These cases pin that the floor exists, is
// well-formed, and is wired into the gate — deleting any of the three turns one of them red.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeOnly } from '../../scripts/lib/source-scan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FLOOR = path.join(REPO, 'docs/evidence/g10-unit-ordinal-baseline.json');
const GATE = path.join(REPO, 'scripts/cutover-regression-gate.mts');

interface Floor {
  cohort?: string;
  capturedAt?: string;
  evidence?: string;
  unitOrdinal?: { publishedWorks?: number; nulls?: number; rollupDigest?: string };
}

describe('G10 keeps a baseline a fresh clone can read', () => {
  it('the committed floor exists and carries a usable digest', () => {
    // SEED: delete the file, or blank rollupDigest -> RED. Either returns the gate to survey mode.
    expect(existsSync(FLOOR), 'the committed G10 floor is gone — the gate silently surveys').toBe(true);
    const f = JSON.parse(readFileSync(FLOOR, 'utf8')) as Floor;
    expect(f.unitOrdinal?.rollupDigest, 'no rollupDigest — nothing to ratchet against').toMatch(/^[0-9a-f]{32}$/);
    expect(f.unitOrdinal?.publishedWorks, 'zero published works would make the instrument blind').toBeGreaterThan(0);
    expect(typeof f.unitOrdinal?.nulls).toBe('number');
  });

  it('it says WHEN and against WHAT it was captured', () => {
    // Provenance is not decoration here. The rest of baseline.regression was captured pre-cutover
    // at 5,510 sections; production is 72,863. A digest with no capture date invites being read as
    // an E0 reading, which it is not.
    const f = JSON.parse(readFileSync(FLOOR, 'utf8')) as Floor;
    expect(f.cohort).toBe('published');
    expect(f.capturedAt, 'no capture date — this would be read as an E0 baseline').toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(f.evidence, 'no pointer to the run that produced it').toContain('instrument-published.log');
    expect(existsSync(path.join(REPO, f.evidence!)), `${f.evidence} does not exist`).toBe(true);
  });

  it('the gate actually falls back to it', () => {
    // A committed floor nothing reads is a file, not a floor.
    // SEED: drop the `?? committedUnitOrdinalBaseline()` from the g10 call -> RED.
    const c = codeOnly(readFileSync(GATE, 'utf8'));
    expect(c, 'the gate does not read the committed floor').toMatch(/stored\.unitOrdinal\s*\?\?\s*committedUnitOrdinalBaseline\(\)/);
    // And an unreadable floor must read as "no baseline", never as a pass.
    expect(c).toMatch(/catch\s*\{\s*return undefined;\s*\}/);
  });
});
