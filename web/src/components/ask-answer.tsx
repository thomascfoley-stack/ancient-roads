'use client';

// The ANSWER half of /ask: the composed voices, the register lanes, the Show filter, the fallback
// source list, tombstones, and the links that open a result in the book. Split out of
// ask-client.tsx in the 2026-09-06 redesign; the state machine stays there.

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { formatVerseId } from '@bible/verse-id';
import { verseHref } from '@/lib/verse-link';
import { sectionOrdinalFromSourceId } from '@/lib/source-ordinal';
import { SaveToStudy, resolveVoiceSourceId } from '@/components/save-to-study';
import type { Block, LaneChunk, LinkContext, Retrieved, TeacherResult } from './ask-types';

// ── Where a result opens ──────────────────────────────────────────────────────────────────────
// Owner, 2026-09-06: "clicking into commentary goes into the EXACT spot that is listed in the
// search", with a clear way back. Results used to open a work on the desk, which starts every work
// at section 1 and knows nothing about the ask. They open the full reader now, at the quoted
// section, carrying the return strip's two parameters — the same contract History mode ships
// (history-results.tsx): `/work/<slug>?from=ask:<threadId>&fq=<question>#s<ordinal>`.
//
// The ordinal comes from `metadata.sectionOrdinal` (resolved server-side at ask time) or, for
// register works, from the sourceId itself. A row that cannot be located links to the work with
// no fragment — never a `#sundefined`. No slug at all → no link (a card must never look clickable
// and fail to navigate).
export function readerHref(slug: string | undefined, ordinal: number | null | undefined, ctx: LinkContext): string | null {
  if (!slug) return null;
  const query = ctx.threadId ? `?from=ask:${ctx.threadId}&fq=${encodeURIComponent(ctx.question)}` : '';
  const fragment = typeof ordinal === 'number' && Number.isInteger(ordinal) && ordinal >= 1 ? `#s${ordinal}` : '';
  // Encoded like the reader's own fetch (work/[slug]/page.tsx): slugs are server-controlled and
  // `[a-z0-9-]` in every manifest, so this changes nothing today and forecloses a `?`/`#` in one.
  return `/work/${encodeURIComponent(slug)}${query}${fragment}`;
}

// Wraps a result card in a link to its passage in the book, when one is known. Renders children
// unwrapped when it isn't. The `-mx-2.5` overhang is read by ask-composer-mask.test.ts: the
// composer's mask must be wide enough to cover a hovered row that overhangs it.
function ResultLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <Link href={href} className="group -mx-2.5 block px-2.5 py-1 transition-colors duration-150 ease-gentle hover:bg-stone-100/80 focus-quiet dark:hover:bg-stone-800/50">
      {children}
    </Link>
  );
}

// Era accents (PRD §4): each voice card takes a 3px era-coloured left border and the attribution
// carries that era's ornament in the same colour, keyed off the attribution's year (Early –500,
// Medieval 501–1500, Reformation 1501–1700, Modern 1701–). `year` is optional in the response
// schema, so a missing year falls back to the Modern neutral rather than guessing an era from the
// free-text tradition string.
const ERAS = {
  early: { border: 'border-l-era-early', ornament: '·', ornamentClass: 'text-era-early' },
  medieval: { border: 'border-l-era-medieval', ornament: '◆', ornamentClass: 'text-era-medieval' },
  reformation: { border: 'border-l-era-reformation', ornament: '§', ornamentClass: 'text-era-reformation' },
  modern: { border: 'border-l-era-modern', ornament: '—', ornamentClass: 'text-era-modern' },
} as const;

function eraOf(year?: number) {
  if (year == null) return ERAS.modern;
  if (year <= 500) return ERAS.early;
  if (year <= 1500) return ERAS.medieval;
  if (year <= 1700) return ERAS.reformation;
  return ERAS.modern;
}

