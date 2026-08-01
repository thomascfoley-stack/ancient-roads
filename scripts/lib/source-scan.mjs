// Shared source-scanning helper.
//
// ONE definition, because two scans in this tree need the same rule and a second copy is the
// defect class this repo has paid for eight times. `test/prod-path-no-transpiler.test.ts` had the
// original; `scripts/lib/gate-leg-inventory.mjs` needs it for the same reason, stated there first:
//
//   the files being scanned EXPLAIN AT LENGTH what they no longer do, so scanning raw source flags
//   the explanation and the only way to get green is to delete the reasoning.
//
// Concretely: `cutover-regression-gate.mts` mentions `pass()` and `fail()` in two comments
// ("this leg used to be `pass()` with no comparison…"), which a naive scan counts as call sites.

/**
 * Drop WHOLE-LINE comments only.
 *
 * Whole-line and not trailing, deliberately: a code line carrying a URL or a string containing
 * `//` must not be mistaken for a comment and deleted, which would hide real code from the scan
 * and make the scan silently under-read — the failure mode these scans exist to prevent.
 *
 * @param {string} src
 * @returns {string}
 */
export function codeOnly(src) {
  return String(src)
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n');
}
