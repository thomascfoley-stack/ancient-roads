'use client';
// Reading Plans — list, plain-form builder, and day-by-day view.
// STUDY_PLANS_DESIGN §12 step 4: the builder is a FORM. The model intake
// (step 5) arrives later and will emit the same PlanSpec this form posts —
// nothing below it changes. Every schedule figure on this screen came from
// expandPlan's arithmetic via the API; nothing here computes a date.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BOOKS, BOOK_BY_NUM } from '@/bible/books';
import { CANONICAL_GROUPS } from '@/lib/plan/canonical-groups';
import { formatVerseId } from '@/bible/verse-id';

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

interface PlanReading {
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

export function PlansClient() {
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [open, setOpen] = useState<OpenPlan | null>(null);
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
    const res = await fetch(`/api/plans/${id}`);
    if (res.ok) setOpen((await res.json()) as OpenPlan);
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-stone-800 dark:text-stone-100">Reading plans</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          A dated walk through a book or passage — the schedule is arithmetic, the readings are Scripture.
        </p>
      </header>

      {list.status === 'loading' && <p className="text-sm text-stone-400">Loading…</p>}
      {list.status === 'signed-out' && (
        <p className="text-sm text-stone-500">
          <Link href="/auth/sign-in" className="text-accent-700 hover:text-accent-800 dark:text-accent-300">Sign in</Link>
          {' '}to build a reading plan.
        </p>
      )}
      {list.status === 'error' && <p className="text-sm text-stone-500">Plans could not be loaded. Please try again.</p>}

      {list.status === 'ready' && (
        <>
          {open ? (
            <PlanDetail open={open} onBack={() => { setOpen(null); void refresh(); }} onChanged={() => void openPlan(open.plan.id)} />
          ) : (
            <>
              <div className="space-y-2">
                {list.plans.length === 0 && !building && (
                  <p className="text-sm text-stone-500 dark:text-stone-400">No plans yet — build your first below.</p>
                )}
                {list.plans.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void openPlan(p.id)}
                    className="flex min-h-[44px] w-full items-center justify-between rounded-xl bg-stone-100/80 px-4 py-3 text-left transition-colors ease-gentle hover:bg-stone-200/60 dark:bg-stone-800/50 dark:hover:bg-stone-800"
                  >
                    <span className="truncate font-medium text-stone-800 dark:text-stone-100">{p.title}</span>
                    <span className="ml-3 shrink-0 text-xs text-stone-400">
                      {p.read_days} of {p.total_days} days read
                    </span>
                  </button>
                ))}
              </div>

              {building ? (
                <BuilderForm
                  onDone={() => { setBuilding(false); void refresh(); }}
                  onCancel={() => setBuilding(false)}
                />
              ) : (
                <button
                  onClick={() => setBuilding(true)}
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-accent-700 px-5 text-sm font-medium text-white shadow-paper transition-colors ease-gentle hover:bg-accent-800"
                >
                  New plan
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function BuilderForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [scopeType, setScopeType] = useState<'book' | 'books' | 'topic'>('book');
  const [book, setBook] = useState('rom');
  const [group, setGroup] = useState('pauline-epistles');
  const [topicQuery, setTopicQuery] = useState('');
  const [topicMatches, setTopicMatches] = useState<TopicMatch[] | null>(null);
  const [pickedTopic, setPickedTopic] = useState<TopicMatch | null>(null);
  const [weeks, setWeeks] = useState(8);
  const [daysPerWeek, setDaysPerWeek] = useState(5);
  const [startDate, setStartDate] = useState(todayLocalDate);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const searchTopics = async () => {
    if (!topicQuery.trim() || busy) return;
    setNotice(null);
    setPickedTopic(null);
    try {
      const res = await fetch(`/api/plans/topics?q=${encodeURIComponent(topicQuery.trim())}`);
      if (!res.ok) { setTopicMatches([]); return; }
      const data = (await res.json()) as { matches: TopicMatch[] };
      setTopicMatches(data.matches);
    } catch {
      setTopicMatches([]);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (scopeType === 'topic' && !pickedTopic) {
      setNotice('Search for a topic and pick one of the suggestions first.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const scope =
        scopeType === 'book' ? { kind: 'book', book }
        : scopeType === 'books' ? { kind: 'books', group }
        : { kind: 'topic', workSlug: pickedTopic!.workSlug, sectionId: pickedTopic!.sectionId };
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: { scope, weeks, daysPerWeek, startDate } }),
      });
      const data = (await res.json()) as { refused?: boolean; reason?: string; error?: { message: string } };
      if (res.status === 201) { onDone(); return; }
      setNotice(data.reason ?? data.error?.message ?? 'The plan could not be created.');
    } catch {
      setNotice('The plan could not be created. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'min-h-[44px] rounded-md border border-stone-300 bg-paper px-3 text-sm text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100';

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl bg-stone-100/80 p-4 shadow-paper dark:bg-stone-800/50">
      <div className="mb-3 flex gap-1 rounded-full bg-stone-200/60 p-1 dark:bg-stone-900/60" role="tablist" aria-label="Plan scope type">
        {([['book', 'One book'], ['books', 'A collection'], ['topic', 'A topic']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={scopeType === value}
            onClick={() => setScopeType(value)}
            className={`min-h-[36px] flex-1 rounded-full px-3 text-xs font-medium transition-colors ease-gentle ${
              scopeType === value
                ? 'bg-paper text-stone-800 shadow-paper dark:bg-stone-700 dark:text-stone-100'
                : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {scopeType === 'topic' && (
        <div className="mb-3">
          <div className="flex gap-2">
            <input
              value={topicQuery}
              onChange={(e) => setTopicQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchTopics(); } }}
              placeholder="prayer, faith, affliction…"
              className={`${field} flex-1`}
              aria-label="Topic search"
            />
            <button
              type="button"
              onClick={() => void searchTopics()}
              className="inline-flex min-h-[44px] items-center rounded-md bg-stone-200/80 px-4 text-sm font-medium text-stone-700 transition-colors ease-gentle hover:bg-stone-300/70 dark:bg-stone-700 dark:text-stone-200"
            >
              Search
            </button>
          </div>
          {topicMatches !== null && (
            <div className="mt-2 space-y-1.5">
              {topicMatches.length === 0 && (
                <p className="text-xs text-stone-400">No matching topics in the library yet — try another word.</p>
              )}
              {topicMatches.map((m) => (
                <button
                  key={`${m.workSlug}-${m.sectionId}`}
                  type="button"
                  onClick={() => setPickedTopic(m)}
                  className={`flex min-h-[44px] w-full items-center justify-between rounded-lg border px-3 text-left transition-colors ease-gentle ${
                    pickedTopic?.sectionId === m.sectionId && pickedTopic?.workSlug === m.workSlug
                      ? 'border-accent-700 bg-accent-50 dark:bg-accent-950/40'
                      : 'border-stone-200 hover:border-accent-300 dark:border-stone-700'
                  }`}
                >
                  <span className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{m.heading}</span>
                  <span className="ml-3 shrink-0 text-[11px] text-stone-400">
                    {m.workTitle} · {m.entryCount} passages
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {scopeType === 'book' && (
          <label className="flex flex-col gap-1 text-xs font-medium text-stone-500 dark:text-stone-400">
            Book
            <select value={book} onChange={(e) => setBook(e.target.value)} className={field}>
              {BOOKS.map((b) => (
                <option key={b.slug} value={b.slug}>{b.name}</option>
              ))}
            </select>
          </label>
        )}
        {scopeType === 'books' && (
          <label className="flex flex-col gap-1 text-xs font-medium text-stone-500 dark:text-stone-400">
            Collection
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={field}>
              {Object.entries(CANONICAL_GROUPS).map(([key, g]) => (
                <option key={key} value={key}>{g.label}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-500 dark:text-stone-400">
          Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} required />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-500 dark:text-stone-400">
          Weeks
          <input type="number" min={1} max={104} value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))} className={field} required />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-500 dark:text-stone-400">
          Days per week
          <input type="number" min={1} max={7} value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Number(e.target.value))} className={field} required />
        </label>
      </div>
      {notice && (
        <p className="mt-3 rounded-md bg-accent-50 px-3 py-2 text-sm text-accent-800 dark:bg-accent-950/40 dark:text-accent-200">
          {notice}
        </p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-full bg-accent-700 px-5 text-sm font-medium text-white shadow-paper transition-colors ease-gentle hover:bg-accent-800 disabled:opacity-50"
        >
          {busy ? 'Building…' : 'Build plan'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function refLabel(d: PlanDay): string {
  const start = formatVerseId(d.verse_start).replace(/:1$/, '');
  const startBook = Math.floor(d.verse_start / 1_000_000);
  const endBook = Math.floor(d.verse_end / 1_000_000);
  const startChapter = Math.floor((d.verse_start % 1_000_000) / 1000);
  const endChapter = Math.floor((d.verse_end % 1_000_000) / 1000);
  if (startBook === endBook) {
    return startChapter === endChapter ? start : `${start}–${endChapter}`;
  }
  // A canonical-group scope (e.g. Pauline Epistles, 87 chapters over 13 books) will not divide
  // on book boundaries at any normal pace — measured: 87/24 days = 3.6 ch/day guarantees a
  // straddling day. Bare "Romans 16–1" (implying ch.16-1 of Romans) would misread as backwards;
  // name the end book explicitly.
  const endBookObj = BOOK_BY_NUM.get(endBook);
  return `${start}–${endBookObj ? endBookObj.name : '?'} ${endChapter}`;
}

function readerHref(d: PlanDay): string {
  const book = BOOK_BY_NUM.get(Math.floor(d.verse_start / 1_000_000));
  const chapter = Math.floor((d.verse_start % 1_000_000) / 1000);
  return book ? `/read/${book.slug}/${chapter}` : '/read/jhn/1';
}

function PlanDetail({ open, onBack, onChanged }: { open: OpenPlan; onBack: () => void; onChanged: () => void }) {
  const [busyDay, setBusyDay] = useState<number | null>(null);

  const toggle = async (d: PlanDay) => {
    setBusyDay(d.day_index);
    try {
      await fetch(`/api/plans/${open.plan.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'day', dayIndex: d.day_index, completed: !d.completed_at }),
      });
      onChanged();
    } finally {
      setBusyDay(null);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this plan? Its reading history goes with it.')) return;
    await fetch(`/api/plans/${open.plan.id}`, { method: 'DELETE' });
    onBack();
  };

  // Topical plans carry labeled readings per day (plan_day_readings, 042);
  // book/collection plans have none and render the single day range.
  const readingsByDay = new Map<number, PlanReading[]>();
  for (const r of open.readings ?? []) {
    (readingsByDay.get(r.day_index) ?? readingsByDay.set(r.day_index, []).get(r.day_index)!).push(r);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex min-h-[44px] items-center text-sm text-accent-700 hover:text-accent-800 dark:text-accent-300">
          ← All plans
        </button>
        <button onClick={remove} className="inline-flex min-h-[44px] items-center text-xs text-stone-400 hover:text-accent-700">
          Delete plan
        </button>
      </div>
      <h2 className="font-display text-2xl text-stone-800 dark:text-stone-100">{open.plan.title}</h2>
      <ol className="mt-4 space-y-1.5">
        {open.days.map((d) => {
          const readings = readingsByDay.get(d.day_index);
          return (
            <li key={d.day_index} className="rounded-lg bg-stone-100/60 px-3 py-2 dark:bg-stone-800/40">
              <div className="flex min-h-[44px] items-center gap-3">
                <button
                  onClick={() => void toggle(d)}
                  disabled={busyDay === d.day_index}
                  aria-label={d.completed_at ? `Mark day ${d.day_index} unread` : `Mark day ${d.day_index} read`}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ease-gentle ${
                    d.completed_at
                      ? 'border-accent-700 bg-accent-700 text-white'
                      : 'border-stone-300 text-transparent hover:border-accent-400 dark:border-stone-600'
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <span className="w-24 shrink-0 text-xs text-stone-400">{d.day_date}</span>
                {readings ? (
                  <span className={`flex-1 truncate text-sm font-medium ${d.completed_at ? 'text-stone-400 line-through' : 'text-stone-700 dark:text-stone-200'}`}>
                    {readings.length} passage{readings.length === 1 ? '' : 's'}
                  </span>
                ) : (
                  <Link
                    href={readerHref(d)}
                    className={`flex-1 truncate text-sm font-medium ${
                      d.completed_at ? 'text-stone-400 line-through' : 'text-stone-700 hover:text-accent-700 dark:text-stone-200'
                    }`}
                  >
                    {refLabel(d)}
                  </Link>
                )}
              </div>
              {readings && (
                <ul className="mt-1 space-y-0.5 pl-9">
                  {readings.map((r) => (
                    <li key={r.ordinal} className="flex items-baseline gap-2 text-sm">
                      <Link
                        href={readingHref(r)}
                        className={`shrink-0 font-medium ${d.completed_at ? 'text-stone-400' : 'text-stone-700 hover:text-accent-700 dark:text-stone-200'}`}
                      >
                        {readingLabel(r)}
                      </Link>
                      {r.label && <span className="truncate text-xs text-stone-400">{r.label}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function readingLabel(r: PlanReading): string {
  const start = formatVerseId(r.verse_start);
  if (r.verse_end === r.verse_start) return start;
  // Same chapter → "John 3:16-18"; otherwise both ends in full.
  const sameChapter = Math.floor(r.verse_start / 1000) === Math.floor(r.verse_end / 1000);
  return sameChapter ? `${start}-${r.verse_end % 1000}` : `${start}–${formatVerseId(r.verse_end)}`;
}

function readingHref(r: PlanReading): string {
  const book = BOOK_BY_NUM.get(Math.floor(r.verse_start / 1_000_000));
  const chapter = Math.floor((r.verse_start % 1_000_000) / 1000);
  return book ? `/read/${book.slug}/${chapter}` : '/read/jhn/1';
}
