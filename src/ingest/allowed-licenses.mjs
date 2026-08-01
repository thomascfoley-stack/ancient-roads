// THE allowed-licence predicate. One definition, plain JavaScript, on purpose.
//
// WHY .mjs AND NOT .ts — the same argument forbidden-provenance.mjs makes, for the same rail.
// The A4 publish flip is the one legally irreversible write in this project, and its gate runs
// under plain `node` against production (test/prod-path-no-transpiler.test.ts forbids a
// transpiler on that path). A check on the legal rail must not stop working because a
// transpiler is missing, a registry is unreachable, or `npx tsx` decided to fetch a package
// mid-run.
//
// license-manifest.ts re-exports these, so every existing importer is unchanged and there is
// still exactly ONE body of this logic in the repo. Do not re-type it anywhere.
//
// scripts/publish-works.mjs:11 DID re-type it (`const ALLOWED = ['Public Domain', 'CC BY',
// 'CC BY-SA']`), which is the hand-maintained-expected-set defect this repo has paid for
// eleven times, sitting on the licensing rail. That copy is why this file exists.
//
// Fail closed: a missing, empty or non-string licence is NOT allowed. Publishing a work whose
// licence we cannot name is the exposure the gate exists to prevent, and "unknown" must never
// read as "probably fine".
export const ALLOWED_LICENSES = ['Public Domain', 'CC BY', 'CC BY-SA'];

/** True only for a licence string in the allowed set. Everything else, including null, is false. */
export function isAllowedLicense(license) {
  return typeof license === 'string' && ALLOWED_LICENSES.includes(license);
}
