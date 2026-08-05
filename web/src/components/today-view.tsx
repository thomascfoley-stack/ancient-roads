'use client';

// The "Today" home screen (build task §5/§6). Client-side ON PURPOSE: the day + AM/PM must key
// off the user's LOCAL clock (a server renders in UTC), and it reuses the reader's client-only
// fetchCommentary/EntryCard. It shows ONE thing: today's Spurgeon devotional + the grounded
// corpus voices on its verse. No streaks, no badges, no notifications (§6) — a quiet morning.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchCommentary } from '@/lib/bible';
import { EntryCard } from '@/components/commentary-panel';
import { resolveToday, type TodayCard, type DevotionalData } from '@/lib/today';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; card: TodayCard };

export function TodayView() {
  const [state, setState] = useState<State>({ status: 'loading' });

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
    return () => {
      live = false;
    };
  }, []);

  // NB: a plain <div>, not <main> — the app-shell already provides the <main> landmark and the
  // scroll container (with bottom-nav padding); nesting a second <main> is invalid HTML.
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-12 sm:px-8 sm:py-16">
      {state.status === 'loading' && (
        <p className="mt-24 text-center font-serif text-base italic text-stone-400 dark:text-stone-500">
          Opening today&rsquo;s page&hellip;
        </p>
      )}

      {state.status === 'error' && (
        <div className="mt-24 text-center">
          <p className="font-serif text-base leading-relaxed text-stone-600 dark:text-stone-300">
            Today&rsquo;s reading could not be opened. The Scriptures are still there to search.
          </p>
          <Link
            href="/read/jhn/1"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-paper px-5 text-sm font-semibold text-stone-800 shadow-paper transition-colors hover:text-accent-800 dark:bg-stone-800 dark:text-stone-200"
          >
            Open the Word
          </Link>
        </div>
      )}

      {state.status === 'ready' && <ReadyCard card={state.card} />}
    </div>
  );
}

function ReadyCard({ card }: { card: TodayCard }) {
  const half = card.half === 'am' ? 'Morning' : 'Evening';
  // Spurgeon's body carries verbatim newlines: blank line = paragraph, single newline = poetry line.
  const paragraphs = card.lead.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <article>
      {/* Gentle date header — the ONLY words the app authors (§4). */}
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500 dark:text-stone-400">
          {half} &middot; {card.dateLabel}
        </p>
        <h1 className="mt-3 font-display text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100">
          {card.lead.refDisplay}
        </h1>
      </header>

      {/* The anchor verse (Spurgeon's KJV quotation, verbatim). */}
      <blockquote className="mt-8 border-l-2 border-accent-700/40 pl-5 font-scripture text-lg leading-relaxed text-stone-800 dark:border-accent-500/40 dark:text-stone-100">
        {card.lead.verseText}
      </blockquote>

      {/* Spurgeon's devotional, verbatim + attributed. */}
      <div className="mt-8 space-y-4 font-serif text-lg leading-relaxed text-stone-700 dark:text-stone-300">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line break-words">
            {p}
          </p>
        ))}
      </div>
      <p className="mt-6 font-display text-base italic text-stone-500 dark:text-stone-400">
        {card.lead.attribution}
      </p>

      {/* The grounded corpus voices on this passage. A pointer, never a verdict. */}
      {card.voices.length > 0 && (
        <section className="mt-14">
          <div aria-hidden className="mx-auto mb-10 h-px w-16 bg-stone-400/50" />
          <h2 className="font-scripture text-lg font-semibold text-stone-800 dark:text-stone-100">
            How the church has read {card.lead.refDisplay}
          </h2>
          <p className="mt-1.5 font-serif text-sm leading-relaxed text-stone-500 dark:text-stone-400">
            Weigh them together, then wrestle and pray it through yourself.
          </p>
          <div className="mt-5 space-y-3">
            {card.voices.map((v, i) => (
              <EntryCard key={`${v.author}-${v.verseStart}-${i}`} entry={v} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-14 flex flex-wrap gap-3">
        <Link
          href={`/read/${card.bookSlug}/${card.chapter}`}
          className="inline-flex min-h-[48px] items-center rounded-lg bg-accent-700 px-6 text-base font-semibold text-stone-50 shadow-float transition-colors hover:bg-accent-800 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Read {card.lead.refDisplay} in full
        </Link>
      </div>
    </article>
  );
}
