// Type surface for the plain-JS sync script (the target-guard.d.mts pattern: the script stays
// dependency-free .mjs so it runs under bare node; TS callers get the real shapes here).

export interface DiskFileMeta {
  sha256: string;
  size: number;
  full: string;
}

export interface SyncPlan {
  uploads: string[];
  deletes: string[];
  unchanged: number;
}

export declare const DEFAULT_ROOTS: string[];
export declare const CACHE_SECONDS: { bible: number; original: number; commentaries: number };

export declare function planSync(
  diskFiles: Map<string, { sha256: string }>,
  manifestFiles: Record<string, { sha256: string }>,
  prefix?: string,
): SyncPlan;

export declare function walkDisk(baseDir: string, roots: string[]): Map<string, DiskFileMeta>;
