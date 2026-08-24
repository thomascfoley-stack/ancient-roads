// The rule for rewriting a shared chapter file in web/public/commentaries.
//
// D23 (DEEP_SWEEP): THREE writers own web/public/commentaries/{book}/{chapter}.json.
// register-writer.ts:362 preserves foreign entries (`filter(e.work !== slug)`);
// insert-static-author.ts:57 preserves them (`filter(e.author !== author)`); merge-commentaries
// wrote its own `entries` array and nothing else, DELETING everything the other two had put
// there. Not truncation — deletion. The tree is gitignored and untracked; for the scraped
// sources it is the only copy on the machine, and there is no `git checkout` to undo it.
//
// Extracted so the rule is testable without executing the script, whose paths are pinned to
// __dirname and whose body is a top-level main().
export interface MergeableEntry {
  author: string;
  /** Set by register-writer for register-owned entries; absent on merge-commentaries' own output. */
  work?: string;
}

/**
 * What the rewritten file should contain: everything this run produced, plus every existing
 * entry this run does not own.
 *
 * Register-owned entries (carrying `work`) are preserved UNCONDITIONALLY rather than by author
 * name. Author-keying alone works today — register uses 'Gill, John' where the HelloAO API uses
 * 'John Gill', and a full-corpus scan found no entry carrying both a HelloAO author name and a
 * work slug — but that is one normalisation away from silently deleting a register work, and the
 * cost of being wrong is unrecoverable.
 */
export function mergeChapterEntries<T extends MergeableEntry>(existing: readonly T[], incoming: readonly T[]): T[] {
  const mine = new Set(incoming.map((e) => e.author));
  const kept = existing.filter((e) => e.work !== undefined || !mine.has(e.author));
  return [...kept, ...incoming];
}
