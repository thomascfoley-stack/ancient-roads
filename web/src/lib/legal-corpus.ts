// Legal corpus boundary — the published-author allowlist shared across read paths.
// Mirrors LEGAL_CORPUS_FILTER in teacher/routing.ts (embeddings metadata JSON).
// Permanent fix at GA: sources.status='published' column (docs/MIGRATION_DESIGN.md).

import { SERVED_PROSE_WORKS, SERVED_SONG_VERSE_WORKS, SERVED_LANE_WORKS } from './teacher/routing';
// The ONE canonical forbidden-aggregator list (ADR-008). Imported, never re-typed — a second copy
// on the legal rail is this repo's most-repeated defect (H8: web/test/helpers/verse-key-scan.ts
// carried a two-domain regex where the canonical list has three). search-sections.ts imports the
// same module by the same path.
import { FORBIDDEN_PROVENANCE_DOMAINS } from './forbidden-provenance.mjs';

export { LEGAL_CORPUS_FILTER } from './teacher/routing';

/** Authors that must never be returned from any served read path (quarantined / copyrighted). */
export const MUST_NOT_SERVE_AUTHORS = [
  'Tyndale Study Notes',
  'Tyndale Open Study Notes',
  'Theophylact',
  'Bonaventure',
  'Oecumenius',
  'Origen',
  'Origen of Alexandria', // the register ingest's author string — same ruling (A6 2026-07-17)
  'Aquinas-Larcher',
  // Owner ruling 2026-08-18 (§17.10): the four modern copyrighted authors in commentary_entries.
  // Measured there: CS Lewis 1,102 + 70 under a suffixed variant, GK Chesterton 714,
  // Douglas Wilson 16, JRR Tolkien 11. None was served — they were excluded only by absence from
  // the published allowlist, which is the weak mechanism this list exists to replace.
  'CS Lewis',
  'GK Chesterton',
  'Douglas Wilson',
  'JRR Tolkien',
  // Owner ruling 2026-08-18: the Origen veto extends to the pseudonymous attribution.
  // NARROW ON PURPOSE, and the narrowness is the ruling. `commentary_entries` carries TWENTY-THREE
  // `Pseudo-` author strings (Pseudo-Chrysostom 370, Pseudo-Jerome 198, Pseudo-Clement 173,
  // Pseudo-Augustine 29, Pseudo-Athanasius 28, … ~660 rows in total). `Pseudo-X` is the scholarly
  // convention for "wrongly attributed to X" — the text is by someone ELSE, usually anonymous and
  // ancient. So a blanket `Pseudo-%` rule would veto twenty-two authors on the strength of a name
  // that is not theirs and against whom no ruling exists. Only Origen's is listed, because only
  // Origen has the standing ruling (A6 2026-07-17).
  'Pseudo-Origen',
] as const;

export type MustNotServeAuthor = (typeof MUST_NOT_SERVE_AUTHORS)[number];

export function isMustNotServeAuthor(author: string): boolean {
  // exact list hit, a normalized first-token hit ("Origen of Alexandria" ~ 'Origen'),
  // or the Jerome's-translation bucket. Normalization guards against the next
  // author-string spelling variant silently bypassing an editorial ruling.
  if ((MUST_NOT_SERVE_AUTHORS as readonly string[]).includes(author)) return true;
  const first = author.split(/\s+(of|the)\s+/i)[0]!.trim();
  if (first !== author && (MUST_NOT_SERVE_AUTHORS as readonly string[]).includes(first)) return true;
  // NAME-PREFIX. A vetoed name followed by a space and anything else is the same author wearing an
  // annotation. Found by measurement, not imagined: commentary_entries carries
  // `CS Lewis  (via the character Screwtape, a devil)` — 70 rows, note the DOUBLE space — which the
  // exact-name rule misses, and which the first-token rule ALSO misses because splitting it on
  // ' the ' yields `CS Lewis  (via`. Anchored to a space boundary so it cannot over-reach onto a
  // genuinely different author whose name merely starts the same way.
  if ((MUST_NOT_SERVE_AUTHORS as readonly string[]).some((n) => author.startsWith(`${n} `))) return true;
  return author.startsWith("Jerome's"); // Jeremiah/Lamentations modern translation bucket
}

