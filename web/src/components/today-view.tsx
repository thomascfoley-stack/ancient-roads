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
      {/* Gentle date header — the ONLY words the app authors (§4). PRD §5 Home:
          small-caps date over a short vellum hairline, then the reference as the
          display title. Spurgeon's entries carry no title of their own, so the
          reference IS the title and the lection line carries the attribution. */}
      <header className="text-center">
        <p className="font-display text-sm tracking-[0.3em] text-stone-500 [font-variant:all-small-caps] dark:text-stone-400">
          {half} &middot; {card.dateLabel}
        </p>
        <div aria-hidden className="mx-auto mt-5 h-px w-[120px] bg-stone-200 dark:bg-stone-800" />
        <h1 className="mt-8 font-display text-4xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
          {card.lead.refDisplay}
        </h1>
        <p className="mt-4 font-scripture text-lg italic leading-relaxed text-stone-500 dark:text-stone-400">
          {card.lead.attribution}
        </p>
      </header>

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
