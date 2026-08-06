// The prose packer. Each test names the seed that turns it red.

import { describe, expect, it } from 'vitest';
import { EMBED_MAX_CHARS, chunkProse } from '@/lib/user-corpus/chunk';

const para = (n: number, word = 'grace') => `${`${word} `.repeat(n).trim()}.`;

describe('the embed budget', () => {
  it('is 1200, the corrected value, not the 1800 still sitting in ingest-historian', () => {
    // SEED: set it to 1800 -> RED. The scar is register-writer.ts:16-20 — 1800 overflowed
    // bge-large's 512-TOKEN ceiling on Watts ("513 input tokens"). Uploads are the densest case
    // there is (Greek, Hebrew, heavy quotation), so they get the corrected budget.
    expect(EMBED_MAX_CHARS).toBe(1200);
  });

  it('never emits a chunk over budget, on prose that has no sentence boundaries at all', () => {
    // The pathological case: one unbroken run. It must be split, never truncated.
    const text = 'x'.repeat(EMBED_MAX_CHARS * 3 + 17);
    const chunks = chunkProse(text);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(EMBED_MAX_CHARS);
  });

  it('loses no text when it splits', () => {
    // SEED: change the hard-split to `buf = buf.slice(max + 1)` -> RED, one character per split
    // vanishes silently. Text that vanishes at chunk time is text the search can never return.
    const text = 'abcdefghij'.repeat(500); // 5000 chars, no sentence boundary
    const rejoined = chunkProse(text).map((c) => c.text).join('');
    expect(rejoined).toBe(text);
  });

  it('holds the budget invariant even at an absurdly small max', () => {
    // NAMED FOR WHAT IT CHECKS. An earlier version of this test was called "throws loudly rather
    // than letting an over-budget chunk reach the embedder" and then asserted `.not.toThrow()` —
    // a name describing the opposite of the assertion, which is how a suite ends up reporting a
    // guarantee nobody tested.
    //
    // The contract-breach throw in chunkProse is a BACKSTOP and is unreachable by construction:
    // the hard split already bounds every chunk at `max`. It stays because it costs nothing and
    // would catch a future edit to the packing loop. What is genuinely testable is the invariant
    // it guards, so that is what this asserts, at a max far below any real sentence.
    const chunks = chunkProse('word '.repeat(400), 10);
    expect(chunks.length).toBeGreaterThan(10);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(10);
  });
});

