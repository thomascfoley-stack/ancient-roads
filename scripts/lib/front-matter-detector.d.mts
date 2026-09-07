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
  kind:
    | 'apparatus-title'
    | 'apparatus-heading'
    | 'roman-numeral-body'
    | 'word-index-title'
    | 'publisher-catalogue-title'
    | 'publisher-price-list-body'
    | 'publisher-blurb-body'
    | null;
  strength: 'strong' | 'weak' | null;
  evidence: string | null;
}

export interface ForeignMatterVerdict {
  foreign: boolean;
  kind: 'foreign-work-banner' | 'foreign-work-byline' | null;
  strength: 'strong' | 'weak' | null;
  name: string | null;
  evidence: string | null;
}

export interface MatterFinding {
  index: number;
  ordinal: number | null;
  position: 'head' | 'tail' | 'middle';
  apparatus: true;
  kind: string;
  strength: 'strong' | 'weak' | null;
  evidence: string | null;
  reason?: string;
}

export interface WorkMatterSweep {
  scanned: number;
  findings: MatterFinding[];
  held: boolean;
  byKind: Record<string, number>;
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

export declare const DETECTOR_VERSION: string;
export declare function titleLine(entry?: ScannedEntry): string;
export declare function frontMatterVerdict(entry?: ScannedEntry): FrontMatterVerdict;
export declare function foreignMatterVerdict(
  entry?: ScannedEntry,
  opts?: { author?: string },
): ForeignMatterVerdict;
export declare function sweepWorkMatter(
  sections: Array<ScannedEntry & { ordinal?: number | null }>,
  opts?: { author?: string; head?: number; tail?: number },
): WorkMatterSweep;
export declare function isStub(entry?: ScannedEntry): boolean;
export declare function scanEntries(
  entries: Iterable<ScannedEntry>,
  opts?: { served?: (e: ScannedEntry) => boolean },
): FrontMatterScan;
export declare function frontMatterVerdictSummary(scan: FrontMatterScan): {
  stop: boolean;
  reason: string | null;
};
