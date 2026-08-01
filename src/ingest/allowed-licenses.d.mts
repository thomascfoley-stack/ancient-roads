// Types for allowed-licenses.mjs. The implementation stays .mjs so the A4 publish-flip gate can
// import it under plain `node` on the production path — see the header there.
export declare const ALLOWED_LICENSES: readonly string[];

/** True only for a licence string in the allowed set; false for null/undefined/non-string. */
export declare function isAllowedLicense(license: unknown): boolean;
