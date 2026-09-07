'use client';

// The "Today" home screen — now the DAILY OFFICE (dossier Sprint 1). Client-side ON PURPOSE:
// the day + AM/PM must key off the user's LOCAL clock (a server renders in UTC), and it reuses
// the reader's client-only fetchCommentary/EntryCard. The office COMPOSES three things the
// product already holds, and authors none of them: Bagster's Daily Light for the date (the
// tradition's own verse chain), the reader's plan day that is due (arithmetic), and Spurgeon's
// Morning & Evening with its grounded corpus voices (the existing Today). No streaks, no
// badges, no notifications (§6) — a quiet morning, twice a day.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { verseHref } from '@/lib/verse-link';
import { fetchCommentary } from '@/lib/bible';
import { EntryCard } from '@/components/commentary-panel';
import { refOf } from '@/lib/plan/day-ref';
import { resolveToday, mmddOf, halfOf, type TodayCard, type DevotionalData } from '@/lib/today';

// Daily Light: date-keyed verbatim entries exported by scripts/export-daily-light.mjs —
// the same static off-request-path pattern as morning-evening.json. `refs` is the
// compiler's own trailing citation list, split out so citations render AS citations.
interface OfficeReading { title: string; body: string; refs: string; attribution: string }
type OfficeData = Record<string, { am?: OfficeReading; pm?: OfficeReading }>;

// The caller's plans, from GET /api/plans (already carries the next unread day).
interface PlanDue {
  id: string;
  title: string;
  total_days: number;
  next_day_index: number | null;
  next_day_date: string | null;
  next_verse_start: number | null;
  next_verse_end: number | null;
}

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; card: TodayCard };

