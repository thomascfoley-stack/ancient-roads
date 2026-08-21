'use client';
// History results — HISTORY_RETRIEVAL_DESIGN §5 stages 2-4. Every visible string is a fixed
// template or a verbatim excerpt; there is deliberately NO generated prose block anywhere.
//
// Styling is the app's token set (order 2026-08-20-historians-study-entrance): this surface
// shipped on `rounded border` + `text-muted-foreground`, neither of which is this app's
// vocabulary — `rounded` is not on the zeroed radius ladder (so it alone painted corners the
// PRD bans) and no `--color-muted-foreground` token exists (so that class styled nothing).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { DISPLAY_LOCALE } from '@/lib/locale';

export interface HistoryResultRow {
  sectionId: number; ordinal: number; headingPath: string[];
  period: [number, number] | null; excerpt: string;
  matched: ('entity' | 'period' | 'text')[];
}
export interface HistoryPayload {
  interpretation: { entities: { slug: string; label: string }[]; period: { start: number; end: number } | null };
  closest: (HistoryResultRow & { work: { slug: string; title: string; author: string } }) | null;
  results: { work: { slug: string; title: string; author: string }; periodSpan: [number, number] | null; sections: HistoryResultRow[] }[];
  coverage: { works: number; sections: number };
}

const era = (y: number): string => (y < 0 ? `${-y} B.C.` : `A.D. ${y}`);
const periodBadge = (p: [number, number] | null): string | null =>
  p ? (p[0] === p[1] ? era(p[0]) : `${era(p[0])}–${era(p[1])}`) : null;
const century = (p: [number, number] | null): number | null =>
  p ? Math.ceil(((p[0] + p[1]) / 2) / 100) : null;

// `fq` beside `from=hist:` is what lets the reader's return strip name the study — see
// HistoryContextBar. Same URL, no extra fetch, and links minted without it still work.
function workHref(slug: string, ordinal: number, threadId: string | null, query: string): string {
  const params = threadId ? `?from=hist:${threadId}&fq=${encodeURIComponent(query)}` : '';
  return `/work/${slug}${params}#s${ordinal}`;
}

const CHIP = 'inline-flex min-h-[30px] items-center border px-2.5 text-xs transition-colors ease-gentle';
const CHIP_ON = 'border-accent-400 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-200';
const CHIP_OFF = 'edge text-stone-600 hover:bg-accent-50/50 dark:text-stone-400 dark:hover:bg-accent-950/20';

