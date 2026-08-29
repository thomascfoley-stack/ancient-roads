import { getDb } from './db';
import { FORBIDDEN_PROVENANCE_DOMAINS } from './forbidden-provenance.mjs';

// The Book Reader's served reads (docs/LIBRARY_READER_DESIGN.md §2). Corpus reads run
// as the least-privilege app_runtime role (SELECT-only on sources/sections, 006/010) —
// runAsUser is for USER tables, not the public corpus. The `status = 'published'`
// filter is the DB analogue of the client published filter: a staged or quarantined
// work is a 404, never a leak.
//
// Attribution discipline (§8.6): the response is author + work + locus only. These
// queries never select `provenance`, so no host URL can reach a response.

export interface WorkSource {
  slug: string;
  title: string;
  author: string;
  tradition: string;
  era: string;
  license: string;
  source_type: string;
}

export interface WorkTocRow {
  id: number;
  ordinal: number;
  unitOrdinal: number | null;
  heading: string | null;
  /**
   * The section's verse range, when it has one. Carried so the reader can LABEL a
   * verse-anchored section — commentaries have `heading IS NULL` by construction
   * (`migrate-sections-slice.ts` never wrote the column) and were rendering as "Section 109".
   *
   * WHY DERIVED HERE AND NOT STORED. Backfilling `sections.heading` would have been the obvious
   * fix and would have broken three things: migration 024 classifies a section as verse-anchored
   * BY `heading IS NULL`, so filling it regroups every commentary from chapters into 31,000 loose
   * fragments; that regrouping moves `unit_ordinal`, which moves the G10 rollup digest and trips
   * the production ratchet; and `sections.tsv` is generated over `heading || body`, so a backfill
   * silently rewrites the search index for 72,863 rows, which is a retrieval change needing its
   * own accuracy run. The join below is bounded by WORK_TOC_MAX, served by the
   * `section_anchors` primary key, and adds no write path that can drift.
   */
  verseStart: number | null;
  verseEnd: number | null;
}

export interface WorkSectionRow extends WorkTocRow {
  body: string;
}

/**
 * ONE ENTRY IN A TABLE OF CONTENTS — a unit, not a section.
 *
 * A "unit" is what a reader calls the thing: one sermon, one hymn, one dictionary entry, one
 * chapter of commentary. It is usually several `sections`, because ingest chunks long text.
 * Until 2026-08-02 the TOC was a list of SECTIONS and the client grouped them, which made the
 * response scale with chunking rather than with content and put `spurgeon-sermons` (118,371
 * sections, 3,540 sermons) 24x over the cap.
 *
 * The range is carried instead of the member rows. "Which unit am I reading?" is then a range
 * test on the current ordinal, which is what the client actually needed the rows for — and
 * shipping every member ordinal would put the payload straight back where it was.
 */
export interface WorkTocUnit {
  unitOrdinal: number | null;
  /** The unit's first section: what a click on the entry opens. */
  firstId: number;
  firstOrdinal: number;
  /** Inclusive. `firstOrdinal === lastOrdinal` for a single-section unit. */
  lastOrdinal: number;
  sectionCount: number;
  /** The first member's heading, which is the unit's title where one exists. */
  heading: string | null;
  /** The union of the unit's members' verse ranges, for labelling verse-anchored units. */
  verseStart: number | null;
  verseEnd: number | null;
}

/**
 * Find the first unit in a work whose verse anchor range overlaps a target verse id.
 * Returns the unit's firstOrdinal, or null when the work has no anchors overlapping the passage.
 * Used by the desk so a commentary added beside an open Scripture pane opens near the passage.
 */
export async function findWorkOrdinalForVerseId(
  slug: string,
  verseId: number,
): Promise<number | null> {
  const sourceId = await publishedSourceId(slug);
  if (sourceId === null) return null;
  const sql = getDb();
  const rows = (await sql.query(
    `SELECT min(s.ordinal) AS ordinal
       FROM sections s
       JOIN section_anchors a ON a.section_id = s.id
      WHERE s.source_id = $1
        AND a.verse_id_start <= $2
        AND a.verse_id_end >= $2
      LIMIT 1`,
    [sourceId, verseId],
  )) as Array<{ ordinal: number }>;
  return rows[0]?.ordinal ?? null;
}

