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
// TWO FILES, ONE BODY, GUARDED. This file is byte-identical to web/src/lib/forbidden-provenance.mjs
// and test/web-core-sync.test.ts fails if they diverge — the same mechanism the contract schema and
// the V1 verifier use. It is a COPY rather than an import because `vercel --prod` uploads `web/`
// ALONE: a `../../../src/ingest/...` specifier resolves in the repo checkout, in CI, and in a local
// `next build`, and does not exist in the deployment. That is exactly how it failed — deploy
// `98124b2` reached Vercel and died with "Module not found: Can't resolve
// '../../../src/ingest/forbidden-provenance.mjs'", after a local build and a full green audit.
// `next build` in CI cannot catch it, because CI builds inside the whole repo.
// test/invariants/web-upload-root.test.ts now catches it before a deploy does.
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
// Exported (2026-08-22, W-SEC-CCEL): the history citation derives its provenance label from
// the source record instead of a hardcoded ` (CCEL)` — one parser, never re-typed.
export { provenanceHost };

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
