// Cutover regression gate leg inventory (Work Order v2 Stage 2 Tranche 7).
// Each top-level gate (G1–G10 except optional G7) must report at least once per run.
import { codeOnly } from './source-scan.mjs';

/** Top-level gate prefixes that MUST report (pass or fail) on every gate run. */
export const REQUIRED_GATE_PREFIXES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G8', 'G9', 'G10'];

/** G7 runs only when CUTOVER_ASK_URL is set. */
export const OPTIONAL_GATE_PREFIXES = ['G7'];

/**
 * The gate prefixes the gate ACTUALLY has, read out of its source.
 *
 * WHY THIS EXISTS. The two lists above are hand-typed, and this repo's most expensive recurring
 * defect is a hand-maintained expected set that nothing enforces — seven instances before this
 * file, and this file was the eighth (independent audit 2026-07-31 §D-1). The lists were correct
 * when written; that is the property this defect class always has. What was missing is anything
 * that NOTICES when they stop being correct: a leg added to the gate is accounted for by nobody,
 * because `validateGateLegInventory` only asks whether the declared legs reported, never whether
 * the declared set is still the gate's set.
 *
 * The fix is the discipline already used elsewhere in this tree rather than a second list:
 * `sourceStatusCohorts()` parses the CHECK constraint out of 023 instead of retyping the statuses,
 * and `backfillSqlFromMigration()` reads 024's UPDATE instead of re-implementing it. Same idea —
 * derive the expected set from the artifact it describes, so the two cannot drift.
 *
 * This is a SOURCE SCAN, and its honest limits are: it sees `pass('G2 …')` / `fail('G2 …')` with a
 * literal single-quoted first argument, which is how all 85 of the gate's real call sites are
 * written today. A leg introduced via a template literal or a computed name would be invisible to
 * it. `gateLegSourceIsScannable()` below is the guard against that becoming silent.
 *
 * It scans `codeOnly()`, not raw source: the gate discusses `pass()` and `fail()` in two of its own
 * comments, and counting those as call sites made the scannability guard fail on an unmodified
 * tree. Stripping comments is the same rule `test/prod-path-no-transpiler.test.ts` needed, which is
 * why it now lives in one place instead of two.
 *
 * @param {string} source contents of scripts/cutover-regression-gate.mts
 * @returns {string[]} sorted distinct prefixes
 */
export function gateLegPrefixesFromSource(source) {
  const prefixes = new Set();
  for (const m of codeOnly(source).matchAll(/\b(?:pass|fail)\(\s*'([^']+)'/g)) {
    const prefix = m[1].split(/\s/)[0];
    if (prefix) prefixes.add(prefix);
  }
  return [...prefixes].sort();
}

/**
 * Would a leg escape the scan? Counts `pass(`/`fail(` call sites whose first argument is NOT a
 * literal single-quoted string. Any hit means `gateLegPrefixesFromSource` is under-reading and its
 * result must not be trusted as "the gate's legs".
 *
 * Without this, the derived check degrades into the failure it replaced: a regex that matches
 * nothing makes set-equality vacuously true, and the inventory goes quiet again — this time with
 * the appearance of being derived.
 *
 * @param {string} source
 * @returns {{ ok: boolean, unscannable: number }}
 */
export function gateLegSourceIsScannable(source) {
  const code = codeOnly(source);
  const all = [...code.matchAll(/\b(?:pass|fail)\(/g)].length;
  const literal = [...code.matchAll(/\b(?:pass|fail)\(\s*'[^']+'/g)].length;
  return { ok: all === literal, unscannable: all - literal };
}

/**
 * Does the declared set still match the gate's own structure?
 *
 * @param {string} source contents of scripts/cutover-regression-gate.mts
 * @returns {{ ok: boolean, inGateNotDeclared: string[], declaredNotInGate: string[], unscannable: number }}
 */
export function validateGateLegDeclaration(source) {
  const actual = gateLegPrefixesFromSource(source);
  const declared = new Set([...REQUIRED_GATE_PREFIXES, ...OPTIONAL_GATE_PREFIXES]);
  const scan = gateLegSourceIsScannable(source);
  const inGateNotDeclared = actual.filter((p) => !declared.has(p));
  const declaredNotInGate = [...declared].filter((p) => !actual.includes(p)).sort();
  return {
    ok: scan.ok && inGateNotDeclared.length === 0 && declaredNotInGate.length === 0,
    inGateNotDeclared,
    declaredNotInGate,
    unscannable: scan.unscannable,
  };
}

/**
 * Record a gate leg report (call from pass/fail in cutover-regression-gate.mts).
 * @param {Set<string>} reported
 * @param {string} gateName e.g. 'G2 >=2 voices'
 */
export function recordGateLeg(reported, gateName) {
  const prefix = gateName.split(/\s/)[0];
  if (prefix) reported.add(prefix);
}

/**
 * @param {Set<string>} reported gate prefixes that reported
 * @param {{ liveProbe?: boolean }} opts
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function validateGateLegInventory(reported, { liveProbe = false } = {}) {
  const required = [...REQUIRED_GATE_PREFIXES];
  if (liveProbe) required.push('G7');
  const missing = required.filter((p) => !reported.has(p));
  return { ok: missing.length === 0, missing };
}