export interface WorkSectionsPage {
  sections: WorkSectionRow[];
  /** Keyset cursor for the next page: the last returned ordinal, or null when this
   *  page reached the end of the work (a short page). */
  nextAfter: number | null;
}

// NEVER an unbounded response (CLAUDE.md): the Institutes is 3,448 sections and a
// sermon collection is larger; the cap is enforced HERE in the data layer so no
// caller can bypass it. Keyset pagination over UNIQUE(source_id, ordinal) +
// sections_source_idx is an index range scan at any depth.
export const WORK_SECTIONS_DEFAULT_LIMIT = 50;
export const WORK_SECTIONS_MAX_LIMIT = 100;
/** Cap on the table of contents. `getWorkWithToc` had NO LIMIT (2026-08-02 deep audit, H11) —
 *  john-gill is 28,843 rows, returned in one response from an unauthenticated route that is the
 *  reader's FIRST call. The rule this file states four lines above ("NEVER an unbounded response
 *  (CLAUDE.md) ... enforced HERE in the data layer so no caller can bypass it") had exactly one
 *  bypass, and it was in this file. Truncation is reported, never silent — see `tocTruncated`.
 *
 *  RAISED 5,000 -> 10,000 on 2026-08-02, when the query started returning UNITS rather than
 *  sections. 10,000 is the ceiling `api-hardening.test.ts` enforces on this constant, and that
 *  guard is the reason it is not higher: the first attempt set 12,000 and the test refused it,
 *  which is the guard doing its job.
 *
 *  READ THE HEADROOM AS A WARNING, NOT AS COMFORT. bdb-lexicon is 9,770 units, so the largest
 *  work in the corpus clears this by 230. A 9,770-entry table of contents is also not navigable
 *  by a human, so the answer when something exceeds it is NOT to raise the cap again — it is
 *  pagination and search over the TOC. Truncation stays detected (one row is fetched past the
 *  cap) and reported as `tocTruncated`, so the day it bites, it says so. */
export const WORK_TOC_MAX = 10_000;

// sections.id is BIGINT and the driver returns it as a string; the JSON contract is
// a number (safe well past 2^53 for any real corpus).
interface SectionRow {
  id: string | number;
  ordinal: number;
  unit_ordinal: number | null;
  heading: string | null;
  verse_start: number | null;
  verse_end: number | null;
}

interface UnitRow {
  unit_ordinal: number | null;
  first_id: string | number;
  first_ordinal: number;
  last_ordinal: number;
  section_count: number;
  heading: string | null;
  verse_start: number | null;
  verse_end: number | null;
}

function toTocUnit(r: UnitRow): WorkTocUnit {
  return {
    unitOrdinal: r.unit_ordinal === null ? null : Number(r.unit_ordinal),
    firstId: Number(r.first_id),
    firstOrdinal: Number(r.first_ordinal),
    lastOrdinal: Number(r.last_ordinal),
    sectionCount: Number(r.section_count),
    heading: r.heading,
    verseStart: r.verse_start === null ? null : Number(r.verse_start),
    verseEnd: r.verse_end === null ? null : Number(r.verse_end),
  };
}

function toTocRow(r: SectionRow): WorkTocRow {
  return {
    id: Number(r.id),
    ordinal: r.ordinal,
    unitOrdinal: r.unit_ordinal,
    heading: r.heading,
    verseStart: r.verse_start,
    verseEnd: r.verse_end,
  };
}

/**
 * The verse range for a set of sections, as a correlated aggregate.
 *
 * Two scalar sub-selects rather than a JOIN + GROUP BY: a section can carry SEVERAL anchor rows
 * (PK is (section_id, verse_id_start)), so a plain join would multiply the section rows and
 * silently change the LIMIT's meaning — the cap would start counting anchors instead of sections.
 * Both sub-selects are served by the section_anchors primary key.
 */
const VERSE_RANGE_COLS = `,
       (SELECT min(a.verse_id_start) FROM section_anchors a WHERE a.section_id = sections.id) AS verse_start,
       (SELECT max(a.verse_id_end)   FROM section_anchors a WHERE a.section_id = sections.id) AS verse_end`;

