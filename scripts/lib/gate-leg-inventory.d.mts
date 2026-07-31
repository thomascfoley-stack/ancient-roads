// Types for gate-leg-inventory.mjs (Work Order v2 Stage 2 Tranche 7).

export declare const REQUIRED_GATE_PREFIXES: string[];
export declare const OPTIONAL_GATE_PREFIXES: string[];

export declare function recordGateLeg(reported: Set<string>, gateName: string): void;

export declare function validateGateLegInventory(
  reported: Set<string>,
  opts?: { liveProbe?: boolean },
): { ok: boolean; missing: string[] };
