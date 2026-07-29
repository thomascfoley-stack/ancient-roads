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

    for (const e of data.entries) {
      if (!e.text || !e.text.trim()) continue;

      const verseId = encodeVerseId({ book: book.bookNum, chapter, verse: e.verseStart });
      const verseEnd = encodeVerseId({ book: book.bookNum, chapter, verse: e.verseEnd });
      const sourceId = `commentary:${opts.bookSlug}:${chapter}:${e.verseStart}-${e.verseEnd}:${e.author}`;
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
