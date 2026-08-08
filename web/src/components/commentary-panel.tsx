'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { type CommentaryEntry } from '@/lib/bible';
import { HIGHLIGHT_COLORS } from '@/lib/highlight-colors';

export interface AnnotationControls {
  color: string | null;
  note: string;
  signedIn: boolean;
  /** The chapter's annotations failed to load, so `note` is empty because it is UNKNOWN, not
   *  because it is absent. Saving would upsert over a note still on the server
   *  (`annotations.ts`, `DO UPDATE SET body = EXCLUDED.body`). Optional so the dead AnnotationBar
   *  below and any future caller default to the safe-because-loaded case. */
  loadFailed?: boolean;
  onSetHighlight: (color: string) => void;
  onClearHighlight: () => void;
  onSaveNote: (body: string) => void;
  onDeleteNote: () => void;
}

// ── The register wall, shared across the reader, the library browse, and Today.
// Song/verse (hymn, poetry), sermon, and theology/confession are DISTINCT prose
// registers: each renders in its OWN labeled section and NEVER blends into the
// exegetical commentary voices (nor counts toward Today's >=2-voices floor). The
// served static corpus reliably carries `register` for every such work (the
// register-wall-check probes this across the whole corpus), so classification is
// by the register string — ONE source of truth consumed by every surface.
export type RegisterLane = 'exegetical' | 'sermon' | 'theology' | 'song_verse';
export function registerLane(e: { register?: string }): RegisterLane {
  switch (e.register) {
    case 'hymn':
    case 'poetry':
      return 'song_verse';
    case 'sermon':
      return 'sermon';
    case 'theology':
    case 'confession':
      return 'theology';
    default:
      return 'exegetical'; // commentary/father + legacy (null register) rows
  }
}
// Sermon + theology/confession are a register of their OWN — like song/verse they
// must never fill an exegetical voice slot or satisfy Today's >=2-voices floor.
export function isLaneWork(e: { register?: string }): boolean {
  const lane = registerLane(e);
  return lane === 'sermon' || lane === 'theology';
}

export interface RegisterPartition<T> {
  exegetical: T[]; // verse-anchored commentary + fathers (the >=2-voices pool)
  sermon: T[];
  theology: T[];
  songVerse: T[];
}
// Split reader/library entries into the four register lanes. The reader, the
// library browse, and register-wall-check all call THIS one function, so the wall
// is provably consistent across surfaces (the checker asserts no lane/song-verse
// work ever lands in `.exegetical`).
export function partitionByRegister<T extends { register?: string }>(entries: T[]): RegisterPartition<T> {
  const p: RegisterPartition<T> = { exegetical: [], sermon: [], theology: [], songVerse: [] };
  for (const e of entries) {
    switch (registerLane(e)) {
      case 'song_verse':
        p.songVerse.push(e);
        break;
      case 'sermon':
        p.sermon.push(e);
        break;
      case 'theology':
        p.theology.push(e);
        break;
      default:
        p.exegetical.push(e); // commentary/father + legacy (null register) rows only
    }
  }
  return p;
}

// The register chip shown on a card so a voice is legible OUT of its section too
// (e.g. a single result). Exegetical commentary/fathers carry no chip.
export function registerChipLabel(register?: string): string | null {
  switch (register) {
    case 'hymn':
      return 'Hymn';
    case 'poetry':
      return 'Poetry';
    case 'sermon':
      return 'Sermon';
    case 'theology':
      return 'Theology';
    case 'confession':
      return 'Confession';
    default:
      return null;
  }
}

// A metrical psalter (Watts' Psalms Imitated, the 1650 Scottish Psalter) is a
// PARAPHRASE — a sung response, never the Scripture text. This marker rides
// wherever such a voice can appear (reader, library, /ask) so it is never mistaken
// for the Bible. Guarantee (b) of the register wall.
export function ParaphraseChip() {
  return (
    <span
      className="rounded-full bg-accent-700/10 px-2 py-0.5 text-micro font-medium text-accent-700 dark:text-accent-300"
      title="A metrical paraphrase, not the Scripture text itself."
    >
      paraphrase · not Scripture
    </span>
  );
}

