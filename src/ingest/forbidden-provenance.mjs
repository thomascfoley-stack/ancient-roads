// THE forbidden-aggregator predicate. One definition, plain JavaScript, on purpose.
//
// WHY .mjs AND NOT .ts: this predicate is the only thing standing between the excerpt
// sampler and printing an aggregator's compilation into a committed evidence log, and
// the instrument that calls it runs under plain `node` against production. The same
// argument scripts/lib/target-guard.d.mts makes for the prod-target guard applies here:
// a check on the legal rail must not stop working because a transpiler is missing, a
// registry is unreachable, or `npx tsx` decided to fetch a package mid-run.
//
// license-manifest.ts re-exports these, so every existing importer is unchanged and
// there is still exactly ONE body of this logic in the repo. Do not re-type it anywhere.
//
// Aggregators we must never depend on for provenance (ADR-008, CLAUDE.md). The TEXT may
// be public domain, but reusing THEIR compilation is a breach-of-contract exposure (the
// hiQ pattern), and an unlabeled aggregator edition can't clear the edition trap. A
// source whose provenance points here fails closed: it must be re-sourced from a
// permitted PD edition, or explicitly quarantined.
//   - biblehub.com, studylight.org: ADR-008 (ToS-protected).
//   - historicalchristian.faith: added 2026-07-10 after vetting (RESOURCING_PLAN §7) —
//     "open source, crowd-sourced" with NO license grant, no edition attribution, and it
//     lists non-PD authors (e.g. C.S. Lewis); its father translations can't be assumed
//     PD. Re-source the fathers from Schaff.
export const FORBIDDEN_PROVENANCE_DOMAINS = ['biblehub.com', 'studylight.org', 'historicalchristian.faith'];

function provenanceHost(url) {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Returns the forbidden aggregator domain a provenance URL belongs to, else null.
// Matches the domain and any subdomain (www.biblehub.com), not naive substrings.
export function forbiddenProvenanceDomain(url) {
  if (typeof url !== 'string' || url.trim() === '') return null;
  const host = provenanceHost(url.trim());
  if (host === null) return null;
  for (const d of FORBIDDEN_PROVENANCE_DOMAINS) {
    if (host === d || host.endsWith(`.${d}`)) return d;
  }
  return null;
}
