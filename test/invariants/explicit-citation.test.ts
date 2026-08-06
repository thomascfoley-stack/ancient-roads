// `isExplicitCitation` — the gate that decides whether a scanned reference becomes an anchor row.
//
// It had NO tests until this file, despite guarding the corpus's historian and sermon ingest paths
// and being the rule that stops `scanReferences` false-positives from being written as facts. The
// defect its own comment describes — `which is 3,000,000` parsed as Isaiah 3 via the `is` alias —
// was found by a deep-audit, fixed, and then left unguarded.
//
// The asymmetry that makes this gate correct, and which the tests below encode: a MISSED citation
// is cheap, because the uncited-quote and semantic channels exist to catch what this drops. A
// FALSE citation is expensive, because an anchor row is a claim about what a document cites.

import { describe, expect, it } from 'vitest';
import { isExplicitCitation } from '../../src/bible/explicit-citation';
// Imported through its original home too: `ingest-sermon.ts` still imports from there, so the
// re-export is load-bearing and a broken one must fail here rather than at ingest time.
import { isExplicitCitation as viaIngestHistorian } from '../../src/ingest/ingest-historian';

describe('the re-export survives the move', () => {
  it('src/ingest/ingest-historian still exports the same function', () => {
    // SEED: delete the re-export line -> RED here, and `ingest-sermon.ts:23` breaks at runtime.
    expect(viaIngestHistorian).toBe(isExplicitCitation);
  });
});

describe('genuine citations are admitted', () => {
  it.each([
    ['abbreviated with a colon', 'Isaiah 53:7', 'As it is written in Isa. 53:7, he was led as a lamb.'],
    ['full book name', 'Isaiah 53:7', 'As it is written in Isaiah 53:7, he was led as a lamb.'],
    ['numbered book', '1 Samuel 12:1', 'Consider 1 Samuel 12 and what Samuel said to them.'],
    ['chapter only', 'Romans 8', "The argument of Romans 8 is the believer's security."],
    ['roman numeral chapter', 'John 10:10', "See John x. 10 for the shepherd's own words."],
    ['book named later in the body', 'Psalms 23:1', 'A familiar line, and Psalm 23 is where it lives.'],
  ])('%s', (_label, display, body) => {
    expect(isExplicitCitation(display, body)).toBe(true);
  });
});

describe('false positives are refused — the expensive direction', () => {
  it('refuses the deep-audit regression: "which is 3,000,000" is not Isaiah 3', () => {
    // THE defect this gate exists for. SEED: `return true` at the top of isExplicitCitation -> RED.
    expect(isExplicitCitation('Isaiah 3', 'a sum which is 3,000,000 talents of silver')).toBe(false);
  });

  it('refuses a reference whose book is never named in the body', () => {
    // scanReferences resolved a display from somewhere; if the body does not NAME the book beside
    // a digit, it is not a citation.
    expect(isExplicitCitation('Romans 8:28', 'And all things work together for good to them that love God.')).toBe(false);
  });

  it('refuses a bare number with no book near it', () => {
    expect(isExplicitCitation('Romans 8', 'There were 8 of them gathered in the upper room.')).toBe(false);
  });

  it('refuses when the book is named but no digit follows it', () => {
    expect(isExplicitCitation('Romans 8', "The epistle to the Romans is Paul's longest.")).toBe(false);
  });

  // ── THE DEFECT THIS TEST FILE FOUND, 2026-08-03 ────────────────────────────────────────────────
  // The rule was `[0-9ivxlc]` — one character class, meant to admit a roman chapter ("John x. 10").
  // It matched the first letter of ANY word starting i/v/x/l/c, which in English prose is constant.
  // Every case below was ADMITTED as an explicit citation before the fix, and each would have
  // become an anchor ROW — which this repo treats as a fact, not a probability. It is the same
  // alias collision the function was written to kill, returning through the roman branch.
  //
  // SEED: restore `[0-9ivxlc]` in explicit-citation.ts -> all five go RED.
  it.each([
    ['a people, not an epistle', 'Romans 8', 'The Romans conquered Britain.'],
    ['a name, then a c-word', 'John 10', 'John came to bear witness of the light.'],
    ['an imperative, then a c-word', 'Mark 4', 'Mark carefully what I say.'],
    ['a name, then an l-word', 'Luke 2', 'Luke likewise records it.'],
    ['a common noun, then a v-word', 'Acts 2', 'The acts victoriously performed.'],
  ])('refuses a book name followed by an ordinary word: %s', (_label, display, body) => {
    expect(isExplicitCitation(display, body)).toBe(false);
  });

  it('still admits the roman-numeral chapter the loose class existed to catch', () => {
    // The fix must not throw out what the character class was FOR. A roman numeral closed by a
    // period is a chapter; a bare i/v/x/l/c starting an English word is not.
    expect(isExplicitCitation('John 10', 'See John x. 10 for the shepherd.')).toBe(true);
    expect(isExplicitCitation('Psalms 104', 'Psalm civ. 14 speaks of bread.')).toBe(true);
  });

  it('refuses an empty display', () => {
    expect(isExplicitCitation('', 'Isaiah 53:7 is quoted here.')).toBe(false);
  });
});

describe('the stem rule, stated so its bluntness is visible', () => {
  it('matches on a THREE-letter stem, so near-homographs can pass', () => {
    // Documented, not celebrated. The stem of "Judges" is "jud", which also prefixes "Jude" —
    // so a body citing "Jude 1" satisfies a display of "Judges 1". This is the conservative
    // direction failing OPEN, and it is the known cost of a rule that must survive "Isa.",
    // "Isai.", "Isaiah" and OCR damage without an alias table.
    //
    // Recorded here rather than fixed: tightening it belongs with the anchor-precision work in
    // step 3, where it can be MEASURED against real documents rather than guessed at.
    expect(isExplicitCitation('Judges 1', 'See Jude 1 and weep.')).toBe(true);
  });

  it('is case-insensitive, because OCR and prose are not consistent', () => {
    expect(isExplicitCitation('Isaiah 53', 'see ISAIAH 53 for the suffering servant')).toBe(true);
  });

  it('does not throw on regex-special characters in the display', () => {
    // The display comes from a parser, not a human. A crash here would take down an ingest run.
    for (const d of ['(Romans) 8', 'Song of Solomon 1:1', 'a+b 3', '[x] 1', '1 Samuel 12:1–5']) {
      expect(() => isExplicitCitation(d, 'some body text with Romans 8 in it')).not.toThrow();
    }
  });
});