// How long the office waits for the devotional before admitting it did not arrive. The load had
// NO bound at all: a request that is accepted and never answered (a hung CDN edge, a captive
// portal) left this screen on "Opening today's page…" forever, with no error and no retry — a
// reader cannot tell a slow morning from a broken one. Short, because this is a UI wait: a reader
// looking at a blank morning should be told inside a few seconds, not a minute.
const OFFICE_TIMEOUT_MS = 15_000;

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TodayView() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [office, setOffice] = useState<OfficeReading | null>(null);
  const [duePlan, setDuePlan] = useState<PlanDue | null>(null);

  useEffect(() => {
    let live = true;
    // ONE clock for the whole office. Two independent `new Date()` reads straddling
    // the local noon boundary made Spurgeon's half and Daily Light's half disagree —
    // a false provenance label over the wrong reading. One instant, every consumer.
    const now = new Date();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const load = async (): Promise<TodayCard | null> => {
        // ONE DAY, NOT THE YEAR. This was `/devotional/morning-evening.json` — the whole 1.42 MB
        // calendar, of which this screen renders 4,056 bytes (0.27%). With Daily Light's 0.82 MB
        // below, /home paid 2.24 MB of fixed transfer before the commentary chapter (p50 0.99 MB,
        // p90 3.08 MB, 9.15 MB on the five Psalm-119 days) was added on top. The day files are a
        // build-time shard of the same export — scripts/split-devotional-by-day.mjs — in the
        // shape the corpus already uses for `/commentaries/<slug>/<chapter>.json`.
        // (Merged 2026-09-07 with the bounded fetch below — two sweeps, one line.)
        const res = await fetch(`/devotional/morning-evening/${mmddOf(now)}.json`, {
          // Releases the socket rather than leaving it half-open; the race below is what
          // guarantees the STATE moves on, since a stalled read may never reject.
          signal: AbortSignal.timeout(OFFICE_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`devotional ${res.status}`);
        // resolveToday still takes the year-shaped map and looks up mmddOf(date) inside it, so
        // the day file is handed over under its own key. today.ts is untouched by this change.
        const data = { [mmddOf(now)]: await res.json() } as DevotionalData;
        // Voices come from the reader's own loader (already license-filtered); today.ts
        // re-filters + grounds them to the passage. Local date/time decides which entry.
        return resolveToday(now, data, (slug, ch) =>
          fetchCommentary(slug, ch).then((d) => d?.entries ?? []),
        );
      };
      // The deadline covers the WHOLE load, not just the fetch: resolveToday goes on to pull
      // commentary, so bounding the JSON alone would leave the same hang one call later.
      const timeout = new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error('devotional load timed out')), OFFICE_TIMEOUT_MS);
      });
      try {
        const card = await Promise.race([load(), timeout]);
        if (!live) return;
        setState(card ? { status: 'ready', card } : { status: 'error' });
      } catch {
        // Timed out or failed — either way the reader is told, and the error state below offers
        // the Word. The two other office loads degrade to absence independently and are untouched.
        if (live) setState({ status: 'error' });
      } finally {
        clearTimeout(deadline);
      }
    })();
    // The office pieces degrade INDEPENDENTLY to absence: a missing file or a
    // signed-out 401 must never cost the reader the rest of the page — in either
    // direction (Spurgeon failing must not take Daily Light or the plan card down;
    // the render below composes from whatever loaded).
    (async () => {
      try {
        // Day-scoped for the same reason as Spurgeon above, and STILL ITS OWN FILE: this loader
        // degrades independently of the one above, and a shared file would couple the failures.
        const res = await fetch(`/devotional/daily-light/${mmddOf(now)}.json`);
        if (!res.ok) return;
        const day = (await res.json()) as OfficeData[string];
        const entry = day?.[halfOf(now)] ?? day?.am ?? day?.pm ?? null;
        if (live && entry) setOffice(entry);
      } catch {
        /* absent, not broken */
      }
    })();
    (async () => {
      try {
        const res = await fetch('/api/plans');
        if (!res.ok) return; // 401 signed-out included
        const { plans } = (await res.json()) as { plans: PlanDue[] };
        // DUE means due: next unread day dated today or earlier. A plan starting
        // next month is not "Your reading" this morning — it renders nothing here.
        const today = localToday();
        const due = plans.filter((p) => p.next_day_index !== null && p.next_day_date !== null && p.next_day_date <= today);
        // The most overdue plan first; ties by earliest date. One card, not a list.
        due.sort((a, b) => (a.next_day_date! < b.next_day_date! ? -1 : a.next_day_date! > b.next_day_date! ? 1 : 0));
        if (live && due[0]) setDuePlan(due[0]);
      } catch {
        /* absent, not broken */
      }
    })();
    return () => {
      live = false;
      clearTimeout(deadline);
    };
  }, []);

  // NB: a plain <div>, not <main> — the app-shell already provides the <main> landmark and the
  // scroll container (with bottom-nav padding); nesting a second <main> is invalid HTML.
  // The page composes from WHATEVER loaded — degradation runs in both directions.
  // Spurgeon failing must not take down Daily Light or the reader's own plan card,
  // and vice versa. The full error screen appears only when nothing at all loaded.
  const anyExtra = office !== null || duePlan !== null;

  return (
    // One quiet centered column at the reader's measure — no card chrome (PRD §3/§5:
    // hairlines and whitespace carry separation; the parchment page IS the surface). Was a
    // hardcoded 66ch; it follows `.reading-measure` now (owner direction 2026-08-12), the
    // same control as every other reading surface.
    <div className="reading-measure mx-auto my-12 w-full px-6 sm:my-20">
      {state.status === 'loading' && !anyExtra && (
        <p className="mt-24 text-center font-scripture text-lg italic text-stone-500 dark:text-stone-400">
          Opening today&rsquo;s page&hellip;
        </p>
      )}

      {state.status === 'error' && !anyExtra && (
        <div className="mt-24 text-center">
          <p className="font-scripture text-lg leading-[1.9] text-stone-900 dark:text-stone-100">
            Today&rsquo;s reading could not be opened. The Scriptures are still there to search.
          </p>
          <Link
            href="/read/jhn/1"
            className="mt-8 inline-flex min-h-[44px] items-center border border-stone-900 px-6 py-3 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
          >
            Open the Word
          </Link>
        </div>
      )}

      {(state.status === 'ready' || anyExtra) && (
        <ReadyCard
          card={state.status === 'ready' ? state.card : null}
          spurgeonFailed={state.status === 'error'}
          office={office}
          duePlan={duePlan}
        />
      )}
    </div>
  );
}

