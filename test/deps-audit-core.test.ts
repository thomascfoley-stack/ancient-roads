// HARDENING (Track 2) — the CVE gate must actually FAIL on a real un-ignored high/critical
// advisory. scripts/deps-audit.mjs does network I/O at import, so its decision was only ever
// proven by a manual seeded run; selectFindings (scripts/deps-audit-core.mjs) is that decision
// as a pure function, fenced here. Seed a bug in selectFindings (drop the severity filter, or
// ignore-everything) and these go RED.
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs core module, no types
import { selectFindings } from '../scripts/deps-audit-core.mjs';

/** A bulk-endpoint advisory shaped like npm's response. */
const adv = (ghsa: string, severity = 'high', extra: Record<string, unknown> = {}) => ({
  severity,
  url: `https://github.com/advisories/${ghsa}`,
  title: `${severity} in dep`,
  vulnerable_versions: '<9.9.9',
  id: 1234,
  ...extra,
});

describe('deps-audit-core.selectFindings — the CVE gate decision', () => {
  it('FLAGS an un-ignored high advisory (the gate has teeth)', () => {
    const f = selectFindings({ 'evil-pkg': [adv('GHSA-aaaa-bbbb-cccc')] }, new Set());
    expect(f.map((x: { ghsa: string }) => x.ghsa)).toEqual(['GHSA-aaaa-bbbb-cccc']);
  });

  it('DROPS an advisory whose exact GHSA is in the ignore list', () => {
    const f = selectFindings({ dep: [adv('GHSA-known')] }, new Set(['GHSA-known']));
    expect(f).toEqual([]);
  });

  it('never flags moderate or low severity (only high/critical gate)', () => {
    const f = selectFindings({ dep: [adv('GHSA-m', 'moderate'), adv('GHSA-l', 'low')] }, new Set());
    expect(f).toEqual([]);
  });

  it('the ignore match is EXACT — ignoring one GHSA does not suppress a different critical', () => {
    const f = selectFindings({ dep: [adv('GHSA-crit', 'critical')] }, new Set(['GHSA-someone-else']));
    expect(f.map((x: { severity: string }) => x.severity)).toEqual(['critical']);
  });

  it('extracts the GHSA from the url, and falls back to the numeric id when url is absent', () => {
    // url-less advisory: ghsa becomes String(id) → ignoring that id suppresses it (proves fallback).
    const noUrl = { severity: 'high', title: 't', vulnerable_versions: '<1', id: 4242 };
    expect(selectFindings({ dep: [noUrl] }, new Set(['4242']))).toEqual([]);
    expect(selectFindings({ dep: [noUrl] }, new Set()).map((x: { ghsa: string }) => x.ghsa)).toEqual(['4242']);
  });
});
