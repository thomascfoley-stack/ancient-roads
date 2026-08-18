// The merged search surface (docs/STUDY_DOCS_DESIGN.md §7.3 — R1 + R5, review P-1): one route,
// one box, labelled groups — never one blended ranking (F5). "The topic view" is this page with
// a subject typed in (E5); there is no separate route.
//
// THE CORE RULE (S-12): every group below is ITS OWN capped query, issued per group through the
// existing catalog fence (search-sections.ts' `catalog` option) — or, for lexicons, the pinned
// sibling query in search-lexicons.ts (the fence cannot express that register by design; the
// deviation is documented there). Nothing here fetches one globally-ranked list and groups it
// after the fact: that anti-pattern renders empty groups that LIE about the library, and it is
// red-proofed against in web/test/invariants/search-register-groups.test.ts.
//
// Personal groups (Your studies / works / prayers / notes) render only when they are SIGNED-IN,
// INCLUDED (the E8 checkbox — explicit, default off), and NON-EMPTY (§7.3). Corpus groups always
// render, and an empty one says so — honestly, because its own query returned zero.
//
// All state — query, include-personal, group collapse, per-group paging — lives in the URL
// (search-groups.ts), so back restores by construction and there is no client state at all
// (S-9). A group whose query fails renders an error inside that group; a failed group never
// looks like an empty one, and never takes the other groups down with it.
//
// R0: this page finds and labels. Nothing here implies the app remembers or converses.
//
// LICENSING: the "Your studies" group renders snapshotted corpus quotes, so the servability
// re-check belt (servability.ts, the doc page's rule) runs INSIDE searchStudies — a refused
// block's row arrives as a tombstone hit, never as quote bytes. See search-personal.ts
// (2026-08-17 pre-deploy audit, domain lens #2: this was the fourth render path, and the only
// one that had forgotten the belt).

import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { searchSections } from '@/lib/search-sections';
import { searchLexicons } from '@/lib/search-lexicons';
import { searchNotes, searchPrayers, searchStudies } from '@/lib/search-personal';
import { keywordSearch, type UserHit } from '@/lib/user-corpus/search';
import { uploadDenial } from '@/lib/user-corpus/access';
import {
  buildSearchHref,
  CORPUS_GROUPS,
  GROUP_PAGE_SIZE,
  pagedGroup,
  parseSearchState,
  PERSONAL_GROUPS,
  toggledCollapse,
  type CorpusGroupDef,
  type PersonalGroupDef,
  type RawSearchParams,
  type SearchGroupId,
  type SearchState,
} from '@/lib/search-groups';
import {
  CorpusGroupRows,
  NotesGroupRows,
  PrayersGroupRows,
  SearchGroupEmpty,
  SearchGroupError,
  SearchGroupPager,
  SearchGroupShell,
  StudiesGroupRows,
  WorksGroupRows,
} from '@/components/search-groups';
import type { NoteSearchHit, PrayerSearchHit, StudySearchHit } from '@/lib/search-personal';
import type { SectionSearchResult } from '@/lib/search-sections';

export const metadata = { title: 'Search' };
// Per-user (the personal groups) and never cacheable: a cached search page is the worst cache.
export const dynamic = 'force-dynamic';

type Settled<T> = { ok: true; value: T } | { ok: false };

/** Per-group isolation: one group's failure is reported IN that group and nowhere else. */
async function settle<T>(group: string, p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    // The real error goes to the log; the group renders an honest failure state. A DB error
    // message is internals, not UI copy, so the group gets a generic line (console, not props).
    console.error(`[search] group "${group}" query failed:`, e);
    return { ok: false };
  }
}

interface CorpusGroupData {
  def: CorpusGroupDef;
  result: Settled<{ results: SectionSearchResult[]; total: number; totalCapped: boolean }>;
}

type PersonalRows =
  | { id: 'studies'; rows: StudySearchHit[]; total: number; totalCapped: boolean }
  | { id: 'works'; rows: UserHit[]; hasMore: boolean }
  | { id: 'prayers'; rows: PrayerSearchHit[]; total: number; totalCapped: boolean }
  | { id: 'notes'; rows: NoteSearchHit[]; total: number; totalCapped: boolean };

interface PersonalGroupData {
  def: PersonalGroupDef;
  result: Settled<PersonalRows>;
}

function groupOffset(state: SearchState, id: SearchGroupId): number {
  return state.offsets[id] ?? 0;
}

/** One capped query per corpus group (S-12), all of them in parallel (§6.4: "one capped query
 *  per register group, in parallel"). */
