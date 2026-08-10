// THE PURE CORE of post-flip reconciliation (cutover order P0.5, 2026-08-03).
//
// After the first intentional serve flip, verify-served-backfill's equality
// check is EXPECTED to diverge — its validity window ends there by design.
// This is the standing instrument that replaces it.
//
// FIRST LIVE RUN TAUGHT IT ONE THING (2026-08-08, prod): "published ⇒ ALL
// work-keyed rows served" is wrong for works carrying FORBIDDEN-provenance
// rows. calvin-crosswire/wesley-crosswire are published and serving their
// clean crosswire slices; their biblehub-provenance remainder MUST STAY
// unserved (the E3 deferred cleanup). Serving it would be the licensing
// violation this instrument exists to catch. So unserved rows on a published
// work are classified by provenance:
//
//   clean-unserved > 0     VIOLATION — a real serving gap (the A3 divergence)
//   only forbidden-unserved E3-DEFERRED LINE — reported, never a violation
//
// Assertions:
//   1. PUBLISHED MEANS SERVED (of what may legally serve) — every published
//      work with work-keyed rows has zero CLEAN-provenance unserved rows.
//   2. NOT-PUBLISHED MEANS UNSERVED — staged/quarantined/ingesting works have
//      zero served rows, and keyed rows with no sources row are a violation
//      only when something actually serves them (served > 0). A 0-served
//      orphan is inert — E3 cleanup inventory, reported on its own line.
//   3. THE WORK-LESS COHORT IS ITS OWN LINE — reported, never folded in.

/** @typedef {{ work: string, rows: number, served: number, unservedClean?: number, unservedForbidden?: number }} WorkServedRow */
/** @typedef {{ slug: string, status: string }} SourceStatusRow */

/**
 * @param {WorkServedRow[]} works   per-work keyed embedding counts (work key NOT NULL)
 * @param {SourceStatusRow[]} sources   every row of sources
 */
export function reconcile(works, sources) {
  const statusBy = new Map(sources.map((s) => [s.slug, s.status]));
  const violations = [];
  const e3Deferred = [];
  const inertOrphans = [];
  const ok = { publishedServed: 0, unpublishedUnserved: 0 };

  for (const w of works) {
    const unserved = w.rows - w.served;
    const status = statusBy.get(w.work);
    if (status === undefined) {
      if (w.served > 0) {
        violations.push({ kind: 'no-sources-row-serving', work: w.work, detail: `${w.served}/${w.rows} served with no sources row to govern it` });
      } else {
        inertOrphans.push({ work: w.work, rows: w.rows });
      }
      continue;
    }
    if (status === 'published') {
      const cleanUnserved = w.unservedClean ?? unserved;
      const forbiddenUnserved = w.unservedForbidden ?? 0;
      if (cleanUnserved > 0) {
        violations.push({ kind: 'published-not-fully-served', work: w.work, detail: `${cleanUnserved} clean-provenance row(s) unserved (${w.served}/${w.rows} served)` });
      } else if (forbiddenUnserved > 0) {
        e3Deferred.push({ work: w.work, rows: forbiddenUnserved });
        ok.publishedServed++;
      } else if (unserved === 0) {
        ok.publishedServed++;
      }
    } else {
      // staged | quarantined | ingesting — nothing may serve.
      if (w.served === 0) ok.unpublishedUnserved++;
      else violations.push({ kind: 'unpublished-serving', work: w.work, status, detail: `${w.served}/${w.rows} served while '${status}'` });
    }
  }

  // Published works with NO work-keyed rows (the legacy author-admitted cohort,
  // or sections-model works) are unreachable by the flip's per-slug write —
  // their own line, never a violation.
  const keyed = new Set(works.map((w) => w.work));
  const publishedWorkless = sources
    .filter((s) => s.status === 'published' && !keyed.has(s.slug))
    .map((s) => s.slug);

  return { violations, e3Deferred, inertOrphans, ok, publishedWorkless };
}
