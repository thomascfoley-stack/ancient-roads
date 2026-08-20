'use client';
// History results — HISTORY_RETRIEVAL_DESIGN §5 stages 2-4. Every visible string is a fixed
// template or a verbatim excerpt; there is deliberately NO generated prose block anywhere.
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

function workHref(slug: string, ordinal: number, threadId: string | null): string {
  return `/work/${slug}${threadId ? `?from=hist:${threadId}` : ''}#s${ordinal}`;
}

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

  const cite = (r: HistoryResultRow, work: { title: string; author: string }): void => {
    void navigator.clipboard.writeText(`${work.author}, ${work.title}, ${r.headingPath.join(' — ')} (CCEL)`);
    setCopied(r.sectionId);
    setTimeout(() => setCopied(null), 1500);
  };

  const noMatchLine = data.interpretation.entities.length === 0 && data.interpretation.period === null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-xl">&ldquo;{query}&rdquo;</h1>
        <Link href="/ask?mode=history" className="shrink-0 text-sm underline">New search</Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Matched:</span>
        {noMatchLine ? (
          <span>No known people or places matched — showing text matches.</span>
        ) : (
          <>
            {data.interpretation.entities.map((e) => (
              <button
                key={e.slug} type="button" aria-pressed={!offEntities.has(e.slug)}
                className={`rounded border px-2 py-0.5 ${offEntities.has(e.slug) ? 'opacity-40' : ''}`}
                onClick={() => setOffEntities((prev) => {
                  const next = new Set(prev);
                  if (next.has(e.slug)) next.delete(e.slug); else next.add(e.slug);
                  return next;
                })}
              >{e.label}</button>
            ))}
            {data.interpretation.period && (
              <span className="rounded border px-2 py-0.5">{periodBadge([data.interpretation.period.start, data.interpretation.period.end])}</span>
            )}
          </>
        )}
        {filtering && <span className="text-muted-foreground">(within these results)</span>}
      </div>

      {buckets.length > 1 && (
        <div className="mt-3 overflow-x-auto">
          <div className="flex w-max gap-2 text-sm">
            {buckets.map(([c, n]) => (
              <button
                key={c} type="button" aria-pressed={bucket === c}
                className={`rounded border px-2 py-0.5 ${bucket === c ? 'font-semibold' : ''}`}
                onClick={() => setBucket((b) => (b === c ? null : c))}
              >{c < 0 ? `${-c}c B.C.` : `${c}c`} · {n}</button>
            ))}
          </div>
        </div>
      )}

      {data.closest && groups.length > 0 ? (
        <Link
          href={workHref(data.closest.work.slug, data.closest.ordinal, threadId)}
          className="mt-5 block rounded-lg border p-4 hover:bg-black/5"
        >
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Closest match to your question</div>
          <div className="mt-1 font-serif">{data.closest.work.author} — {data.closest.work.title}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground" style={{ direction: 'rtl', textAlign: 'left' }}>
            <bdi>{data.closest.headingPath.join(' › ')}</bdi>
            {periodBadge(data.closest.period) && <span className="ml-2 rounded border px-1">[{periodBadge(data.closest.period)}]</span>}
          </div>
          <p className="mt-2 text-sm">&ldquo;{data.closest.excerpt}&rdquo;{data.closest.excerpt.length >= 420 ? '…' : ''}</p>
          <div className="mt-2 text-sm underline">Open in book →</div>
        </Link>
      ) : (
        <div className="mt-6 rounded-lg border p-4">
          <p>Nothing in the {data.coverage.works} served history works matches this.</p>
          <Link href="/library" className="mt-2 inline-block text-sm underline">Browse the history shelf</Link>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {groups.map((g) => {
          const open = expanded.has(g.work.slug);
          const shown = open ? g.sections : g.sections.slice(0, 3);
          return (
            <section key={g.work.slug}>
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-1">
                <h2 className="font-serif">{g.work.author} — {g.work.title}</h2>
                <span className="text-xs text-muted-foreground">
                  {g.sections.length} match{g.sections.length === 1 ? '' : 'es'}
                  {periodBadge(g.periodSpan) ? ` · ${periodBadge(g.periodSpan)}` : ''}
                </span>
              </header>
              <ul>
                {shown.map((s) => (
                  <li key={s.sectionId} className="flex gap-2 border-b py-2">
                    <Link href={workHref(g.work.slug, s.ordinal, threadId)} className="min-w-0 flex-1">
                      <div className="truncate text-sm text-muted-foreground" style={{ direction: 'rtl', textAlign: 'left' }}>
                        <bdi>{s.headingPath.join(' › ')}</bdi>
                      </div>
                      <p className="mt-1 line-clamp-3 text-sm sm:line-clamp-2">{s.excerpt}</p>
                    </Link>
                    <button
                      type="button" aria-label="Copy citation" title="Copy citation"
                      className="h-8 w-8 shrink-0 self-center rounded border text-xs"
                      onClick={() => cite(s, g.work)}
                    >{copied === s.sectionId ? '✓' : '⧉'}</button>
                  </li>
                ))}
              </ul>
              {g.sections.length > 3 && (
                <button
                  type="button" aria-expanded={open} className="mt-1 text-sm underline"
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

      <footer className="mt-8 text-sm text-muted-foreground">
        Searched {data.coverage.works} works · {data.coverage.sections.toLocaleString(DISPLAY_LOCALE)} sections
      </footer>
    </div>
  );
}
