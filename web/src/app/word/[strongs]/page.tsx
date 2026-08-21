'use client';

// OPTION D — the word as a destination (owner ruling 2026-08-21: "…then D"; design canvas
// "Behind the Word"). A deep-linkable page for ONE original word: the Strong's entry in full,
// its morphology-free senses, and the complete concordance — every verse that carries it, each
// one a link. This is the concordance stance applied to a single word, and it is also the
// "reference-pane UX" the ruling holding the five lexicon works staged has been waiting for
// (docs/DECISIONS.md: "Lexicons stay staged until the reference-pane UX ships") — so the page
// NAMES those works as coming, and nothing more: a roadmap fact, never a control that 404s.
//
// Everything here is static-asset data (/lexicon/*.json, /concordance/*) — public, cacheable,
// signed-out friendly, exactly like the reader surfaces that link in.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { fetchLexEntry, type LexEntry } from '@/lib/original';
import type { WordArticle } from '@/lib/word-articles';
import { ConcordanceList } from '@/components/concordance-list';
import { formatVerseId } from '@bible/verse-id';
import { verseHref } from '@/lib/verse-link';

/** BDB headings carry openscriptures internal codes ("H5867 עֵילָם [p.cj.ai]") — display noise,
 *  stripped from the SHOWN heading only; the stored row is untouched. */
const displayHeading = (h: string): string => h.replace(/\s*\[[a-z0-9.]+\]\s*$/i, '');

/** One reference-shelf article: attribution header, heading, body (long ones clamp). */
function ArticleCard({ article }: { article: WordArticle }) {
  const [expanded, setExpanded] = useState(false);
  const long = article.body.length > 1200;
  const shown = long && !expanded ? `${article.body.slice(0, 1200)}…` : article.body;
  return (
    <article className="border edge p-4">
      <p className="text-micro font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
        {article.work.author ?? 'Unattributed'} — {article.work.title}
      </p>
      <p className="mt-1.5 font-scripture text-lg text-stone-900 dark:text-stone-100">{displayHeading(article.heading)}</p>
      <p className="mt-2 whitespace-pre-line font-scripture text-[15px] leading-relaxed text-stone-800 dark:text-stone-200">{shown}</p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm text-stone-600 underline transition-colors ease-gentle hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300"
        >
          {expanded ? 'Show less' : 'Read the whole entry'}
        </button>
      )}
    </article>
  );
}

/** G1–G5624 / H1–H8674 — anything else is not a Strong's key. Case folds: links must not care. */
function normalizeStrongs(raw: string | undefined): string | null {
  const m = /^([GHgh])(\d{1,4})$/.exec(raw ?? '');
  return m ? `${m[1]!.toUpperCase()}${parseInt(m[2]!, 10)}` : null;
}

