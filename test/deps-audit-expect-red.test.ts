import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs core module
import { selectFindings } from '../scripts/deps-audit-core.mjs';

/** Compare observed vs declared GHSA sets — mirrors deps-audit.mjs --expect-red logic. */
function expectRedOk(observed: string[], declared: Set<string>): boolean {
  const obs = new Set(observed);
  const extra = [...obs].filter((g) => !declared.has(g));
  const missing = [...declared].filter((g) => !obs.has(g));
  return extra.length === 0 && missing.length === 0;
}

const adv = (ghsa: string, severity = 'high') => ({
  severity,
  url: `https://github.com/advisories/${ghsa}`,
  title: 't',
  vulnerable_versions: '<1',
  id: 1,
});

describe('deps-audit --expect-red set comparison', () => {
  it('passes when observed matches declared exactly', () => {
    const findings = selectFindings({ dep: [adv('GHSA-qq9h-g4jm-xgf3')] }, new Set()) as { ghsa: string }[];
    const observed = [...new Set(findings.map((f) => f.ghsa))];
    expect(expectRedOk(observed, new Set(['GHSA-qq9h-g4jm-xgf3']))).toBe(true);
  });

  it('fails when an extra advisory appears (direction: introduce red)', () => {
    const findings = selectFindings(
      { dep: [adv('GHSA-qq9h-g4jm-xgf3'), adv('GHSA-extra-bbbb-cccc')] },
      new Set(),
    ) as { ghsa: string }[];
    const observed = [...new Set(findings.map((f) => f.ghsa))];
    expect(expectRedOk(observed, new Set(['GHSA-qq9h-g4jm-xgf3']))).toBe(false);
  });

  it('fails when a declared id disappears (direction: remove from set)', () => {
    expect(expectRedOk([], new Set(['GHSA-qq9h-g4jm-xgf3']))).toBe(false);
    expect(selectFindings({}, new Set()).length).toBe(0);
  });
});
