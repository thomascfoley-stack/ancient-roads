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

describe('scanReferences — numbered books mid-prose and abbreviated forms (M3)', () => {
  // The two drops measured in docs/evidence/uploader-deep-dive-2026-08-20/MEASUREMENTS.md Run 4,
  // plus the seven forms of that matrix that already worked, pinned as regression controls.
  //
  // Mechanism (a): SCAN_RE's leftmost match at a word PRECEDING a numbered book eats the ordinal —
  // "see also 1 Corinthians 13" produces the candidate "also 1" (rejected), and because matchAll
  // resumes after the consumed "1", the remaining "Corinthians 13" is ambiguous (1 Cor vs 2 Cor)
  // and dies in parseRef. Mechanism (b): SCAN_RE's book word is `[a-z]{2,}` followed directly by
  // `\s+`, so an abbreviation's trailing period ("Cor.") kills the candidate before it forms.
  const scan = (t: string) => scanReferences(t).map((r) => r.display);

  // ── the two measured drops ──────────────────────────────────────────────────────────────────
  it('finds a numbered book preceded by prose (drop a)', () => {
    expect(scan('see also 1 Corinthians 13:4-7 on love')).toEqual(['1 Corinthians 13:4–7']);
  });
  it('finds a numbered book after another reference in the same sentence (drop a)', () => {
    expect(scan('Compare John 3:16, and see also 1 Corinthians 13:4-7 on love.')).toEqual([
      'John 3:16',
      '1 Corinthians 13:4–7',
    ]);
  });
  it('finds the abbreviated form with a period, standalone (drop b)', () => {
    expect(scan('1 Cor. 13:4-7')).toEqual(['1 Corinthians 13:4–7']);
  });
  it('finds the abbreviated form with a period, mid-prose (both mechanisms at once)', () => {
    expect(scan('as Paul says in 1 Cor. 13:4-7, love is patient')).toEqual(['1 Corinthians 13:4–7']);
  });
  it('finds the CCEL header forms the measurement log cites', () => {
    expect(scan('1 Cor. 11:26')).toEqual(['1 Corinthians 11:26']);
    expect(scan('2 Chron. 33:9-13')).toEqual(['2 Chronicles 33:9–13']);
  });

  // ── the seven Run-4 forms that already worked: regression controls ──────────────────────────
  it('control: unnumbered book mid-prose', () => {
    expect(scan('As Paul writes in Romans 8:28, all things work together')).toEqual(['Romans 8:28']);
  });
  it('control: numbered book standalone', () => {
    expect(scan('1 Corinthians 13:4-7')).toEqual(['1 Corinthians 13:4–7']);
  });
  it('control: worded ordinal', () => {
    expect(scan('First Corinthians 13:4-7')).toEqual(['1 Corinthians 13:4–7']);
  });
  it('control: numbered book at string start, prose after', () => {
    expect(scan('2 Timothy 1:18 is the text.')).toEqual(['2 Timothy 1:18']);
  });
  it('control: unnumbered book mid-prose with trailing period', () => {
    expect(scan('Turn with me to Ephesians 2:8-9.')).toEqual(['Ephesians 2:8–9']);
  });
  it('control: two references joined by "and"', () => {
    expect(scan('Genesis 1:1-3 and Revelation 22:20')).toEqual(['Genesis 1:1–3', 'Revelation 22:20']);
  });
  it('control: chapter reference followed by a number word-pair stays intact', () => {
    expect(scan('Genesis 1 and 2')).toEqual(['Genesis 1']);
  });

  // ── adversarial NON-citations: every one measured [] before the fix, and must stay [] ───────
  it.each([
    ['digit-noun with sentence boundary', 'I have 1 dog. 3 cats'],
    ['chapter-of-a-manual', 'Chapter 3:16 of the manual'],
    ['digit-noun digit-noun', 'he ate 2 pizzas 4 nights running'],
    ['counted things', 'the top 3 things in 2 weeks'],
    ['clock time with sentence boundary', 'meeting at 1 pm. 30 people came'],
    ['verse-less numbers', 'verse-less numbers like 12 and 14 mean nothing'],
    ['ordinal-noun sentence boundary', 'we sang 2 hymns. 12 people wept'],
  ])('yields nothing for %s', (_label, text) => {
    expect(scan(text)).toEqual([]);
  });
});

