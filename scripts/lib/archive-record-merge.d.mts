// Types for archive-record-merge.mjs. The module is plain .mjs, matching
// forbidden-provenance.mjs / source-artifact-urls.mjs, so every runtime here can import it
// (tsx scripts, vitest, plain node); the declarations ride alongside.

/**
 * Merge one run's rows into the prior manifest.
 *
 * Rows whose slug is NOT in `inScope` are carried forward untouched. Rows whose slug IS in scope
 * are replaced wholesale by `freshRows`, so a work re-archived with fewer artifacts does not leave
 * stale claims behind. Result is sorted by `keyOf` (default: the slug) so the committed manifest
 * has stable diffs.
 */
export function mergeArchiveRows<T extends { slug: string }>(
  priorRows: T[] | undefined,
  freshRows: T[],
  inScope: Set<string>,
  keyOf?: (row: T) => string,
): T[];

/** Sort/identity key for a file row: one work can contribute many artifacts. */
export function fileKey(row: { slug: string; artifact: string }): string;
