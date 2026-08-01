// Types for front-matter-detector.mjs (Work Order v2 Stage 3.2).
export interface ScannedEntry {
  heading?: string | null;
  body?: string | null;
  author?: string;
  book?: number;
  chapter?: number;
  verseStart?: number;
  verseEnd?: number;
  work?: string | null;
  sourceUrl?: string | null;
  /** free-form location label the runner supplies for the report */
  where?: string;
}

export interface FrontMatterVerdict {
  apparatus: boolean;
  kind: 'apparatus-title' | 'apparatus-heading' | 'roman-numeral-body' | null;
  evidence: string | null;
}

export interface FrontMatterHit extends FrontMatterVerdict {
  apparatus: true;
  admitted: boolean;
  entry: ScannedEntry;
}

export interface FrontMatterScan {
  scanned: number;
  hits: FrontMatterHit[];
  stubs: Array<{ admitted: boolean; entry: ScannedEntry }>;
  admittedHits: FrontMatterHit[];
  byKind: Record<string, number>;
}

export declare function titleLine(entry?: ScannedEntry): string;
export declare function frontMatterVerdict(entry?: ScannedEntry): FrontMatterVerdict;
export declare function isStub(entry?: ScannedEntry): boolean;
export declare function scanEntries(
  entries: Iterable<ScannedEntry>,
  opts?: { served?: (e: ScannedEntry) => boolean },
): FrontMatterScan;
export declare function frontMatterVerdictSummary(scan: FrontMatterScan): {
  stop: boolean;
  reason: string | null;
};
