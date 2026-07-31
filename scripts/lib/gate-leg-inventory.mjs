// Cutover regression gate leg inventory (Work Order v2 Stage 2 Tranche 7).
// Each top-level gate (G1–G10 except optional G7) must report at least once per run.

/** Top-level gate prefixes that MUST report (pass or fail) on every gate run. */
export const REQUIRED_GATE_PREFIXES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G8', 'G9', 'G10'];

/** G7 runs only when CUTOVER_ASK_URL is set. */
export const OPTIONAL_GATE_PREFIXES = ['G7'];

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
