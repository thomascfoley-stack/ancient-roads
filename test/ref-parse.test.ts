import { describe, expect, it } from 'vitest';
import {
  parseRef,
  matchBooks,
  resolveBookSlug,
  typeahead,
  scanReferences,
  CHAPTER_END_SENTINEL,
  type VerseCountProvider,
} from '../src/bible/ref-parse';

function ranges(input: string, opts?: { verseCounts?: VerseCountProvider }) {
  const r = parseRef(input, opts);
  if (!r.ok) throw new Error(`expected ok for "${input}": ${r.reason}`);
  return r.ref.ranges;
}

function display(input: string) {
  const r = parseRef(input);
  if (!r.ok) throw new Error(`expected ok for "${input}": ${r.reason}`);
  return r.ref.display;
}

function reject(input: string, opts?: { verseCounts?: VerseCountProvider }) {
  const r = parseRef(input, opts);
  if (r.ok) throw new Error(`expected reject for "${input}", got ${r.ref.display}`);
  return r;
}

// Known verse counts for provider tests only.
const COUNTS: Record<number, Record<number, number>> = {
  1: { 1: 31 },      // Genesis 1
  43: { 3: 36 },     // John 3
  65: { 1: 25 },     // Jude
};
const provider: VerseCountProvider = {
  verseCount: (b, c) => COUNTS[b]?.[c],
};

describe('book matching', () => {
  it('resolves exact aliases', () => {
    expect(matchBooks('jn').map((b) => b.slug)).toEqual(['jhn']);
    expect(matchBooks('ps').at(0)?.slug).toBe('psa');
    expect(matchBooks('song of solomon').at(0)?.slug).toBe('sng');
    expect(matchBooks('canticles').at(0)?.slug).toBe('sng');
    expect(matchBooks('apoc').at(0)?.slug).toBe('rev');
    expect(matchBooks('revelations').at(0)?.slug).toBe('rev'); // common misspelling
  });

  it('convention beats prefix ambiguity', () => {
    expect(matchBooks('phil').at(0)?.slug).toBe('php'); // never Philemon
    expect(matchBooks('jud').map((b) => b.slug)).toEqual(['jud']); // Jude, not Judges
    expect(matchBooks('judg').at(0)?.slug).toBe('jdg');
  });

  it('normalizes ordinals: roman, word, suffixed', () => {
    for (const form of ['1 john', 'I John', 'first john', '1st john', '1john', '1 Jn.', 'i jn']) {
      expect(matchBooks(form).map((b) => b.slug)).toEqual(['1jn']);
    }
    expect(matchBooks('II Tim').at(0)?.slug).toBe('2ti');
    expect(matchBooks('third john').at(0)?.slug).toBe('3jn');
  });

  it('unique prefixes resolve, ambiguous prefixes return candidates', () => {
    expect(matchBooks('gene').at(0)?.slug).toBe('gen');
    expect(matchBooks('ez').map((b) => b.slug).sort()).toEqual(['ezk', 'ezr']);
    const jo = matchBooks('jo').map((b) => b.slug);
    expect(jo).toContain('jhn');
    expect(jo).toContain('jol');
    expect(jo.length).toBeGreaterThan(2);
  });

  it('bare numbered-book names return the siblings', () => {
    expect(matchBooks('timothy').map((b) => b.slug)).toEqual(['1ti', '2ti']);
    expect(matchBooks('corinthians').map((b) => b.slug)).toEqual(['1co', '2co']);
    expect(matchBooks('thess').map((b) => b.slug)).toEqual(['1th', '2th']);
  });

  it('unknown input matches nothing', () => {
    expect(matchBooks('qwx')).toEqual([]);
    expect(matchBooks('')).toEqual([]);
  });
});

// A7's product walk (2026-08-02): /read/john/1 failed with "Unknown book: john" while
// /read/jhn/1 worked, even though the alias table right above already knows "john" means
// John. The reader route and the multi-pane desk each did a bare BOOK_BY_BOOK_SLUG.get(slug)
// and never called into this file at all — resolveBookSlug is the fix, an exact-alias-only
// lookup (deliberately not matchBooks' prefix/candidate behaviour, which is right for an
// interactive typeahead and wrong for a URL path segment that must resolve to one book or none).
describe('resolveBookSlug — URL-path book resolution, exact-alias only', () => {
  it('resolves a full alias name a bare Map lookup on the canonical slug would miss', () => {
    // SEED: revert resolveBookSlug to `BOOK_BY_BOOK_SLUG.get(raw)` -> RED, this is the bug itself.
    expect(resolveBookSlug('john')?.slug).toBe('jhn');
    expect(resolveBookSlug('JOHN')?.slug).toBe('jhn'); // case-insensitive, like every other alias
    expect(resolveBookSlug('1john')?.slug).toBe('1jn');
    expect(resolveBookSlug('First John')?.slug).toBe('1jn');
  });

  it('still resolves the canonical slug itself — the common case is unaffected', () => {
    expect(resolveBookSlug('jhn')?.slug).toBe('jhn');
  });

  it('does NOT prefix-match — "jo" must return nothing, not a guess', () => {
    // matchBooks('jo') returns candidates (John AND Joel) because that's correct for a
    // typeahead menu. A URL path segment has no menu: a caller gets one book or none.
    // SEED: swap the implementation to `matchBooks(raw)[0]` -> RED, "jo" silently becomes John.
    expect(matchBooks('jo').length).toBeGreaterThan(1); // the precondition this case depends on
    expect(resolveBookSlug('jo')).toBeUndefined();
  });

  it('unknown input resolves to nothing, same as before the fix', () => {
    expect(resolveBookSlug('qwx')).toBeUndefined();
    expect(resolveBookSlug('')).toBeUndefined();
  });
});

