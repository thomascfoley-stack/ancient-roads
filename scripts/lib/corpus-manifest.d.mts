// Types for corpus-manifest.mjs — corpus identity and the loss ratchet (Stage 3.1).
export declare const MANIFEST_VERSION: number;

export interface CorpusInventory {
  present: boolean;
  fileCount: number;
  entryCount: number;
  /** chapter-file count per on-disk book directory (1ch, jhn…) */
  books: Record<string, number>;
  /** commentary entry count per author — the granularity the reader exposes */
  works: Record<string, number>;
  corpusHash: string | null;
}

export interface CorpusManifest {
  version: number;
  sha: string | null;
  ts: string;
  corpusHash: string | null;
  fileCount: number;
  entryCount: number;
  bookCount: number;
  workCount: number;
  books: Record<string, number>;
  works: Record<string, number>;
}

export interface CorpusRatchetResult {
  ok: boolean;
  failures: string[];
  missingWorks: string[];
  shrunkWorks: Array<{ work: string; was: number; now: number }>;
  missingBooks: string[];
  shrunkBooks: Array<{ work: string; was: number; now: number }>;
  baselining?: boolean;
}

export declare function buildCorpusInventory(corpusDir: string): CorpusInventory;
export declare function buildCorpusManifest(
  corpusDir: string,
  opts?: { sha?: string | null; ts?: string },
): CorpusManifest;
export declare function evaluateCorpusRatchet(
  current: CorpusInventory | CorpusManifest,
  previous: Partial<CorpusManifest> | null,
  opts?: { deploying?: boolean },
): CorpusRatchetResult;
export declare function loadLatestManifest(
  dir: string,
  readJson: (p: string) => CorpusManifest,
): CorpusManifest | null;
