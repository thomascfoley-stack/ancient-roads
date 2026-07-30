import { describe, expect, it, vi, afterEach } from 'vitest';
// @ts-expect-error — plain .mjs core module
import * as depsAuditCore from '../scripts/deps-audit-core.mjs';

const { selectFindings } = depsAuditCore;

const adv = (ghsa: string, severity = 'high') => ({
  severity,
  url: `https://github.com/advisories/${ghsa}`,
  title: 't',
  vulnerable_versions: '<1',
  id: 1,
});

const declared = new Set(['GHSA-qq9h-g4jm-xgf3']);

describe('deps-audit --expect-red (imports compareExpectRed from deps-audit-core.mjs)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes when observed matches declared exactly', () => {
    const findings = selectFindings({ dep: [adv('GHSA-qq9h-g4jm-xgf3')] }, new Set()) as { ghsa: string }[];
    const observed = [...new Set(findings.map((f) => f.ghsa))];
    expect(depsAuditCore.compareExpectRed(observed, declared)).toBe(true);
  });

  it('fails when an extra advisory appears', () => {
    const findings = selectFindings(
      { dep: [adv('GHSA-qq9h-g4jm-xgf3'), adv('GHSA-extra-bbbb-cccc')] },
      new Set(),
    ) as { ghsa: string }[];
    const observed = [...new Set(findings.map((f) => f.ghsa))];
    expect(depsAuditCore.compareExpectRed(observed, declared)).toBe(false);
  });

  it('fails when a declared id disappears', () => {
    expect(depsAuditCore.compareExpectRed([], declared)).toBe(false);
  });

  it('seed compareExpectRed → return true: mocked red, restored green', () => {
    expect(depsAuditCore.compareExpectRed(['GHSA-extra-bbbb-cccc'], declared)).toBe(false);
    vi.spyOn(depsAuditCore, 'compareExpectRed').mockReturnValue(true);
    expect(depsAuditCore.compareExpectRed(['GHSA-extra-bbbb-cccc'], declared)).toBe(true);
    vi.restoreAllMocks();
    expect(depsAuditCore.compareExpectRed(['GHSA-extra-bbbb-cccc'], declared)).toBe(false);
  });

  it('seed compareExpectRed → ignore extra advisories: mocked red, restored green', () => {
    const obs = ['GHSA-qq9h-g4jm-xgf3', 'GHSA-extra-bbbb-cccc'];
    expect(depsAuditCore.compareExpectRed(obs, declared)).toBe(false);
    vi.spyOn(depsAuditCore, 'compareExpectRed').mockImplementation((observed: string[]) => {
      const o = new Set(observed);
      return [...declared].every((g) => o.has(g));
    });
    expect(depsAuditCore.compareExpectRed(obs, declared)).toBe(true);
    vi.restoreAllMocks();
    expect(depsAuditCore.compareExpectRed(obs, declared)).toBe(false);
  });

  it('seed compareExpectRed → size-only compare: mocked red, restored green', () => {
    expect(depsAuditCore.compareExpectRed(['GHSA-totally-different-aaaa-bbbb'], declared)).toBe(false);
    vi.spyOn(depsAuditCore, 'compareExpectRed').mockImplementation((observed: string[], dec: Set<string>) => {
      return new Set(observed).size === dec.size;
    });
    expect(depsAuditCore.compareExpectRed(['GHSA-totally-different-aaaa-bbbb'], declared)).toBe(true);
    vi.restoreAllMocks();
    expect(depsAuditCore.compareExpectRed(['GHSA-totally-different-aaaa-bbbb'], declared)).toBe(false);
  });
});