// Resolve slug → surrogate id under the published filter. Both reads key off this;
// null means "not a published work" and maps to a 404 at the route.
//
// EXPORTED for the progress write route (api/work/[slug]/progress), so the write path admits
// exactly the works the read paths serve. Duplicating the lookup there would have been the
// cheaper edit and would have given licensing two definitions of "published" to drift between —
// the failure this repo has already logged fifteen times under a different name.
export async function publishedSourceId(slug: string): Promise<string | number | null> {
  const sql = getDb();
  const rows = (await sql.query(`SELECT id FROM sources WHERE slug = $1 AND status = 'published'`, [slug])) as {
    id: string | number;
  }[];
  return rows[0]?.id ?? null;
}

/** Source row + TOC (ids/ordinals/headings only — NEVER bodies) in reading order,
 *  (unit_ordinal, ordinal) per ADR-026. Null when the slug is not a published work. */
export async function getWorkWithToc(
  slug: string,
): Promise<{ source: WorkSource; toc: WorkTocUnit[]; tocTruncated: boolean } | null> {
  const sql = getDb();
  const sources = (await sql.query(
    `SELECT id, slug, title, author, tradition, era, license, source_type
     FROM sources
     WHERE slug = $1 AND status = 'published'`,
    [slug],
  )) as ({ id: string | number } & WorkSource)[];
  const found = sources[0];
  if (!found) return null;

  // Explicit field copy — the response whitelist. `provenance` (which carries host
  // URLs) can never ride along, even if the SELECT above is later widened.
  const source: WorkSource = {
    slug: found.slug,
    title: found.title,
    author: found.author,
    tradition: found.tradition,
    era: found.era,
    license: found.license,
    source_type: found.source_type,
  };
  // ONE ROW PER UNIT, NOT PER SECTION (2026-08-02).
  //
  // This selected one row per SECTION and let the client group them. The cap therefore counted
  // sections, and a table of contents is a list of UNITS — so `spurgeon-sermons`, 118,371 sections
  // in 3,540 sermons, spent its entire 5,000-row budget on the first ~150 sermons and reported
  // itself truncated. Fifteen of the corpus's works exceed the section cap; measured against dev,
  // ALL of them fit comfortably as units (largest: bdb-lexicon at 9,770).
  //
  // The payload is the point. 3,540 unit rows is a couple of hundred KB; 118,371 section rows is
  // not sendable at all, which is why the cap existed. Grouping in SQL removes the reason for the
  // cap rather than raising it and hoping.
  //
  // NULL unit_ordinal MUST STAY UNGROUPED. NULL means "no unit recorded", not "same unit", so
  // `GROUP BY unit_ordinal` would collapse every unclassified section of a work into ONE row —
  // silently, and worst on exactly the works that are missing the column. The two-key GROUP BY
  // below keeps NULL rows one-per-section and cannot collide with a real unit ordinal, because the
  // first key separates the two populations before the second is compared.
  // A JOIN HERE, WHICH `VERSE_RANGE_COLS` ABOVE EXPLICITLY ARGUES AGAINST — so, why it is now
  // right. That comment's objection is exact and was correct: a section can carry several anchor
  // rows, so joining multiplies section rows and "the cap would start counting anchors instead of
  // sections". That reasoning holds only while the LIMIT counts ROWS OF SECTIONS. This query
  // GROUPs to one row per unit before the LIMIT applies, so the multiplication is absorbed by the
  // aggregates and the cap counts units either way.
  //
  // The one thing multiplication would still corrupt is the section count, because `count(*)`
  // would count anchor rows. Hence `count(DISTINCT s.id)`, which is the whole reason the join is
  // safe; without it this silently reports a 31-part sermon as 74 parts wherever sections are
  // multiply anchored.
  //
  // Measured on dev, warm: spurgeon-sermons 1,436ms via the correlated subqueries vs 844ms via
  // the join, with byte-identical output including which units resolve a verse range (the
  // subqueries ran 236,742 times for one table of contents). Verified identical on
  // spurgeon-sermons, bdb-lexicon, adam-clarke and josephus-whiston, which between them cover
  // zero-anchor, fully-anchored and partially-anchored works.
  const rows = (await sql.query(
    `SELECT min(s.unit_ordinal)                         AS unit_ordinal,
            (array_agg(s.id      ORDER BY s.ordinal))[1] AS first_id,
            min(s.ordinal)::int                         AS first_ordinal,
            max(s.ordinal)::int                         AS last_ordinal,
            count(DISTINCT s.id)::int                   AS section_count,
            (array_agg(s.heading ORDER BY s.ordinal))[1] AS heading,
            min(a.verse_id_start)                       AS verse_start,
            max(a.verse_id_end)                         AS verse_end
       FROM sections s LEFT JOIN section_anchors a ON a.section_id = s.id
      WHERE s.source_id = $1
      GROUP BY (s.unit_ordinal IS NULL), coalesce(s.unit_ordinal, s.ordinal)
      ORDER BY min(s.ordinal)
      LIMIT $2`,
    [found.id, WORK_TOC_MAX + 1],
  )) as UnitRow[];
  // LIMIT + 1: fetch one past the cap so truncation is DETECTED rather than assumed. A caller
  // that silently receives exactly WORK_TOC_MAX rows cannot tell a complete short work from a
  // clipped long one, and a table of contents that quietly omits chapters is worse than one that
  // says it is partial.
  const tocTruncated = rows.length > WORK_TOC_MAX;
  return { source, toc: rows.slice(0, WORK_TOC_MAX).map(toTocUnit), tocTruncated };
}

