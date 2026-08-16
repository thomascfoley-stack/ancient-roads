// HARDENING (Track 2) — the CVE gate must actually FAIL on a real un-ignored high/critical
// advisory. scripts/deps-audit.mjs does network I/O at import, so its decision was only ever
// proven by a manual seeded run; selectFindings (scripts/deps-audit-core.mjs) is that decision
// as a pure function, fenced here. Seed a bug in selectFindings (drop the severity filter, or
// ignore-everything) and these go RED.
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs core module, no types
import { selectFindings, resolvedInLockfile } from '../scripts/deps-audit-core.mjs';

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

describe('deps-audit-core.resolvedInLockfile — installed-vs-lockfile coherence', () => {
  // Real shapes from pnpm-lock.yaml 2026-08-16, when posthog-js became the first dependency
  // with an ALIASED transitive (web-vitals-soft-navs: npm:web-vitals@6.0.0) and the plain
  // substring check refused a coherent tree.
  const lock = [
    '  web-vitals@5.3.0:',
    '  web-vitals@6.0.0:',
    "      web-vitals: 5.3.0",
    '      web-vitals-soft-navs: web-vitals@6.0.0',
  ].join('\n');

  it('accepts the plain verbatim form', () => {
    expect(resolvedInLockfile(lock, 'web-vitals', '5.3.0')).toBe(true);
  });

  it('accepts the pnpm alias form (alias name reported, real resolution recorded)', () => {
    expect(resolvedInLockfile(lock, 'web-vitals-soft-navs', '6.0.0')).toBe(true);
  });

  it('still REFUSES a version the lockfile never resolved — the can-fail leg', () => {
    // Present name, absent version: 9.9.9 is in neither form. If the alias fallback ever
    // degenerates to name-only matching, this goes RED.
    expect(resolvedInLockfile(lock, 'web-vitals-soft-navs', '9.9.9')).toBe(false);
    expect(resolvedInLockfile(lock, 'web-vitals', '9.9.9')).toBe(false);
    expect(resolvedInLockfile(lock, 'not-installed', '1.0.0')).toBe(false);
  });
});
