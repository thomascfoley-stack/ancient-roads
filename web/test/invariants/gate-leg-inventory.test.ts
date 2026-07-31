import { describe, expect, it } from 'vitest';
import {
  recordGateLeg,
  REQUIRED_GATE_PREFIXES,
  validateGateLegInventory,
} from '../../../scripts/lib/gate-leg-inventory.mjs';

describe('gate leg inventory', () => {
  it('passes when all required prefixes reported', () => {
    const reported = new Set<string>();
    for (const p of REQUIRED_GATE_PREFIXES) recordGateLeg(reported, `${p} test`);
    expect(validateGateLegInventory(reported).ok).toBe(true);
  });

  it('REFUSES when a required leg silently did not report (red-proof)', () => {
    const reported = new Set<string>();
    for (const p of REQUIRED_GATE_PREFIXES) {
      if (p !== 'G10') recordGateLeg(reported, `${p} test`);
    }
    const r = validateGateLegInventory(reported);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['G10']);
  });

  it('requires G7 only when live probe ran', () => {
    const reported = new Set(REQUIRED_GATE_PREFIXES);
    expect(validateGateLegInventory(reported, { liveProbe: true }).missing).toContain('G7');
    recordGateLeg(reported, 'G7 live /ask');
    expect(validateGateLegInventory(reported, { liveProbe: true }).ok).toBe(true);
  });
});
