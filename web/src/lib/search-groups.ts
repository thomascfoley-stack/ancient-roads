// The merged search surface's GROUP MODEL and URL STATE (docs/STUDY_DOCS_DESIGN.md §7.3 —
// "one route, one box", R1 + R5). Pure module: no db, no next — so the page, the components,
// and the unit tests all drive the same definitions, and a drift between what the URL says and
// what the page renders has exactly one place to live.
//
// THREE properties this module exists to keep true:
//
// 1. GROUP ORDER IS THE DESIGN'S ORDER (§7.3). Your studies, Your works, Your prayers, Your
//    notes — then Commentaries, Sermons, Hymns & Poetry, Theology, Lexicons. Personal first
//    ("my prayers, my notes, my sermons, searchable with the commentaries and lexicons"), the
//    library after, never interleaved and never one blended ranking (F5).
//
// 2. EVERYTHING LIVES IN THE URL (§7.3, Flow B.4). Query, include-personal (E8), group
//    collapse, and per-group paging are all search params, so back/forward restores the exact
//    view BY CONSTRUCTION and no render path depends on client-only state (S-9). A group that
//    is collapsed or paged survives a refresh and a share.
//
// 3. PARSING FAILS CLOSED. Unknown group ids, non-numeric offsets, and out-of-range values are
//    dropped or clamped at the boundary — the same scar search-sections.ts documents for
//    `?offset=1e21` (an unbounded value is a Postgres error, i.e. a 500 from a URL).

import type { CatalogId } from './catalog-defs';

// ── the groups ──────────────────────────────────────────────────────────────────────────────

export type PersonalGroupId = 'studies' | 'works' | 'prayers' | 'notes';
export type CorpusGroupId = 'commentaries' | 'sermons' | 'hymns-poetry' | 'theology' | 'lexicons';
export type SearchGroupId = PersonalGroupId | CorpusGroupId;

export interface PersonalGroupDef {
  id: PersonalGroupId;
  label: string;
}

/**
 * A corpus group is either one catalog of the existing register fence (searched via
 * searchSections' `catalog` option — one capped query per group, S-12) or the lexicon register,
 * which the taxonomy deliberately keeps OUT of every catalog (catalog-defs.ts: "lexicon belongs
 * to Word Study"). The fence cannot express it, so `search-lexicons.ts` pins the same query
 * pattern to source_type 'lexicon' — a sibling of the fence, never a widening of it.
 */
export type CorpusGroupDef =
  | { id: CorpusGroupId; label: string; via: 'catalog'; catalog: CatalogId }
  | { id: CorpusGroupId; label: string; via: 'lexicon-register' };

export const PERSONAL_GROUPS: readonly PersonalGroupDef[] = [
  { id: 'studies', label: 'Your studies' },
  { id: 'works', label: 'Your works' },
  { id: 'prayers', label: 'Your prayers' },
  { id: 'notes', label: 'Your notes' },
];

export const CORPUS_GROUPS: readonly CorpusGroupDef[] = [
  { id: 'commentaries', label: 'Commentaries', via: 'catalog', catalog: 'commentaries' },
  { id: 'sermons', label: 'Sermons', via: 'catalog', catalog: 'sermons' },
  { id: 'hymns-poetry', label: 'Hymns & Poetry', via: 'catalog', catalog: 'hymns-poetry' },
  // The design names the group "Theology"; the catalog it fences to is labelled
  // "Theology & Creeds" on its own shelf. The group's label follows the design.
  { id: 'theology', label: 'Theology', via: 'catalog', catalog: 'theology' },
  { id: 'lexicons', label: 'Lexicons', via: 'lexicon-register' },
];

export const SEARCH_GROUP_IDS: readonly SearchGroupId[] = [
  ...PERSONAL_GROUPS.map((g) => g.id),
  ...CORPUS_GROUPS.map((g) => g.id),
];

export function isSearchGroupId(v: string): v is SearchGroupId {
  return (SEARCH_GROUP_IDS as readonly string[]).includes(v);
}

/** Rows a group shows per page. Small on purpose: nine groups share one screen, and the true
 *  count beside each label is what carries "how much is there" — the list is the sample. */
export const GROUP_PAGE_SIZE = 5;