// The published (PD, servable) commentators, in the naming used by commentary_entries
// AND the static reader files (both use "Barnes' Notes", not the embeddings table's
// 'Albert Barnes'). Whole-Bible PD works served for every book:
export const PUBLISHED_WHOLE_BIBLE_AUTHORS = [
  'John Gill',
  'Jamieson, Fausset & Brown',
  'Adam Clarke',
  'Matthew Henry',
  "Barnes' Notes",
  'Albert Barnes', // SAME author as "Barnes' Notes" — the embeddings table names him this way; both are published (matches 0 rows in commentary_entries, which is harmless)
  'John Wesley',
  'John Calvin',
] as const;
// Published only for specific books (a verified PD edition exists there):
const PUBLISHED_BOOK_SCOPED: Record<string, number[]> = {
  'John Chrysostom': [40, 43, 44],
  'Augustine of Hippo': [19, 43],
};

// ⚠ HISTORY, AND THE CORRECTION (deep audit 2026-08-02, H4 + H5).
//
// This predicate was HAND-COPIED from the embeddings-table convention (LEGAL_CORPUS_FILTER:
// 'Albert Barnes' + sourceUrl ILIKE '%crosswire%') into commentary_entries, where the same
// authors are named "Barnes' Notes" and were sourced from biblehub — so the crosswire leg matched
// ZERO rows and search served 6 of 9 authors, not 9. The repair rebuilt the predicate "with no URL
// condition", which fixed the count and DELETED THE ONLY PROVENANCE TEST ON THIS SURFACE. The
// note that stood here said the biblehub sources were "flagged for owner review … these authors
// are all pre-1929 PD", which answers a COPYRIGHT question that was never the objection: ADR-008
// forbids reusing an aggregator's COMPILATION regardless of the text's status.
//
// Measured on production 2026-08-01 (docs/evidence/serving-provenance-census-2026-08-01.log):
// of 114,834 entries this predicate admitted, 50,618 came from a forbidden aggregator —
// Barnes' Notes 21,036 · John Wesley 18,181 · John Calvin 6,163 from biblehub.com, and
// John Chrysostom 2,947 · Augustine of Hippo 2,291 from historicalchristian.faith.
//
// H4 is the same defect from the other side. A3 excluded `barnes-notes` and A4 left it `staged`,
// but `sources.status` binds only the sections path; this predicate is the ONLY gate on
// searchCommentaries, which queries commentary_entries and never joins sources. The census shows
// `sources.barnes-notes` = staged with provenance `https://biblehub.com/commentaries/barnes/`,
// while 21,036 rows under "Barnes' Notes" served from that same aggregator. One work, two
// boundaries, opposite answers.
//
// THE FIX IS NOT THE OLD CROSSWIRE LEG. That was an ALLOWLIST on three author names, and it is
// why the drift happened: an allowlist keyed to author strings breaks the moment a table spells
// an author differently. This is a DENYLIST on provenance, derived from the one canonical domain
// list, so it cannot drift from it and it needs no author names at all. It is also why the
// Chrysostom/Augustine rows are caught — the crosswire leg never covered them, and they were
// ingested before historicalchristian.faith joined the list on 2026-07-10 (H6's "a row ingested
// before a rule existed serves forever", now closed on this surface too).
//
// SUBSTRING, NOT HOST. `forbiddenProvenanceDomain()` parses the host so `notbiblehub.com` cannot
// masquerade as `biblehub.com`; this is a naive ILIKE, so it OVER-matches in the exclusion
// direction. That is deliberate: over-matching here refuses a row, which fails closed. A partial
// index predicate may not contain a subquery or a function call over another relation, so the
// host-parsing form cannot be expressed in the index twin at all, and the query and index
// predicates must be byte-identical (fts-legal-index-sync). Same shape as search-sections.ts.
//
// STILL OPEN, DELIBERATELY: `LEGAL_CORPUS_FILTER` (teacher/routing.ts:120-124) — the /ask
// embeddings pool — still admits 'John Chrysostom' and 'Augustine of Hippo' BY NAME with no
// provenance test, and those are the same historicalchristian.faith rows. It keeps its crosswire
// leg, so Barnes/Wesley/Calvin are already correct there. It is not changed here because it has a
// partial HNSW index twin (migration 012) and changing what the /ask pool retrieves is an
// accuracy change, which CLAUDE.md gates on re-running the held-out eval and recording it in
// WORKLOG.md. Fixing it inside a licensing tranche would ship an unmeasured retrieval change.
const sqlList = (xs: readonly string[]) => xs.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
/** `source_url NOT ILIKE '%d%'` for every canonical forbidden domain. One list, no second copy. */
const NOT_FORBIDDEN_PROVENANCE = FORBIDDEN_PROVENANCE_DOMAINS.map(
  (d) => `source_url NOT ILIKE '%${d}%'`,
).join(' AND ');
// ALL served works across surfaces: exegetical prose + song/verse + the sermon/
// theology lanes. Drives PUBLISHED_WORKS (the READER shows every served work) and
// the FTS row-gate. The exegetical FTS SEARCH then removes hymn/poetry + lane
// works via EXEGETICAL_FTS_EXCLUSION, so those surface only in their own lane.
const REGISTER_SERVED_SLUGS: readonly string[] = [...SERVED_PROSE_WORKS, ...SERVED_SONG_VERSE_WORKS, ...SERVED_LANE_WORKS];
// The register go-live adds `work IN (published slugs)` — migration 019 adds the
// column + rebuilds idx_commentary_fts_legal in lockstep (fts-legal-index-sync).
/**
 * The MUST_NOT_SERVE veto, as SQL. Mirrors `isMustNotServeAuthor` rule for rule:
 *   1. an exact hit on the list,
 *   2. a first-token hit, so "Origen of Alexandria" is caught by 'Origen' even if the register
 *      ingest invents another spelling variant,
 *   3. the "Jerome's …" modern-translation bucket.
 *
 * WHY IT EXISTS SEPARATELY FROM THE ALLOWLIST, which already excludes every one of these authors
 * today. The allowlist excludes them by NOT NAMING them, and `routing.ts` argues in its own
 * comments that "unnamed" is strictly weaker than "unreachable". `commentary_entries` has no
 * `served` column and its `work` column is entirely NULL, so the two mechanisms that make the
 * vector surface unreachable are both inert here — the FTS surface had only the allowlist. Three
 * ordinary edits would have undone it: the A048 backfill filling `work`, adding an author to
 * PUBLISHED_WHOLE_BIBLE_AUTHORS who also appears on copyrighted rows, or a new OR leg written
 * without this in mind. ANDed, the veto survives all three (2026-08-18 diagnosis §17.10).
 *
 * BEHAVIOUR-PRESERVING TODAY, and `must-not-serve-veto-on-fts.test.ts` asserts the condition that
 * makes it so: no vetoed author is on the allowlist, so this subtracts only rows already refused.
 * The day that assertion fails, the veto has started doing real work and it stops being a
 * licensing belt and becomes a retrieval change — which is precisely when a human should look.
 */