export function HistoryResults({ data, query, threadId }: {
  data: HistoryPayload; query: string; threadId: string | null;
}): React.ReactElement {
  const [offEntities, setOffEntities] = useState<Set<string>>(new Set());
  const [bucket, setBucket] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<number | null>(null);

  const filtering = offEntities.size > 0 || bucket !== null;
  const groups = useMemo(() => data.results.map((g) => ({
    ...g,
    sections: g.sections.filter((s) => {
      if (bucket !== null && century(s.period) !== bucket) return false;
      // an OFF entity chip removes sections whose ONLY match reason is entity — least surprising
      if (offEntities.size && s.matched.length === 1 && s.matched[0] === 'entity') return false;
      return true;
    }),
  })).filter((g) => g.sections.length > 0), [data.results, offEntities, bucket]);

  const buckets = useMemo(() => {
    const m = new Map<number, number>();
    for (const g of data.results) for (const s of g.sections) {
      const c = century(s.period);
      if (c !== null) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [data.results]);

  const cite = async (r: HistoryResultRow, work: { title: string; author: string }): Promise<void> => {
    // Only confirm a copy that happened. navigator.clipboard is undefined on a non-secure context
    // and rejects when the document is unfocused or permission is denied; flashing ✓ regardless is
    // a false confirmation on an attribution control — the wrong direction for this product
    // (deep-audit client finding 7).
    try {
      await navigator.clipboard.writeText(`${work.author}, ${work.title}, ${r.headingPath.join(' — ')} (CCEL)`);
      setCopied(r.sectionId);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* no confirmation: the reader still has the citation visible on screen to copy by hand */
    }
  };

  const noMatchLine = data.interpretation.entities.length === 0 && data.interpretation.period === null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="min-w-0 break-words font-display text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-100">&ldquo;{query}&rdquo;</h1>
        <Link href="/ask?mode=history" className="shrink-0 text-sm text-stone-600 underline transition-colors ease-gentle hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300">New study</Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-500 dark:text-stone-400">Matched:</span>
        {noMatchLine ? (
          <span className="text-stone-700 dark:text-stone-300">No known people or places matched — showing text matches.</span>
        ) : (
          <>
            {data.interpretation.entities.map((e) => (
              <button
                key={e.slug} type="button" aria-pressed={!offEntities.has(e.slug)}
                className={`${CHIP} ${offEntities.has(e.slug) ? `${CHIP_OFF} opacity-40` : CHIP_ON}`}
                onClick={() => setOffEntities((prev) => {
                  const next = new Set(prev);
                  if (next.has(e.slug)) next.delete(e.slug); else next.add(e.slug);
                  return next;
                })}
              >{e.label}</button>
            ))}
            {data.interpretation.period && (
              <span className={`${CHIP} ${CHIP_ON} tabular-nums`}>{periodBadge([data.interpretation.period.start, data.interpretation.period.end])}</span>
            )}
            {data.interpretation.entities.length > 0 && !filtering && (
              <span className="text-xs text-stone-500 dark:text-stone-400">tap a name to set it aside</span>
            )}
          </>
        )}
        {filtering && <span className="text-stone-500 dark:text-stone-400">(within these results)</span>}
      </div>

      {buckets.length > 1 && (
        <div className="mt-3 overflow-x-auto">
          <div className="flex w-max gap-2 text-sm">
            {buckets.map(([c, n]) => (
              <button
                key={c} type="button" aria-pressed={bucket === c}
                className={`${CHIP} tabular-nums ${bucket === c ? CHIP_ON : CHIP_OFF}`}
                onClick={() => setBucket((b) => (b === c ? null : c))}
              >{c < 0 ? `${-c}c B.C.` : `${c}c`} · {n}</button>
            ))}
          </div>
        </div>
      )}

      {data.closest && groups.length > 0 ? (
        <Link
          href={workHref(data.closest.work.slug, data.closest.ordinal, threadId, query)}
          className="mt-5 block border edge bg-paper p-5 transition-colors ease-gentle hover:bg-accent-50/40 dark:bg-stone-900 dark:hover:bg-accent-950/20"
        >
          <div className="text-micro uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">Closest match to your question</div>
          <div className="mt-1 font-scripture text-[17px] text-stone-900 dark:text-stone-100">{data.closest.work.author} — {data.closest.work.title}</div>
          <div className="mt-0.5 flex items-baseline gap-2 text-xs text-stone-500 dark:text-stone-400">
            <span className="min-w-0 truncate" style={{ direction: 'rtl', textAlign: 'left' }}>
              <bdi>{data.closest.headingPath.join(' › ')}</bdi>
            </span>
            {periodBadge(data.closest.period) && <span className="shrink-0 border edge px-1 tabular-nums">{periodBadge(data.closest.period)}</span>}
          </div>
          <p className="mt-2 font-scripture text-[15px] leading-relaxed text-stone-800 dark:text-stone-200">&ldquo;{data.closest.excerpt}&rdquo;{data.closest.excerpt.length >= 420 ? '…' : ''}</p>
          <div className="mt-2 text-sm text-accent-700 underline dark:text-accent-300">Open in book →</div>
        </Link>
      ) : (
        <div className="mt-6 border edge p-4">
          <p className="text-stone-700 dark:text-stone-300">Nothing in the {data.coverage.works} served history items matches this.</p>
          <Link href="/library/historians" className="mt-2 inline-block text-sm text-accent-700 underline dark:text-accent-300">Browse the history shelf</Link>
        </div>
      )}

      <div className="mt-6 space-y-7">
        {groups.map((g) => {
          const open = expanded.has(g.work.slug);
          const shown = open ? g.sections : g.sections.slice(0, 3);
          return (
            <section key={g.work.slug}>
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b edge pb-1.5">
                <h2 className="font-scripture text-[17px] text-stone-900 dark:text-stone-100">{g.work.author} — {g.work.title}</h2>
                <span className="text-micro tabular-nums text-stone-500 dark:text-stone-400">
                  {g.sections.length} match{g.sections.length === 1 ? '' : 'es'}
                  {periodBadge(g.periodSpan) ? ` · ${periodBadge(g.periodSpan)}` : ''}
                </span>
              </header>
              <ul>
                {shown.map((s) => (
                  <li key={s.sectionId} className="flex gap-2 border-b edge py-2.5">
                    <Link href={workHref(g.work.slug, s.ordinal, threadId, query)} className="group min-w-0 flex-1">
                      <div className="truncate text-xs text-stone-500 dark:text-stone-400" style={{ direction: 'rtl', textAlign: 'left' }}>
                        <bdi>{s.headingPath.join(' › ')}</bdi>
                      </div>
                      <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-stone-600 transition-colors ease-gentle group-hover:text-stone-900 sm:line-clamp-2 dark:text-stone-300 dark:group-hover:text-stone-100">{s.excerpt}</p>
                    </Link>
                    <button
                      type="button" aria-label="Copy citation" title="Copy citation"
                      className="h-8 w-8 shrink-0 self-center border edge text-xs text-stone-500 transition-colors ease-gentle hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300"
                      onClick={() => void cite(s, g.work)}
                    >{copied === s.sectionId ? '✓' : '⧉'}</button>
                  </li>
                ))}
              </ul>
              {g.sections.length > 3 && (
                <button
                  type="button" aria-expanded={open} className="mt-1.5 text-sm text-stone-600 underline transition-colors ease-gentle hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300"
                  onClick={() => setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.work.slug)) next.delete(g.work.slug); else next.add(g.work.slug);
                    return next;
                  })}
                >{open ? 'Show fewer' : `Show all ${g.sections.length} in this work`}</button>
              )}
            </section>
          );
        })}
      </div>

      <footer className="mt-8 text-sm text-stone-500 dark:text-stone-400">
        Searched {data.coverage.works} items · {data.coverage.sections.toLocaleString(DISPLAY_LOCALE)} sections
      </footer>
    </div>
  );
}
