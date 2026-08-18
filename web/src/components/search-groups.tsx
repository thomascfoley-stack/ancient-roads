// Group components for the merged search surface (docs/STUDY_DOCS_DESIGN.md §7.3). SERVER
// components — every control is a plain link or form against URL state (search-groups.ts), so
// there is no client fetch plumbing, no client state to restore, and back/forward rebuilds the
// exact view by construction (Flow B.4, S-9).
//
// Honesty rules these components exist to keep, in UI form:
//   - A group's count is its OWN query's count (S-12) — passed in, never derived from the rows
//     shown. An empty corpus group says "No matches" only because its own query returned zero.
//   - A group whose query FAILED renders an error, never an empty state (the catalog-search
//     lesson: a rejected request must not look like an empty one).
//   - Every corpus row carries its register label from the ROW's own sourceType (S-5) — the
//     register wall is presentational law. Personal rows need no register label: group
//     membership says whose they are (§7.3).

import Link from 'next/link';
import { count } from '@/lib/plural';
import { sanitizeSnippet } from '@/lib/snippet';
import { excerpt } from '@/lib/search-groups';
import type { SectionSearchResult } from '@/lib/search-sections';
import type { NoteSearchHit, PrayerSearchHit, StudyAttribution, StudySearchHit } from '@/lib/search-personal';
import { TOMBSTONE_NOTICE } from '@/lib/servability';
import type { UserHit } from '@/lib/user-corpus/search';
import { verseHref } from '@/lib/verse-link';
import { formatVerseId } from '@bible/verse-id';
import { DISPLAY_LOCALE } from '@/lib/locale';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

export interface GroupShellProps {
  label: string;
  /** True count from the group's own capped query; undefined when the source gives no total
   *  (user-corpus search returns hits only — see the page's recorded gap). */
  total?: number;
  totalCapped?: boolean;
  collapsed: boolean;
  /** URL with this group's collapse flipped (search-groups.ts toggledCollapse). */
  toggleHref: string;
  children?: React.ReactNode;
}

/** One group's header + body. The collapse toggle is a LINK (URL state), not a button with
 *  client state — the group's open/closed survives back, refresh, and share. */
export function SearchGroupShell({ label, total, totalCapped, collapsed, toggleHref, children }: GroupShellProps) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-3">
        <Link
          href={toggleHref}
          aria-expanded={!collapsed}
          className="group flex min-h-[44px] flex-1 items-baseline gap-3 py-1"
        >
          <span aria-hidden className={`inline-block text-micro text-stone-400 transition-transform ease-gentle dark:text-stone-500 ${collapsed ? '' : 'rotate-90'}`}>
            ▶
          </span>
          <h2 className="text-micro font-semibold uppercase tracking-wider text-stone-500 group-hover:text-stone-700 dark:text-stone-400 dark:group-hover:text-stone-200">
            {label}
          </h2>
          {total !== undefined && (
            <span className="shrink-0 text-micro tabular-nums text-stone-400 dark:text-stone-500">
              {count(total, 'match', 'matches')}
              {totalCapped ? '+' : ''}
            </span>
          )}
        </Link>
      </div>
      {!collapsed && children}
    </section>
  );
}

/** The group-level error state: the query failed, and the UI says so — never a false "No
 *  matches" for a group whose query never answered. */
export function SearchGroupError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-red-300/60 bg-red-50/60 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
      This search failed: {message}
    </p>
  );
}

/** Honest empty for a corpus group: its own query returned zero (S-12), and it says so. */
export function SearchGroupEmpty({ label }: { label: string }) {
  return <p className="py-2 text-sm text-stone-500 dark:text-stone-400">No matches in {label}.</p>;
}

export function SearchGroupPager({
  showMoreHref,
  previousHref,
  shown,
  total,
  totalCapped,
}: {
  /** URL with this group's offset advanced one page (undefined when nothing follows). */
  showMoreHref?: string;
  /** URL back to this group's first page (present whenever the group is paged in). */
  previousHref?: string;
  shown: number;
  total?: number;
  totalCapped?: boolean;
}) {
  return (
    <div className="mt-3 flex items-center gap-4">
      {showMoreHref && (
        <Link
          href={showMoreHref}
          className="inline-flex min-h-[44px] items-center border border-stone-500 bg-transparent px-6 font-sans text-sm font-medium text-stone-600 transition-colors ease-gentle hover:bg-stone-500 hover:text-stone-50 dark:border-stone-400 dark:text-stone-300 dark:hover:bg-stone-400 dark:hover:text-stone-950"
        >
          {total !== undefined ? `Show more (${shown} of ${total}${totalCapped ? '+' : ''})` : 'Show more'}
        </Link>
      )}
      {previousHref && (
        <Link
          href={previousHref}
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
        >
          First page
        </Link>
      )}
    </div>
  );
}

// ── corpus rows ─────────────────────────────────────────────────────────────────────────────
// The row shape is the catalog-search row (same product surface, same contract): title, the
// register label from the row itself, WHO SAID IT (attribution is this product's promise —
// CLAUDE.md I1–I6), and the sanitized ts_headline snippet.

