// THE ARCHIVE MANIFEST MERGE — pure, so it can be driven red without a network.
//
// Split out of `scripts/archive-sources.mts` for the reason `publish-flip-census.mjs` was split
// out of its runner: the runner needs the network, so a rule that only lives inside it can only be
// tested by doing the expensive thing, which means in practice it is written once, never watched
// fail, and then trusted.
//
// THE DEFECT THIS EXISTS TO PREVENT, measured 2026-08-02 rather than imagined. The archiver wrote
// its manifest as `files: <this run's records>`. A full run produced 131 records. The very next
// run, `--fetch --slug=thayers-lexicon`, considered ONE work and wrote ONE record — silently
// discarding 130 checksums and all 26 unrecoverable findings. The provenance for a 272MB archive
// was destroyed by a routine targeted re-fetch, and nothing said so.
//
// `quarantine-served-corpus` already carries a test for precisely this shape ("MERGES into an
// existing quarantine file instead of clobbering it — the case that silently eats the first run's
// entries"). The lesson was already written down here and got reintroduced one tool over, which is
// why it is now a function with its own tests rather than four lines inside a writer.

/**
 * Merge one run's rows into the prior manifest.
 *
 * `inScope` is the set of slugs THIS RUN considered. Rows for slugs outside it are carried
 * forward untouched; rows for slugs inside it are replaced by what the run just measured — so a
 * work that becomes unrecoverable, or a file deliberately dropped, does not linger as a stale
 * claim that the archive still holds it.
 *
 * @param {Array<{slug: string}>} priorRows rows from the manifest on disk (may be undefined)
 * @param {Array<{slug: string}>} freshRows rows this run produced
 * @param {Set<string>} inScope slugs this run considered
 * @param {(row: {slug: string}) => string} keyOf sort key
 */
export function mergeArchiveRows(priorRows, freshRows, inScope, keyOf = (r) => r.slug) {
  const carried = (priorRows ?? []).filter((r) => !inScope.has(r.slug));
  return [...carried, ...freshRows].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/** Sort/identity key for a file row: a work can contribute many artifacts. */
export const fileKey = (r) => `${r.slug}/${r.artifact}`;