export default function WordPage() {
  const params = useParams<{ strongs: string }>();
  const search = useSearchParams();
  const strongs = normalizeStrongs(params.strongs);
  const lang: 'hebrew' | 'greek' | null = strongs ? (strongs[0] === 'H' ? 'hebrew' : 'greek') : null;

  // `from` is the verse a reader arrived from (a numeric verse id) — renders the way back.
  const fromId = (() => {
    const n = Number(search.get('from'));
    return Number.isInteger(n) && n > 0 ? n : null;
  })();

  const [entry, setEntry] = useState<LexEntry | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'unavailable'>('loading');
  // The reference shelf: articles from PUBLISHED lexicon works, DB-gated behind the owner's
  // flip. Empty (or a failed fetch) renders nothing new — the roadmap strip stays instead.
  const [articles, setArticles] = useState<WordArticle[]>([]);

  useEffect(() => {
    if (!strongs) return;
    let cancelled = false;
    fetch(`/api/word/${strongs}/articles`)
      .then(async (r) => (r.ok ? ((await r.json()) as { articles?: WordArticle[] }) : null))
      .then((d) => {
        if (!cancelled) setArticles(Array.isArray(d?.articles) ? d.articles : []);
      })
      .catch(() => {
        /* the strip stays; the shelf simply doesn't render */
      });
    return () => {
      cancelled = true;
    };
  }, [strongs]);

  useEffect(() => {
    if (!strongs) return;
    let cancelled = false;
    fetchLexEntry(strongs).then((e) => {
      if (cancelled) return;
      if (e === 'unavailable') setState('unavailable');
      else if (e === null) setState('missing');
      else {
        setEntry(e);
        setState('ready');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [strongs]);

  if (!strongs || !lang) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="mb-2 font-scripture text-xl text-stone-700 dark:text-stone-200">
          That isn&rsquo;t a Strong&rsquo;s number.
        </p>
        <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">
          A word page looks like <span className="font-semibold">/word/G2316</span> (Greek) or{' '}
          <span className="font-semibold">/word/H430</span> (Hebrew).
        </p>
        <Link
          href="/library/word-study"
          className="inline-flex min-h-[44px] items-center border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Search the dictionary
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-24 pt-8">
      <nav className="mb-6 flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
        {fromId ? (
          <Link href={verseHref(fromId)} className="underline hover:text-accent-700 dark:hover:text-accent-300">
            &larr; {formatVerseId(fromId)}
          </Link>
        ) : (
          <Link href="/library/word-study" className="underline hover:text-accent-700 dark:hover:text-accent-300">
            &larr; Word study
          </Link>
        )}
      </nav>

      {state === 'loading' && (
        <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">Looking up {strongs}…</p>
      )}
      {state === 'unavailable' && (
        <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">
          The lexicon is unavailable right now; {strongs} can&rsquo;t be shown.
        </p>
      )}
      {state === 'missing' && (
        <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">
          No dictionary entry is linked to {strongs}.
        </p>
      )}

      {state === 'ready' && entry && (
        <>
          <header className="border-b edge pb-5">
            <div className="flex items-baseline justify-between gap-4">
              <h1
                dir={lang === 'hebrew' ? 'rtl' : 'ltr'}
                lang={lang === 'hebrew' ? 'he' : 'el'}
                className="min-w-0 break-words font-scripture text-5xl text-stone-900 dark:text-stone-100"
              >
                {entry.lemma}
              </h1>
              <span className="shrink-0 bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                {strongs}
              </span>
            </div>
            <p className="mt-2 text-base text-stone-500 dark:text-stone-400">
              <i>{entry.translit}</i>
              {entry.pron && <span> · {entry.pron}</span>}
            </p>
            <p className="mt-1 text-micro uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
              {lang === 'hebrew' ? 'Hebrew' : 'Greek'}
            </p>
          </header>

          <div className="mt-6 space-y-5">
            {entry.def && (
              <section>
                <h2 className="mb-1 text-micro font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
                  Definition · Strong&rsquo;s 1890
                </h2>
                <p className="font-scripture text-lg leading-relaxed text-stone-800 dark:text-stone-200">{entry.def}</p>
              </section>
            )}
            {entry.kjv && (
              <section>
                <h2 className="mb-1 text-micro font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
                  KJV renders it
                </h2>
                <p className="text-sm text-stone-700 dark:text-stone-300">{entry.kjv}</p>
              </section>
            )}
            {entry.derivation && (
              <section>
                <h2 className="mb-1 text-micro font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
                  Derivation
                </h2>
                <p className="text-sm text-stone-700 dark:text-stone-300">{entry.derivation}</p>
              </section>
            )}

            <section className="border-t edge pt-5">
              <h2 className="mb-2 text-micro font-semibold uppercase tracking-[0.08em] text-accent-600 dark:text-accent-400">
                Every verse · the concordance
              </h2>
              <ConcordanceList strong={strongs} minCount={1} />
            </section>

            {/* THE REFERENCE SHELF — published lexicon works' articles for this key, quoted and
                attributed. DB-gated: the owner's flip lights it, quarantine darkens it. The
                roadmap strip below renders ONLY while nothing has come back — never both, and
                no hand-maintained list of what is "missing" (the watchlist class). */}
            {articles.length > 0 ? (
              <section className="border-t edge pt-5">
                <h2 className="mb-2 text-micro font-semibold uppercase tracking-[0.08em] text-accent-600 dark:text-accent-400">
                  From the reference shelf
                </h2>
                <div className="space-y-3">
                  {articles.map((a) => (
                    <ArticleCard key={`${a.work.slug}:${a.ordinal}`} article={a} />
                  ))}
                </div>
              </section>
            ) : (
              <section className="border-t edge pt-5">
                <h2 className="mb-1 text-micro font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
                  Deeper entries · coming to this page
                </h2>
                <p className="text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                  Full reference articles from{' '}
                  <span className="text-stone-700 dark:text-stone-300">BDB · ISBE · Smith&rsquo;s · Easton&rsquo;s · Nave&rsquo;s</span>{' '}
                  — quoted and attributed, never summarized.
                </p>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
