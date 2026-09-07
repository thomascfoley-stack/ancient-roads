// Types for served-corpus-authors.mjs.
export declare const MUST_NOT_SERVE: string[];
export declare const IN_COPYRIGHT_SUSPECTS: string[];
export declare const MUST_NOT_SERVE_SURNAMES: string[];
export declare const MUST_NOT_SERVE_WORK_EXCEPTIONS: Record<string, number>;
export declare const ADR112_CUTOFF_YEAR: number;
export declare const REVIEWED_SURNAME_CLEARANCES: Record<string, string>;
export declare function isMustNotServe(author: unknown): boolean;
export declare function authorSurnameLooksMustNotServe(author: unknown): boolean;
export declare function isRulingAdmittedWorkSlug(slug: unknown): boolean;
export declare function isServingBanned(author: unknown, work: unknown): boolean;
export interface ServedAuthorOffender {
  author: string;
  entries: number;
  chars: number;
  kind: 'must-not-serve' | 'in-copyright';
  sample: string;
}
export declare function scanServedCorpusAuthors(dir: string): {
  files: number;
  entries: number;
  offenders: ServedAuthorOffender[];
};