// Shared header for a labeled register section (Sermons / Theology & confessions /
// Hymns & sacred poetry) — the same treatment across reader and library.
export function RegisterSectionHeading({ title, note }: { title: string; note: string }) {
  return (
    <>
      <p className="pt-4 pb-1 text-micro font-bold uppercase tracking-widest text-stone-300 dark:text-stone-400">
        {title}
      </p>
      <p className="mb-2 text-micro italic text-stone-500 dark:text-stone-400">{note}</p>
    </>
  );
}

// The copy for each labeled register section, shared so every surface reads the
// same way.
export const SERMON_NOTE = 'Preached expositions, not verse-by-verse commentary; read them in full for the argument.';
export const THEOLOGY_NOTE = 'Systematic and confessional reflections on this passage: topical, not verse-commentary.';
export const SONG_VERSE_NOTE = 'Sung and poetic responses to this passage: not commentary, and (where marked) a metrical paraphrase, not the Scripture text itself.';

export function eraLabel(year: number | null): string {
  if (!year) return '';
  if (year <= 500) return 'Early Church';
  if (year <= 1500) return 'Medieval';
  if (year <= 1700) return 'Reformation';
  return 'Modern';
}

function traditionKey(entry: CommentaryEntry): string {
  if (entry.tradition) return entry.tradition;
  return eraLabel(entry.year) || 'Unknown';
}

// Primacy = the foundational voice in each tradition first. The round-robin below picks
// the round-th entry from each tradition, so ORDER WITHIN A TRADITION decides who survives
// the cut. The old code left each bucket in raw insertion (file) order, so at John 1:1 the
// top slot went to whoever the ingest happened to write first ("Alcuin of York, as quoted
// by Aquinas") while Chrysostom, Augustine, Calvin and Henry were dropped. Rank each bucket
// by year ascending (earliest = most primary) so the round-robin surfaces the primary voice.
export function pickDiverse(entries: CommentaryEntry[], max: number): CommentaryEntry[] {
  if (entries.length <= max) return entries;

  const byTradition = new Map<string, CommentaryEntry[]>();
  for (const e of entries) {
    const key = traditionKey(e);
    const arr = byTradition.get(key);
    if (arr) arr.push(e);
    else byTradition.set(key, [e]);
  }
  for (const arr of byTradition.values()) {
    arr.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  }

  const picked: CommentaryEntry[] = [];
  const traditions = [...byTradition.keys()];

  // AUTHOR-FIRST PASS. The round-robin below rotates over TRADITION buckets, so two entries by
  // the same author land in one bucket and are drawn on successive rounds — spending both slots
  // of a ≥2-voices floor on a single voice. Measured: 100 corpus sets did exactly that (all John
  // Wesley). So take at most ONE entry per author first, in the same tradition rotation; only if
  // that cannot fill `max` do we fall through and allow an author to repeat.
  const seenAuthors = new Set<string>();
  let round = 0;
  while (picked.length < max) {
    let added = false;
    for (const t of traditions) {
      const arr = byTradition.get(t)!;
      if (round < arr.length && picked.length < max) {
        const cand = arr[round]!;
        if (!seenAuthors.has(cand.author)) {
          picked.push(cand);
          seenAuthors.add(cand.author);
          added = true;
        }
      }
    }
    if (!added && round >= Math.max(...traditions.map((t) => byTradition.get(t)!.length))) break;
    round++;
  }

  // SECOND PASS — the panels call pickDiverse(entries, 10) to show a work in DEPTH, and a single
  // commentator with several notes on a verse is legitimate there. Author dedupe must therefore
  // narrow the FLOOR, not starve the panel: once every distinct author is represented, top up in
  // the original diversity order. (The floor's own guarantee is enforced in voicesForPassage,
  // which now counts distinct authors before it ever calls this.)
  if (picked.length < max) {
    for (const t of traditions) {
      for (const cand of byTradition.get(t)!) {
        if (picked.length >= max) break;
        if (!picked.includes(cand)) picked.push(cand);
      }
    }
  }

  return picked.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
}