describe('single verse', () => {
  it('parses every common separator to the same verse', () => {
    for (const form of ['john 3:16', 'jn 3:16', 'Jn 3.16', 'jn 3 16', 'JOHN 3v16', 'john 3 v 16', 'jn. 3:16']) {
      expect(ranges(form)).toEqual([{ start: 43003016, end: 43003016 }]);
    }
  });

  it('handles numbered books with any ordinal form', () => {
    for (const form of ['1 john 1:9', '1jn 1:9', 'I John 1:9', 'first john 1 9', '1 Jn. 1.9']) {
      expect(ranges(form)).toEqual([{ start: 62001009, end: 62001009 }]);
    }
  });

  it('drops print letter suffixes', () => {
    expect(ranges('1 cor 13:4a')).toEqual([{ start: 46013004, end: 46013004 }]);
  });
});

describe('single-chapter books', () => {
  it('bare number means verse, not chapter', () => {
    expect(ranges('philemon 6')).toEqual([{ start: 57001006, end: 57001006 }]);
    expect(ranges('jude 24')).toEqual([{ start: 65001024, end: 65001024 }]);
    expect(ranges('obadiah 21')).toEqual([{ start: 31001021, end: 31001021 }]);
    expect(ranges('2 john 12')).toEqual([{ start: 63001012, end: 63001012 }]);
  });

  it('explicit 1:V also works', () => {
    expect(ranges('phm 1:6')).toEqual([{ start: 57001006, end: 57001006 }]);
  });

  it('verse ranges work', () => {
    expect(ranges('jude 24-25')).toEqual([{ start: 65001024, end: 65001025 }]);
  });

  it('displays without a chapter number', () => {
    expect(display('jude 24')).toBe('Jude 24');
    expect(display('philem 6')).toBe('Philemon 6');
  });

  it('rejects chapter 2', () => {
    expect(reject('2 john 2:1').reason).toContain('one chapter');
  });
});

describe('chapters and books', () => {
  it('bare book spans the whole book', () => {
    expect(ranges('john')).toEqual([
      { start: 43001001, end: 43021000 + CHAPTER_END_SENTINEL },
    ]);
    const r = parseRef('john');
    expect(r.ok && r.ref.kind).toBe('book');
  });

  it('chapter spans the chapter', () => {
    expect(ranges('psalm 23')).toEqual([
      { start: 19023001, end: 19023000 + CHAPTER_END_SENTINEL },
    ]);
    expect(ranges('ps 119')).toEqual([
      { start: 19119001, end: 19119000 + CHAPTER_END_SENTINEL },
    ]);
  });

  it('chapter ranges span chapters', () => {
    expect(ranges('matt 5-7')).toEqual([
      { start: 40005001, end: 40007000 + CHAPTER_END_SENTINEL },
    ]);
    const r = parseRef('matt 5-7');
    expect(r.ok && r.ref.kind).toBe('chapter_range');
  });
});

describe('ranges and sequences', () => {
  it('verse ranges, all dash flavors', () => {
    for (const form of ['john 3:16-18', 'john 3:16–18', 'john 3:16—18']) {
      expect(ranges(form)).toEqual([{ start: 43003016, end: 43003018 }]);
    }
  });

  it('cross-chapter ranges', () => {
    expect(ranges('john 3:16-4:2')).toEqual([{ start: 43003016, end: 43004002 }]);
    expect(ranges('gen 1:31-2:3')).toEqual([{ start: 1001031, end: 1002003 }]);
  });

  it('ff runs to end of chapter', () => {
    expect(ranges('rom 8:28ff')).toEqual([
      { start: 45008028, end: 45008000 + CHAPTER_END_SENTINEL },
    ]);
  });

  it('sequences inherit book and chapter left to right', () => {
    expect(ranges('john 3:16, 18')).toEqual([
      { start: 43003016, end: 43003016 },
      { start: 43003018, end: 43003018 },
    ]);
    expect(ranges('john 3:16, 18-20, 4:2')).toEqual([
      { start: 43003016, end: 43003016 },
      { start: 43003018, end: 43003020 },
      { start: 43004002, end: 43004002 },
    ]);
  });

  it('sequence display is canonical', () => {
    expect(display('john 3:16, 18-20, 4:2')).toBe('John 3:16, 18–20, 4:2');
    expect(display('jn 3:16-4:2')).toBe('John 3:16–4:2');
    expect(display('matt 5-7')).toBe('Matthew 5–7');
    expect(display('1co 13')).toBe('1 Corinthians 13');
    expect(display('rom 8:28ff')).toBe('Romans 8:28ff');
  });
});