function fetchCorpusGroups(q: string, state: SearchState): Promise<CorpusGroupData[]> {
  return Promise.all(
    CORPUS_GROUPS.map(async (def) => {
      const offset = groupOffset(state, def.id);
      const result = await settle(
        def.id,
        def.via === 'catalog'
          ? searchSections({ query: q, catalog: def.catalog, limit: GROUP_PAGE_SIZE, offset })
          : searchLexicons({ query: q, limit: GROUP_PAGE_SIZE, offset }),
      );
      return { def, result };
    }),
  );
}

/**
 * The personal fan-out. "Your works" reuses the user-corpus search directly — `keywordSearch`
 * is the very function /api/user-corpus/search?mode=keyword serves (the route's fused mode adds
 * one embedding call per request; a merged page issuing it per group view would pay an external
 * API call on every search, so the page rides the keyword mode). The SEC-1 upload gate is
 * honoured the same way the route honours it: a denied account simply has no works group.
 */
function fetchPersonalGroups(q: string, state: SearchState, userId: string): Promise<PersonalGroupData[]> {
  return Promise.all(
    PERSONAL_GROUPS.map(async (def): Promise<PersonalGroupData> => {
      const offset = groupOffset(state, def.id);
      switch (def.id) {
        case 'studies': {
          const r = await settle(def.id, searchStudies(userId, q, { limit: GROUP_PAGE_SIZE, offset }));
          return { def, result: r.ok ? { ok: true, value: { id: 'studies', ...r.value } } : r };
        }
        case 'works': {
          if (uploadDenial(userId) !== null) {
            // Feature not open to this account — the group is absent, not empty, never an error.
            return { def, result: { ok: true, value: { id: 'works', rows: [], hasMore: false } } };
          }
          // The user-corpus search returns hits without a total (recorded gap — see the W5
          // report), so one extra row is fetched as the hasMore probe and never rendered.
          const r = await settle(def.id, keywordSearch(userId, q, { limit: GROUP_PAGE_SIZE + 1, offset }));
          if (!r.ok) return { def, result: r };
          const hasMore = r.value.length > GROUP_PAGE_SIZE;
          return { def, result: { ok: true, value: { id: 'works', rows: r.value.slice(0, GROUP_PAGE_SIZE), hasMore } } };
        }
        case 'prayers': {
          const r = await settle(def.id, searchPrayers(userId, q, { limit: GROUP_PAGE_SIZE, offset }));
          return { def, result: r.ok ? { ok: true, value: { id: 'prayers', ...r.value } } : r };
        }
        case 'notes': {
          const r = await settle(def.id, searchNotes(userId, q, { limit: GROUP_PAGE_SIZE, offset }));
          return { def, result: r.ok ? { ok: true, value: { id: 'notes', ...r.value } } : r };
        }
      }
    }),
  );
}