/** Mirrors MAX_OFFSET in search-sections.ts (why: an unbounded offset is a Postgres error).
 *  Not imported — the engine does not export its bound, and clamping here is the URL boundary's
 *  own job regardless of what the engine does with the value afterwards. */
export const SEARCH_MAX_OFFSET = 100_000;

// ── URL state ───────────────────────────────────────────────────────────────────────────────

export interface SearchState {
  q: string;
  /**
   * The E8 include-personal checkbox. DEFAULT FALSE: the ruling says the user explicitly
   * decides whether their own works/writings are in scope for a given search — an unchecked
   * default is what "explicit" means. Personal groups are also absent entirely when signed out.
   */
  includePersonal: boolean;
  /** Collapsed group ids, in canonical group order (stable URLs). */
  collapsed: readonly SearchGroupId[];
  /** Per-group paging offsets (Flow B.2: "show more" paginates THAT group only). */
  offsets: Readonly<Partial<Record<SearchGroupId, number>>>;
}

export const EMPTY_SEARCH_STATE: SearchState = { q: '', includePersonal: false, collapsed: [], offsets: {} };

/** Next's searchParams shape. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseOffset(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0; // garbage is page one, never a 500
  return Math.min(SEARCH_MAX_OFFSET, Math.max(0, Math.trunc(n)));
}

export function parseSearchState(params: RawSearchParams): SearchState {
  const collapsed = (first(params.collapsed) ?? '')
    .split(',')
    .filter((s): s is SearchGroupId => isSearchGroupId(s))
    // Canonical order keeps the URL stable (and the round-trip property testable).
    .sort((a, b) => SEARCH_GROUP_IDS.indexOf(a) - SEARCH_GROUP_IDS.indexOf(b))
    .filter((id, i, arr) => arr.indexOf(id) === i);

  const offsets: Partial<Record<SearchGroupId, number>> = {};
  for (const id of SEARCH_GROUP_IDS) {
    const parsed = parseOffset(first(params[`off_${id}`]));
    if (parsed !== null) offsets[id] = parsed;
  }

  return {
    q: first(params.q) ?? '',
    includePersonal: first(params.personal) === '1',
    collapsed,
    offsets,
  };
}

/**
 * The inverse of parseSearchState, omitting defaults so URLs stay short (unchecked checkbox,
 * expanded groups, and first pages leave no trace). Round-trips: parse(build(s)) === s for any
 * parsed state — pinned by web/test/search-groups.test.ts.
 */
export function buildSearchHref(state: SearchState): string {
  const p = new URLSearchParams();
  if (state.q !== '') p.set('q', state.q);
  if (state.includePersonal) p.set('personal', '1');
  if (state.collapsed.length > 0) p.set('collapsed', state.collapsed.join(','));
  for (const id of SEARCH_GROUP_IDS) {
    const off = state.offsets[id];
    if (off !== undefined && off > 0) p.set(`off_${id}`, String(off));
  }
  const s = p.toString();
  return s === '' ? '/search' : `/search?${s}`;
}

/** The collapse toggle: flips one group's membership, canonical order preserved. */
export function toggledCollapse(state: SearchState, id: SearchGroupId): SearchState {
  const has = state.collapsed.includes(id);
  const next = has ? state.collapsed.filter((c) => c !== id) : [...state.collapsed, id];
  next.sort((a, b) => SEARCH_GROUP_IDS.indexOf(a) - SEARCH_GROUP_IDS.indexOf(b));
  return { ...state, collapsed: next };
}

/** One group's next/previous page. Paging a group resets nothing else — that is S-12's UI face:
 *  "show more" paginates THAT group only. */
export function pagedGroup(state: SearchState, id: SearchGroupId, offset: number): SearchState {
  return { ...state, offsets: { ...state.offsets, [id]: Math.min(SEARCH_MAX_OFFSET, Math.max(0, offset)) } };
}

// ── small shared text helpers ───────────────────────────────────────────────────────────────

/**
 * Escapes ILIKE's metacharacters so a user's `%`, `_`, or `\` is literal text, not pattern
 * operators. Used by the prayers/notes ILIKE fallback (their tsv columns do not exist yet —
 * see search-personal.ts for the recorded deviation).
 */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** A plain-text excerpt for result rows whose source has no ts_headline (user-corpus hits,
 *  ILIKE snippets): hard-bounded, ellipsis-marked when cut. */
export function excerpt(text: string, max = 280): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}
