// Types for gate-leg-inventory.mjs (Work Order v2 Stage 2 Tranche 7).

export declare const REQUIRED_GATE_PREFIXES: string[];
export declare const OPTIONAL_GATE_PREFIXES: string[];

export declare function recordGateLeg(reported: Set<string>, gateName: string): void;

export declare function validateGateLegInventory(
  reported: Set<string>,
  opts?: { liveProbe?: boolean },
): { ok: boolean; missing: string[] };

export declare function gateLegPrefixesFromSource(source: string): string[];

export declare function gateLegSourceIsScannable(
  source: string,
): { ok: boolean; unscannable: number };

export declare function validateGateLegDeclaration(source: string): {
  ok: boolean;
  inGateNotDeclared: string[];
  declaredNotInGate: string[];
  unscannable: number;
};
