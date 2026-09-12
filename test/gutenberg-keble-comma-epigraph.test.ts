// keble-christian-year gutenberg profile — comma-form Scripture epigraphs.
//
// PG #4272 (Keble, The Christian Year) prints the romanised Scripture epigraph
// that heads each poem as `_Book_, chap. verse.` — `_`-marked italic book name,
// a roman-numeral chapter, a period, then the verse. `romaniseEpigraph`
// (adapter-gutenberg.ts) rewrites that into `Book chapter:verse` form so
// `scanReferences` (bible/ref-parse.ts) can return the verse reference that
// `epigraphAnchor` attaches to the poem.
//
// 111 of the 111 epigraphs use a SPACE after the italic book name; TWO use a
// COMMA there instead:
//   _Isaiah_, xli. 17.         (Second Sunday after Christmas — Isaiah 41:17)
//   _St. Matthew_, vi. 28.    (Fifteenth Sunday after Trinity — Matthew 6:28)
// The shipped regex required `\s+` (whitespace only) after the book-name group,
// so the two comma-form epigraphs never matched, `romaniseEpigraph` passed them
// through unchanged, `scanReferences` could not parse the un-romanised roman
// numerals, and the two poems were published with `anchors: undefined` — no
// `section_anchors` row and no entry in the verse-keyed per-chapter reader
// corpus (web/public/commentaries/isaiah/41.json, .../matthew/6.json). The fix
// widens the book→chapter separator from `\s+` to `[\s,]+`, admitting the comma
// PG #4272 prints after the italic book name.
//
// The raw PG #4272 text is a .gitignore-d cache write under
// data/raw/gutenberg/4272.txt (fetched on demand by fetchGutenberg), so this
// suite — like gutenberg-luther-works-profile / gutenberg-newman-apologia —
// drives the adapter with an in-memory fixture shaped like the real text
// rather than reading the cache. The two comma-form epigraphs and one
// space-form control below are the VERBATIM epigraph lines from PG #4272
// (lines 1183 and 5470 for the comma pair), so the regex sees the same
// `Book, roman. verse` candidates it sees on the real corpus.

import { describe, expect, it } from 'vitest';
import { buildSections, PROFILES, stripBoilerplate } from '../src/ingest/adapter-gutenberg.js';
import { encodeVerseId } from '../src/bible/verse-id.js';

// KJV book numbers from src/bible/books.ts (the verse-ID encoding is
// book * 1_000_000 + chapter * 1_000 + verse): Job = 18, Isaiah = 23,
// Matthew = 40.
const vid = (book: number, chapter: number, verse: number): number =>
  encodeVerseId({ book, chapter, verse });
const JOB_8_11 = vid(18, 8, 11);       // space-form control
const ISAIAH_41_17 = vid(23, 41, 17);   // comma-form (Isaiah)
const MATTHEW_6_28 = vid(40, 6, 28);    // comma-form (St. Matthew)

// Shape taken from pg4272.txt: a blank-surrounded feast-day TITLE LINE (own ≤120
// char block, dropped by defaultSplit's >120-char filter), then the prose
// epigraph carrying the citation, then the poem body. defaultSplit splits on a
// triple-newline gap (\n\s*\n\s*\n+) so the title is its own block and the
// epigraph + body are one unit; the unit reaching epigraphAnchor therefore
// begins at the epigraph (the citation is within epigraphAnchor's 6-line head).
//   - poems are separated by a TWO blank-line gap (a triple-newline split);
//   - the title↔epigraph boundary is also a two blank-line gap (title dropped);
//   - the epigraph↔body boundary is a SINGLE blank line (one unit together).
//   - the comma pair keep the period AFTER the roman (`xli.`, `vi.`) but use a
//     COMMA after the italic book name — the one obstacle the fix targets.
const KEBLE = `
*** START OF THIS PROJECT GUTENBERG EBOOK ***

MORNING.

Third Sunday after Epiphany.


    Can the rush grow up without mire? can the flag grow without water?
    _Job_ viii. 11.

  The poem body for the third Sunday after Epiphany is long enough to clear
  the default split block filter of one hundred twenty characters so the
  adapter keeps it as a real poetry section in the register output.


Second Sunday after Christmas.


    When the poor and needy seek water, and there is none, and their
    tongue faileth for thirst, I the Lord will hear them, I the God of
    Israel will not forsake them.  _Isaiah_, xli. 17.

  The poem body for the second Sunday after Christmas is long enough to
  clear the default split block filter of one hundred twenty characters so
  the adapter keeps it as a real poetry section in the register output.


Fifteenth Sunday after Trinity.


    Consider the lilies of the field, how they grow.  _St. Matthew_, vi.
    28.

  The poem body for the fifteenth Sunday after Trinity is long enough to
  clear the default split block filter of one hundred twenty characters so
  the adapter keeps it as a real poetry section in the register output.


First Sunday after Trinity.


  The sun is just rising over the quiet hills of the English countryside,
  and the parish bell calls faithful hearts to morning prayer this day,
  a poem with no scripture epigraph heading the work at all whatsoever.

*** END OF THIS PROJECT GUTENBERG EBOOK ***
`;