describe('paragraph and sentence awareness', () => {
  it('keeps a short document as one chunk', () => {
    const chunks = chunkProse('The plowman plows. He opens the ground.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe('The plowman plows. He opens the ground.');
  });

  it('packs short adjacent paragraphs together instead of making a chunk each', () => {
    // The notes-chunker trap in reverse (§4): one chunk per fragment gives garbage embeddings for
    // sermons, whose natural unit is the paragraph or move.
    const text = ['First thought.', 'Second thought.', 'Third thought.'].join('\n\n');
    const chunks = chunkProse(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain('First thought.');
    expect(chunks[0]!.text).toContain('Third thought.');
  });

  it('splits at sentence boundaries, not mid-sentence, when a paragraph is long', () => {
    // SEED: drop the sentence split and hard-slice at `max` -> RED. Mid-sentence splits destroy
    // the 6-word shingles that cross the boundary, which is exactly the anchor recall step 3c
    // depends on.
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about the plowman and his ground.`).join(' ');
    const chunks = chunkProse(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(EMBED_MAX_CHARS);
      expect(c.text.trim()).toMatch(/[.!?]$/); // each chunk ends on a sentence terminator
    }
  });

  it('numbers chunks contiguously from zero', () => {
    // user_sections has UNIQUE (document_id, ordinal); a gap or repeat is an insert failure.
    const chunks = chunkProse(Array.from({ length: 30 }, (_, i) => para(40, `w${i}`)).join('\n\n'));
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });
});

describe('headings', () => {
  it('attaches the heading in force as metadata, and keeps it OUT of the body', () => {
    // Corpus convention (`ingest-historian.ts:63`): "heading is NOT part of the body". If the
    // heading were concatenated in, it would contribute shingles the document never wrote.
    const text = 'THE GOOD SHEPHERD\n\nHe giveth his life for the sheep. That is the whole of it.';
    const chunks = chunkProse(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.heading).toBe('THE GOOD SHEPHERD');
    expect(chunks[0]!.text).not.toContain('THE GOOD SHEPHERD');
  });

  it('switches heading when a new one appears', () => {
    const text = 'FIRST HEAD\n\nBody one here.\n\nSECOND HEAD\n\nBody two here.';
    const chunks = chunkProse(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.heading).toBe('FIRST HEAD');
    expect(chunks[1]!.heading).toBe('SECOND HEAD');
  });

  it('does NOT mistake ordinary prose for a heading', () => {
    // SEED: loosen isHeadingLine (drop the terminal-punctuation or word-count test) -> RED.
    // Over-detection silently removes a sentence from the body and with it every shingle that
    // crossed that boundary — an anchor-recall loss with no visible cause.
    const text = 'He giveth his life for the sheep.\n\nAnd they shall hear his voice, and there shall be one fold.';
    const chunks = chunkProse(text);
    expect(chunks[0]!.heading).toBeUndefined();
    expect(chunks.map((c) => c.text).join(' ')).toContain('one fold');
  });

  it('does NOT treat an ALL-CAPS SENTENCE as a heading — terminal punctuation decides it', () => {
    // THIS TEST EXISTS BECAUSE THE RED-PROOF FOUND IT MISSING. Seeding "drop the
    // terminal-punctuation rule" passed 15/15: the existing negative fixture was mixed-case, so
    // the ALL-CAPS rule rejected it anyway and the punctuation rule never decided anything. A
    // rule no fixture exercises is a rule with no test.
    //
    // The real case is not hypothetical: sermons carry all-caps emphasis, and Slice 0's own
    // epigraph format is an ALL-CAPS scripture line ending in a period. Swallowing one as a
    // heading removes it from the body, and with it every 6-gram that crossed that boundary.
    const capsSentence = 'HE GIVETH HIS LIFE FOR THE SHEEP.';
    const chunks = chunkProse(`${capsSentence}\n\nAnd the hireling fleeth.`);
    // SEED: drop the /[.!?,;:]$/ rule in isHeadingLine -> RED here, and only here.
    expect(chunks[0]!.heading).toBeUndefined();
    expect(chunks.map((c) => c.text).join(' ')).toContain('GIVETH HIS LIFE');
  });

  it('treats a numbered section head as a heading', () => {
    const chunks = chunkProse('II. The Second Point\n\nBody follows here and is long enough.');
    expect(chunks[0]!.heading).toBe('II. The Second Point');
  });

  it('does not treat a long line as a heading even in caps', () => {
    const shout = 'THIS IS A VERY LONG LINE OF SHOUTING THAT RUNS WELL PAST ANY PLAUSIBLE HEADING LENGTH INDEED';
    const chunks = chunkProse(`${shout}\n\nBody.`);
    expect(chunks[0]!.heading).toBeUndefined();
    expect(chunks.map((c) => c.text).join(' ')).toContain('SHOUTING');
  });
});

describe('normalisation', () => {
  it('treats CRLF the same as LF, so a Windows .docx chunks like a Unix .txt', () => {
    const unix = 'First para.\n\nSecond para.';
    const windows = 'First para.\r\n\r\nSecond para.';
    expect(chunkProse(windows).map((c) => c.text)).toEqual(chunkProse(unix).map((c) => c.text));
  });

  it('emits nothing for empty or whitespace-only input', () => {
    expect(chunkProse('')).toEqual([]);
    expect(chunkProse('   \n\n \t ')).toEqual([]);
  });
});
