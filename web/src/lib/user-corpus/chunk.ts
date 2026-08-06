// The prose packer — the one chunker Slice 1 ships (SERMON_SEARCH_DESIGN §4, UPLOADER_DESIGN §6:
// "chunkers beyond the sermon prose packer" are out of scope).
//
// ── THE BUDGET IS THE LOAD-BEARING NUMBER, AND IT HAS A SCAR ───────────────────────────────────
// bge-large's ceiling is 512 TOKENS, not characters, and the two do not convert at a fixed rate.
// `src/ingest/ingest-historian.ts:28` uses 1800 chars with the comment "~450 tokens — bge-large's
// 512-token budget never truncates". That turned out to be false for token-DENSE text:
// `src/ingest/register-writer.ts:16-20` records 1800 overflowing on Watts ("513 input tokens") and
// drops the register budget to 1200 for hymns and Greek/Hebrew.
//
// Uploads are the densest case there is — a sermon manuscript may carry Greek, Hebrew, long proper
// nouns and heavy quotation. So this uses **1200**, the corrected value, not the 1800 that is still
// sitting in ingest-historian. Chunks split at this bound are still WHOLE: we make more, smaller
// chunks. Nothing is ever truncated, because a truncated chunk embeds silently and returns a vector
// for text the user never sees again.

/** Copied deliberately rather than imported: `web/` cannot import `src/ingest/` (A6). */
export const EMBED_MAX_CHARS = 1200;

export type ChunkKind = 'body' | 'footnote' | 'heading';

export interface Chunk {
  text: string;
  ordinal: number;
  heading?: string;
  kind: ChunkKind;
}

/**
 * A line that is a heading rather than prose.
 *
 * Deliberately conservative: short, no terminal punctuation, and either all-caps or title-ish.
 * Over-detecting headings is worse than under-detecting — a mis-called heading pulls a sentence
 * out of the body, and the 6-gram shingles that cross that boundary vanish, which costs anchor
 * recall in step 3c for no visible reason.
 */
function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 80) return false;
  if (/[.!?,;:]$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 10) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  // ALL CAPS, or a roman/arabic numbered section head ("II.", "3 The Good Shepherd").
  return letters === letters.toUpperCase() || /^([IVXLC]+|\d{1,2})[.)]?\s+\S/.test(t);
}

/** Sentence-boundary split. Keeps the terminator with its sentence. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

/**
 * Pack one paragraph into chunks under `max`.
 *
 * Splits at sentence boundaries. A single sentence longer than the budget (a 19th-century preacher
 * with a fondness for semicolons, or a run with no punctuation at all) is hard-split at the bound
 * rather than truncated — more chunks, no lost text.
 */
function packParagraph(para: string, max: number): string[] {
  if (para.length <= max) return [para];
  const out: string[] = [];
  let buf = '';
  for (const sent of sentences(para)) {
    if (buf && buf.length + sent.length + 1 > max) {
      out.push(buf);
      buf = sent;
    } else {
      buf = buf ? `${buf} ${sent}` : sent;
    }
    while (buf.length > max) {
      out.push(buf.slice(0, max));
      buf = buf.slice(max);
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Split prose into embeddable chunks.
 *
 * Paragraph-aware first, sentence-aware second. Paragraphs are the natural unit of a sermon (§4:
 * "paragraph / move"), so short adjacent paragraphs are packed together rather than each becoming
 * a tiny chunk — the notes-chunker trap in reverse. The heading in force when a chunk starts rides
 * on the chunk as metadata; it is NOT concatenated into the body, matching the corpus convention
 * (`ingest-historian.ts:63`: "heading is NOT part of the body").
 */
export function chunkProse(text: string, max: number = EMBED_MAX_CHARS): Chunk[] {
  const chunks: Chunk[] = [];
  let heading: string | undefined;
  let ordinal = 0;

  const push = (body: string, kind: ChunkKind) => {
    const t = body.trim();
    if (!t) return;
    chunks.push({ text: t, ordinal: ordinal++, kind, ...(heading ? { heading } : {}) });
  };

  // Blank-line-separated blocks are paragraphs. Normalise CRLF first so the split is stable across
  // a .docx written on Windows and a .txt written anywhere else.
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);

  let buf = '';
  for (const block of blocks) {
    const b = block.trim();
    if (!b) continue;

    // A block that is a single heading line changes the heading in force and emits nothing.
    const lines = b.split('\n');
    if (lines.length === 1 && isHeadingLine(lines[0]!)) {
      if (buf) {
        push(buf, 'body');
        buf = '';
      }
      heading = lines[0]!.trim();
      continue;
    }

    for (const piece of packParagraph(b, max)) {
      if (buf && buf.length + piece.length + 2 > max) {
        push(buf, 'body');
        buf = piece;
      } else {
        buf = buf ? `${buf}\n\n${piece}` : piece;
      }
    }
  }
  if (buf) push(buf, 'body');

  // CONTRACT BREACH, loud. Copied in spirit from `ingest-historian.ts:81-83`, which throws rather
  // than let the embedder truncate. A chunk over budget does not fail at embed time — it succeeds,
  // silently, on the first 512 tokens, and the tail is embedded as nothing.
  for (const c of chunks) {
    if (c.text.length > max) {
      throw new Error(
        `contract breach: chunk ${c.ordinal} is ${c.text.length} chars > ${max} — ` +
          'truncation would fire and the tail would embed as nothing',
      );
    }
  }
  return chunks;
}
