'use client';
// Reading Plans — list, builder, and the day-by-day view.
//
// UX PRINCIPLE, after the first pass read as unintuitive: a user should never
// have to submit a form to find out what it does. The builder previews the real
// plan LIVE using `expandPlan` — the SAME pure function the server runs — so the
// preview cannot drift from the result, and a scope that cannot fill the
// schedule says so BEFORE the button is pressed rather than as an error after.
//
// Copy is written for a reader, not for this repo. The old subtitle said "the
// schedule is arithmetic", which is true of the implementation and tells a
// person nothing about what they are about to get.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BOOKS, BOOK_BY_NUM } from '@/bible/books';
import { CANONICAL_GROUPS } from '@/lib/plan/canonical-groups';
import { expandPlan } from '@/lib/plan/expand';
import { formatVerseId } from '@/bible/verse-id';
import { CHAPTER_END_SENTINEL } from '@/bible/ref-parse';
import { PassagePane } from '@/components/passage-pane';
import { VerseRef } from '@/components/verse-ref';
import { DEFAULT_TRANSLATION } from '@/lib/bible';
import { storedTranslation, type PassageTarget } from '@/lib/verse-preview';
import { count } from '@/lib/plural';
import { DISPLAY_LOCALE } from '@/lib/locale';
import { defaultPlanShape } from '@/lib/plan/defaults';
import { refOf } from '@/lib/plan/day-ref';
import { BOOK_BY_SLUG } from '@/bible/books';

interface PlanListRow {
  id: string;
  title: string;
  total_days: number;
  read_days: number;
}

interface PlanDay {
  day_index: number;
  day_date: string;
  verse_start: number;
  verse_end: number;
  completed_at: string | null;
}

export interface PlanReading {
  day_index: number;
  ordinal: number;
  verse_start: number;
  verse_end: number;
  label: string | null;
}

interface TopicMatch {
  workSlug: string;
  workTitle: string;
  sectionId: number;
  heading: string;
  entryCount: number;
}

interface OpenPlan {
  plan: { id: string; title: string };
  days: PlanDay[];
  readings?: PlanReading[];
}

type ListState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error' }
  | { status: 'ready'; plans: PlanListRow[] };

// PRD §6 inputs: 1px hairline (`edge` flips light/dark), parchment surface, square corners
// (the radius ladder in globals.css is all 0, so `rounded-lg` compiles to nothing).
// `text-base sm:text-sm` rather than a flat `text-sm`: iOS Safari zooms the viewport when a
// focused field is under 16px, which on the builder threw the whole page off-centre mid-form.
const FIELD =
  'min-h-[44px] rounded-lg border edge bg-stone-50 px-3 text-base text-stone-900 sm:text-sm dark:bg-stone-900 dark:text-stone-100';

// PRD §6 primary CTA: 1px ink hairline on transparent; hover fills with ink INSTANTLY (no
// background transition — the PRD's motion budget is fade-only and hover is an immediate fill).
const PRIMARY_BUTTON =
  'inline-flex min-h-[44px] items-center justify-center border border-stone-900 bg-transparent px-6 py-3 text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:opacity-40 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-200 dark:hover:text-stone-950';

