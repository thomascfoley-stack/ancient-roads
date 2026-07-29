// Types for target-guard.mjs. The implementation must stay .mjs because the cutover
// orchestrator and its delegates run under plain `node`, with no tsx in the path — a
// prod-safety guard must not depend on a transpiler being present.
export declare const PROD_ENDPOINT: string;
export declare const DEV_ENDPOINT: string;

/** Lowercased host of a connection string. `new URL()` will not do this for postgresql:. */
export declare function hostOf(url: string): string;

/** The Neon endpoint id (first DNS label), or null if the input is not an endpoint id. */
export declare function endpointId(s: string | null | undefined): string | null;

export declare function isProdHost(url: string): boolean;
export declare function isDevHost(url: string): boolean;

/** Exact endpoint-id equality between the URL's host and the operator's declared target. */
export declare function declaredMatches(url: string, declared: string | null | undefined): boolean;

/** Dev is always allowed; anything else needs BOTH the override and an exact declared id. */
export declare function assertCutoverTarget(
  url: string,
  opts: { allow: boolean; declared: string | null | undefined; what?: string },
): string;

/** For scripts that destroy their target: refuses prod and dev outright. */
export declare function assertThrowawayTarget(
  url: string,
  declared: string | null | undefined,
): string;
