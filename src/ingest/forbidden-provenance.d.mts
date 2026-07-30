// Types for forbidden-provenance.mjs. The implementation stays .mjs so the read-only
// production instrument can import it under plain `node` — see the header there.
export declare const FORBIDDEN_PROVENANCE_DOMAINS: readonly string[];

/** The forbidden aggregator domain a provenance URL belongs to, else null. */
export declare function forbiddenProvenanceDomain(url: unknown): string | null;
