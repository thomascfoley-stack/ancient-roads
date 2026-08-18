// The PERSONAL side of the merged search surface (docs/STUDY_DOCS_DESIGN.md §6.4): one scoped,
// capped query per domain — studies, prayers, notes — never one ranking blended with the corpus
// (F5). "Your works" is NOT here: it is served by the existing user-corpus search
// (`keywordSearch`, the same function /api/user-corpus/search?mode=keyword calls), reused from
// the page rather than re-implemented.
//
// Every query runs through runAsUser with the audited H1 belt (explicit user_id on every read),
// soft-deletes excluded, ts_headline snippets where a tsv exists, capped counts, hard LIMITs —
// the search-sections.ts properties, at user-content scale.
//
// ── RECORDED DEVIATION (W5): prayers and notes have NO tsv columns ──────────────────────────
// §6.4 sketches "a generated tsvector + GIN on body … two tiny migrations". Those migrations do
// not exist (prayers is migration 107, notes predates it; neither has a tsv), and the W5 brief
// forbids writing migrations. So prayers/notes search is plain ILIKE with the pattern escaped
// (escapeLike), a hard LIMIT, and a substring-window snippet instead of ts_headline. Ranking is
// recency, not relevance — honest at journal scale (per-user, low-thousands of rows), and the
// swap to tsv later is additive: same function signatures, same page.

import { runAsUser } from './db';
import { escapeLike } from './search-groups';
import { blockRenderState, resolveServability, type ServabilityKeyed } from './servability';

// Bounds mirror search-sections.ts / user-corpus/search.ts (each bound is a documented scar
// there). The count cap means the UI renders "N+" exactly like the corpus groups do.
export const PERSONAL_DEFAULT_LIMIT = 20;
export const PERSONAL_MAX_LIMIT = 100;
export const PERSONAL_MAX_OFFSET = 100_000;
export const PERSONAL_COUNT_CAP = 1000;

const clampLimit = (n: number | undefined) =>
  Math.min(PERSONAL_MAX_LIMIT, Math.max(1, Math.trunc(Number.isFinite(n) ? (n as number) : PERSONAL_DEFAULT_LIMIT)));
const clampOffset = (n: number | undefined) =>
  Math.min(PERSONAL_MAX_OFFSET, Math.max(0, Math.trunc(Number.isFinite(n) ? (n as number) : 0)));

export interface PersonalPage<T> {
  rows: T[];
  /** Matching rows in this domain, capped at PERSONAL_COUNT_CAP. */
  total: number;
  totalCapped: boolean;
}

/** The attribution shape study_blocks stores (studies.ts StudyBlock) — kept on a tombstoned hit. */
export interface StudyAttribution {
  author?: string;
  work_title?: string;
  reference?: string;
}

/**
 * One "Your studies" row. Discriminated on `state`, because the two shapes must not be
 * confusable: a `snippet` hit carries ts_headline HTML (render ONLY through sanitizeSnippet);
 * a `tombstone` hit carries NO text from the corpus at all — attribution only, and the UI adds
 * the shared TOMBSTONE_NOTICE (servability.ts). See the servability re-check inside
 * searchStudies for why the tombstone shape exists on this surface.
 */
export type StudySearchHit =
  | {
      studyId: string;
      title: string;
      state: 'snippet';
      /** ts_headline HTML — render ONLY through sanitizeSnippet. */
      snippet: string;
    }
  | {
      studyId: string;
      title: string;
      state: 'tombstone';
      /** Plain data, never HTML — the tombstone keeps attribution and drops the quote (S-10). */
      attribution: StudyAttribution | null;
    };

/** The ranked-page row searchStudies reads before any snippet text is built (phase 1 below). */
export interface StudyRankedRow {
  studyId: string;
  title: string;
  blockId: string;
  kind: string;
  sectionId: string | null;
  sourceId: string | null;
  /** `b.quote IS NOT NULL` — the null-test is all the render rule needs (see toServabilityKeyed). */
  hasQuote: boolean;
  attribution: StudyAttribution | null;
}