export function EntryCard({ entry }: { entry: CommentaryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.text.length > 600;
  const displayText = isLong && !expanded ? entry.text.slice(0, 600).replace(/\s+\S*$/, '') + '...' : entry.text;

  return (
    <div className="rounded-xl bg-stone-100/80 px-4 py-3.5 dark:bg-stone-800/50">
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span className="font-semibold text-stone-800 text-sm dark:text-stone-100">
          {entry.author}
        </span>
        {entry.year && (
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {entry.year < 0 ? `${Math.abs(entry.year)} BC` : entry.year}
          </span>
        )}
        {entry.tradition && (
          <span className="rounded-full bg-stone-200/50 px-2 py-0.5 text-micro font-medium text-stone-600 dark:bg-stone-700/50 dark:text-stone-300">
            {entry.tradition}
          </span>
        )}
        {registerChipLabel(entry.register) && (
          <span className="rounded-full bg-accent-700/10 px-2 py-0.5 text-micro font-medium text-accent-700 dark:text-accent-300">
            {registerChipLabel(entry.register)}
          </span>
        )}
        {entry.paraphrase && <ParaphraseChip />}
      </div>
      {/* Lane/song-verse text is lineated (stanzas, sermon headings) — preserve
          line breaks like the library and /ask surfaces do; exegetical prose
          stays flowing (deep-audit 2026-07-18: collapsing stanzas destroys the
          content of the register). */}
      <p
        className={`font-scripture text-base leading-relaxed text-stone-600 dark:text-stone-500${
          registerLane(entry) === 'exegetical' ? ' break-words' : ' whitespace-pre-line break-words'
        }`}
      >
        {displayText}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 inline-flex min-h-[36px] items-center text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
      {entry.sourceTitle && (
        // Attribution is the author + WORK TITLE only — never a host link.
        // Content is ingested and self-hosted (ADR-013); a hyperlink to
        // ccel.org/gutenberg/crosswire surfaces a host as if it were the source
        // (GO_LIVE A5: "attribute to the author, never a host"). provenance
        // keeps the URL for the record; the UI shows the work title, plain.
        <p className="mt-2 text-micro text-stone-500 dark:text-stone-400">
          {entry.sourceTitle}
          {/* CC BY / CC BY-SA require attribution notice; PD needs none */}
          {entry.license && /^cc/i.test(entry.license) ? ` · ${entry.license}` : ''}
        </p>
      )}
    </div>
  );
}

// The labeled register sections (sermon, theology/confession, song/verse) rendered
// BELOW the exegetical commentary on the reader surfaces. Same treatment as the
// long-standing hymns/poetry section — each register in its OWN section, never
// blended into the exegetical voices. Shared by the study panel and the browse
// panel so the reader wall is identical wherever it renders.
export function RegisterLaneSections({
  sermon,
  theology,
  songVerse,
  limit = 4,
}: {
  sermon: CommentaryEntry[];
  theology: CommentaryEntry[];
  songVerse: CommentaryEntry[];
  limit?: number;
}) {
  if (sermon.length === 0 && theology.length === 0 && songVerse.length === 0) return null;
  const section = (title: string, note: string, entries: CommentaryEntry[]) =>
    entries.length === 0 ? null : (
      <div>
        <RegisterSectionHeading title={title} note={note} />
        <div className="space-y-2">
          {entries.slice(0, limit).map((e, i) => (
            <EntryCard key={i} entry={e} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="space-y-2">
      {section('Sermons', SERMON_NOTE, sermon)}
      {section('Theology & confessions', THEOLOGY_NOTE, theology)}
      {section('Hymns & sacred poetry', SONG_VERSE_NOTE, songVerse)}
    </div>
  );
}

export function CommentaryPanel({
  verseNum,
  verseText,
  entries,
  onClose,
  annotation,
}: {
  verseNum: number;
  verseText: string;
  entries: CommentaryEntry[];
  onClose: () => void;
  annotation?: AnnotationControls;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Register wall (reader side): sermons, theology/confessions, and hymns/poems are
  // DISTINCT registers — each renders in its OWN labeled section below, never
  // blended into (or displacing) the exegetical commentary voices.
  const { exegetical, sermon, theology, songVerse } = partitionByRegister(entries);
  const diverse = pickDiverse(exegetical, 10);
  let lastEra = '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-paper pb-[env(safe-area-inset-bottom)] shadow-deep animate-slide-up dark:bg-stone-900"
      >
 <div className="sticky top-0 z-10 flex items-center justify-between border-b edge bg-paper/95 px-5 py-4 backdrop-blur-sm dark:bg-stone-900/95">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">
            Ancient Paths
          </h2>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-100 hover:text-stone-600 active:bg-stone-100 transition-colors ease-gentle"
            aria-label="Close"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="border-b border-stone-100 bg-stone-50/50 px-5 py-4 dark:border-stone-800 dark:bg-stone-800/40">
          <p className="text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
            Verse {verseNum}
          </p>
          <p className="font-scripture text-base leading-relaxed text-stone-700 italic dark:text-stone-500">
            &ldquo;{verseText}&rdquo;
          </p>
        </div>

        {annotation && <AnnotationBar key={verseNum} annotation={annotation} />}

        <div className="px-5 py-4 space-y-1">
          {diverse.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-500 dark:text-stone-400">
              No commentary available for this verse yet.
            </p>
          ) : (
            diverse.map((entry, i) => {
              const era = eraLabel(entry.year);
              const showEra = era !== lastEra && era !== '';
              if (showEra) lastEra = era;

              return (
                <div key={i}>
                  {showEra && (
                    <p className="pt-4 pb-1.5 text-micro font-bold uppercase tracking-widest text-stone-500">
                      {era}
                    </p>
                  )}
                  <div className="mb-2">
                    <EntryCard entry={entry} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 pb-4">
          <RegisterLaneSections sermon={sermon} theology={theology} songVerse={songVerse} />
        </div>

        {diverse.length < exegetical.length && (
          <div className="px-5 pb-3">
            <p className="text-xs text-stone-500 dark:text-stone-400 text-center">
              Showing {diverse.length} of {exegetical.length} commentaries
            </p>
          </div>
        )}

        <div className="border-t border-stone-100 px-5 py-5 text-center">
          <p className="font-scripture text-sm text-stone-500 italic">
            Nevertheless, not as I will, but as you will. . . . Your will be done!
          </p>
        </div>
      </div>
    </div>
  );
}

function AnnotationBar({ annotation }: { annotation: AnnotationControls }) {
  const [noteText, setNoteText] = useState(annotation.note);
  const [editingNote, setEditingNote] = useState(false);

  if (!annotation.signedIn) {
    return (
      <div className="border-b border-stone-100 bg-white px-5 py-3 dark:border-stone-800 dark:bg-stone-900">
        <Link
          href="/auth/sign-in"
          className="inline-flex min-h-[44px] items-center text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
        >
          Sign in to highlight this verse and save notes to your account →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-b border-stone-100 bg-white px-5 py-3 dark:border-stone-800 dark:bg-stone-900">
      {/* Highlight colors */}
      <div className="flex items-center gap-2">
        <span className="text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Highlight
        </span>
        <div className="flex items-center gap-1.5">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => annotation.onSetHighlight(c.id)}
              aria-label={`Highlight ${c.id}`}
              className={`h-6 w-6 rounded-full ${c.dot} ring-2 transition-transform ease-gentle hover:scale-110 ${
                annotation.color === c.id ? 'ring-stone-700' : 'ring-transparent'
              }`}
            />
          ))}
          {annotation.color && (
            <button
              onClick={annotation.onClearHighlight}
              className="ml-1 text-xs text-stone-500 dark:text-stone-400 hover:text-stone-600"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Note */}
      {editingNote || annotation.note ? (
        <div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onFocus={() => setEditingNote(true)}
            placeholder="Write a note on this verse…"
            aria-label="Note on this verse"
            rows={3}
            className="w-full resize-y rounded-lg bg-stone-100/80 px-3 py-2.5 text-base text-stone-800 outline-none placeholder:text-stone-500 dark:placeholder:text-stone-400 sm:text-sm dark:bg-stone-800 dark:text-stone-100"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={() => {
                annotation.onSaveNote(noteText);
                setEditingNote(false);
              }}
              disabled={!noteText.trim()}
              className="min-h-[44px] rounded-lg bg-accent-700 px-4 text-xs font-semibold text-stone-50 hover:bg-accent-800 active:bg-accent-900 disabled:opacity-40 dark:bg-accent-500 dark:hover:bg-accent-400"
            >
              Save note
            </button>
            {annotation.note && (
              <button
                onClick={() => {
                  annotation.onDeleteNote();
                  setNoteText('');
                  setEditingNote(false);
                }}
                className="min-h-[44px] px-2 text-xs text-stone-500 dark:text-stone-400 hover:text-accent-700 dark:hover:text-accent-300"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditingNote(true)}
          className="inline-flex min-h-[44px] items-center text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
        >
          + Add a note
        </button>
      )}
    </div>
  );
}