function personalVisible(v: PersonalRows): boolean {
  // §7.3: personal groups render "signed-in and non-empty". A group paged past its end by a
  // hand-edited URL still renders (its total says it is not empty) so its First-page link
  // remains reachable. The works group has no total, so rows are all it can show.
  if (v.id === 'works') return v.rows.length > 0;
  return v.rows.length > 0 || v.total > 0;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const state = parseSearchState(await searchParams);
  const q = state.q.trim();
  const user = await currentUser();

  const includePersonal = user !== null && state.includePersonal;
  const [corpus, personal] = q
    ? await Promise.all([
        fetchCorpusGroups(q, state),
        includePersonal ? fetchPersonalGroups(q, state, user.id) : Promise.resolve([]),
      ])
    : [[], []];

  const pagerProps = (id: SearchGroupId, shown: number, hasMore: boolean, total?: number, totalCapped?: boolean) => ({
    showMoreHref: hasMore ? buildSearchHref(pagedGroup(state, id, groupOffset(state, id) + GROUP_PAGE_SIZE)) : undefined,
    previousHref: groupOffset(state, id) > 0 ? buildSearchHref(pagedGroup(state, id, 0)) : undefined,
    shown,
    total,
    totalCapped,
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-8">
      <h1 className="mb-6 font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">Search</h1>

      {/* One box (§7.3). A plain GET form: the query IS the URL, so no client code is involved
          in running a search at all. Submitting starts a fresh search — collapse and paging
          belong to the results they were set against and do not carry over.
          E8: the include-personal checkbox is explicit and default-off — the user decides
          whether their own works/writings are in scope for a given search. It rides the same
          form, so checking it and pressing Search is one action; signed out there is nothing to
          include, so the control is absent rather than disabled (and a hint says why). */}
      <form action="/search" method="get" className="mb-8">
        <div className="flex gap-2">
          <input
            /* key remounts the uncontrolled input when the URL's q changes (back/forward, a
               shared link) — defaultValue alone leaves the box showing the previous term while
               the results show the new one. */
            key={state.q}
            type="search"
            name="q"
            inputMode="search"
            defaultValue={state.q}
            placeholder="Search the library…"
            aria-label="Search the library"
            /* text-base (16px) so iOS does not zoom on focus; the global gold :focus-visible ring
               is the focus state (same note as catalog-search.tsx). */
            className="min-h-[44px] flex-1 border edge bg-transparent px-4 text-base text-stone-800 placeholder:text-stone-500 dark:text-stone-100 dark:placeholder:text-stone-400"
          />
          <button
            type="submit"
            className="min-h-[44px] shrink-0 border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
          >
            Search
          </button>
        </div>
        {user ? (
          <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
            <input
              /* same remount rule as the query box: back/forward must restore the checkbox. */
              key={state.includePersonal ? 'on' : 'off'}
              type="checkbox"
              name="personal"
              value="1"
              defaultChecked={state.includePersonal}
              className="h-4 w-4 accent-stone-800 dark:accent-stone-200"
            />
            Include my studies, works, prayers, and notes
          </label>
        ) : (
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            <Link href="/auth/sign-in" className="underline underline-offset-4">Sign in</Link> to
            include your own studies, works, prayers, and notes.
          </p>
        )}
      </form>

      {!q && (
        <p className="max-w-2xl font-serif text-base leading-relaxed text-stone-500 dark:text-stone-400">
          One search across the library — commentaries, sermons, hymns and poetry, theology, and
          lexicons — grouped by register, each group with its own count. Type a subject, a phrase,
          or a name to begin.
        </p>
      )}

      {/* Personal groups first, in the design's order, each signed-in + included + non-empty. */}
      {personal.map(({ def, result }) => {
        if (result.ok && !personalVisible(result.value)) return null;
        const collapsed = state.collapsed.includes(def.id);
        return (
          <SearchGroupShell
            key={def.id}
            label={def.label}
            total={result.ok && result.value.id !== 'works' ? result.value.total : undefined}
            totalCapped={result.ok && result.value.id !== 'works' ? result.value.totalCapped : false}
            collapsed={collapsed}
            toggleHref={buildSearchHref(toggledCollapse(state, def.id))}
          >
            {!result.ok ? (
              <SearchGroupError message="the search did not complete — try again" />
            ) : result.value.rows.length === 0 ? (
              <SearchGroupPager {...pagerProps(def.id, 0, false)} />
            ) : (
              <>
                {result.value.id === 'studies' && <StudiesGroupRows rows={result.value.rows} />}
                {result.value.id === 'works' && <WorksGroupRows rows={result.value.rows} />}
                {result.value.id === 'prayers' && <PrayersGroupRows rows={result.value.rows} />}
                {result.value.id === 'notes' && <NotesGroupRows rows={result.value.rows} />}
                <SearchGroupPager
                  {...pagerProps(
                    def.id,
                    groupOffset(state, def.id) + result.value.rows.length,
                    result.value.id === 'works'
                      ? result.value.hasMore
                      : groupOffset(state, def.id) + result.value.rows.length < result.value.total,
                    result.value.id === 'works' ? undefined : result.value.total,
                    result.value.id === 'works' ? undefined : result.value.totalCapped,
                  )}
                />
              </>
            )}
          </SearchGroupShell>
        );
      })}

      {/* Corpus groups, always rendered, each its own capped query's truth (S-12). */}
      {corpus.map(({ def, result }) => {
        const collapsed = state.collapsed.includes(def.id);
        return (
          <SearchGroupShell
            key={def.id}
            label={def.label}
            total={result.ok ? result.value.total : undefined}
            totalCapped={result.ok ? result.value.totalCapped : false}
            collapsed={collapsed}
            toggleHref={buildSearchHref(toggledCollapse(state, def.id))}
          >
            {!result.ok ? (
              <SearchGroupError message="the search did not complete — try again" />
            ) : result.value.results.length === 0 ? (
              <SearchGroupEmpty label={def.label.toLowerCase()} />
            ) : (
              <>
                <CorpusGroupRows results={result.value.results} />
                <SearchGroupPager
                  {...pagerProps(
                    def.id,
                    groupOffset(state, def.id) + result.value.results.length,
                    groupOffset(state, def.id) + result.value.results.length < result.value.total,
                    result.value.total,
                    result.value.totalCapped,
                  )}
                />
              </>
            )}
          </SearchGroupShell>
        );
      })}
    </div>
  );
}