/**
 * Bridge a ranked search row into servability.ts's keyed shape so `/search` runs the SAME
 * resolveServability/blockRenderState pair as the study doc page, feed, and export — never a
 * parallel re-derivation (servability.ts: "reimplementing it per caller is how one of them
 * forgets"; 2026-08-17 pre-deploy audit, domain lens #2: this path was the fourth render
 * surface and the only one that had forgotten).
 *
 * `quote` is a SENTINEL, not the bytes: blockRenderState only ever null-tests quote
 * (isTombstone's data-state leg), so the search page never SELECTs the stored quote out of the
 * ranked page at all. A withdrawn work's text cannot leak from a query that never fetched it.
 * Exported for the unit suite (search-personal-servability.test.ts).
 */
export function toServabilityKeyed(row: StudyRankedRow): ServabilityKeyed {
  return {
    kind: row.kind,
    section_id: row.sectionId,
    source_id: row.sourceId,
    quote: row.hasQuote ? '[bytes withheld — never fetched on the search path]' : null,
    attribution: row.attribution,
  };
}

export interface PrayerSearchHit {
  id: string;
  /** Plain text (ILIKE window), never HTML — render as text. */
  snippet: string;
  createdAt: string;
}

export interface NoteSearchHit {
  id: string;
  verseId: number;
  /** Plain text (ILIKE window), never HTML — render as text. */
  snippet: string;
  updatedAt: string;
}

/**
 * "Your studies" — one row per STUDY (its best-matching block's snippet), not one row per
 * block: the group answers "which of my docs mention this", and three hits in one doc are one
 * answer. The join to `studies` carries the title AND re-asserts the study's own tombstone, so
 * a soft-deleted study's blocks contribute nothing (S-7). The tsv is migration 110's
 * body+quote+attribution vector, so clippings match on what they quote and who said it, not
 * only on the user's own words.
 *
 * ── THE LICENSING RE-CHECK RUNS HERE TOO (2026-08-17 pre-deploy audit, domain lens #2) ───────
 * A clipping's `quote` is snapshotted corpus text, and this function used to feed it into
 * ts_headline gated on nothing but `deleted_at IS NULL` — the exact bypass servability.ts
 * exists to close, on the ONE sibling render path that had forgotten it (doc page, feed, and
 * export all apply it). The rule (servability.ts:135-137): the re-check "outranks the stored
 * bytes; a render path that forgets to purge still shows nothing unlicensed".
 *
 * So the query is now three BOUNDED phases — never per-row (no N+1; resolveServability batches
 * both key legs with `= ANY`):
 *   1. rank + page WITHOUT building any snippet text — the page rows carry corpus keys and a
 *      `quote IS NOT NULL` flag, never the quote bytes;
 *   2. ONE batched resolveServability over the page's blocks (≤ limit rows), decided per row by
 *      the SAME shared blockRenderState the siblings use;
 *   3. ONE `= ANY(uuid[])` ts_headline query for the surviving rows, where `b.quote` enters the
 *      concat ONLY for block ids servability confirmed (the CASE gate). A withdrawn quote's
 *      bytes therefore never reach the headline, the process, or the page.
 * A row whose best block is refused renders as the sibling paths' tombstone — attribution +
 * TOMBSTONE_NOTICE, no quote, no work link (S-10). Why tombstone rather than quietly dropping
 * the quote from the headline: a clipping block has NO body by schema CHECK (110_studies.sql),
 * so a quote-less headline would be attribution fragments with no <mark> — a snippet that
 * misreports the match — where the notice states the truth the siblings already state.
 *
 * FAILS CLOSED at every seam: resolveServability's own error path returns the empty resolution
 * (every keyed clipping tombstones); a block that vanishes between phases gets no headline row
 * and falls back to tombstone; and a phase-3 error rejects, which /search renders as the
 * group-level error, not as text.
 *
 * (Ranking still matches over the stored tsv, which includes withdrawn quote bytes until the
 * Flow D purge runs — same as the doc page holding the bytes in the DB. The belt governs what
 * RENDERS; matching displays nothing.)
 */
