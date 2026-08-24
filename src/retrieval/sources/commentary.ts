import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { BOOK_BY_SLUG } from '../../bible/books';
import { encodeVerseId } from '../../bible/verse-id';
import type { CorpusDoc } from '../types';

const CORPUS_DIR = 'web/public/commentaries';
const MAX_CHARS = 800; // BGE context is 512 tokens; Greek/Hebrew text tokenizes at ~3 chars/token

interface RawEntry {
  verseStart: number;
  verseEnd: number;
  author: string;
  year: number | null;
  tradition?: string | null;
  sourceTitle: string;
  sourceUrl: string | null;
  text: string;
}

// Crude paragraph packing: greedily pack blank-line-separated paragraphs into
// chunks under maxChars; hard-split any single paragraph that is itself too long.
// Deliberate (not truncation) so a long entry's matching paragraph isn't dropped
// or diluted into a smeared vector.
function chunkText(text: string, maxChars = MAX_CHARS): string[] {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let cur = '';

  const push = () => {
    if (cur) {
      chunks.push(cur);
      cur = '';
    }
  };

  for (const p of paras) {
    if (p.length > maxChars) {
      push();
      for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars));
      continue;
    }
    if (cur && cur.length + p.length + 2 > maxChars) push();
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  push();

  return chunks.length > 0 ? chunks : [text.slice(0, maxChars)];
}

// Yields one CorpusDoc per chunk for every commentary entry in a book. The only
// module that knows the on-disk commentary JSON shape.
/**
 * The flat-corpus key for one commentary entry.
 *
 * D6 (DEEP_SWEEP): this omitted the WORK, so two different works by the same author on the same
 * verse produced the SAME key, and store.ts's `ON CONFLICT (source_type, source_id, chunk_index)
 * DO NOTHING` silently dropped the second. Measured on the real corpus: 14,346 entries lost
 * across 7,657 colliding keys, and not one of them a byte-identical duplicate — 3,857 were a
 * different work by the same author (Henry's Concise vs Commentary on the Whole Bible; Ryle's
 * Expository Thoughts vs Holiness).
 *
 * The title is slugged rather than interpolated raw: the key is split on ':' by consumers
 * (studies.ts derives source_type via `split_part(source_id, ':', 1)`), so a title containing a
 * colon would corrupt it.
 *
 * The title alone is not enough: 11,098 entries share author AND title AND verse range and
 * differ only in text (an author with more than one note on the same verse). `occurrence`
 * disambiguates those by position within the chapter file, which is the source of truth and is
 * stable. Omitted from the key when 0 so the common case stays readable.
 *
 * CHANGING THIS CHANGES EVERY LEGACY KEY. New ingests write new ids; rows already in the table
 * keep theirs, and `ON CONFLICT DO NOTHING` means a re-run INSERTS ALONGSIDE the old rows rather
 * than updating them. That is why the backfill is a separate, owner-gated piece of work and not
 * part of this change — see the revisit log.
 */
export function commentarySourceId(
  bookSlug: string, chapter: number, verseStart: number, verseEnd: number,
  author: string, sourceTitle: string | undefined, occurrence = 0,
): string {
  const work = (sourceTitle ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const base = `commentary:${bookSlug}:${chapter}:${verseStart}-${verseEnd}:${author}:${work}`;
  return occurrence > 0 ? `${base}#${occurrence}` : base;
}

/** Injective keys for one chapter file's entries, in file order. Shared by the ingest generator
 *  and the collision test so both agree on what "the key" is. */
export function assignCommentarySourceIds(
  bookSlug: string, chapter: number,
  entries: readonly { verseStart: number; verseEnd: number; author: string; sourceTitle?: string }[],
): string[] {
  const seen = new Map<string, number>();
  return entries.map((e) => {
    const base = commentarySourceId(bookSlug, chapter, e.verseStart, e.verseEnd, e.author, e.sourceTitle);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return commentarySourceId(bookSlug, chapter, e.verseStart, e.verseEnd, e.author, e.sourceTitle, n);
  });
}

export async function* readCommentaryDocs(opts: { bookSlug: string }): AsyncIterable<CorpusDoc> {
  const book = BOOK_BY_SLUG.get(opts.bookSlug);
  if (!book) throw new Error(`Unknown book: ${opts.bookSlug}`);

  const dir = join(CORPUS_DIR, opts.bookSlug);
  if (!existsSync(dir)) return;

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => parseInt(a) - parseInt(b));

  for (const file of files) {
    const chapter = parseInt(file);
    const data = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as { entries: RawEntry[] };
    if (!Array.isArray(data.entries)) continue;

    // D6: keys assigned over the WHOLE file so the occurrence ordinal is stable. Computed before
    // the text filter for the same reason — dropping an empty entry must not renumber the rest.
    const ids = assignCommentarySourceIds(opts.bookSlug, chapter, data.entries);

    for (const [entryIdx, e] of data.entries.entries()) {
      if (!e.text || !e.text.trim()) continue;

      const verseId = encodeVerseId({ book: book.bookNum, chapter, verse: e.verseStart });
      const verseEnd = encodeVerseId({ book: book.bookNum, chapter, verse: e.verseEnd });
      const sourceId = ids[entryIdx]!;
      const chunks = chunkText(e.text);

      for (let i = 0; i < chunks.length; i++) {
        yield {
          sourceType: 'commentary',
          sourceId,
          chunkIndex: i,
          verseId,
          verseEnd,
          text: chunks[i]!,
          attribution: {
            author: e.author,
            year: e.year ?? null,
            tradition: e.tradition ?? null,
            sourceTitle: e.sourceTitle,
            sourceUrl: e.sourceUrl ?? null,
          },
        };
      }
    }
  }
}