// The plan's due day, one quiet card: what is due, how far along, one link. The
// plan must live in the room the reader is already in — not a room they must
// remember to visit (dossier Sprint 2 item 4, pulled into Sprint 1 with the URL).
function PlanDueCard({ plan }: { plan: PlanDue }) {
  if (plan.next_day_index === null || plan.next_verse_start === null || plan.next_verse_end === null) return null;
  // Same threshold as the plan page's catch-up card (>= 2 days): one day behind
  // is "due now", and a hint there would nag — plans-client.tsx documents why.
  const behind = (() => {
    if (plan.next_day_date === null) return false;
    const [y, m, d] = plan.next_day_date.split('-').map(Number) as [number, number, number];
    const [ty, tm, td] = localToday().split('-').map(Number) as [number, number, number];
    return (Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86_400_000 >= 2;
  })();
  return (
    <div className="mt-14 border edge bg-paper px-5 py-4 dark:bg-stone-900">
      <p className="break-words text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
        Your reading · Day {plan.next_day_index} of {plan.total_days} · {plan.title}
      </p>
      <p className="mt-1 font-scripture text-xl text-stone-900 dark:text-stone-100">
        {refOf(plan.next_verse_start, plan.next_verse_end)}
      </p>
      <div className="mt-2 flex items-center gap-4">
        <Link
          href={`/plans/${plan.id}`}
          className="inline-flex min-h-[44px] items-center border border-stone-900 px-4 font-sans text-xs font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Open the plan
        </Link>
        {behind && (
          <span className="font-sans text-xs text-stone-500 dark:text-stone-400">
            A few days behind — the plan can move with you.
          </span>
        )}
      </div>
    </div>
  );
}

function ReadyCard({ card, spurgeonFailed, office, duePlan }: {
  card: TodayCard | null;
  spurgeonFailed: boolean;
  office: OfficeReading | null;
  duePlan: PlanDue | null;
}) {
  // The office's own title ("August 21 — Morning") is authoritative for ITS label —
  // never Spurgeon's half, which is picked independently and can disagree across a
  // fallback. The page header prefers Spurgeon's dateLabel (weekday included) and
  // falls back to the office title's own date half.
  const officeHalf = office ? (office.title.endsWith('Morning') ? 'Morning' : 'Evening') : null;
  const headerHalf = card ? (card.half === 'am' ? 'Morning' : 'Evening') : officeHalf;
  const headerDate = card ? card.dateLabel : office ? office.title.split(/\s*—\s*/)[0] : null;
  // Spurgeon's body carries verbatim newlines: blank line = paragraph, single newline = poetry line.
  const paragraphs = card ? card.lead.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [];

  return (
    <article>
      {/* Gentle date header — the ONLY words the app authors (§4). PRD §5 Home:
          small-caps date over a short vellum hairline. With the office composed
          above Spurgeon's page, the HOUR is the title ("Morning"), and his
          reference heads its own section below. */}
      {headerHalf && (
        <header className="text-center">
          <p className="font-display text-sm tracking-[0.3em] text-stone-500 [font-variant:all-small-caps] dark:text-stone-400">
            {headerDate}
          </p>
          <div aria-hidden className="mx-auto mt-5 h-px w-[120px] bg-stone-200 dark:bg-stone-800" />
          <h1 className="mt-8 font-display text-4xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
            {headerHalf}
          </h1>
        </header>
      )}

      {/* Bagster's Daily Light for this date — the compiler's own verse chain,
          verbatim and attributed, with his citation list rendered AS citations.
          Rendered before Spurgeon: the office opens with Scripture answering
          Scripture. (The source's portion boundaries beyond its printed dashes
          were flattened at ingest — see scripts/export-daily-light.mjs.) */}
      {office && (
        <section className="mt-14">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
            Daily Light &middot; {officeHalf}
          </h2>
          <p className="mt-4 font-scripture text-lg leading-[1.9] text-stone-900 dark:text-stone-100">
            {office.body}
          </p>
          <p className="mt-3 font-sans text-xs leading-relaxed text-stone-500 dark:text-stone-400">
            {office.refs}
          </p>
          <p className="mt-1 font-sans text-xs text-stone-500 dark:text-stone-400">{office.attribution}</p>
        </section>
      )}

      {duePlan && <PlanDueCard plan={duePlan} />}

      {/* Spurgeon failing is a quiet line, not a page-wide error — the office and
          the reader's plan stand on their own. */}
      {spurgeonFailed && (
        <p className="mt-16 border-t edge pt-10 text-center font-sans text-sm text-stone-500 dark:text-stone-400">
          Spurgeon&rsquo;s page could not be opened just now.
        </p>
      )}

      {card && (
        <>
      {/* Spurgeon's page: his reference heads the section, attribution beneath. */}
      <div className="mt-16 border-t edge pt-12 text-center">
        <h2 className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
          {card.lead.refDisplay}
        </h2>
        <p className="mt-4 font-scripture text-lg italic leading-relaxed text-stone-500 dark:text-stone-400">
          {card.lead.attribution}
        </p>
      </div>

      {/* The anchor verse (Spurgeon's KJV quotation, verbatim): 3px antique-gold
          rule, 18px Literata at the PRD's 1.9 reading leading. */}
      <blockquote className="mt-16 border-l-[3px] border-accent-600 py-2 pl-8 font-scripture text-lg leading-[1.9] text-stone-900 dark:border-accent-400 dark:text-stone-100">
        {card.lead.verseText}
      </blockquote>

      {/* Spurgeon's devotional, verbatim. Attribution sits in the header above. */}
      <div className="mt-12 space-y-4 font-scripture text-lg leading-[1.9] text-stone-900 dark:text-stone-100">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line break-words">
            {p}
          </p>
        ))}
      </div>

      {/* The grounded corpus voices on this passage. A pointer, never a verdict. */}
      {card.voices.length > 0 && (
        <section className="mt-20">
          <h2 className="font-display text-[22px] font-medium tracking-[0.08em] text-stone-900 [font-variant:all-small-caps] dark:text-stone-100">
            How the church has read {card.lead.refDisplay}
          </h2>
          <p className="mt-2 font-scripture text-base leading-relaxed text-stone-500 dark:text-stone-400">
            Weigh them together, then wrestle and pray it through yourself.
          </p>
          {/* A vellum hairline above each entry (PRD §5); the era border + ornament
              live in EntryCard itself (commentary-panel.tsx). */}
          <div className="mt-10 space-y-12">
            {card.voices.map((v, i) => (
              <div key={`${v.author}-${v.verseStart}-${i}`} className="border-t edge pt-8">
                <EntryCard entry={v} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The PRD's hairline CTA: 1px ink border, transparent, INSTANT ink fill on
          hover (§7 — no transition on background). */}
      <div className="mt-20 border-t edge pt-12 text-center">
        <Link
          // L-12 — the label names a verse, so the link must land on it. `verseHref` is the shipped
          // helper (/library/notes, /word/[strongs], search results, the omnibox all use it); this
          // surface was hand-building `/read/<slug>/<chapter>` and dropping the anchor. Psalm
          // 119:57 landed at the top of a 176-verse chapter.
          href={verseHref(card.passage.start)}
          className="inline-flex min-h-[44px] items-center border border-stone-900 px-6 py-3 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Read {card.lead.refDisplay} in full
        </Link>
      </div>
        </>
      )}
    </article>
  );
}
