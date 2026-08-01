import { getDb } from './db';

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
}

export interface WorkSectionRow extends WorkTocRow {
  body: string;
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
 *  bypass, and it was in this file. Truncation is reported, never silent — see `tocTruncated`. */
export const WORK_TOC_MAX = 5_000;

// sections.id is BIGINT and the driver returns it as a string; the JSON contract is
// a number (safe well past 2^53 for any real corpus).
interface SectionRow {
  id: string | number;
  ordinal: number;
  unit_ordinal: number | null;
  heading: string | null;
}

function toTocRow(r: SectionRow): WorkTocRow {
  return { id: Number(r.id), ordinal: r.ordinal, unitOrdinal: r.unit_ordinal, heading: r.heading };
}

// Resolve slug → surrogate id under the published filter. Both reads key off this;
// null means "not a published work" and maps to a 404 at the route.
async function publishedSourceId(slug: string): Promise<string | number | null> {
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
): Promise<{ source: WorkSource; toc: WorkTocRow[]; tocTruncated: boolean } | null> {
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
  // LIMIT + 1: fetch one past the cap so truncation is DETECTED rather than assumed. A caller
  // that silently receives exactly WORK_TOC_MAX rows cannot tell a complete short work from a
  // clipped long one, and a table of contents that quietly omits chapters is worse than one that
  // says it is partial.
  const rows = (await sql.query(
    `SELECT id, ordinal, unit_ordinal, heading
     FROM sections
     WHERE source_id = $1
     ORDER BY unit_ordinal, ordinal
     LIMIT $2`,
    [found.id, WORK_TOC_MAX + 1],
  )) as SectionRow[];
  const tocTruncated = rows.length > WORK_TOC_MAX;
  return { source, toc: rows.slice(0, WORK_TOC_MAX).map(toTocRow), tocTruncated };
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
  const rows = (await sql.query(
    `SELECT id, ordinal, unit_ordinal, heading, body
     FROM sections
     WHERE source_id = $1 AND ordinal > $2
     ORDER BY ordinal ASC
     LIMIT $3`,
    [sourceId, after, limit],
  )) as (SectionRow & { body: string })[];

  const sections = rows.map((r) => ({ ...toTocRow(r), body: r.body }));
  const last = sections[sections.length - 1];
  return { sections, nextAfter: sections.length === limit && last ? last.ordinal : null };
}
