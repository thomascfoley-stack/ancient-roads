/**
 * DEPS-AUDIT CORE — the pure, side-effect-free decision logic of the CVE gate, extracted from
 * scripts/deps-audit.mjs so it can be unit-tested. deps-audit.mjs itself does network + child-
 * process I/O at import time, so its decision (which advisories FAIL the build) could only ever
 * be proven by a manual run. This module makes that decision a testable function.
 *
 * Consumed by scripts/deps-audit.mjs (production) and test/deps-audit-core.test.ts.
 */

const LEVELS = new Set(['high', 'critical']);

/** Extract the GHSA id from a bulk-endpoint advisory: the url form, falling back to numeric id. */
function extractGhsa(advisory) {
  return (advisory.url ?? '').split('/advisories/')[1] ?? String(advisory.id);
}

/**
 * Given the bulk endpoint response ({ pkgName: advisory[] }) and the ignore set of GHSA ids,
 * return the findings that MUST FAIL the gate: severity is high/critical AND the GHSA is not
 * ignored. Everything else (moderate/low, or an exactly-ignored GHSA) is dropped. The ignore
 * match is EXACT — ignoring one GHSA never suppresses a different advisory.
 */
export function selectFindings(bulkData, ignore) {
  const findings = [];
  for (const [name, advisories] of Object.entries(bulkData ?? {})) {
    for (const a of advisories ?? []) {
      if (!LEVELS.has(a.severity)) continue;
      const ghsa = extractGhsa(a);
      if (ignore.has(ghsa)) continue;
      findings.push({ name, severity: a.severity, ghsa, title: a.title, range: a.vulnerable_versions });
    }
  }
  return findings;
}