export async function searchStudies(
  userId: string,
  query: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<PersonalPage<StudySearchHit>> {
  const q = query.trim();
  if (!q) return { rows: [], total: 0, totalCapped: false };
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);

  // Phase 1 — rank and dedupe on the cheap columns FIRST (the search-sections.ts lesson:
  // headline inside the dedupe paid 17x on the corpus). No ts_headline and no quote bytes
  // here: snippet text is built in phase 3, after servability has spoken.
  const [pageRows, countRows] = await runAsUser(userId, (sql) => [
    sql`WITH ranked AS (
          SELECT DISTINCT ON (b.study_id) b.study_id, b.id AS block_id,
                 ts_rank_cd(b.tsv, websearch_to_tsquery('english', ${q})) AS rank
          FROM study_blocks b
          JOIN studies s ON s.id = b.study_id AND s.deleted_at IS NULL
          WHERE b.user_id = ${userId} AND b.deleted_at IS NULL
            AND b.tsv @@ websearch_to_tsquery('english', ${q})
          ORDER BY b.study_id, ts_rank_cd(b.tsv, websearch_to_tsquery('english', ${q})) DESC, b.id
        ), page AS (
          SELECT study_id, block_id, rank FROM ranked ORDER BY rank DESC, study_id LIMIT ${limit} OFFSET ${offset}
        )
        SELECT p.study_id AS "studyId", st.title,
               b.id::text AS "blockId", b.kind,
               b.section_id::text AS "sectionId", b.source_id AS "sourceId",
               (b.quote IS NOT NULL) AS "hasQuote",
               b.attribution
        FROM page p
        JOIN study_blocks b ON b.id = p.block_id
        JOIN studies st ON st.id = p.study_id
        ORDER BY p.rank DESC, p.study_id`,
    sql`SELECT count(*)::int AS total FROM (
          SELECT DISTINCT b.study_id
          FROM study_blocks b
          JOIN studies s ON s.id = b.study_id AND s.deleted_at IS NULL
          WHERE b.user_id = ${userId} AND b.deleted_at IS NULL
            AND b.tsv @@ websearch_to_tsquery('english', ${q})
          LIMIT ${PERSONAL_COUNT_CAP}
        ) capped`,
  ]);
  const total = (countRows as { total: number }[])[0]?.total ?? 0;
  const ranked = pageRows as unknown as StudyRankedRow[];
  if (ranked.length === 0) return { rows: [], total, totalCapped: total >= PERSONAL_COUNT_CAP };

  // Phase 2 — the shared belt, batched once for the whole page (its two legs are `= ANY`
  // queries by design). Corpus read, so it runs outside runAsUser, exactly as on the doc page.
  const resolution = await resolveServability(ranked.map(toServabilityKeyed));
  const decided = ranked.map((row) => ({
    row,
    state: blockRenderState(toServabilityKeyed(row), resolution),
  }));

  // Phase 3 — build headlines ONLY for rows the rule allows, and let `b.quote` into the
  // concat ONLY for confirmed-servable clippings ('clipping' state; 'text' rows have quote
  // NULL by schema CHECK, and tombstoned rows are not queried at all).
  const headlineIds = decided.filter((d) => d.state !== 'tombstone').map((d) => d.row.blockId);
  const quoteOkIds = decided.filter((d) => d.state === 'clipping').map((d) => d.row.blockId);
  const snippets = new Map<string, string>();
  if (headlineIds.length > 0) {
    const [headlineRows] = await runAsUser(userId, (sql) => [
      sql`SELECT b.id::text AS "blockId",
                 ts_headline('english',
                   concat_ws(' ', b.body,
                     CASE WHEN b.id = ANY(${quoteOkIds}::uuid[]) THEN b.quote END,
                     b.attribution->>'work_title', b.attribution->>'author'),
                   websearch_to_tsquery('english', ${q}),
                   'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>') AS snippet
          FROM study_blocks b
          WHERE b.user_id = ${userId} AND b.deleted_at IS NULL
            AND b.id = ANY(${headlineIds}::uuid[])`,
    ]);
    for (const r of headlineRows as { blockId: string; snippet: string }[]) {
      snippets.set(r.blockId, r.snippet);
    }
  }

  const rows: StudySearchHit[] = decided.map(({ row, state }) => {
    const snippet = snippets.get(row.blockId);
    // `snippet === undefined` for a non-tombstone row means it vanished between phases —
    // fail closed to the tombstone shape rather than render anything unvouched-for.
    if (state === 'tombstone' || snippet === undefined) {
      return { studyId: row.studyId, title: row.title, state: 'tombstone', attribution: row.attribution };
    }
    return { studyId: row.studyId, title: row.title, state: 'snippet', snippet };
  });
  return { rows, total, totalCapped: total >= PERSONAL_COUNT_CAP };
}

