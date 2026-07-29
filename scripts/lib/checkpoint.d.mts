// Types for checkpoint.mjs. The implementation stays .mjs because the cutover
// orchestrator runs under plain `node` with no tsx in the path; the regression gate
// (.mts) imports the same module so parent and child cannot drift.

export interface CheckpointOwner {
  session: string;
  pid: number;
  host: string;
  at: string;
}

export interface CheckpointFile {
  done: string[];
  baseline: Record<string, unknown>;
  target?: string;
  owner?: CheckpointOwner;
  snapshot?: { id: string; name: string; parent: string; at: string };
}

/** This process's session id. Children inherit it via CUTOVER_SESSION_ID. */
export declare const SESSION_ID: string;

/** Prefix on every ownership refusal. */
export declare const OWNERSHIP_ERROR: string;

export declare function loadCheckpoint(file: string): CheckpointFile;

/** Throws (message starts with OWNERSHIP_ERROR) if a foreign LIVE process owns the file. */
export declare function assertCheckpointOwner(file: string): void;

/**
 * Merge with what is on disk, then write atomically (tmp file + rename).
 * Throws (message starts with OWNERSHIP_ERROR) when a foreign LIVE process owns the file.
 */
export declare function saveCheckpoint<T extends CheckpointFile>(file: string, cp: T): T & CheckpointFile;
