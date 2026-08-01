// Types for served-assets.mjs.
export declare const WEB_SRC: string;
export declare const WEB_PUBLIC: string;
export declare function servedAssetDirs(srcDir?: string): string[];
export declare function assertServedAssetsScannable(srcDir?: string): { ok: boolean; offenders: string[] };
export declare function missingServedAssetDirs(publicDir?: string, srcDir?: string): { ok: boolean; served: string[]; missing: string[] };
export declare const SERVED_ASSETS_BASELINE: string;
export declare function servedAssetFileCounts(dirs: string[], publicDir?: string): { counts: Record<string, number>; absent: string[] };
export declare function servedAssetCountRatchet(publicDir?: string, baselinePath?: string): {
  ok: boolean;
  failures: string[];
  absent: string[];
  increases: string[];
  live: Record<string, number>;
  baseline: Record<string, number>;
};
