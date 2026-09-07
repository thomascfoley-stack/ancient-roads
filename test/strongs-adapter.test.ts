// adapter-strongs.ts unit checks — Strong's dictionaries must land keyed by
// Strong's number ("G<n> lemma" / "H<n> lemma"), fail closed on malformed
// input, and never pass a short parse off as complete.
import { describe, it, expect } from 'vitest';
import { parseStrongs, parseJsDict } from '../src/ingest/adapter-strongs.js';

const GREEK = `/** header */\nvar strongsGreekDictionary = {
"G1":{"lemma":"ἀάω","translit":"aáō","strongs_def":" to breathe hard","derivation":"a primary word;","kjv_def":"breathe"},
"G2":{"lemma":"Ἀαρών","strongs_def":" Aaron, the brother of Moses","derivation":"of Hebrew origin (H175);","kjv_def":"Aaron"}
};`;

const HEBREW = `/** header */\nvar strongsHebrewDictionary = {
"H1":{"lemma":"אָב","xlit":"ʼâb","pron":"awb","derivation":"a primitive word;","strongs_def":"father, in a literal and immediate, or figurative and remote application","kjv_def":"chief, (fore-) father(-less)"}
};`;

describe('parseStrongs', () => {
  it('keys every entry by Strong\'s number with the lemma', () => {
    const g = parseStrongs(GREEK, 'G', 0);
    expect(g.map((r) => r.key)).toEqual(['G1 ἀάω', 'G2 Ἀαρών']);
    expect(g[0]!.text).toContain('to breathe hard');
    expect(g[0]!.text).toContain('KJV: breathe');
  });

  it('parses the hebrew transliteration fields without breaking', () => {
    const h = parseStrongs(HEBREW, 'H', 0);
    expect(h).toHaveLength(1);
    expect(h[0]!.key).toBe('H1 אָב');
  });

  it('fails closed on a non-numeric key', () => {
    expect(() => parseStrongs('var d = {"Gx1":{"lemma":"α","strongs_def":"x"}};', 'G', 0)).toThrow(/FAIL CLOSED/);
  });

  it('fails closed on an empty definition', () => {
    expect(() => parseStrongs('var d = {"G1":{"lemma":"α","strongs_def":"  "}};', 'G', 0)).toThrow(/FAIL CLOSED/);
  });

  it('fails closed below the parse-failure floor', () => {
    expect(() => parseStrongs(GREEK, 'G', 5000)).toThrow(/parse failure/);
  });

  it('fails closed when there is no object literal', () => {
    expect(() => parseJsDict('not a dictionary', 'G')).toThrow(/FAIL CLOSED/);
  });
});
