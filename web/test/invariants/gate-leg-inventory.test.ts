// Cutover gate leg inventory — two properties, and they are not the same property.
//
//   1. RUNTIME: every declared leg reported on this run (a silent leg refuses the gate).
//   2. DECLARATION: the declared set is still the gate's actual set.
//
// (2) is the one that was missing. `REQUIRED_GATE_PREFIXES` is hand-typed, and the independent
// audit (2026-07-31 §D-1) showed a `G11` leg could be added to the gate while this file, its test,
// and the gate itself all stayed green — the eighth instance of "a hand-maintained expected set
// that nothing enforces", introduced by the tranche meant to close that class.
//
// The old test for (1) could not have caught it either, because it built its reported set FROM the
// constant it was validating (`new Set(REQUIRED_GATE_PREFIXES)`) — it compared the list to itself.
// Every reported set below is now derived from the gate's source instead.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  gateLegPrefixesFromSource,
  gateLegSourceIsScannable,
  recordGateLeg,
  REQUIRED_GATE_PREFIXES,
  OPTIONAL_GATE_PREFIXES,
  validateGateLegDeclaration,
  validateGateLegInventory,
} from '../../../scripts/lib/gate-leg-inventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GATE = path.join(ROOT, 'scripts/cutover-regression-gate.mts');
const gateSource = readFileSync(GATE, 'utf8');

/** The legs the gate really has — never the constant under test. */
const legsInGate = gateLegPrefixesFromSource(gateSource);

describe('gate leg inventory — DECLARATION matches the gate', () => {
  it('the scanner is not blind (positive control)', () => {
    // Without this, a regex that matched nothing would make every assertion below vacuous.
    expect(legsInGate.length).toBeGreaterThan(5);
    expect(legsInGate).toContain('G1');
    expect(legsInGate).toContain('G10');
  });

  it('every pass()/fail() call site is scannable — no leg can hide behind a template literal', () => {
    const scan = gateLegSourceIsScannable(gateSource);
    expect(scan.unscannable, `${scan.unscannable} call site(s) do not use a literal name`).toBe(0);
    expect(scan.ok).toBe(true);
  });

  it('the declared set IS the gate’s set — no leg unaccounted for, none declared that is gone', () => {
    const r = validateGateLegDeclaration(gateSource);
    expect(r.inGateNotDeclared, 'legs the gate runs that no list requires').toEqual([]);
    expect(r.declaredNotInGate, 'legs declared that the gate no longer has').toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('REFUSES a leg the gate gained but no list declares (red-proof)', () => {
    const seeded = `${gateSource}\npass('G11 new leg', 'added to the gate, declared nowhere');\n`;
    const r = validateGateLegDeclaration(seeded);
    expect(r.ok).toBe(false);
    expect(r.inGateNotDeclared).toEqual(['G11']);
  });

  it('REFUSES a declared leg the gate no longer has (red-proof, the other direction)', () => {
    const seeded = gateSource.replace(/\b(pass|fail)\(\s*'G6\s/g, "$1('GX ");
    expect(seeded, 'seed must actually change the source').not.toBe(gateSource);
    const r = validateGateLegDeclaration(seeded);
    expect(r.ok).toBe(false);
    expect(r.declaredNotInGate).toContain('G6');
  });

  it('REFUSES a source it cannot scan rather than reporting an empty gate', () => {
    const seeded = `${gateSource}\npass(\`G12 \${dynamic}\`, 'computed name');\n`;
    const scan = gateLegSourceIsScannable(seeded);
    expect(scan.ok).toBe(false);
    expect(scan.unscannable).toBe(1);
    expect(validateGateLegDeclaration(seeded).ok).toBe(false);
  });
});

describe('gate leg inventory — RUNTIME reporting', () => {
  it('passes when every leg the gate has reported', () => {
    const reported = new Set<string>();
    for (const p of legsInGate) recordGateLeg(reported, `${p} ran`);
    expect(validateGateLegInventory(reported).ok).toBe(true);
  });

  it('REFUSES when a required leg silently did not report (red-proof)', () => {
    const reported = new Set<string>();
    for (const p of legsInGate) {
      if (p !== 'G10') recordGateLeg(reported, `${p} ran`);
    }
    const r = validateGateLegInventory(reported);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['G10']);
  });

  it('requires G7 only when the live probe ran', () => {
    const reported = new Set<string>();
    for (const p of legsInGate) {
      if (!OPTIONAL_GATE_PREFIXES.includes(p)) recordGateLeg(reported, `${p} ran`);
    }
    expect(validateGateLegInventory(reported).ok, 'G7 not required when the probe did not run').toBe(true);
    expect(validateGateLegInventory(reported, { liveProbe: true }).missing).toContain('G7');
    recordGateLeg(reported, 'G7 live /ask');
    expect(validateGateLegInventory(reported, { liveProbe: true }).ok).toBe(true);
  });

  // KNOWN LIMIT, recorded not fixed (independent audit §D-1, second half).
  // `recordGateLeg` keys on the FAMILY (`gateName.split(/\s/)[0]`), not the individual check. The
  // gate has 85 pass/fail call sites across 10 families — G2 alone has 16 — so this inventory can
  // detect 10 possible silences out of 85, and only when an entire family goes quiet. A single
  // sub-leg falling silent (e.g. the G5 leg guarded by `hasColumn(...)`) is invisible here because
  // G5's other call sites still report "G5". Widening to per-leg granularity is a separate change
  // with its own red-proof; this test exists so the limit is not rediscovered as a surprise.
  it('is FAMILY-granular, not leg-granular — this is a limit, not a bug', () => {
    const reported = new Set<string>();
    recordGateLeg(reported, 'G2 first leg');
    expect(reported.has('G2')).toBe(true);
    // A second, different G2 check failing to report changes nothing the inventory can see.
    expect(validateGateLegInventory(reported).missing).not.toContain('G2');
    expect(REQUIRED_GATE_PREFIXES).toContain('G2');
  });
});