describe('rejects, never guesses', () => {
  it('unknown book', () => {
    expect(reject('foo 3:16').reason).toContain('Unknown book');
  });

  it('ambiguous book carries candidates', () => {
    const r = reject('ez 3');
    expect(r.reason).toContain('Ambiguous');
    expect(r.candidates?.map((b) => b.slug).sort()).toEqual(['ezk', 'ezr']);
  });

  it('chapter out of bounds, with the count in the message', () => {
    expect(reject('genesis 51').reason).toBe('Genesis has 50 chapters');
    expect(reject('john 99:1').reason).toBe('John has 21 chapters');
  });

  it('verse zero and backwards ranges', () => {
    expect(reject('john 3:0').reason).toContain('start at 1');
    expect(reject('john 3:18-16').reason).toContain('Backwards');
    expect(reject('matt 7-5').reason).toContain('Backwards');
    expect(reject('john 4:2-3:16').reason).toContain('Backwards');
  });

  it('garbage tails', () => {
    expect(parseRef('john 3:16:22').ok).toBe(false);
    expect(parseRef('john :16').ok).toBe(false);
    expect(parseRef('3:16').ok).toBe(false); // no book
  });
});

describe('verse-count provider', () => {
  it('rejects verses beyond the real count', () => {
    expect(reject('john 3:37', { verseCounts: provider }).reason).toBe(
      'John 3 has 36 verses',
    );
    expect(reject('jude 26', { verseCounts: provider }).reason).toBe(
      'Jude has 25 verses',
    );
  });

  it('accepts the last verse and uses real chapter ends', () => {
    expect(ranges('john 3:36', { verseCounts: provider })).toEqual([
      { start: 43003036, end: 43003036 },
    ]);
    expect(ranges('john 3', { verseCounts: provider })).toEqual([
      { start: 43003001, end: 43003036 },
    ]);
    expect(ranges('gen 1:31-2:3', { verseCounts: provider })).toEqual([
      { start: 1001031, end: 1002003 },
    ]);
  });

  it('ff clamps to the real count', () => {
    expect(ranges('john 3:16ff', { verseCounts: provider })).toEqual([
      { start: 43003016, end: 43003036 },
    ]);
  });
});

describe('typeahead routing', () => {
  it('letters-only input returns completions', () => {
    const t = typeahead('jo');
    expect(t.kind).toBe('completions');
    if (t.kind === 'completions') {
      expect(t.books.length).toBeGreaterThan(2);
    }
  });

  it('ordinal-only input still completes', () => {
    const t = typeahead('1 jo');
    expect(t.kind).toBe('completions');
    if (t.kind === 'completions') {
      expect(t.books.map((b) => b.slug)).toEqual(['1jn']);
    }
  });

  it('input with chapter digits parses', () => {
    const t = typeahead('jn 3 16');
    expect(t.kind).toBe('ref');
    if (t.kind === 'ref' && t.outcome.ok) {
      expect(t.outcome.ref.display).toBe('John 3:16');
    } else {
      throw new Error('expected parsed ref');
    }
  });
});

describe('scanReferences — multi-word book names in prose (B2b: the Song of Solomon gap)', () => {
  const scan = (t: string) => scanReferences(t).map((r) => r.display);

  it('resolves "Song of Solomon" quoted by its canonical KJV name', () => {
    expect(scan('Song of Solomon 2, I am the rose of Sharon')).toEqual(['Song of Songs 2']);
  });
  it('resolves "Song of Songs" with a verse', () => {
    expect(scan('as it says in Song of Songs 8:7, love is strong as death')).toEqual(['Song of Songs 8:7']);
  });
  it('still finds a single-word reference embedded in prose (no regression)', () => {
    expect(scan('in John 3 we read that God so loved the world')).toEqual(['John 3']);
  });
  it('does not let the multi-word scan swallow a preceding word', () => {
    // The failure mode a naive broadening of SCAN_RE would cause: "in John 3" parsed
    // as a failed "in john 3" span, losing the reference entirely.
    expect(scan('sitting in John 3 today')).toEqual(['John 3']);
  });
  it('keeps numbered books working', () => {
    expect(scan('1 Corinthians 13 the greatest of these is love')).toEqual(['1 Corinthians 13']);
  });
  it('does not false-resolve a topical mention of "song"', () => {
    expect(scan('there is a song in the night for the weary soul')).toEqual([]);
  });
});
