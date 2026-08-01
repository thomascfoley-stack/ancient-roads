// THE TWO DECISIONS THE PUBLISH FLIP MAKES ABOUT ROWS, extracted so they can be driven red
// without a database and without the one legally irreversible write this project performs.
//
// WHY THEY LIVE HERE. Both were inline in publish-flip.mjs, inside a transaction, reachable only
// by connecting to a real Postgres and staging a real corpus. The 2026-08-02 audit found a defect
// in each — the delta loop could not see deletions, and the eligibility split silently skipped a
// third status — and both were found by reading, not by any test, because there were no tests: the
// toolchain's 22 red-proof cases were prose in a markdown file that nothing re-runs. A guarantee
// asserted in a commit message and checked by nobody is exactly what this repo's failure-mode
// watchlist calls "a verdict computed separately from the report of that verdict".
//
// Pure in, pure out. No pg, no fs, no env. test/publish-flip-delta.test.ts drives every branch.

/**
 * Split the requested slugs by what the database actually says about them.
 *
 * @param {string[]} slugs           what the flip list asked for
 * @param {Map<string,string>} beforeBy  slug -> status, from the pre-flip snapshot
 * @param {string} from              the status being flipped away from
 * @param {string} to                the status being flipped to
 * @returns {{missing: string[], eligible: string[], already: string[], thirdStatus: string[]}}
 *
 * `thirdStatus` is the one that matters and the one that was missing. A slug that is neither
 * `from` nor `to` is in some OTHER state — `quarantined` (migration 006) or `ingesting` (023).
 * The original code computed `eligible` and then reported "the rest are already <to>" without
 * checking, so a quarantined work was skipped by the UPDATE and reported as already published.
 * Publishing is a legal act; "we thought it was already done" is not a defence.
 */
export function eligibility(slugs, beforeBy, from, to) {
  const missing = [];
  const eligible = [];
  const already = [];
  const thirdStatus = [];
  for (const s of slugs) {
    const st = beforeBy.get(s);
    if (st === undefined) missing.push(s);
    else if (st === from) eligible.push(s);
    else if (st === to) already.push(s);
    else thirdStatus.push(s);
  }
  return { missing, eligible, already, thirdStatus };
}

/**
 * Everything that changed between the snapshot and the re-read, EXCEPT the flip that was named.
 * An empty array is the only acceptable result; anything in it rolls the transaction back.
 *
 * @param {{slug: string, status: string}[]} before
 * @param {{slug: string, status: string}[]} after
 * @param {Iterable<string>} named  the slugs this flip was permitted to move
 * @param {string} from
 * @param {string} to
 * @returns {string[]} human-readable descriptions, stable order (deletions, then changes, then inserts)
 *
 * THE DELETION CASE is why this exists as its own function. The original loop iterated `after`
 * only. A row present in `before` and absent in `after` — deleted by a concurrent session under
 * READ COMMITTED, which is the default and which this transaction never overrides — was invisible
 * to a check whose stated guarantee is "the ONLY rows that changed are the listed slugs". The
 * before-count was logged and never compared.
 */
export function flipDelta(before, after, named, from, to) {
  const namedSet = new Set(named);
  const beforeBy = new Map(before.map((r) => [r.slug, r.status]));
  const afterBy = new Map(after.map((r) => [r.slug, r.status]));
  const unexpected = [];

  for (const r of before) {
    if (!afterBy.has(r.slug)) unexpected.push(`${r.slug}: ${r.status} -> DELETED`);
  }
  for (const r of after) {
    const was = beforeBy.get(r.slug);
    if (was === undefined) {
      // An INSERT. Not a flip, and not something a publish step may do.
      unexpected.push(`${r.slug}: ABSENT -> ${r.status}`);
      continue;
    }
    if (was === r.status) continue;
    if (!namedSet.has(r.slug) || was !== from || r.status !== to) {
      unexpected.push(`${r.slug}: ${was} -> ${r.status}`);
    }
  }
  return unexpected;
}
