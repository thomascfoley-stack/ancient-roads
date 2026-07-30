import { describe, expect, it } from 'vitest';
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
  it('passes when observed matches declared exactly', () => {
    const findings = selectFindings({ dep: [adv('GHSA-qq9h-g4jm-xgf3')] }, new Set()) as { ghsa: string }[];
    const observed = [...new Set(findings.map((f) => f.ghsa))];
    expect(depsAuditCore.compareExpectRed(observed, declared).ok).toBe(true);
  });

  it('fails when an extra advisory appears', () => {
    const findings = selectFindings(
      { dep: [adv('GHSA-qq9h-g4jm-xgf3'), adv('GHSA-extra-bbbb-cccc')] },
      new Set(),
    ) as { ghsa: string }[];
    const observed = [...new Set(findings.map((f) => f.ghsa))];
    const result = depsAuditCore.compareExpectRed(observed, declared);
    expect(result.ok).toBe(false);
    expect(result.extra).toContain('GHSA-extra-bbbb-cccc');
  });

  it('fails when a declared id disappears', () => {
    const result = depsAuditCore.compareExpectRed([], declared);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('GHSA-qq9h-g4jm-xgf3');
  });

  it('extra and missing come from the same predicate the gate uses', () => {
    const result = depsAuditCore.compareExpectRed(
      ['GHSA-qq9h-g4jm-xgf3', 'GHSA-extra-bbbb-cccc'],
      declared,
    );
    expect(result.ok).toBe(false);
    expect(result.extra).toEqual(['GHSA-extra-bbbb-cccc']);
    expect(result.missing).toEqual([]);
  });
});
