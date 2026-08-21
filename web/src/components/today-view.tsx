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
import { fetchCommentary } from '@/lib/bible';
import { EntryCard } from '@/components/commentary-panel';
import { refOf } from '@/lib/plan/day-ref';
import { resolveToday, mmddOf, halfOf, type TodayCard, type DevotionalData } from '@/lib/today';

// Daily Light: date-keyed verbatim entries exported by scripts/export-daily-light.mjs —
// the same static off-request-path pattern as morning-evening.json.
interface OfficeReading { title: string; body: string; attribution: string }
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
    (async () => {
      try {
        const res = await fetch('/devotional/morning-evening.json');
        if (!res.ok) throw new Error(`devotional ${res.status}`);
        const data = (await res.json()) as DevotionalData;
        // Voices come from the reader's own loader (already license-filtered); today.ts
        // re-filters + grounds them to the passage. Local date/time decides which entry.
        const card = await resolveToday(new Date(), data, (slug, ch) =>
          fetchCommentary(slug, ch).then((d) => d?.entries ?? []),
        );
        if (!live) return;
        setState(card ? { status: 'ready', card } : { status: 'error' });
      } catch {
        if (live) setState({ status: 'error' });
      }
    })();
    // The office extras degrade to absence, never to an error screen: Spurgeon's page is
    // the floor this surface has always had, and a missing file or a signed-out 401 must
    // not cost the reader their morning.
    (async () => {
      try {
        const res = await fetch('/devotional/daily-light.json');
        if (!res.ok) return;
        const data = (await res.json()) as OfficeData;
        const now = new Date();
        const day = data[mmddOf(now)];
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
        const withNext = plans.filter((p) => p.next_day_index !== null && p.next_day_date !== null);
        // The most overdue plan first; ties by earliest date. One card, not a list.
        withNext.sort((a, b) => (a.next_day_date! < b.next_day_date! ? -1 : a.next_day_date! > b.next_day_date! ? 1 : 0));
        if (live && withNext[0]) setDuePlan(withNext[0]);
      } catch {
        /* absent, not broken */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // NB: a plain <div>, not <main> — the app-shell already provides the <main> landmark and the
  // scroll container (with bottom-nav padding); nesting a second <main> is invalid HTML.
  return (
    // One quiet centered column at the reader's measure — no card chrome (PRD §3/§5:
    // hairlines and whitespace carry separation; the parchment page IS the surface). Was a
    // hardcoded 66ch; it follows `.reading-measure` now (owner direction 2026-08-12), the
    // same control as every other reading surface.
    <div className="reading-measure mx-auto my-12 w-full px-6 sm:my-20">
      {state.status === 'loading' && (
        <p className="mt-24 text-center font-scripture text-lg italic text-stone-500 dark:text-stone-400">
          Opening today&rsquo;s page&hellip;
        </p>
      )}

      {state.status === 'error' && (
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

      {state.status === 'ready' && <ReadyCard card={state.card} office={office} duePlan={duePlan} />}
    </div>
  );
}

// The plan's due day, one quiet card: what is due, how far along, one link. The
// plan must live in the room the reader is already in — not a room they must
// remember to visit (dossier Sprint 2 item 4, pulled into Sprint 1 with the URL).
function PlanDueCard({ plan }: { plan: PlanDue }) {
  if (plan.next_day_index === null || plan.next_verse_start === null || plan.next_verse_end === null) return null;
  const behind = plan.next_day_date !== null && plan.next_day_date < localToday();
  return (
    <div className="mt-14 border edge bg-paper px-5 py-4 dark:bg-stone-900">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
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

function ReadyCard({ card, office, duePlan }: { card: TodayCard; office: OfficeReading | null; duePlan: PlanDue | null }) {
  const half = card.half === 'am' ? 'Morning' : 'Evening';
  // Spurgeon's body carries verbatim newlines: blank line = paragraph, single newline = poetry line.
  const paragraphs = card.lead.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <article>
      {/* Gentle date header — the ONLY words the app authors (§4). PRD §5 Home:
          small-caps date over a short vellum hairline. With the office composed
          above Spurgeon's page, the HOUR is the title ("Morning"), and his
          reference heads its own section below. */}
      <header className="text-center">
        <p className="font-display text-sm tracking-[0.3em] text-stone-500 [font-variant:all-small-caps] dark:text-stone-400">
          {card.dateLabel}
        </p>
        <div aria-hidden className="mx-auto mt-5 h-px w-[120px] bg-stone-200 dark:bg-stone-800" />
        <h1 className="mt-8 font-display text-4xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
          {half}
        </h1>
      </header>

      {/* Bagster's Daily Light for this date — the tradition's own verse chain,
          verbatim and attributed, nothing added between the verses. Rendered
          before Spurgeon: the office opens with Scripture answering Scripture. */}
      {office && (
        <section className="mt-14">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
            Daily Light &middot; {half}
          </h2>
          <p className="mt-4 font-scripture text-lg leading-[1.9] text-stone-900 dark:text-stone-100">
            {office.body}
          </p>
          <p className="mt-3 font-sans text-xs text-stone-500 dark:text-stone-400">{office.attribution}</p>
        </section>
      )}

      {duePlan && <PlanDueCard plan={duePlan} />}

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
          href={`/read/${card.bookSlug}/${card.chapter}`}
          className="inline-flex min-h-[44px] items-center border border-stone-900 px-6 py-3 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Read {card.lead.refDisplay} in full
        </Link>
      </div>
    </article>
  );
}