export function CorpusGroupRows({ results }: { results: SectionSearchResult[] }) {
  return (
    <ul className="border-y edge">
      {results.map((r) => (
        <li key={`${r.slug}#${r.ordinal}`} className="border-b edge last:border-b-0">
          <Link
            href={`/work/${r.slug}#s${r.ordinal}`}
            className="group block py-4 transition-colors ease-gentle hover:bg-accent-50/40 dark:hover:bg-accent-950/20"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate font-scripture text-[17px] text-stone-900 group-hover:text-accent-800 dark:text-stone-100 dark:group-hover:text-accent-300">{r.title}</span>
              {/* the register label — the wall requires the reader can always tell what this is (S-5) */}
              <span className="shrink-0 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{r.sourceType}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-stone-500 dark:text-stone-400">
              {r.author ?? 'Unattributed'}
              {r.tradition && <span> · {r.tradition}</span>}
              {r.heading && <span> · {r.heading}</span>}
            </span>
            <span
              className="mt-1 block text-sm leading-relaxed text-stone-600 [&_mark]:bg-accent-100 [&_mark]:text-stone-900 dark:text-stone-300 dark:[&_mark]:bg-accent-900/60 dark:[&_mark]:text-stone-100"
              /* ts_headline does NOT escape the body — sanitize before rendering (lib/snippet.ts). */
              dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── personal rows ───────────────────────────────────────────────────────────────────────────
// No register label on these rows by design (§7.3): group membership says whose they are.

/** One attribution line, plain text — the wording of the study editor's AttributionLine and the
 *  export's attributionLine ("author, work_title (reference)", 'Unknown source' fallback), in
 *  the row's single-line register. Formatting only: the DECISION that this row is a tombstone
 *  was made server-side by servability.ts's shared blockRenderState (searchStudies phase 2) —
 *  this component never re-derives licensing. */
function tombstoneAttributionText(attribution: StudyAttribution | null): string {
  const author = attribution?.author?.trim();
  const title = attribution?.work_title?.trim();
  const reference = attribution?.reference?.trim();
  const name = [author, title].filter(Boolean).join(', ') || 'Unknown source';
  return `${name}${reference ? ` (${reference})` : ''}`;
}

export function StudiesGroupRows({ rows }: { rows: StudySearchHit[] }) {
  return (
    <ul className="border-y edge">
      {rows.map((r) => (
        <li key={r.studyId} className="border-b edge last:border-b-0">
          <Link
            href={`/studies/${r.studyId}`}
            className="group block py-4 transition-colors ease-gentle hover:bg-accent-50/40 dark:hover:bg-accent-950/20"
          >
            <span className="truncate font-scripture text-[17px] text-stone-900 group-hover:text-accent-800 dark:text-stone-100 dark:group-hover:text-accent-300">{r.title}</span>
            {r.state === 'snippet' ? (
              <span
                className="mt-1 block text-sm leading-relaxed text-stone-600 [&_mark]:bg-accent-100 [&_mark]:text-stone-900 dark:text-stone-300 dark:[&_mark]:bg-accent-900/60 dark:[&_mark]:text-stone-100"
                dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }}
              />
            ) : (
              /* Tombstone (S-10 on the search surface; 2026-08-17 audit, domain lens #2): the
                 best-matching block's quote is no longer servable, so the row shows attribution
                 + the ONE shared notice — no quote bytes, no dangerouslySetInnerHTML (plain
                 text; React escapes it), and no link to the withdrawn WORK. The row still links
                 to the STUDY above, which is the user's own doc and tombstones the block
                 itself. */
              <span className="mt-1 block text-sm italic leading-relaxed text-stone-500 dark:text-stone-400">
                — {tombstoneAttributionText(r.attribution)} — {TOMBSTONE_NOTICE}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function WorksGroupRows({ rows }: { rows: UserHit[] }) {
  return (
    <ul className="border-y edge">
      {rows.map((r) => (
        <li key={r.sectionId} className="border-b edge last:border-b-0">
          <Link
            href={`/library/uploads/${r.documentId}`}
            className="group block py-4 transition-colors ease-gentle hover:bg-accent-50/40 dark:hover:bg-accent-950/20"
          >
            <span className="truncate font-scripture text-[17px] text-stone-900 group-hover:text-accent-800 dark:text-stone-100 dark:group-hover:text-accent-300">{r.title}</span>
            {r.heading && (
              <span className="mt-0.5 block truncate text-xs text-stone-500 dark:text-stone-400">{r.heading}</span>
            )}
            {/* user-corpus keyword search returns the stored body, not a headline — bounded
                plain-text excerpt, rendered as text (never HTML: it is the user's own writing). */}
            <span className="mt-1 block text-sm leading-relaxed text-stone-600 dark:text-stone-300">{excerpt(r.text)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PrayersGroupRows({ rows }: { rows: PrayerSearchHit[] }) {
  return (
    <ul className="border-y edge">
      {rows.map((r) => (
        <li key={r.id} className="border-b edge last:border-b-0">
          {/* The journal is the prayers home (E9); there is no per-prayer route to deep-link. */}
          <Link
            href="/prayers"
            className="group block py-4 transition-colors ease-gentle hover:bg-accent-50/40 dark:hover:bg-accent-950/20"
          >
            <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{when(r.createdAt)}</span>
            <span className="mt-1 block text-sm leading-relaxed text-stone-600 dark:text-stone-300">{excerpt(r.snippet)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function NotesGroupRows({ rows }: { rows: NoteSearchHit[] }) {
  return (
    <ul className="border-y edge">
      {rows.map((r) => (
        <li key={r.id} className="border-b edge last:border-b-0">
          <Link
            href={verseHref(r.verseId)}
            className="group block py-4 transition-colors ease-gentle hover:bg-accent-50/40 dark:hover:bg-accent-950/20"
          >
            <span className="block truncate text-xs font-medium text-accent-700 group-hover:text-accent-800 dark:text-accent-300">
              {formatVerseId(r.verseId)}
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-stone-600 dark:text-stone-300">{excerpt(r.snippet)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