/**
 * "Your prayers" (§7.3; the journal keeps its own home — E9 — this is the search-layer
 * unification, not a move). ILIKE fallback: see the header's recorded deviation. Ordered by
 * recency (there is no rank without a tsv); id is the deterministic tiebreak. The snippet is a
 * window around the first literal occurrence, falling back to the head of the body when the
 * escaped pattern's literal isn't found (a pattern metachar the user typed).
 */
export async function searchPrayers(
  userId: string,
  query: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<PersonalPage<PrayerSearchHit>> {
  const q = query.trim();
  if (!q) return { rows: [], total: 0, totalCapped: false };
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  const pattern = `%${escapeLike(q)}%`;

  const [pageRows, countRows] = await runAsUser(userId, (sql) => [
    sql`SELECT id,
               substring(body from greatest(strpos(lower(body), lower(${q})) - 40, 1) for 280) AS snippet,
               created_at AS "createdAt"
        FROM prayers
        WHERE user_id = ${userId} AND deleted_at IS NULL
          AND body ILIKE ${pattern} ESCAPE '\\'
        ORDER BY created_at DESC, id
        LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*)::int AS total FROM (
          SELECT 1 FROM prayers
          WHERE user_id = ${userId} AND deleted_at IS NULL
            AND body ILIKE ${pattern} ESCAPE '\\'
          LIMIT ${PERSONAL_COUNT_CAP}
        ) capped`,
  ]);
  const total = (countRows as { total: number }[])[0]?.total ?? 0;
  return { rows: pageRows as unknown as PrayerSearchHit[], total, totalCapped: total >= PERSONAL_COUNT_CAP };
}

/**
 * "Your notes" (§7.3; notes stay verse-anchored in the reader — E9). Same ILIKE fallback and
 * ordering rationale as prayers; `verseId` is what the row links with (the reader's own
 * verseHref, same as /library/notes).
 */
export async function searchNotes(
  userId: string,
  query: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<PersonalPage<NoteSearchHit>> {
  const q = query.trim();
  if (!q) return { rows: [], total: 0, totalCapped: false };
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  const pattern = `%${escapeLike(q)}%`;

  const [pageRows, countRows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, verse_id AS "verseId",
               substring(body from greatest(strpos(lower(body), lower(${q})) - 40, 1) for 280) AS snippet,
               updated_at AS "updatedAt"
        FROM notes
        WHERE user_id = ${userId} AND deleted_at IS NULL
          AND body ILIKE ${pattern} ESCAPE '\\'
        ORDER BY updated_at DESC, id
        LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*)::int AS total FROM (
          SELECT 1 FROM notes
          WHERE user_id = ${userId} AND deleted_at IS NULL
            AND body ILIKE ${pattern} ESCAPE '\\'
          LIMIT ${PERSONAL_COUNT_CAP}
        ) capped`,
  ]);
  const total = (countRows as { total: number }[])[0]?.total ?? 0;
  return { rows: pageRows as unknown as NoteSearchHit[], total, totalCapped: total >= PERSONAL_COUNT_CAP };
}