describe('scanReferences — overlap dedupe (the 1/2/3-John residual)', () => {
  // Tier-level verification of the M3 fix (2026-08-21) found the additive ordinal pass left the
  // OLD wrong-book match alive beside the new correct one wherever the bare name is itself an
  // alias: "What does 1 John 4:8 mean?" scanned to BOTH John 4:8 (the Gospel, wrong) and
  // 1 John 4:8 — display-dedupe cannot see that the two candidates overlap in the SOURCE. The
  // floor then spent one of its two reserved slots on Gospel-of-John commentary. Overlapping
  // candidate spans now resolve to the LONGER span.
  const books = (s: string) => scanReferences(s).map((r) => r.display);

  it('a prefixed numbered-John query yields ONLY the epistle', () => {
    expect(books('What does 1 John 4:8 mean?')).toEqual(['1 John 4:8']);
    // Single-chapter books display without the chapter — the canonical form, not a bug.
    expect(books('read 2 John 1:6')).toEqual(['2 John 6']);
    expect(books('on 3 John 1:4')).toEqual(['3 John 4']);
  });

  it('non-overlapping references all survive — the dedupe is positional, not greedy', () => {
    expect(books('Ephesians 2:8-9 and 1 Peter 5:7')).toEqual(['Ephesians 2:8–9', '1 Peter 5:7']);
    expect(books('Genesis 1:1-3 and Revelation 22:20')).toEqual(['Genesis 1:1–3', 'Revelation 22:20']);
  });

  it('the bare alias alone is untouched', () => {
    expect(books('John 4:8')).toEqual(['John 4:8']);
    expect(books('What does John 4:8 mean?')).toEqual(['John 4:8']);
  });
});

describe('scanReferences — attached-digit ordinals (1Cor 13, #108)', () => {
  // SCAN_RE's ordinal group requires `\s+` after the ordinal and its book group `[a-z]{2,}`
  // cannot start on a digit, so "1Cor 13" formed no candidate at all and never reached
  // parseRef — which already normalises the attached form ("1john" → "1 john"). The fix is a
  // third additive pass (DIGIT_ATTACHED_SCAN_RE), same shape as ORDINAL_BOOK_SCAN_RE; the
  // [1-3] prefix is required and parseRef validates every candidate, so precision holds.
  const scan = (t: string) => scanReferences(t).map((r) => r.display);

  // ── the two reported forms (issue #108's failing tests, verbatim) ──────────────────────────
  it('finds attached-digit ordinals (1Cor 13)', () => {
    expect(scan('1Cor 13')).toEqual(['1 Corinthians 13']);
  });
  it('finds attached-digit ordinals mid-prose', () => {
    expect(scan('turn to 1Cor 13:4-7 for the reading')).toEqual(['1 Corinthians 13:4–7']);
  });

  // ── the third pass and the overlap resolver ────────────────────────────────────────────────
  it('a prefixed attached-digit 1 John query yields ONLY the epistle', () => {
    // Same winner rule as the spaced form: the digit-attached span covers the characters the
    // wrong "John 4:8" (Gospel) would come from, so only the epistle may survive.
    expect(scan('What does 1John 4:8 mean?')).toEqual(['1 John 4:8']);
  });
  it('non-overlapping references all survive beside the new pass', () => {
    expect(scan('Ephesians 2:8-9 and 2tim 3:16')).toEqual(['Ephesians 2:8–9', '2 Timothy 3:16']);
  });
  it('the same reference in attached and spaced form dedupes by display', () => {
    expect(scan('see 1Cor 13 and 1 Cor 13')).toEqual(['1 Corinthians 13']);
  });

  // ── precision guards: every one measured [] before the fix, and must stay [] ───────────────
  it.each([
    ['suffixed ordinal + bare number', '3rd 4'],
    ['1st + bare number', '1st 3'],
    ['multi-digit prefix', '21cor 13'],
    ['digit word digit', '1 in 3'],
  ])('yields nothing for %s', (_label, text) => {
    expect(scan(text)).toEqual([]);
  });
});