/** One keyset page of section bodies, ordinal-ascending after the cursor. Null when
 *  the slug is not a published work. */
export async function getWorkSectionsPage(
  slug: string,
  opts: { after?: number; limit?: number } = {},
): Promise<WorkSectionsPage | null> {
  const sourceId = await publishedSourceId(slug);
  if (sourceId === null) return null;

  const after = Math.max(0, opts.after ?? 0);
  const limit = Math.min(Math.max(1, opts.limit ?? WORK_SECTIONS_DEFAULT_LIMIT), WORK_SECTIONS_MAX_LIMIT);

  const sql = getDb();
  // THE FORBIDDEN-PROVENANCE BELT, AT SERVE TIME (2026-08-17 deep-audit domain lens, MEDIUM).
  // This query serves section BODIES and was gated only by `publishedSourceId` above — the one
  // body-serving path with no provenance belt while every sibling carries one on every query:
  // search-sections.ts (H6), the clipping INSERT…SELECT in studies.ts, servability.ts's section
  // leg. `status='published'` is a one-shot admission check; this is the second lock, evaluated
  // at serve time, so an admission mistake (a row ingested before a rule existed, or provenance
  // edited in place after publication) cannot outlive the mistake. The domain list is bound from
  // the CANONICAL constant, never re-typed here — the verse-key-scan defect.
  //
  // POSITIVE/COALESCED FORM, DELIBERATELY — the three-valued-logic trap (MASTER watchlist,
  // instance fourteen's corollary): SQL `NOT predicate` over a NULL-evaluating row yields NULL,
  // not TRUE. Written as a bare `NOT (source_url LIKE …)`, every NULL-source_url row silently
  // vanishes from THIS query (clean rows with no recorded host stop serving), and the same trap
  // in a check of the opposite polarity fails OPEN — "a licensing predicate that can evaluate
  // NULL fails open" is the watchlist's standing sentence. So the NULL case is NAMED, never left
  // to the engine: `source_url IS NULL OR NOT EXISTS` admits a row with no recorded host by
  // decision, byte-for-byte the siblings' form. Semantics watched on the live engine 2026-08-17
  // (VALUES probe: shipped form serves {clean, null}, refuses forbidden; bare negation drops the
  // NULL row). Pinned statically by web/test/invariants/work-sections-provenance-static.test.ts.
  //
  // Pagination stays correct with rows filtered: the belt is inside the WHERE, so LIMIT counts
  // CLEAN rows and the keyset cursor (`ordinal > $2` on the last returned row) simply steps past
  // any refused rows on the next page — a filtered row is skipped, never a truncation point.
  const rows = (await sql.query(
    `SELECT id, ordinal, unit_ordinal, heading, body${VERSE_RANGE_COLS}
     FROM sections
     WHERE source_id = $1 AND ordinal > $2
       AND (source_url IS NULL OR NOT EXISTS (
              SELECT 1 FROM unnest($4::text[]) d
              WHERE lower(source_url) LIKE '%' || d || '%'))
     ORDER BY ordinal ASC
     LIMIT $3`,
    [sourceId, after, limit, FORBIDDEN_PROVENANCE_DOMAINS],
  )) as (SectionRow & { body: string })[];

  const sections = rows.map((r) => ({ ...toTocRow(r), body: r.body }));
  const last = sections[sections.length - 1];
  return { sections, nextAfter: sections.length === limit && last ? last.ordinal : null };
}
