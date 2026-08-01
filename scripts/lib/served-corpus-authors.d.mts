// Types for served-corpus-authors.mjs.
export declare const MUST_NOT_SERVE: string[];
export declare const IN_COPYRIGHT_SUSPECTS: string[];
export declare function isMustNotServe(author: unknown): boolean;
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