describe('scanReferences — space-separated verses in prose (M3 verse precision)', () => {
  // The remaining half of M3 (docs/evidence/uploader-deep-dive-2026-08-20/MEASUREMENTS.md Run 4):
  // SCAN_RE's numeric tail was `(?::\d{1,3})?` — a verse REQUIRED a colon — so "john 3 16" in
  // prose scanned as chapter-only ("John 3") and the trailing "16" dropped, while parseRef
  // (typeahead) already normalised "3 16" → "3:16". The two functions disagreed, so /ask intent
  // routing ("what does john 3 16 say") resolved a whole CHAPTER instead of the verse. The fix
  // is a fourth additive pass (SPACE_VERSE_SCAN_RE) that requires chapter + SPACE + verse, feeds
  // the span to parseRef, and out-spans SCAN_RE's chapter match under the longer-span rule.
  const scan = (t: string) => scanReferences(t).map((r) => r.display);

  // ── the measured drops: a space-separated verse resolves to the VERSE, not the chapter ─────
  it('finds a space-separated verse in prose (the headline bug)', () => {
    expect(scan('in john 3 16 we read')).toEqual(['John 3:16']);
    expect(scan('what does romans 8 28 teach us')).toEqual(['Romans 8:28']);
  });
  it('finds a space-separated verse for a numbered book (with digit ordinal)', () => {
    expect(scan('1 cor 13 4')).toEqual(['1 Corinthians 13:4']);
    expect(scan('1 john 3 16')).toEqual(['1 John 3:16']);
  });
  it('resolves the verse range, not the chapter range (the intent-routing payload)', () => {
    const r = scanReferences('what does romans 8 28 teach us')[0]!;
    expect(r.ranges).toEqual([{ start: 45008028, end: 45008028 }]);
    expect(r.kind).toBe('verse');
  });

  // ── agreement with parseRef (typeahead) and the colon form ──────────────────────────────────
  it('agrees with parseRef for the space form, and the colon form scans the same verse', () => {
    expect(display('john 3 16')).toBe('John 3:16'); // typeahead already normalised this
    expect(scan('john 3 16')).toEqual(['John 3:16']); // prose now agrees
    expect(scan('john 3:16')).toEqual(['John 3:16']); // colon form unchanged
  });

  // ── ordinal variants all reach the verse, mid-prose and standalone ───────────────────────
  it('roman and word ordinals normalise through parseRef', () => {
    expect(scan('ii tim 3 16')).toEqual(['2 Timothy 3:16']);
    expect(scan('first cor 13 4')).toEqual(['1 Corinthians 13:4']);
    expect(scan('I cor 13 4')).toEqual(['1 Corinthians 13:4']);
    expect(scan('turn to 1 cor 13 4 for the reading')).toEqual(['1 Corinthians 13:4']);
  });

  // ── ranges: a space-separated verse start, with a same-chapter or colon-cross-chapter tail ─
  it('same-chapter verse range via space start + dash end', () => {
    expect(scan('john 3 16-18')).toEqual(['John 3:16–18']);
    expect(scan('1 cor 13 4-7')).toEqual(['1 Corinthians 13:4–7']);
  });
  it('cross-chapter range with a space start and a colon range-end', () => {
    expect(scan('john 3 16-4:2')).toEqual(['John 3:16–4:2']);
  });

  // ── overlap & non-overlap: the longer space-verse span wins; multiple refs all survive ─────
  it('two space-separated verses in one sentence both survive', () => {
    expect(scan('john 3 16 and romans 8 28')).toEqual(['John 3:16', 'Romans 8:28']);
    expect(scan('Ephesians 2 8 and Revelation 22 20')).toEqual(['Ephesians 2:8', 'Revelation 22:20']);
  });
  it('a prefixed numbered-John space-verse yields ONLY the epistle (longer span wins)', () => {
    expect(scan('What does 1 John 4 8 mean?')).toEqual(['1 John 4:8']);
    // Single-chapter books display without the chapter — the canonical form, not a bug.
    expect(scan('read 2 John 1 6')).toEqual(['2 John 6']);
    expect(scan('on 3 John 1 4')).toEqual(['3 John 4']);
  });
  it('the bare Gospel alias space-verse is untouched', () => {
    expect(scan('John 4 8')).toEqual(['John 4:8']);
  });

  // ── regression controls unique to this pass (colon/multiword/digit-attached forms are already
  //    pinned by the M3 / multiword / digit-attached describe blocks above) ───────────────────
  it('control: a bare chapter in prose stays a chapter (no false verse)', () => {
    expect(scan('Isaiah 53 the suffering servant')).toEqual(['Isaiah 53']);
    expect(scan('1 Corinthians 13 the greatest of these is love')).toEqual(['1 Corinthians 13']);
  });
  it('control: a chapter followed by "and <number>" stays a chapter (no false verse)', () => {
    expect(scan('Genesis 1 and 2')).toEqual(['Genesis 1']);
  });

  // ── precision guards: book word + two numbers that die in parseRef, so [] ────────────────────
  it.each([
    ['unknown book word, two numbers', 'the dog 3 4 barked'],
    ['ordinary word, two adjacent numbers', 'top 6 7 results returned'],
    ['non-book "at" before two numbers', 'at 3 16 the meeting started'],
    ['ambiguous numbered book (1/2 Peter)', 'peter 2 3 letters'],
    ['ambiguous numbered book (1/2 Cor, no ordinal)', 'cor 13 4 reference'],
    ['ambiguous prefix (John/Joel)', 'see jo 3 16 again'],
  ])('yields nothing for %s', (_label, text) => {
    expect(scan(text)).toEqual([]);
  });

  it('has a known limit, recorded rather than hidden: a real book word + space verse in non-citation prose resolves', () => {
    // scanReferences finds references; it does not judge whether they are citations — that is
    // isExplicitCitation's job downstream. A book word beside a digit has always resolved; the
    // space-verse pass makes "John 3" → "John 3:16" here, a lateral move on a case that was
    // ALREADY a false positive before this fix (it returned "John 3"). Pinned so the next person
    // meets the limit as a known one, not a surprise — the uncited channel and the ≥2-tradition
    // floor are what stop a stray anchor mattering, same as the M3 colon-form limit recorded in
    // web/test/user-corpus/anchor.test.ts "has a known limit".
    expect(scan('see john 3 16 people came')).toEqual(['John 3:16']);
  });
});