export function PlansClient({ initialPlanId }: { initialPlanId?: string } = {}) {
  const router = useRouter();
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [open, setOpen] = useState<OpenPlan | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/plans');
      if (res.status === 401) { setList({ status: 'signed-out' }); return; }
      if (!res.ok) { setList({ status: 'error' }); return; }
      const data = (await res.json()) as { plans: PlanListRow[] };
      setList({ status: 'ready', plans: data.plans });
    } catch {
      setList({ status: 'error' });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openPlan = useCallback(async (id: string) => {
    // Was `if (res.ok) setOpen(...)` with no else and no catch: on a failure the row simply
    // did not respond, and a network rejection surfaced as an unhandled promise. Silence is
    // the one thing a click must never do.
    //
    // A 401 here is SIGNED OUT, and it must say so: two mount effects race on
    // /plans/[id], and mapping every non-ok to the list-level error let this one
    // win over refresh()'s signed-out state — an anonymous reader following a
    // shared link saw "Plans could not be loaded" with no way in. A 404/400/500
    // all get ONE plan-scoped message on purpose: no oracle separating "not
    // yours" from "does not exist", and the loaded list is not clobbered.
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(id)}`);
      if (res.status === 401) { setList({ status: 'signed-out' }); return; }
      if (!res.ok) { setOpenError('This plan could not be opened. It may have been removed.'); return; }
      setOpenError(null);
      setOpen((await res.json()) as OpenPlan);
    } catch {
      setOpenError('This plan could not be opened. Please try again.');
    }
  }, []);

  // A plan has a URL now (/plans/[id]) — the dossier ruled it a Sprint-1
  // prerequisite: without one a plan cannot be linked from home, refreshed,
  // or returned to with the back button. This component serves both routes:
  // the list at /plans, and one plan when the page passes its id.
  useEffect(() => {
    // Clear the PREVIOUS plan first: navigating /plans/A -> /plans/B re-runs this
    // effect, and without the reset plan A's title and grid render under B's URL
    // for the length of the fetch.
    setOpen(null);
    setOpenError(null);
    if (initialPlanId) void openPlan(initialPlanId);
  }, [initialPlanId, openPlan]);

  return (
    <div className="w-full px-4 py-8 sm:px-6">
      {/* NO max-width here. It used to be `mx-auto max-w-3xl` on this wrapper, which also
          capped the DETAIL view, and the passage pane renders inside that. Opening a pane
          therefore split 768px between the plan and a 440px pane, squeezing the plan to
          roughly 300px (narrower than a phone) while the whole block stayed centred and
          left a large dead gap beside the rail. Each view now owns its own measure. */}
      {!open && (
        <header className="mx-auto mb-6 max-w-3xl">
          <h1 className="font-display text-3xl font-medium text-stone-900 dark:text-stone-100">Reading plans</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Choose what to read and how long you want to take. We lay the readings out day by day
            and keep your place as you go.
          </p>
        </header>
      )}

      {(list.status === 'loading' || (initialPlanId && !open && !openError && list.status === 'ready')) && (
        <p className="mx-auto max-w-3xl text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      )}

      {openError && list.status !== 'signed-out' && (
        <div className="mx-auto max-w-3xl">
          <p role="alert" className="text-sm text-stone-700 dark:text-stone-200">{openError}</p>
          <Link href="/plans" className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-300">
            ← All plans
          </Link>
        </div>
      )}
      {list.status === 'signed-out' && (
        <p className="mx-auto max-w-3xl text-sm text-stone-500">
          <Link href="/auth/sign-in" className="text-accent-700 hover:text-accent-800 dark:text-accent-300">Sign in</Link>
          {' '}to build a reading plan.
        </p>
      )}
      {list.status === 'error' && <p role="alert" className="mx-auto max-w-3xl text-sm text-red-800 dark:text-red-200">Plans could not be loaded. Please try again.</p>}

      {list.status === 'ready' && (open ? (
        <PlanDetail
          key={open.plan.id}
          open={open}
          onBack={() => { setOpen(null); router.push('/plans'); }}
          onChanged={() => openPlan(open.plan.id)}
          onDayPainted={(dayIndex, completedAt) =>
            setOpen((cur) => cur && {
              ...cur,
              days: cur.days.map((day) => (day.day_index === dayIndex ? { ...day, completed_at: completedAt } : day)),
            })
          }
        />
      ) : initialPlanId ? null : (
        <div className="mx-auto max-w-3xl">
          {list.plans.length > 0 && (
            <div className="border-b edge">
              {list.plans.map((p) => <PlanRow key={p.id} plan={p} />)}
            </div>
          )}

          {list.plans.length === 0 && !building && <EmptyState />}

          {building ? (
            <BuilderForm
              onDone={(planId) => { setBuilding(false); if (planId) { router.push(`/plans/${planId}`); } else { void refresh(); } }}
              onCancel={() => setBuilding(false)}
            />
          ) : (
            <button
              onClick={() => setBuilding(true)}
              className={`mt-5 ${PRIMARY_BUTTON}`}
            >
              {list.plans.length === 0 ? 'Build my first plan' : 'New plan'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// The empty state TEACHES the feature rather than only reporting emptiness.
function EmptyState() {
  const examples = [
    ['A book', 'Romans, a chapter a day for a month'],
    ['A collection', 'Paul’s letters, the Gospels, or the whole Bible in a year'],
    ['A topic', 'Prayer or forgiveness, gathered by Nave’s and Torrey’s'],
  ] as const;
  // No card chrome: a hairline-bounded quiet block, per the PRD's empty-state rule
  // (type and hairlines, no boxes).
  return (
    <div className="border-y edge py-5">
      <p className="text-sm font-medium text-stone-900 dark:text-stone-100">No plans yet. You can build:</p>
      <ul className="mt-3 space-y-2">
        {examples.map(([what, eg]) => (
          <li key={what} className="text-sm">
            <span className="font-medium text-stone-800 dark:text-stone-100">{what}</span>
            <span className="text-stone-500 dark:text-stone-400">. {eg}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// PRD §5: 2px vellum track, 2px antique-gold fill, SQUARE ends (no rounded-full here).
function ProgressBar({ pct }: { pct: number }) {
  // Spans, not divs: this renders inside PlanRow's <Link> -> <span> chain, and a
  // div inside a span is invalid HTML (phrasing content cannot contain flow).
  return (
    <span className="block h-[2px] bg-stone-200 dark:bg-stone-800">
      <span
        className="block h-full bg-accent-600 transition-[width] duration-200 ease-gentle dark:bg-accent-400"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

function PlanRow({ plan }: { plan: PlanListRow }) {
  const pct = plan.total_days > 0 ? Math.round((plan.read_days / plan.total_days) * 100) : 0;
  const done = plan.total_days > 0 && plan.read_days === plan.total_days;
  // PRD §5 Plans: a hairline-separated ROW, not a card — 11px Source Sans metadata kicker
  // (0.05em tracking, ink-wash), 18px Literata title in ink that warms to antique gold on hover.
  // A LINK, not a button: a plan has a URL, so a row is navigation — middle-click,
  // back button and refresh all behave.
  return (
    <Link
      href={`/plans/${plan.id}`}
      className="group block w-full border-t edge px-1 py-6 text-left transition-colors ease-gentle hover:bg-stone-100/50 dark:hover:bg-stone-800/40"
    >
      <span className="block text-micro font-medium uppercase tracking-[0.05em] text-stone-500 dark:text-stone-400">
        {count(plan.total_days, 'day')}
      </span>
      <span className="mt-1 block truncate font-serif text-[18px] font-medium text-stone-900 transition-colors ease-gentle group-hover:text-accent-600 dark:text-stone-100 dark:group-hover:text-accent-400">
        {plan.title}
      </span>
      <span className="mt-4 flex items-center gap-6">
        <span className="w-full max-w-[200px]"><ProgressBar pct={pct} /></span>
        <span className="shrink-0 text-micro font-medium text-stone-500 dark:text-stone-400">
          {done ? 'Finished' : `Day ${plan.read_days} of ${plan.total_days}`}
        </span>
      </span>
    </Link>
  );
}

// ── builder ──────────────────────────────────────────────────────────────────

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole calendar days from `fromIso` to `toIso` (UTC arithmetic on date-only strings). */
function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  // DISPLAY_LOCALE, not `undefined` — block L2c. `undefined` resolves against the READER's runtime,
  // so a zh-CN browser rendered `8月8日周六` in an all-English product. The audit deck screenshotted
  // exactly this and filed it as a server-locale leak; it is the client's.
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(DISPLAY_LOCALE, {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

const MODES = [
  { key: 'book', label: 'One book', hint: 'Work through a single book of the Bible.' },
  { key: 'books', label: 'A collection', hint: 'A group of books: the Gospels, Paul’s letters, the whole Bible.' },
  { key: 'topic', label: 'A topic', hint: 'A theme, gathered by a classic topical index and read passage by passage.' },
] as const;
type Mode = (typeof MODES)[number]['key'];

function BuilderForm({ onDone, onCancel }: { onDone: (planId?: string) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<Mode>('book');
  const [book, setBook] = useState('rom');
  // Re-derive when the reader picks another book. `pickBook` rather than raw `setBook` so the two
  // numbers can never be left describing the previous book — which is how the error state returns.
  const pickBook = (slug: string) => {
    setBook(slug);
    // RE-DERIVE ONLY IF THE CURRENT SHAPE WOULD ERROR. Recomputing unconditionally would prevent the
    // error state but discard a reader's deliberate 8-weeks-at-3-days while they browse books,
    // which is its own small betrayal. Keeping what they chose when it still fits is both gentler
    // and a smaller change in effect.
    const chapters = BOOK_BY_SLUG.get(slug)?.chapterCount ?? 0;
    if (weeks * daysPerWeek > chapters) {
      const shape = defaultPlanShape(slug, daysPerWeek);
      setWeeks(shape.weeks);
      setDaysPerWeek(shape.daysPerWeek);
    }
  };
  const [group, setGroup] = useState('pauline-epistles');
  const [topicQuery, setTopicQuery] = useState('');
  const [topicMatches, setTopicMatches] = useState<TopicMatch[] | null>(null);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [pickedTopic, setPickedTopic] = useState<TopicMatch | null>(null);
  // DERIVED, not constant — block L2b. `useState(8)` with `daysPerWeek` 5 meant the builder opened
  // on Romans at 40 reading slots against 16 chapters, rendering its own validation error with
  // `Create plan` disabled before the reader touched anything.
  const [weeks, setWeeks] = useState(() => defaultPlanShape('rom').weeks);
  const [daysPerWeek, setDaysPerWeek] = useState(() => defaultPlanShape('rom').daysPerWeek);
  const [startDate, setStartDate] = useState(todayLocalDate);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // THE PREVIEW. Runs the server's own expandPlan, so what is shown is what will
  // be built — including its refusal when a scope cannot fill the schedule.
  const preview = useMemo(() => {
    // A CLEARED NUMBER FIELD IS AN INCOMPLETE FORM, NOT A ZERO. Number('') is 0, and with
    // weeks 0 expandPlan returns { ok: true, days: [] } (the too-few-chapters refusal
    // cannot fire at dayCount 0), so the code below read r.days[0]!.date and THREW during
    // render — the error boundary ate the whole page because someone cleared a field. In
    // topic mode the same input divided by zero into "about Infinity passages a day".
    // Guard ABOVE the per-mode branches so every mode gets the same quiet refusal.
    if (!Number.isFinite(weeks) || weeks < 1 || !Number.isFinite(daysPerWeek) || daysPerWeek < 1) {
      return { ok: false as const, reason: 'Choose how many weeks and days each week, and the preview appears here.' };
    }
    const dayCount = weeks * daysPerWeek;
    if (mode === 'topic') {
      if (!pickedTopic) return null;
      if (pickedTopic.entryCount < dayCount) {
        return {
          ok: false as const,
          reason: `“${pickedTopic.heading}” has ${pickedTopic.entryCount} passages, not enough for ${dayCount} reading days. Try fewer weeks or fewer days each week.`,
        };
      }
      const per = pickedTopic.entryCount / dayCount;
      return {
        ok: true as const,
        days: dayCount,
        scope: `${pickedTopic.heading} · ${count(pickedTopic.entryCount, 'passage')} · ${pickedTopic.workTitle}`,
        pace: per < 1.5 ? 'about 1 passage a day' : `about ${Math.round(per)} passages a day`,
        from: null as string | null, to: null as string | null,
      };
    }
    const scope = mode === 'book' ? { kind: 'book' as const, book } : { kind: 'books' as const, group };
    const r = expandPlan({ scope, weeks, daysPerWeek, startDate });
    if (!r.ok) return { ok: false as const, reason: r.reason };
    const first = r.days[0]!;
    const last = r.days[r.days.length - 1]!;
    // Count from the CANON, not by summing each day's span. `chapterEnd -
    // chapterStart + 1` goes NEGATIVE on a day that straddles a book boundary
    // (Romans 16 → 1 Corinthians 2 gives -13), which a collection guarantees at
    // any normal pace. Caught by plans-builder-preview.test.tsx.
    const g = mode === 'books' ? CANONICAL_GROUPS[group] : undefined;
    const chapters = g
      ? g.books.reduce((n, slug) => n + (BOOKS.find((b) => b.slug === slug)?.chapterCount ?? 0), 0)
      : BOOKS.find((b) => b.slug === book)?.chapterCount ?? 0;
    const per = chapters / r.days.length;
    // Name the SCOPE, not the first and last day's readings. "Genesis 1–3 →
    // Genesis 48–50" describes the schedule twice and never says "Genesis".
    const scopeText = g
      ? `${g.label} · ${count(chapters, 'chapter')} across ${count(g.books.length, 'book')}`
      : `${BOOKS.find((b) => b.slug === book)?.name ?? book} · ${count(chapters, 'chapter')}`;
    return {
      ok: true as const,
      days: r.days.length,
      scope: scopeText,
      pace: per < 1.5 ? 'about 1 chapter a day' : `about ${Math.round(per)} chapters a day`,
      from: first.date, to: last.date,
    };
  }, [mode, book, group, pickedTopic, weeks, daysPerWeek, startDate]);

  const searchTopics = async () => {
    if (!topicQuery.trim() || searching) return;
    setSearching(true); setNotice(null); setPickedTopic(null);
    // A failed search and an empty library are DIFFERENT facts. Collapsing both
    // to [] rendered "no matching topics" — an authoritative claim about the
    // corpus from an instrument that did not run.
    setTopicError(null);
    try {
      const res = await fetch(`/api/plans/topics?q=${encodeURIComponent(topicQuery.trim())}`);
      if (!res.ok) {
        setTopicMatches(null);
        setTopicError('Topic search is unavailable right now. Please try again.');
        return;
      }
      const data = (await res.json()) as { matches: TopicMatch[] };
      setTopicMatches(data.matches);
    } catch {
      setTopicMatches(null);
      setTopicError('Topic search could not be reached. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'topic' && !pickedTopic) {
      setNotice('Search for a topic and choose one of the suggestions first.');
      return;
    }
    setBusy(true); setNotice(null);
    try {
      const scope =
        mode === 'book' ? { kind: 'book', book }
        : mode === 'books' ? { kind: 'books', group }
        : { kind: 'topic', workSlug: pickedTopic!.workSlug, sectionId: pickedTopic!.sectionId };
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: { scope, weeks, daysPerWeek, startDate } }),
      });
      const data = (await res.json()) as { plan?: { id: string }; refused?: boolean; reason?: string; error?: { message: string } };
      if (res.status === 201) { onDone(data.plan?.id); return; }
      setNotice(data.reason ?? data.error?.message ?? 'The plan could not be created.');
    } catch {
      setNotice('The plan could not be created. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // PRD §5 builder form labels: 12px Source Sans, uppercase, 0.08em tracking, ink-wash.
  const stepLabel = 'mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400';

  return (
    <form onSubmit={submit} className="mt-5 border edge p-4 sm:p-6">
      <p className={stepLabel}>1 · What to read</p>
      {/* Segmented control, but SQUARE — the old rounded-full pill fought the no-radius PRD
          (rounded-full is reserved for true pills: dots, swatches, avatar). 44px rows. */}
      <div className="flex gap-1 border edge p-1" role="tablist" aria-label="What kind of plan">
        {MODES.map((m) => (
          <button
            key={m.key} type="button" role="tab" aria-selected={mode === m.key}
            onClick={() => setMode(m.key)}
            className={`min-h-[44px] flex-1 px-3 text-xs font-semibold uppercase tracking-[0.08em] transition-colors ease-gentle ${
              mode === m.key
                ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900'
                : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{MODES.find((m) => m.key === mode)!.hint}</p>

      <div className="mt-3">
        {mode === 'book' && (
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
            Book
            <select value={book} onChange={(e) => pickBook(e.target.value)} className={FIELD}>
              {BOOKS.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
          </label>
        )}
        {mode === 'books' && (
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
            Collection
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={FIELD}>
              {Object.entries(CANONICAL_GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
            </select>
          </label>
        )}
        {mode === 'topic' && (
          <TopicPicker
            query={topicQuery} setQuery={setTopicQuery} onSearch={searchTopics} searching={searching}
            matches={topicMatches} error={topicError} picked={pickedTopic} setPicked={setPickedTopic}
          />
        )}
      </div>

      <p className={`${stepLabel} mt-5`}>2 · How long</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
          Weeks
          <input type="number" min={1} max={104} value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))} className={FIELD} required />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
          Days each week
          <input type="number" min={1} max={7} value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Number(e.target.value))} className={FIELD} required />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
          Starting
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD} required />
        </label>
      </div>

      {preview && (
        <div
          aria-live="polite"
          className={`mt-4 border px-4 py-3 text-base sm:text-sm ${
            preview.ok
              ? 'edge text-stone-700 dark:text-stone-200'
              : 'border-accent-300 bg-accent-50 text-accent-800 dark:border-accent-700 dark:bg-accent-950/40 dark:text-accent-200'
          }`}
        >
          {preview.ok ? (
            <>
              <p className="font-medium">{preview.days} readings · {preview.pace}</p>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{preview.scope}</p>
              {preview.from && preview.to && (
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                  {prettyDate(preview.from)} → {prettyDate(preview.to)}
                </p>
              )}
            </>
          ) : (
            <p>{preview.reason}</p>
          )}
        </div>
      )}

      {notice && (
        <p className="mt-3 border border-accent-300 bg-accent-50 px-3 py-2 text-sm text-accent-800 dark:border-accent-700 dark:bg-accent-950/40 dark:text-accent-200">
          {notice}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit" disabled={busy || preview?.ok === false}
          className={PRIMARY_BUTTON}
        >
          {busy ? 'Building…' : 'Create plan'}
        </button>
        <button type="button" onClick={onCancel}
          className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
          Cancel
        </button>
      </div>
    </form>
  );
}

function TopicPicker({
  query, setQuery, onSearch, searching, matches, error, picked, setPicked,
}: {
  query: string; setQuery: (s: string) => void; onSearch: () => void; searching: boolean;
  matches: TopicMatch[] | null; error: string | null;
  picked: TopicMatch | null; setPicked: (t: TopicMatch) => void;
}) {
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSearch(); } }}
          placeholder="Try: prayer, faith, forgiveness…"
          className={`${FIELD} flex-1`} aria-label="Search topics"
        />
        <button type="button" onClick={onSearch} disabled={searching}
          className="inline-flex min-h-[44px] shrink-0 items-center border border-stone-500 bg-transparent px-4 text-sm font-semibold tracking-[0.02em] text-stone-500 hover:bg-stone-500 hover:text-stone-50 disabled:opacity-50 dark:border-stone-400 dark:text-stone-300 dark:hover:bg-stone-400 dark:hover:text-stone-950">
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && (
        <p className="mt-2 border border-accent-300 bg-accent-50 px-3 py-2 text-xs text-accent-800 dark:border-accent-700 dark:bg-accent-950/40 dark:text-accent-200">{error}</p>
      )}

      {matches !== null && !error && (
        <div className="mt-2">
          {matches.length === 0 ? (
            <p className="text-xs text-stone-500 dark:text-stone-400">No topic by that name in the library. Try another word.</p>
          ) : (
            <>
              <p className="mb-1.5 text-xs text-stone-500 dark:text-stone-400">Choose one:</p>
              <div className="space-y-1.5">
                {matches.map((m) => {
                  const on = picked?.sectionId === m.sectionId && picked?.workSlug === m.workSlug;
                  return (
                    <button
                      key={`${m.workSlug}-${m.sectionId}`} type="button" onClick={() => setPicked(m)} aria-pressed={on}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-3 border px-3 py-1.5 text-left transition-colors ease-gentle ${
                        on ? 'border-accent-700 bg-accent-50 dark:border-accent-500 dark:bg-accent-950/40'
 : 'edge hover:border-accent-300'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-stone-800 dark:text-stone-100">{m.heading}</span>
                        <span className="block truncate text-micro text-stone-500 dark:text-stone-400">{m.workTitle}</span>
                      </span>
                      <span className="shrink-0 text-micro text-stone-500 dark:text-stone-400">{count(m.entryCount, 'passage')}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── labels ───────────────────────────────────────────────────────────────────

const dayRef = (d: PlanDay) => refOf(d.verse_start, d.verse_end);

export function readingLabel(r: PlanReading): string {
  const startBook = Math.floor(r.verse_start / 1_000_000);
  const endBook = Math.floor(r.verse_end / 1_000_000);
  const startCh = Math.floor((r.verse_start % 1_000_000) / 1000);
  const endCh = Math.floor((r.verse_end % 1_000_000) / 1000);
  // A whole-chapter reference parses to verse 1 .. CHAPTER_END_SENTINEL. Rendering
  // that literally produced "Genesis 1:1-999" — an internal sentinel shown to the
  // reader as if it were a verse number. Name the chapter instead.
  if (r.verse_start % 1000 === 1 && r.verse_end % 1000 === CHAPTER_END_SENTINEL) {
    const bookName = BOOK_BY_NUM.get(startBook)?.name ?? '?';
    if (startBook === endBook) return startCh === endCh ? `${bookName} ${startCh}` : `${bookName} ${startCh}–${endCh}`;
    return `${bookName} ${startCh}–${BOOK_BY_NUM.get(endBook)?.name ?? '?'} ${endCh}`;
  }
  const start = formatVerseId(r.verse_start);
  if (r.verse_end === r.verse_start) return start;
  return startBook === endBook && startCh === endCh
    ? `${start}-${r.verse_end % 1000}`
    : `${start}–${formatVerseId(r.verse_end)}`;
}

// ── the plan itself ──────────────────────────────────────────────────────────

function PlanDetail({ open, onBack, onChanged, onDayPainted }: { open: OpenPlan; onBack: () => void; onChanged: () => void | Promise<void>; onDayPainted: (dayIndex: number, completedAt: string | null) => void }) {
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pane, setPane] = useState<PassageTarget | null>(null);
  const [catchUpDismissed, setCatchUpDismissed] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  // "Keep the original dates" is a decision, not a session mood. Without
  // persistence the card returns on every visit for a reader who is permanently
  // behind and has deliberately declined — the nag pattern the design's
  // no-gamification rule exists to prevent. Read in an effect (the app's
  // standing #418 rule: never localStorage during render).
  useEffect(() => {
    try {
      if (localStorage.getItem(`ap:catchup-dismissed:${open.plan.id}`) === '1') setCatchUpDismissed(true);
    } catch { /* storage unavailable: the card simply reappears */ }
  }, [open.plan.id]);
  const dismissCatchUp = () => {
    setCatchUpDismissed(true);
    try { localStorage.setItem(`ap:catchup-dismissed:${open.plan.id}`, '1'); } catch { /* best effort */ }
  };
  // The server render and the first client render both use the default, and the reader's stored
  // choice is adopted only after mount. Reading localStorage during render is exactly what
  // produced this app's React #418 on every reader page load (see storedTranslation's note).
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  useEffect(() => setTranslation(storedTranslation()), []);

  const readingsByDay = new Map<number, PlanReading[]>();
  for (const r of open.readings ?? []) {
    (readingsByDay.get(r.day_index) ?? readingsByDay.set(r.day_index, []).get(r.day_index)!).push(r);
  }

  const today = todayLocalDate();
  const doneCount = open.days.filter((d) => d.completed_at).length;
  // "Up next" answers the one question someone opening a plan actually has, which
  // the flat list made them scan for.
  const upNext = open.days.find((d) => !d.completed_at);
  // Behind = the next unread day's date has passed. One day behind is "due now" and the
  // card would nag; from two days the plan needs forgiving, not a badge. This is the
  // dossier's Sprint-1 retention piece: reading plans die silently without a catch-up.
  const daysBehind = upNext && upNext.day_date < today ? daysBetween(upNext.day_date, today) : 0;

  const reschedule = async () => {
    if (rescheduling) return;
    setRescheduling(true);
    try {
      const res = await fetch(`/api/plans/${open.plan.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'reschedule', fromDate: todayLocalDate() }),
      });
      if (!res.ok) { setWriteError('The schedule could not be moved. Please try again.'); return; }
      setWriteError(null);
      // AWAITED: releasing the button before the re-fetch lands leaves the stale
      // "behind" card under an enabled button — an invitation to double-submit.
      await Promise.resolve(onChanged());
    } catch {
      setWriteError('The schedule could not be moved. Please try again.');
    } finally {
      setRescheduling(false);
    }
  };

  const toggle = async (d: PlanDay) => {
    setBusyDay(d.day_index);
    // OPTIMISTIC (L2 step 2): the flip is painted NOW and rolled back if the
    // save fails. Was: await the POST, then await a full re-read of the plan,
    // busyDay holding the checkbox disabled the whole time — on a slow
    // connection the tap read as dead. Painting first is safe here because
    // the write sends an ABSOLUTE value (`completed: !d.completed_at`), never
    // "flip": a late response cannot set the row to something the reader is
    // no longer looking at. busyDay still locks the same day until this write
    // resolves, so a rollback can never clobber a newer paint of that day.
    const painted = d.completed_at ? null : new Date().toISOString();
    onDayPainted(d.day_index, painted);
    try {
      const res = await fetch(`/api/plans/${open.plan.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'day', dayIndex: d.day_index, completed: !d.completed_at }),
      });
      if (!res.ok) {
        onDayPainted(d.day_index, d.completed_at);
        setWriteError('That change could not be saved. Please try again.');
        return;
      }
      setWriteError(null);
      // No re-read on success: the acknowledged write was absolute, so the
      // painted state IS the server state — a refetch would only spend a
      // round-trip re-learning it.
    } catch {
      onDayPainted(d.day_index, d.completed_at);
      setWriteError('That change could not be saved. Please try again.');
    } finally {
      setBusyDay(null);
    }
  };

  const remove = async () => {
    // Two-step, not window.confirm: the first tap arms, the second acts. A native confirm dialog
    // in a plan detail is heavier than the action deserves, and it froze the renderer in some
    // environments (F-108).
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setConfirmDelete(false);
    // Was: await fetch(DELETE) then onBack() unconditionally, so a failed delete returned the
    // reader to a list with the plan still sitting in it and no message.
    try {
      const res = await fetch(`/api/plans/${open.plan.id}`, { method: 'DELETE' });
      if (!res.ok) { setWriteError('The plan could not be deleted. Please try again.'); return; }
      onBack();
    } catch {
      setWriteError('The plan could not be deleted. Please try again.');
    }
  };

  // "Read it" on a topical day opens the day's FIRST cited passage — the day itself is a bag of
  // passages, so there is no single range for it that would not be invented here.
  const upNextTarget = ((): PassageTarget | null => {
    if (!upNext) return null;
    const first = readingsByDay.get(upNext.day_index)?.[0];
    return first
      ? { verseStart: first.verse_start, verseEnd: first.verse_end, label: readingLabel(first) }
      : { verseStart: upNext.verse_start, verseEnd: upNext.verse_end, label: dayRef(upNext) };
  })();

  return (
    // The detail view owns its own width, and it CHANGES with the pane. Alone, it holds the
    // same max-w-3xl reading measure as the list. With a pane open it widens to max-w-6xl so
    // the plan column keeps a real measure instead of being squeezed into the leftover.
    <div className={`mx-auto lg:flex lg:items-start lg:gap-8 ${pane ? 'max-w-6xl' : 'max-w-3xl'}`}>
      {/* On a phone the pane REPLACES the plan, same tab, no navigation, and its back control
          returns here. From lg the two sit side by side and the plan never loses its place. */}
      <div className={`min-w-0 lg:flex-1 ${pane ? 'hidden lg:block' : ''}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-accent-700 hover:text-accent-800 hover:underline dark:text-accent-300">
          ← All plans
        </button>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-red-800 dark:text-red-200">Delete this plan and your progress?</span>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="inline-flex min-h-[44px] items-center text-xs text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              className="inline-flex min-h-[44px] items-center text-xs font-semibold text-red-800 hover:text-red-900 dark:text-red-200 dark:hover:text-red-100"
            >
              Delete
            </button>
          </div>
        ) : (
          <button onClick={remove} className="inline-flex min-h-[44px] items-center text-xs text-stone-500 dark:text-stone-400 hover:text-accent-700">
            Delete plan
          </button>
        )}
      </div>

      {/* An h1, not an h2. The page's only h1 is gated on `{!open}` above, so with a plan
          open this route had no h1 at all and the document started at h2. The plan title
          IS the subject of the screen once one is open, so it takes the h1 rather than
          adding a second heading above it. */}
      <h1 className="break-words font-display text-2xl font-medium text-stone-900 dark:text-stone-100">{open.plan.title}</h1>
      {writeError && (
        <p role="alert" className="mt-2 text-sm text-red-800 dark:text-red-200">{writeError}</p>
      )}
      {/* The 40-day grid from the dossier: progress you can SEE growing — read days in
          gold, passed-by days as hollow paper, days ahead as quiet vellum. Square 10px
          cells, wrap by width; no percentages, no streak counter (a quiet texture, per
          the design's no-gamification rule). */}
      <div className="mt-3">
        <div className="flex flex-wrap gap-[5px]" aria-hidden>
          {open.days.map((d) => {
            const cell = d.completed_at
              ? 'bg-accent-600 dark:bg-accent-400'
              : d.day_date < today
                ? 'border edge bg-paper dark:bg-stone-900'
                : 'bg-stone-100 dark:bg-stone-800';
            return <span key={d.day_index} className={`h-2.5 w-2.5 ${cell}`} />;
          })}
        </div>
        <p role="status" className="mt-2 text-micro font-medium text-stone-500 dark:text-stone-400">
          {doneCount} of {open.days.length} days read{daysBehind >= 2 ? ` · ${count(daysBehind, 'day')} behind` : ''}
        </p>
      </div>

      {daysBehind >= 2 && !catchUpDismissed && (
        <div className="mt-4 border border-accent-200 bg-accent-50 px-4 py-3 dark:border-accent-800 dark:bg-accent-950/40">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-800 dark:text-accent-200">
            {count(daysBehind, 'day')} behind
          </p>
          <p className="mt-1 font-serif text-base text-stone-900 dark:text-stone-100">
            Life happened. Pick up where you left off — the remaining readings move forward
            with you, and nothing you read is lost.
          </p>
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={() => void reschedule()}
              disabled={rescheduling}
              className="inline-flex min-h-[44px] items-center border border-stone-900 bg-transparent px-4 text-xs font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:opacity-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-200 dark:hover:text-stone-950"
            >
              {rescheduling ? 'Moving the schedule…' : 'Resume from today'}
            </button>
            <button
              type="button"
              onClick={dismissCatchUp}
              className="inline-flex min-h-[44px] items-center text-xs text-stone-500 hover:text-accent-700 dark:text-stone-400"
            >
              Keep the original dates
            </button>
          </div>
        </div>
      )}

      {upNext ? (
        <div className="mt-4 border edge px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
            Up next{upNext.day_date <= today ? ' · due now' : ` · ${prettyDate(upNext.day_date)}`}
          </p>
          <p className="mt-1 font-serif text-lg text-stone-900 dark:text-stone-100">
            {readingsByDay.has(upNext.day_index)
              ? count(readingsByDay.get(upNext.day_index)!.length, 'passage')
              : dayRef(upNext)}
          </p>
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={() => upNextTarget && setPane(upNextTarget)}
              className="inline-flex min-h-[36px] items-center border border-stone-900 bg-transparent px-4 text-xs font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-200 dark:hover:text-stone-950">
              Read it
            </button>
            <button onClick={() => void toggle(upNext)} disabled={busyDay === upNext.day_index}
              className="text-xs text-stone-500 hover:text-accent-700 disabled:opacity-50 dark:text-stone-400">
              Mark as read
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 border edge px-4 py-3 text-sm text-stone-600 dark:text-stone-300">
          Every day is read. Well done.
        </p>
      )}

      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">All readings</p>
      {/* PRD §5 schedule list: hairlines between days, not tinted card rows. The up-next day
          keeps a quiet accent tint so the list still answers "where am I" at a glance. */}
      <ol className="border-b edge">
        {open.days.map((d) => {
          const readings = readingsByDay.get(d.day_index);
          const isNext = upNext?.day_index === d.day_index;
          return (
            <li key={d.day_index}
              className={`border-t edge px-3 py-2 ${isNext ? 'bg-accent-50 dark:bg-accent-950/30' : ''}`}>
              <div className="flex min-h-[44px] items-center gap-3">
                <button
                  onClick={() => void toggle(d)} disabled={busyDay === d.day_index}
                  aria-label={d.completed_at ? `Mark day ${d.day_index} unread` : `Mark day ${d.day_index} read`}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ease-gentle ${
                    d.completed_at
                      ? 'border-accent-700 bg-accent-700 text-stone-50 dark:border-accent-500 dark:bg-accent-500 dark:text-stone-950'
                      : 'border-stone-300 text-transparent hover:border-accent-400 dark:border-stone-600'
                  }`}
                >
                  <svg aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                {/* PRD §5: dates in small-caps Source Sans, ink-wash. */}
                <span className="w-20 shrink-0 font-sans text-xs small-caps tracking-[0.05em] text-stone-500 dark:text-stone-400">{prettyDate(d.day_date)}</span>
                {readings ? (
                  <span className={`flex-1 truncate text-sm font-medium ${d.completed_at ? 'text-stone-400 line-through' : 'text-stone-700 dark:text-stone-200'}`}>
                    {readings.length} passage{readings.length === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1">
                    <VerseRef
                      verseStart={d.verse_start}
                      verseEnd={d.verse_end}
                      label={dayRef(d)}
                      translation={translation}
                      onOpen={setPane}
                      active={pane?.verseStart === d.verse_start && pane?.verseEnd === d.verse_end}
                      // PRD §5 schedule list: the reading reference is 18px Literata in
                      // antique gold; a read day falls back to ink-wash with the strike.
                      className={`font-serif text-[18px] ${
                        d.completed_at ? 'text-stone-400 line-through' : 'text-accent-600 dark:text-accent-400'
                      }`}
                    />
                  </span>
                )}
              </div>
              {readings && (
                <ul className="mt-1 space-y-0.5 pl-9">
                  {readings.map((r) => (
                    <li key={r.ordinal} className="flex items-baseline gap-2 text-sm">
                      <VerseRef
                        verseStart={r.verse_start}
                        verseEnd={r.verse_end}
                        label={readingLabel(r)}
                        translation={translation}
                        onOpen={setPane}
                        active={pane?.verseStart === r.verse_start && pane?.verseEnd === r.verse_end}
                        className={`shrink-0 font-serif text-base ${d.completed_at ? 'text-stone-400' : 'text-accent-600 dark:text-accent-400'}`}
                      />
                      {r.label && <span className="truncate text-xs text-stone-500 dark:text-stone-400">{r.label}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      </div>

      {pane && (
        <aside className="lg:sticky lg:top-4 lg:w-[380px] lg:shrink-0 xl:w-[440px]">
          <PassagePane target={pane} translation={translation} onClose={() => setPane(null)} />
        </aside>
      )}
    </div>
  );
}