/** Present a tradition label: title-cased, and never the raw word "unassigned". */
function formatTradition(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (t === 'unassigned') return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function RetryButton({ onRetry, busy, tone, disabled }: { onRetry: () => void; busy: boolean; tone: 'error' | 'fallback'; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={busy || disabled}
      className={`mt-3 inline-flex min-h-[44px] items-center border px-3 text-xs font-semibold transition-colors ease-gentle disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'error'
          ? 'border-red-300/70 hover:bg-red-100/60 dark:border-red-900/70 dark:hover:bg-red-950/50'
          : 'border-accent-300/70 text-accent-900 hover:bg-accent-100/60 dark:border-accent-800 dark:text-accent-200 dark:hover:bg-accent-950/50'
      }`}
    >
      {busy ? 'Asking…' : 'Ask again'}
    </button>
  );
}

// ── The Show filter (design §4.7, owner-ruled variant A, 2026-08-16) ──────────────────────
// Display-only. One chip per register that returned results, with its count; unchecking hides
// that register's rows INSTANTLY and rechecking restores them — nothing re-runs, nothing is
// fetched. "only" isolates one register; "Show all" appears while anything is hidden. State is
// per-turn and ephemeral (component state, never persisted): a reopened thread starts complete.
type ShowKey = 'commentary' | 'sermons' | 'theology' | 'songVerse' | 'historians';
const SHOW_LABELS: Record<ShowKey, string> = {
  commentary: 'Commentary',
  sermons: 'Sermons',
  theology: 'Theology & Confessions',
  songVerse: 'Hymns & Sacred Poetry',
  historians: 'History',
};

function ShowFilter({ entries, hidden, onToggle, onOnly, onAll }: {
  entries: { key: ShowKey; n: number }[];
  hidden: Set<ShowKey>;
  onToggle: (k: ShowKey) => void;
  onOnly: (k: ShowKey) => void;
  onAll: () => void;
}) {
  return (
    <div className="edge border-t pt-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">Show</p>
          <span className="bg-stone-500/10 px-2 py-0.5 font-sans text-micro font-medium text-stone-500 dark:text-stone-400">instant · nothing re-runs</span>
        </span>
        {hidden.size > 0 && (
          <button type="button" onClick={onAll} className="text-xs font-medium text-accent-600 hover:underline dark:text-accent-400">
            Show all
          </button>
        )}
      </div>
      <div role="group" aria-label="Show collections" className="flex flex-wrap gap-1.5">
        {entries.map(({ key, n }) => {
          const on = !hidden.has(key);
          return (
            <span key={key} className={`inline-flex items-stretch border text-xs transition-colors ease-gentle ${on ? 'border-accent-600/50 bg-accent-600/10 text-accent-800 dark:border-accent-400/50 dark:bg-accent-400/10 dark:text-accent-200' : 'border-stone-300 text-stone-500 dark:border-stone-700 dark:text-stone-400'}`}>
              <button type="button" aria-pressed={on} onClick={() => onToggle(key)} className="flex min-h-[32px] items-center gap-1.5 px-2.5">
                <span aria-hidden className="text-[10px]">{on ? '✓' : '○'}</span>
                {SHOW_LABELS[key]} <span className="opacity-70">{n}</span>
              </button>
              <button type="button" onClick={() => onOnly(key)} title={`Show only ${SHOW_LABELS[key]}`}
                className="edge border-l px-1.5 text-[10px] uppercase tracking-wide text-stone-400 hover:text-accent-700 dark:hover:text-accent-300">
                only
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function useShowFilter(entries: { key: ShowKey; n: number }[]) {
  const [hidden, setHidden] = useState<Set<ShowKey>>(new Set());
  const onToggle = useCallback((k: ShowKey) => {
    setHidden((prev) => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
  }, []);
  const onOnly = useCallback((k: ShowKey) => {
    setHidden(new Set(entries.filter((e) => e.key !== k).map((e) => e.key)));
  }, [entries]);
  const onAll = useCallback(() => setHidden(new Set()), []);
  return { hidden, onToggle, onOnly, onAll };
}

// §4.4 corpus drift: a stored turn whose work has left the served corpus keeps its ATTRIBUTION
// and loses its QUOTE. The reader sees what was cited and that it is gone — never stale text
// re-rendered as though it still served.
function Tombstone({ author, work }: { author: string; work?: string }) {
  return (
    <figure className="border-l-[3px] border-l-stone-400 pl-5 opacity-80 dark:border-l-stone-600">
      <p className="font-serif text-base italic leading-relaxed text-stone-500 dark:text-stone-400">
        This source is no longer part of the served corpus. The quote is not shown.
      </p>
      <figcaption className="mt-2 text-sm text-stone-500 dark:text-stone-400">
        <span className="font-semibold text-stone-700 dark:text-stone-300">{author}</span>
        {work ? `, ${work}` : ''}
        <span className="ml-2 bg-stone-200 px-2 py-0.5 text-micro font-medium uppercase tracking-wide text-stone-600 dark:bg-stone-800 dark:text-stone-400">withdrawn</span>
      </figcaption>
    </figure>
  );
}

const OPEN_HINT = 'Open in book →';

// `askOutcomeId` rides down to the save affordance so a kept voice names the ask it came from
// (migration 125). Optional throughout: stored turns replayed from history do not carry one, and
// a clipping without it is still a perfectly good clipping — just an unlabelled one.
export function Answer({ result, onRetry, busy, contextTitle, withdrawnIds, askOutcomeId, linkCtx }: {
  result: TeacherResult; onRetry: () => void; busy: boolean; contextTitle?: string; withdrawnIds?: string[]; askOutcomeId?: string; linkCtx: LinkContext;
}) {
  // Hooks before any early return (rules-of-hooks): entries are derived from the result shape.
  const entries: { key: ShowKey; n: number }[] = [];
  if (result.kind === 'composed') {
    const n = result.response.blocks.filter((b) => b.type === 'voice').length;
    if (n > 0) entries.push({ key: 'commentary', n });
  } else if (result.kind === 'fallback') {
    if (result.retrieval.length > 0) entries.push({ key: 'commentary', n: result.retrieval.length });
  }
  if (result.kind !== 'empty') {
    if (result.sermons?.length) entries.push({ key: 'sermons', n: result.sermons.length });
    if (result.theology?.length) entries.push({ key: 'theology', n: result.theology.length });
    if (result.song_verse?.length) entries.push({ key: 'songVerse', n: result.song_verse.length });
    if (result.historians?.length) entries.push({ key: 'historians', n: result.historians.length });
  }
  const { hidden, onToggle, onOnly, onAll } = useShowFilter(entries);
  const show = (k: ShowKey) => !hidden.has(k);
  const gone = new Set(withdrawnIds ?? []);

  if (result.kind === 'empty') {
    return (
      <p className="max-w-[62ch] font-serif text-lg leading-relaxed text-stone-500 dark:text-stone-400">
        {result.reason}
      </p>
    );
  }
  if (result.kind === 'fallback') {
    return (
      <div className="space-y-6">
        <ShowFilter entries={entries} hidden={hidden} onToggle={onToggle} onOnly={onOnly} onAll={onAll} />
        {show('commentary') && <Fallback retrieval={result.retrieval} onRetry={onRetry} busy={busy} contextTitle={contextTitle} gone={gone} linkCtx={linkCtx} />}
        <Lanes result={result} contextTitle={contextTitle} show={show} gone={gone} linkCtx={linkCtx} />
        {entries.length > 0 && entries.every((e) => hidden.has(e.key)) && (
          <p className="py-4 text-center font-sans text-sm text-stone-500 dark:text-stone-400">Everything is hidden. Check a register above.</p>
        )}
      </div>
    );
  }

  const blocks = result.response.blocks;
  const framing = blocks.find((b) => b.type === 'framing') as Extract<Block, { type: 'framing' }> | undefined;
  const voices = blocks.filter((b): b is Extract<Block, { type: 'voice' }> => b.type === 'voice');
  const passages = blocks.find((b) => b.type === 'passages') as Extract<Block, { type: 'passages' }> | undefined;

  // PRD §5 answer reveal: staggered fade-in, opacity only — framing first, each voice card 60ms
  // after the last, then the register lanes, then the passage list.
  const hasLanes = Boolean(result.sermons?.length || result.theology?.length || result.song_verse?.length || result.historians?.length);
  const laneDelay = (voices.length + 1) * 60;
  const passageDelay = laneDelay + (hasLanes ? 60 : 0);

  return (
    <div className="space-y-6">
      {framing && show('commentary') && (
        <p className="edge animate-fade-in border-t pt-6 font-serif text-lg leading-relaxed text-stone-700 dark:text-stone-300">{framing.text}</p>
      )}
      <ShowFilter entries={entries} hidden={hidden} onToggle={onToggle} onOnly={onOnly} onAll={onAll} />
      {entries.length > 0 && entries.every((e) => hidden.has(e.key)) && (
        <p className="py-4 text-center font-sans text-sm text-stone-500 dark:text-stone-400">Everything is hidden. Check a register above.</p>
      )}
      {show('commentary') && <div className="space-y-6">
        {voices.map((v, i) => {
          const era = eraOf(v.attribution.year);
          // Slice 4 (SERMON_SEARCH_DESIGN §7(a)): a user-library voice is labelled as THEIRS (doc
          // title), never rendered as an attributed historical voice — no era rail, no tradition,
          // no book link, no save affordance (it has no corpus source_id; the save path
          // auto-suppresses on null anyway). It also SKIPS the withdrawal/tombstone path
          // entirely: withdrawals are corpus-row concepts, and resolveVoiceSourceId matches
          // against the corpus retrieval payload, so a user voice would otherwise tombstone
          // (quote stripped) on any stored thread with known withdrawals.
          if (v.attribution.origin === 'user_library') {
            return (
              <div key={i}>
                <div aria-hidden="true" className="edge mb-6 border-t" />
                <figure
                  className="animate-fade-in border-l-[3px] border-l-stone-300 pl-5 dark:border-l-stone-600"
                  style={{ animationDelay: `${(i + 1) * 60}ms`, animationFillMode: 'backwards' }}
                >
                  <blockquote className="max-w-[62ch] break-words font-serif text-[17px] leading-[1.75] text-stone-900 dark:text-stone-100">“{v.quote}”</blockquote>
                  <figcaption className="mt-2.5 font-serif text-sm tracking-[0.05em] text-stone-500 [font-variant:all-small-caps] dark:text-stone-400">
                    From your library — <span className="font-semibold text-stone-800 dark:text-stone-200">{v.attribution.work}</span>
                  </figcaption>
                  {v.summary && <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-500">{v.summary}</p>}
                </figure>
              </div>
            );
          }
          // §4.4: withdrawn ROW → attribution stays, quote goes. A voice is tombstoned when the
          // retrieval row it was composed from is no longer served (per-row check).
          //
          // AND THE UNRESOLVABLE CASE FAILS CLOSED — NARROWLY (audit #7, 2026-08-18). This used to
          // read `voiceSid && gone.has(voiceSid)`, so a voice whose row could not be resolved
          // skipped the check and rendered its stored quote: the one fail-open path in a subsystem
          // that fails closed everywhere else. The narrowing is what makes it safe: `gone` is
          // non-empty only on a stored thread with KNOWN withdrawals, so on a live turn (gone
          // empty) an unresolvable voice still renders — tombstoning fresh verifier-passed voices
          // would be a mass false positive. Withdrawals present + cannot prove this voice is not
          // among them = attribution without the quote.
          const voiceSid = resolveVoiceSourceId(result.retrieval, v);
          if ((voiceSid === null && gone.size > 0) || (voiceSid !== null && gone.has(voiceSid))) {
            return (
              <div key={i}>
                <div aria-hidden="true" className="edge mb-6 border-t" />
                <Tombstone author={v.attribution.author} work={v.attribution.work} />
              </div>
            );
          }
          // Save to study (design §7.5, R3). A voice block's section_id is PROMPT-LOCAL (an index
          // into the composer's re-sorted voice subset), never a corpus key, so the saveable
          // source_id is resolved against this turn's retrieval rows. An unresolvable voice
          // renders NO affordance rather than guessing — a guess would save the wrong passage's
          // bytes (see save-to-study.tsx).
          const saveSourceId = voiceSid;
          // The link resolves the same way: the retrieval row the voice was composed from knows
          // the work and the section. Its slug is authoritative over the attribution's (which is
          // an author-match backfill, retrieve.ts), and its ordinal is the one the reader lands on.
          const row = voiceSid !== null ? result.retrieval.find((r) => r.sourceId === voiceSid) : undefined;
          const ordinal = row?.metadata.sectionOrdinal ?? (voiceSid !== null ? sectionOrdinalFromSourceId(voiceSid) : null);
          const href = readerHref(row?.metadata.work ?? v.attribution.slug, ordinal, linkCtx);
          return (
            <div key={i}>
              {/* PRD: a 1px hairline rule above each voice card. It cannot be a border-t on the
                  figure itself — `.edge` is unlayered and would repaint the 3px era rail too. */}
              <div aria-hidden="true" className="edge mb-6 border-t" />
              <ResultLink href={href}>
                <figure
                  className={`animate-fade-in border-l-[3px] pl-5 ${era.border}`}
                  style={{ animationDelay: `${(i + 1) * 60}ms`, animationFillMode: 'backwards' }}
                >
                  {/* PRD §5: the quote is 17px Literata at 1.75 line-height, 62ch measure. 17px
                      sits between the type ladder's 16/18 steps, so it stays a literal. */}
                  <blockquote className="max-w-[62ch] break-words font-serif text-[17px] leading-[1.75] text-stone-900 dark:text-stone-100">“{v.quote}”</blockquote>
                  {/* Small caps for real: the `small-caps` class this carried was never defined
                      (not a Tailwind utility either), so the PRD's small-caps attribution had never
                      actually rendered. `[font-variant:all-small-caps]` is the idiom the rest of
                      the app uses (today-view, commentary-panel). */}
                  <figcaption className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-serif text-sm tracking-[0.05em] text-stone-500 [font-variant:all-small-caps] dark:text-stone-400">
                    <span className="font-semibold text-stone-800 group-hover:text-accent-800 dark:text-stone-200 dark:group-hover:text-accent-300">{v.attribution.author}</span>
                    <span aria-hidden="true" className={`text-xs ${era.ornamentClass}`}>{era.ornament}</span>
                    {v.attribution.year != null && (
                      <span className="text-xs text-stone-500 dark:text-stone-400">
                        {v.attribution.year < 0 ? `${Math.abs(v.attribution.year)} BC` : v.attribution.year}
                      </span>
                    )}
                    {formatTradition(v.attribution.tradition) && (
                      <span className="rounded-full bg-stone-200/50 px-2 py-0.5 text-micro font-medium text-stone-600 dark:bg-stone-700/50 dark:text-stone-300">
                        {formatTradition(v.attribution.tradition)}
                      </span>
                    )}
                    {href && <span className="text-xs text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-stone-500">{OPEN_HINT}</span>}
                  </figcaption>
                  {v.summary && <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-500">{v.summary}</p>}
                </figure>
              </ResultLink>
              {/* The affordance sits OUTSIDE the ResultLink — a button inside an anchor is invalid
                  HTML — aligned with the card text (link px-2.5 + figure pl-5). */}
              {saveSourceId && (
                <SaveToStudy className="ml-[30px]" clip={{ sourceId: saveSourceId, askOutcomeId }} contextTitle={contextTitle} />
              )}
            </div>
          );
        })}
      </div>}
      {hasLanes && (
        <div className="animate-fade-in" style={{ animationDelay: `${laneDelay}ms`, animationFillMode: 'backwards' }}>
          <Lanes result={result} contextTitle={contextTitle} show={show} gone={gone} linkCtx={linkCtx} />
        </div>
      )}
      {passages && passages.items.length > 0 && show('commentary') && (
        <div className="animate-fade-in pt-1" style={{ animationDelay: `${passageDelay}ms`, animationFillMode: 'backwards' }}>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Passages</p>
          {/* PRD passage rows also spec a 17px preview line, but the passages block carries only
              verse-id ranges — no text — so the hairline-separated row is the 14px antique-gold
              reference alone. */}
          <div className="edge border-t">
            {passages.items.map((p, i) => (
              <Link key={i} href={verseHref(p.start)}
                className="edge flex min-h-[44px] items-center border-b py-2.5 font-sans text-sm text-accent-600 transition-colors ease-gentle hover:text-accent-700 hover:underline dark:text-accent-400 dark:hover:text-accent-300">
                {p.start === p.end ? formatVerseId(p.start) : `${formatVerseId(p.start)}–${formatVerseId(p.end).split(' ').pop()}`} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// The register LANES (song/verse, sermon, theology) — each a DISTINCT labeled section of verbatim
// corpus text, never blended into the exegetical voices and never part of the composed answer
// (sermon-lane slice 2026-07-18). Attribution is author + work only — never a host URL. A
// paraphrase-tagged item (metrical psalter) is marked as such, never presented as Scripture.
function LaneSection({ title, note, chunks, contextTitle, gone, linkCtx }: { title: string; note: string; chunks?: LaneChunk[]; contextTitle?: string; gone?: Set<string>; linkCtx: LinkContext }) {
  if (!chunks || chunks.length === 0) return null;
  return (
    <div className="pt-2">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">{title}</p>
      <p className="mb-3 text-sm italic text-stone-500 dark:text-stone-400">{note}</p>
      <div className="space-y-4">
        {chunks.map((c) => {
          if (gone?.has(c.sourceId)) return <Tombstone key={c.sourceId} author={c.metadata.author} work={c.metadata.sourceTitle} />;
          // A register work's sourceId carries its own ordinal (register-writer.ts), so the lane
          // needs no server help to land on the exact section.
          const href = readerHref(c.metadata.work, sectionOrdinalFromSourceId(c.sourceId), linkCtx);
          return (
            <div key={c.sourceId}>
              <ResultLink href={href}>
                {/* The neutral rail is a single stone-500 class, not a `stone-300 dark:stone-700`
                    pair — the pair's dark half loses the cascade (see THE EDGE in globals.css), and
                    500 reads in both themes. */}
                <figure className="border-l-[3px] border-l-stone-500 pl-5">
                  <blockquote className="whitespace-pre-line break-words font-serif text-base leading-relaxed text-stone-700 dark:text-stone-300">
                    {c.content.length > 400 ? `${c.content.slice(0, 400)}…` : c.content}
                  </blockquote>
                  <figcaption className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                    <span className="font-semibold text-stone-800 group-hover:text-accent-800 dark:text-stone-300 dark:group-hover:text-accent-300">{c.metadata.author}</span>
                    {c.metadata.sourceTitle ? `, ${c.metadata.sourceTitle}` : ''}
                    {c.metadata.paraphrase ? <span title="A metrical paraphrase, not the Scripture text itself." className="ml-2 bg-accent-700/10 px-2 py-0.5 text-micro font-medium text-accent-700 dark:text-accent-300">paraphrase · not Scripture</span> : null}
                    {href && <span className="ml-2 text-xs text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-stone-500">{OPEN_HINT}</span>}
                  </figcaption>
                </figure>
              </ResultLink>
              {/* Save to study (design §7.5, R3) — lane chunks carry their corpus sourceId directly,
                  so no resolution step is needed here. Outside the ResultLink, as with the voice
                  cards above. */}
              <SaveToStudy className="ml-[30px]" clip={{ sourceId: c.sourceId }} contextTitle={contextTitle} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Lanes({ result, contextTitle, show, gone, linkCtx }: { result: Extract<TeacherResult, { kind: 'composed' | 'fallback' }>; contextTitle?: string; show?: (k: ShowKey) => boolean; gone?: Set<string>; linkCtx: LinkContext }) {
  const vis = show ?? (() => true);
  return (
    <>
      {vis('sermons') && <LaneSection title="Sermons on this theme" note="Preached expositions, not commentary. Read them in full for the argument." chunks={result.sermons} contextTitle={contextTitle} gone={gone} linkCtx={linkCtx} />}
      {vis('theology') && <LaneSection title="Theology & confessions" note="Systematic and confessional reflections on this theme." chunks={result.theology} contextTitle={contextTitle} gone={gone} linkCtx={linkCtx} />}
      {vis('songVerse') && <LaneSection title="Hymns & sacred poetry" note="Sung and poetic responses, and (where marked) a metrical paraphrase, not the Scripture text itself." chunks={result.song_verse} contextTitle={contextTitle} gone={gone} linkCtx={linkCtx} />}
      {vis('historians') && <LaneSection title="Historical background" note="Narrative history for context — never doctrine, never part of the composed answer." chunks={result.historians} contextTitle={contextTitle} gone={gone} linkCtx={linkCtx} />}
    </>
  );
}

function Fallback({ retrieval, onRetry, busy, contextTitle, gone, linkCtx }: { retrieval: Retrieved[]; onRetry: () => void; busy: boolean; contextTitle?: string; gone?: Set<string>; linkCtx: LinkContext }) {
  return (
    <div>
      {/* WHY, and a way forward. This block used to be one apologetic sentence and a dead end: no
          reason, and nothing to press. A reader who has just waited through three visible
          "Refining the answer" attempts is owed both — and the reason here is a GOOD one, so saying
          it out loud turns an apparent failure into the guarantee working. The wording stays at the
          level of the product promise and does not surface raw verifier `violations`, which name
          internal checks and would read as a stack trace. */}
      <div className="edge mb-5 border p-4">
        <p className="font-serif text-base text-stone-800 dark:text-stone-200">
          A grounded answer couldn’t be composed for this one. Here are the sources we found. Read them directly.
        </p>
        <p className="mt-2 font-sans text-xs leading-relaxed text-stone-500 dark:text-stone-400">
          Every quote is checked word-for-word against the original before it is shown. This
          draft didn’t pass that check, so the sources are given to you unedited rather than an
          answer we can’t stand behind. Asking again often composes cleanly.
        </p>
        <RetryButton onRetry={onRetry} busy={busy} tone="fallback" />
      </div>
      <div className="space-y-5">
        {retrieval.map((r) => {
          if (gone?.has(r.sourceId)) return <Tombstone key={r.sourceId} author={r.metadata.author} work={r.metadata.sourceTitle} />;
          // The unedited sources open in the book too — the same link a composed voice would carry.
          const href = readerHref(r.metadata.work, r.metadata.sectionOrdinal ?? sectionOrdinalFromSourceId(r.sourceId), linkCtx);
          return (
            <div key={r.sourceId}>
              <ResultLink href={href}>
                <figure className="border-l-[3px] border-l-stone-500 pl-5">
                  <blockquote className="font-serif text-base leading-relaxed text-stone-700 dark:text-stone-300">
                    {r.content.length > 320 ? `${r.content.slice(0, 320)}…` : r.content}
                  </blockquote>
                  <figcaption className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                    <span className="font-semibold text-stone-800 group-hover:text-accent-800 dark:text-stone-300 dark:group-hover:text-accent-300">{r.metadata.author}</span>, {r.metadata.sourceTitle}
                    {formatTradition(r.metadata.tradition) ? ` · ${formatTradition(r.metadata.tradition)}` : ''}
                    {href && <span className="ml-2 text-xs text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-stone-500">{OPEN_HINT}</span>}
                  </figcaption>
                </figure>
              </ResultLink>
              {/* Save to study here too — R3 is "one verb on EVERY surfaced item", and the
                  fallback's unedited source list is a surfaced list. sourceId is direct. */}
              <SaveToStudy className="ml-[30px]" clip={{ sourceId: r.sourceId }} contextTitle={contextTitle} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
