// Types for publish-flip-census.mjs — the pure verdict logic of the publish-flip preflight.
export type Verdict = 'STOP' | 'WARN' | 'OK';

export declare const STOP: 'STOP';
export declare const WARN: 'WARN';
export declare const OK: 'OK';

export interface CensusSource {
  slug: string;
  status: string;
  register?: string | null;
  source_type?: string | null;
  /** Decided by the RUNNER using the imported serving predicates — never recomputed here. */
  admitted: boolean;
}

export interface AdmissionFinding {
  slug: string;
  status: string;
  register: string;
  admitted: boolean;
  verdict: Verdict;
  note: string;
}

export interface ForbiddenRow {
  slug: string;
  count: number;
  willBePublished: boolean;
}

export interface ForbiddenExposure {
  works: ForbiddenRow[];
  totalRows: number;
  reachableWorks: ForbiddenRow[];
  reachableRows: number;
  verdict: Verdict;
  note: string;
}

export interface VoiceFloor {
  versesMeasured: number;
  versesWithZero: number;
  versesWithOne: number;
  verdict: Verdict;
  note: string;
}

export interface Serving {
  worksByRegister: Record<string, number>;
  entriesByCatalog: Record<string, number>;
  totalWorks: number;
  totalEntries: number;
  verdict: Verdict;
  note: string;
}

export declare function admissionFindings(sources: CensusSource[]): AdmissionFinding[];
export declare function forbiddenExposure(rows: ForbiddenRow[]): ForbiddenExposure;
export declare function voiceFloorFindings(input: {
  versesWithZero: number;
  versesWithOne: number;
  versesMeasured: number;
}): VoiceFloor;
export declare function servingFindings(input: {
  worksByRegister: Record<string, number>;
  entriesByCatalog: Record<string, number>;
}): Serving;
export declare function censusVerdict(input: {
  admission: AdmissionFinding[];
  forbidden: ForbiddenExposure;
  voices: VoiceFloor;
  serving: Serving;
}): { stop: boolean; stops: string[]; warnings: string[]; exitCode: number };
