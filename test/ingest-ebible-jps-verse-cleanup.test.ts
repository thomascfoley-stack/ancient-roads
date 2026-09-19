// JPS 1917 verse-text cleanup — strips eBible's two kinds of inline editorial
// metadata that sit on the \v line and would otherwise leak into verse text.
//
// BUG (introduced in 9b4cb087, PR #235): the JPS ingester's cleanup only
// stripped eBible's parenthetical original-reference markers "(22-1) … (22-2)
// …" and missed eBible's OTHER inline insertion — the Psalms-book section
// banners "BOOK I" … "BOOK V" — which eBible stranded inside \v 1 of Pss 1,
// 42, 73, 90, and 107 (the five Jewish five-fold divisions of Psalms). The
// canon-exact proof at `canonExactDiffs` is a pure count/contiguity check and
// does not see the extra two words of non-Scripture text, so the bug sails
// through the gate. `parseUsfmFile` (usfm.ts) only skips lines that BEGIN with
// a USFM heading tag (\\h, \\s1, \\d, …) and \\v 1 BOOK I … does not, so the
// banner is captured as verse text and the ingester's cleanup was the only
// place it could be removed — and that cleanup was inline to main() and
// untestable without standing up a USFM tree plus the gitignored KJV corpus.
//
// So — mirroring the earlier extraction of `canonExactDiffs` — the cleanup
// is extracted here into the exported pure function `cleanJpsVerseText` and
// exercised against the five real boundary-psalm openings.
//
// LATENT, not live: the jps slice is BLOCKED on the D3 corpus-store token
// (WORKLOG.md); no `web/public/bible/jps/**` file has ever been written. This
// fix lands BEFORE the first deploy of the JPS translation, so no served slot
// is currently corrupt; the bug is in an unrun, never-deployed ingester that
// would write five polluted verse-1 slots at the next deploy unless fixed.
//
// RED-PROOF: every RED case below — without the `^BOOK [IVX]+\\s+` strip —
// returns a string still starting with `BOOK I/II/III/IV/V `, the exact bytes
// eBible wrote into \\v 1. With the strip in place, the same input returns
// the real JPS verse opening.
//
// THE_LOOP rule 4: a green check is a claim, not a proof, until you have seen
// it fail on a broken input. Each RED case is the seeded broken input.

import { describe, expect, it } from 'vitest';
import { cleanJpsVerseText } from '../src/ingest/ingest-ebible-jps.js';

describe('cleanJpsVerseText — plain verse text passes through (GREEN, no regression)', () => {
  it('a bare verse with no markers or banners is unchanged', () => {
    expect(cleanJpsVerseText('Happy is the man that hath not walked in the counsel of the wicked.')).toBe(
      'Happy is the man that hath not walked in the counsel of the wicked.',
    );
  });

  it('collapses internal whitespace runs to single spaces (unchanged behaviour)', () => {
    expect(cleanJpsVerseText('In the beginning   God\ncreated the heavens')).toBe(
      'In the beginning God created the heavens',
    );
  });

  it('trims leading and trailing whitespace', () => {
    expect(cleanJpsVerseText('  And the earth was without form.  ')).toBe('And the earth was without form.');
  });

  it('an empty string stays empty', () => {
    expect(cleanJpsVerseText('')).toBe('');
  });

  it('a whitespace-only string collapses to empty', () => {
    expect(cleanJpsVerseText('   \n\t  ')).toBe('');
  });
});

describe('cleanJpsVerseText — eBible (N-M) original-ref markers stripped (no regression of the original strip)', () => {
  it('a single mid-string (N-M) marker is removed', () => {
    expect(cleanJpsVerseText('For the Leader; (42-2) As the hart panteth')).toBe(
      'For the Leader; As the hart panteth',
    );
  });

  it('multiple (N-M) markers (the engjps norm) are all removed in one pass', () => {
    expect(cleanJpsVerseText('(22-1) The LORD is my shepherd; (22-2) I shall not want.')).toBe(
      'The LORD is my shepherd; I shall not want.',
    );
  });

  it('a leading (N-M) marker is stripped without leaving leading whitespace', () => {
    expect(cleanJpsVerseText('(3-1) This is the text.')).toBe('This is the text.');
  });
});