describe("PROFILES['keble-christian-year'] — comma-form epigraph anchoring", () => {
  const profile = PROFILES['keble-christian-year'];
  // Sections are built once and reused across every assertion below.
  const secs = buildSections(stripBoilerplate(KEBLE), profile!);

  it('the profile exists and is poetry-register, driven by epigraph anchoring', () => {
    expect(profile).toBeDefined();
    expect(profile!.register).toBe('poetry');
    // No sections spec: the keble profile anchors via the epigraph path
    // (romaniseEpigraph + epigraphAnchor), not the scoped-contents path.
    expect(profile!.sections).toBeUndefined();
  });

  it('yields exactly the four kept epigraph/body poems (title blocks dropped)', () => {
    // The four blank-surrounded, ≤120-char feast-day title blocks (and the
    // `MORNING.` part-heading) are their own defaultSplit blocks and are
    // filtered out by the >120-char filter, so only the four epigraph+body
    // units survive as sections — in the fixture's order.
    expect(secs).toHaveLength(4);
    const find = (p: string) => secs.find((s) => s.heading!.startsWith(p));
    expect(find('Can the rush')).toBeDefined();
    expect(find('When the poor and needy')).toBeDefined();
    expect(find('Consider the lilies of the field')).toBeDefined();
    expect(find('The sun is just rising')).toBeDefined();
    // No section's heading is one of the dropped title lines.
    for (const h of secs.map((s) => s.heading ?? '')) {
      expect(h.startsWith('Second Sunday after Christmas')).toBe(false);
      expect(h.startsWith('Fifteenth Sunday after Trinity')).toBe(false);
      expect(h.startsWith('Third Sunday after Epiphany')).toBe(false);
      expect(h.startsWith('MORNING')).toBe(false);
    }
  });

  it('RED-PROOF — the Isaiah comma-form epigraph poem is verse-anchored (Isaiah 41:17)', () => {
    // Without the fix the `\s+` after the book group rejects `_Isaiah_, xli. 17.`
    // (comma, not whitespace), romaniseEpigraph passes it through unchanged,
    // scanReferences returns [] for `Isaiah, xli. 17.`, epigraphAnchor returns
    // null, and `poor.anchors` is `undefined` — this expectation fails.
    const poor = secs.find((s) => s.heading!.startsWith('When the poor and needy'))!;
    expect(poor).toBeDefined();
    expect(poor.anchors).toBeDefined();
    expect(poor.anchors).toEqual([{ verseIdStart: ISAIAH_41_17, verseIdEnd: ISAIAH_41_17 }]);
  });

  it('RED-PROOF — the Matthew comma-form epigraph poem is verse-anchored (Matthew 6:28)', () => {
    // The Matthew citation is split across two raw lines (`..._St. Matthew_, vi.` then `28.`);
    // epigraphAnchor's 6-line head folds the continuation into the search window, and the
    // fix's `[\s,]+` admits the comma after `Matthew` so `vi. 28` romanises to `6:28`.
    // bug: `_St. Matthew_, vi. 28.` is not rewritten → scanReferences returns [] → undefined.
    const lilies = secs.find((s) => s.heading!.startsWith('Consider the lilies of the field'))!;
    expect(lilies).toBeDefined();
    expect(lilies.anchors).toBeDefined();
    expect(lilies.anchors).toEqual([{ verseIdStart: MATTHEW_6_28, verseIdEnd: MATTHEW_6_28 }]);
  });

  it('CONTROL — the space-form Job epigraph still anchors and is unchanged by the fix', () => {
    // A SPACE-separated epigraph (the form 109 of the 111 Keble poems use) must
    // anchor exactly as before; `[\s,]+` is a superset of `\s+` and the book
    // group's optional-trailing-period strip is unchanged, so this is a byte-
    // for-byte identical anchor (Job 8:11).
    const job = secs.find((s) => s.heading!.startsWith('Can the rush'))!;
    expect(job).toBeDefined();
    expect(job.anchors).toEqual([{ verseIdStart: JOB_8_11, verseIdEnd: JOB_8_11 }]);
  });

  it('CONTROL — a poem with no Scripture epigraph stays unanchored (no false positives)', () => {
    // The relaxation must not start anchoring prose that carries no Scripture
    // citation; a poem whose head has no `Book roman. verse` token (and no book
    // word paired with digits) yields no anchor, exactly as the shipped regex.
    const sun = secs.find((s) => s.heading!.startsWith('The sun is just rising'))!;
    expect(sun).toBeDefined();
    expect(sun.anchors).toBeUndefined();
  });
});
