import { getDb } from './db';
import { FORBIDDEN_PROVENANCE_DOMAINS } from './forbidden-provenance.mjs';

// Servability re-check + the ONE tombstone render rule (design §2.4/§6.5; build task 1.5).
// Why this module exists: ASK_HISTORY_DESIGN §4.4 and its audit's F-4 — a stored corpus quote
// (a clipping here, a transcript there) is read back as JSONB/text, which bypasses every live
// licensing predicate. The library is not static (2026-08-06: two works quarantined back out,
// 1,484 rows unserved); without a render-time re-check, a work withdrawn for a licensing
// reason keeps serving its text to whoever saved it, forever. Licensing fails closed.
//
// Three properties are load-bearing (S-2, S-3, S-10 pin them):
//
// 1. TWO LEGS, ONE PER KEY UNIVERSE (design §2.3: sections.id and embeddings.source_id share
//    no relation). A study doc's clippings are re-checked in ONE bounded query per leg —
//    `= ANY($1)` over the collected keys, never per-block (no N+1).
//
// 2. POSITIVE-FORM PREDICATES ONLY. Each leg SELECTs what IS servable; everything not returned
//    is tombstoned. Never `NOT unservable` — the watchlist's three-valued-logic trap:
//    `FALSE OR NULL = NULL` makes a negated predicate silently skip NULL-evaluating rows, and
//    a licensing predicate that can evaluate NULL fails OPEN.
//
// 3. FAILS CLOSED. Any error resolving servability returns the empty resolution — every
//    keyed clipping renders as a tombstone, and no unlicensed text is displayed because the
//    check path broke. (S-3's seeded-throw case.)
//
// The render rule is exported from HERE and shared by every surface (study page, export, the
// future history surface) — reimplementing it per caller is how one of them forgets.
//
// CORPUS READS, NOT USER READS: this module queries only `sections`/`sources`/`embeddings`
// (public corpus; SELECT-granted to app_runtime; no user rows), so it uses getDb() directly —
// the same shape as search-sections.ts. The studies tables never appear here; their queries
// live in studies.ts behind runAsUser.

export interface ServabilityResolution {
  /** sections.id values (as strings — BIGINT) currently servable. */
  servableSectionIds: ReadonlySet<string>;
  /** embeddings.source_id values with at least one served, provenance-clean corpus row. */
  servableSourceIds: ReadonlySet<string>;
  /** True when a leg errored and the empty result is the fail-closed answer, not a measurement. */
  failedClosed: boolean;
}

/** The block fields the re-check and render rule need — a structural subset of StudyBlock. */
export interface ServabilityKeyed {
  kind: string;
  section_id: string | number | null;
  source_id: string | null;
  quote: string | null;
  attribution: unknown;
}

const EMPTY: ServabilityResolution = {
  servableSectionIds: new Set(),
  servableSourceIds: new Set(),
  failedClosed: true,
};

/**
 * Re-check current servability for a document's clippings — one bounded query per key leg.
 * Blocks with no keyed clipping short-circuit to an empty (non-failed) resolution: zero
 * queries for a text-only study.
 */
export async function resolveServability(blocks: readonly ServabilityKeyed[]): Promise<ServabilityResolution> {
  const sectionIds = [
    ...new Set(
      blocks
        .filter((b) => b.kind === 'clipping' && b.section_id !== null)
        .map((b) => String(b.section_id)),
    ),
  ];
  const sourceIds = [
    ...new Set(
      blocks.flatMap((b) => (b.kind === 'clipping' && b.source_id !== null ? [b.source_id] : [])),
    ),
  ];
  if (sectionIds.length === 0 && sourceIds.length === 0) {
    return { servableSectionIds: new Set(), servableSourceIds: new Set(), failedClosed: false };
  }

  try {
    const sql = getDb();
    // Section leg: the reader-surface serving predicate — published, provenance-clean
    // (search-sections.ts H6). Positive form: returns the servable ids.
    const sectionLeg =
      sectionIds.length > 0
        ? sql`SELECT s.id::text AS id
              FROM sections s JOIN sources src ON src.id = s.source_id
              WHERE s.id = ANY(${sectionIds}::bigint[])
                AND src.status = 'published'
                AND (s.source_url IS NULL OR NOT EXISTS (
                       SELECT 1 FROM unnest(${FORBIDDEN_PROVENANCE_DOMAINS}::text[]) d
                       WHERE lower(s.source_url) LIKE '%' || d || '%'))`
        : null;
    // Source leg: the ask-surface serving predicate — corpus row, served (044/045), provenance
    // belt. `source_type` derives from the key's own prefix so the lookup rides the
    // (source_type, source_id, chunk_index) index — measured 2026-08-12: 0/570,350 corpus rows
    // violate the equality, and a violating row fails to match (closed), never serves.
    const sourceLeg =
      sourceIds.length > 0
        ? sql`SELECT DISTINCT e.source_id
              FROM embeddings e
              WHERE (e.source_type, e.source_id) IN
                      (SELECT split_part(u, ':', 1), u FROM unnest(${sourceIds}::text[]) u)
                AND e.user_id IS NULL AND e.served
                AND (e.metadata->>'sourceUrl' IS NULL OR NOT EXISTS (
                       SELECT 1 FROM unnest(${FORBIDDEN_PROVENANCE_DOMAINS}::text[]) d
                       WHERE lower(e.metadata->>'sourceUrl') LIKE '%' || d || '%'))`
        : null;
    const [sectionRows, sourceRows] = await Promise.all([
      sectionLeg ?? Promise.resolve([]),
      sourceLeg ?? Promise.resolve([]),
    ]);
    return {
      servableSectionIds: new Set((sectionRows as { id: string }[]).map((r) => r.id)),
      servableSourceIds: new Set((sourceRows as { source_id: string }[]).map((r) => r.source_id)),
      failedClosed: false,
    };
  } catch (e) {
    // Fail closed: the caller renders tombstones, never text the check could not vouch for.
    console.error('servability re-check failed (rendering tombstones):', (e as Error).message);
    return EMPTY;
  }
}

export type BlockRenderState = 'text' | 'clipping' | 'tombstone';

/** Data-state test alone (review S-K): purged quote, attribution kept. */
export function isTombstone(block: ServabilityKeyed): boolean {
  return block.kind === 'clipping' && block.quote === null && block.attribution !== null;
}

/**
 * THE render rule — both legs of Flow D, in order:
 *  - data state: `quote IS NULL` + attribution → tombstone (the purge already ran);
 *  - belt: quote present but no key confirmed servable → tombstone anyway (the re-check
 *    outranks the stored bytes; a render path that forgets to purge still shows nothing
 *    unlicensed).
 * A tombstone renders attribution + "no longer available in the library" — no quote, no link
 * (S-10).
 */
export function blockRenderState(block: ServabilityKeyed, resolution: ServabilityResolution): BlockRenderState {
  if (block.kind !== 'clipping') return 'text';
  if (isTombstone(block)) return 'tombstone';
  const sectionOk = block.section_id !== null && resolution.servableSectionIds.has(String(block.section_id));
  const sourceOk = block.source_id !== null && resolution.servableSourceIds.has(block.source_id);
  return sectionOk || sourceOk ? 'clipping' : 'tombstone';
}

/** The one user-facing tombstone notice, so no surface re-words it. */
export const TOMBSTONE_NOTICE = 'no longer available in the library';