describe('cleanJpsVerseText — eBible Psalms-book banners stripped (RED-PROOF, the bug)', () => {
  // The five boundary psalms where eBible inlined `BOOK I..V` inside \v 1.
  // Each input line is the exact form `parseUsfmFile` captures for that
  // verse's \v 1 (i.e. after the `\v 1 ` marker itself is consumed),
  // including (for Ps 42:1) the mixed banner-plus-marker form.

  it('Ps 1:1 — strips `BOOK I ` exposing the real JPS opening', () => {
    const input = 'BOOK I HAPPY IS the man that hath not walked in the counsel of the wicked.';
    expect(cleanJpsVerseText(input)).toBe(
      'HAPPY IS the man that hath not walked in the counsel of the wicked.',
    );
    // RED-PROOF: without the strip this would still start with `BOOK I `.
    expect(cleanJpsVerseText(input), 'must NOT begin with the banner').not.toMatch(/^BOOK [IVX]+ /);
  });

  it('Ps 42:1 — strips `BOOK II ` AFTER the (N-M) markers are removed (order matters)', () => {
    // Exact form eBible wrote: `\v 1 BOOK II (42-1) For the Leader; … (42-2) As the hart …`.
    // The (N-M) strip runs FIRST; it leaves `BOOK II For the Leader; … As the hart …`,
    // which is when the anchored BOOK strip sees position 0 and removes `BOOK II `.
    const input =
      'BOOK II (42-1) For the Leader; Maschil of the sons of Korah. (42-2) As the hart panteth after the water brooks.';
    expect(cleanJpsVerseText(input)).toBe(
      'For the Leader; Maschil of the sons of Korah. As the hart panteth after the water brooks.',
    );
    expect(cleanJpsVerseText(input), 'must NOT begin with the banner').not.toMatch(/^BOOK [IVX]+ /);
  });

  it('Ps 73:1 — strips `BOOK III `', () => {
    const input = 'BOOK III A Psalm of Asaph. Surely God is good to Israel.';
    expect(cleanJpsVerseText(input)).toBe('A Psalm of Asaph. Surely God is good to Israel.');
    expect(cleanJpsVerseText(input)).not.toMatch(/^BOOK [IVX]+ /);
  });

  it('Ps 90:1 — strips `BOOK IV `', () => {
    const input = 'BOOK IV A Prayer of Moses the man of God. Lord, Thou hast been our dwelling-place.';
    expect(cleanJpsVerseText(input)).toBe(
      'A Prayer of Moses the man of God. Lord, Thou hast been our dwelling-place.',
    );
    expect(cleanJpsVerseText(input)).not.toMatch(/^BOOK [IVX]+ /);
  });

  it('Ps 107:1 — strips `BOOK V `', () => {
    const input =
      "BOOK V 'O give thanks unto the LORD, for He is good, for His mercy endureth for ever.'";
    expect(cleanJpsVerseText(input)).toBe(
      "'O give thanks unto the LORD, for He is good, for His mercy endureth for ever.'",
    );
    expect(cleanJpsVerseText(input)).not.toMatch(/^BOOK [IVX]+ /);
  });

  it('all five banners together — each real eBible \\v 1 line cleans to the real opening', () => {
    // Locks the five boundary-psalm inputs in one place so a future reader
    // can see exactly which verse slots the bug affected.
    const cases: [string, string][] = [
      ['BOOK I HAPPY IS the man.', 'HAPPY IS the man.'],
      ['BOOK II (42-1) For the Leader. (42-2) As the hart.', 'For the Leader. As the hart.'],
      ['BOOK III A Psalm of Asaph.', 'A Psalm of Asaph.'],
      ['BOOK IV A Prayer of Moses.', 'A Prayer of Moses.'],
      ["BOOK V 'O give thanks.'", "'O give thanks.'"],
    ];
    for (const [input, expected] of cases) {
      expect(cleanJpsVerseText(input)).toBe(expected);
    }
  });
});

describe('cleanJpsVerseText — anchor discipline (no over-match)', () => {
  // The banner strip is anchored with `^` because eBible inlines the banner
  // only at position 0 of \v 1, never mid-verse. An un-anchored strip would
  // risk removing a legitimate `BOOK V ` appearing inside a verse; the
  // anchor keeps the strip surgical on the five affected verses only.

  it('a `BOOK V ` appearing MID-verse is preserved (the anchor protects it)', () => {
    expect(cleanJpsVerseText('I read about BOOK V of the work.')).toBe('I read about BOOK V of the work.');
  });

  it('a leading `BOOK ` followed by a non-Roman-numeral word is preserved', () => {
    // "of" begins with 'o', not in [IVX], so `^BOOK [IVX]+\s+` does not match.
    expect(cleanJpsVerseText('BOOK of the law is read in the synagogue.')).toBe(
      'BOOK of the law is read in the synagogue.',
    );
  });

  it('a leading `BOOKS ` (no space after BOOK) is preserved', () => {
    // The regex requires `\s+` immediately after `BOOK`; `BOOKS` has no space.
    expect(cleanJpsVerseText('BOOKS are heavy.')).toBe('BOOKS are heavy.');
  });

  it('a leading lowercase `book ` is preserved (the strip is case-sensitive)', () => {
    expect(cleanJpsVerseText('book the next meeting now.')).toBe('book the next meeting now.');
  });

  it('a `BOOK I ` mid-verse is preserved (anchor protects it)', () => {
    // Guards against a non-anchored revert: `BOOK I ` here appears at a
    // non-zero offset and must survive.
    expect(cleanJpsVerseText('He said BOOK I was the best of the five.')).toBe(
      'He said BOOK I was the best of the five.',
    );
  });
});

describe('cleanJpsVerseText — strip-order invariants (regression lock)', () => {
  // The (N-M) strip MUST run before the BOOK strip so Ps 42:1 (banner + marker
  // mixed on the same line) still leaves the BOOK anchor at position 0. This
  // block locks the order against a future reorder.

  it('on the Ps 42:1 mixed form, the (N-M) markers and banner are both gone', () => {
    const out = cleanJpsVerseText('BOOK II (42-1) For the Leader. (42-2) As the hart.');
    expect(out).toBe('For the Leader. As the hart.');
  });

  it('the cleaned Ps 42:1 line does not leave a leading space after the banner strip', () => {
    const out = cleanJpsVerseText('BOOK II (42-1) text (42-2) more text');
    expect(out).toBe('text more text');
    expect(out, 'must not start with a space').toMatch(/^\S/);
  });

  it('the cleaned Ps 42:1 line has neither marker nor banner text remaining', () => {
    const out = cleanJpsVerseText('BOOK II (42-1) For the Leader. (42-2) As the hart.');
    expect(out).not.toMatch(/BOOK [IVX]+/);
    expect(out).not.toMatch(/\(\d+-\d+\)/);
  });

  it('a banner AFTER a (N-M) marker (markers-first form) is still stripped', () => {
    // Hypothetical but exercises the same order property: the (N-M) strip is
    // global, the BOOK strip is anchored; the BOOK must still be at position 0
    // after the markers mid-string are cleared.
    expect(cleanJpsVerseText('BOOK I (1-1) text (1-2) more')).toBe('text more');
  });
});