/**
 * The MUST_NOT_SERVE veto as SQL, over any author column.
 *
 * PARAMETERISED 2026-08-18 because the veto was reaching ONE surface. It was ANDed into
 * `LEGAL_COMMENTARY_ENTRIES_PREDICATE` (the `commentary_entries` FTS search) and nowhere else, so
 * `servability.ts` and `studies.ts` — the two paths that decide whether a STORED study clipping
 * keeps rendering, and whether a new one may be created — gated on `status='published'` and
 * provenance only. A clipping of a vetoed author kept rendering in a study, its feed and its
 * export (pre-deploy audit 2026-08-18, H7).
 *
 * THE DEFAULT COLUMN MUST STAY `author` AND THE TEXT MUST NOT MOVE. This exact string is the
 * predicate of the partial index `idx_commentary_fts_legal`, live on production via migrations
 * 117/118. Change the rendering — even the whitespace — and the query stops implying the index
 * predicate, the planner drops the index, and commentary search silently seq-scans. That is not a
 * theory: it is the live state this repo is in today, and `fts-legal-index-sync.test.ts` is the
 * guard. Callers on other tables pass their own qualified column; the `author` rendering is
 * byte-identical to what it was before this was made a function.
 */
export function mustNotServeVetoSql(col = 'author'): string {
  return `NOT (
     ${col} IN (${sqlList(MUST_NOT_SERVE_AUTHORS)})
     OR split_part(${col}, ' of ', 1) IN (${sqlList(MUST_NOT_SERVE_AUTHORS)})
     OR split_part(${col}, ' the ', 1) IN (${sqlList(MUST_NOT_SERVE_AUTHORS)})
     OR ${MUST_NOT_SERVE_AUTHORS.map((n) => `${col} LIKE '${n.replace(/'/g, "''")} %'`).join('\n     OR ')}
     OR ${col} LIKE 'Jerome''s%'
   )`;
}

const MUST_NOT_SERVE_VETO = mustNotServeVetoSql();

export const LEGAL_COMMENTARY_ENTRIES_PREDICATE = `((author IN (${sqlList(PUBLISHED_WHOLE_BIBLE_AUTHORS)})
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43))
   OR work IN (${sqlList(REGISTER_SERVED_SLUGS)}))
  AND (source_url IS NULL OR (${NOT_FORBIDDEN_PROVENANCE}))
  AND ${MUST_NOT_SERVE_VETO})`;

// Register go-live (CONTENT_GO_LIVE.md decisions 2/3, 2026-07-16): static-corpus
// entries from the auto-published clean tier carry a `work` slug; membership here
// is the reader-side publish switch (mirrors SERVED_*_WORKS in teacher/routing.ts
// — now DERIVED from those constants; one edit updates every surface). Deliberately absent: origen-commentary
// (MUST_NOT_SERVE conflict, escalated), thayers-lexicon (served by nothing — D4
// lexicon call, staged past its fixed OCR defect), the two unpublished historians.
// poole-tcp/scofield-crosswire/pnt-crosswire/barnes-crosswire-nt are PRESENT as of
// 2026-08-13: the parked owner call was ruled (corpus-backlog decision 5) and the
// named-edition re-ingests landed; whitefield-works and donne/herrick are in via
// SERVED_LANE_WORKS / SERVED_SONG_VERSE_WORKS the same day.
export const PUBLISHED_WORKS = new Set<string>(REGISTER_SERVED_SLUGS);

/** In-memory per-entry check for static JSON entries (reader). Book-aware;
 *  register-aware via the entry's `work` slug. */
export function isPublishedCommentaryEntry(entry: {
  author: string;
  sourceUrl?: string | null;
  book?: number;
  work?: string | null;
}): boolean {
  const { author } = entry;
  // MUST_NOT_SERVE is an absolute veto — the work-slug branch was author-blind,
  // so a banned author (e.g. an Origen excerpt) inside an otherwise-published
  // work slug would serve (A6 line-by-line 2026-07-17). Check the ruling first.
  if (isMustNotServeAuthor(author)) return false;
  if (entry.work && PUBLISHED_WORKS.has(entry.work)) return true;
  if ((PUBLISHED_WHOLE_BIBLE_AUTHORS as readonly string[]).includes(author)) return true;
  const books = PUBLISHED_BOOK_SCOPED[author];
  return books ? books.includes(entry.book ?? 0) : false;
}

/** Author-level check for the library facet / manifest: is this author published in
 *  ANY book? (The per-book restriction is enforced at entry level by the reader.) */
export function isPublishedAuthor(author: string): boolean {
  if (isMustNotServeAuthor(author)) return false;
  return (PUBLISHED_WHOLE_BIBLE_AUTHORS as readonly string[]).includes(author)
    || Object.prototype.hasOwnProperty.call(PUBLISHED_BOOK_SCOPED, author);
}
