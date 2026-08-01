// Types for served-assets.mjs.
export declare const WEB_SRC: string;
export declare const WEB_PUBLIC: string;
export declare function servedAssetDirs(srcDir?: string): string[];
export declare function assertServedAssetsScannable(srcDir?: string): { ok: boolean; offenders: string[] };
export declare function missingServedAssetDirs(publicDir?: string, srcDir?: string): { ok: boolean; served: string[]; missing: string[] };
