// SCAN_RE false-floor gate — the corroboration rule for book words that are also
// ordinary English nouns (W-SCANRE; owner ruling 2026-08-23).
//
// WHY THIS IS AN INVARIANT AND NOT A SCRIPT. The measurement lived only in
// scripts/probe-scan-floors.mts, which nothing runs in CI, so a regression here would be
// invisible until someone re-ran it by hand. A false floor RESERVES the top two answer
// slots, so it displaces a correct voice rather than merely adding a wrong one — the
// ADR-015 hijack class surviving in the un-corroborated numeric path.
//
// The dataset is the pre-registered n=36 adversarial set + n=31 genuine-citation controls
// (evals/cases/reference_floors.yaml, frozen before the fix was written). The two known
// residuals are named individually below rather than subtracted from a total, so a NEW
// failure cannot hide inside a passing count.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { resolveIntent } from '../../src/bible/pericopes';

interface FloorCase { id: string; suite: string; prompt: string; expect: string[] }

const cases = (
  parse(readFileSync(path.resolve(__dirname, '../../evals/cases/reference_floors.yaml'), 'utf8')) as FloorCase[]
).filter((c) => c && c.id && c.prompt);

// Ruled residuals (owner 2026-08-23, "ship it" at 33 -> 2). Each is a NAMED design question
// in docs/pm/orders/2026-08-22-w-scanre-adr-proposal.md, not a tolerance:
//   nc-001 — two false candidates corroborate each other (`is 1` alias -> Isaiah)
//   nc-007 — a bare major-figure lexicon token ("paul") reads as corroboration
const RULED_RESIDUAL = new Set(['scanre-nc-001', 'scanre-nc-007']);

describe('SCAN_RE false-floor corroboration gate', () => {
  it('the frozen dataset is present and the expected size', () => {
    expect(cases.filter((c) => c.expect.includes('floor_empty')).length).toBe(36);
    expect(cases.filter((c) => c.expect.includes('floor_fires')).length).toBe(31);
  });

  for (const c of cases) {
    const wantEmpty = c.expect.includes('floor_empty');
    const residual = RULED_RESIDUAL.has(c.id);
    it(`${c.id} ${residual ? '[RULED RESIDUAL] ' : ''}${wantEmpty ? 'does not floor' : 'floors'}: "${c.prompt}"`, () => {
      const floor = resolveIntent(c.prompt).floor;
      if (wantEmpty && residual) {
        // Pinned as still-broken. If this ever passes, the residual closed and the pin
        // must be removed — a stale allowance is how a fixed bug stays "known broken".
        expect(floor.length, `${c.id} now passes — remove it from RULED_RESIDUAL`).toBeGreaterThan(0);
      } else if (wantEmpty) {
        expect(floor, `"${c.prompt}" is not a citation and must not reserve the top slots`).toEqual([]);
      } else {
        expect(floor.length, `"${c.prompt}" is a genuine citation and must floor`).toBeGreaterThan(0);
      }
    });
  }
});
