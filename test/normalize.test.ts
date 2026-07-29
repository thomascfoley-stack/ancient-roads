import { describe, expect, it } from 'vitest';
import { normalizeForMatch, isNormalizedSubstring } from '../src/verifier/normalize';

describe('normalizeForMatch: whitespace/punct/case (unchanged semantics)', () => {
  it('collapses newlines and whitespace', () => {
    expect(normalizeForMatch('the  king\n\nwho  had')).toBe('the king who had');
  });
  it('folds curly quotes, em dashes, ellipses to punctuation', () => {
    expect(normalizeForMatch('David’s—song…')).toBe('david s song');
  });
  it('is case-insensitive via NFKD + lowercase', () => {
    expect(normalizeForMatch('The Shepherd')).toBe('the shepherd');
  });
});

describe('normalizeForMatch: HTML-entity decoding (exact, not fuzzy)', () => {
  it('decodes a numeric decimal entity (&#8217; == ’)', () => {
    // Source stored the apostrophe as an entity; model typed the real char.
    expect(normalizeForMatch('David&#8217;s life')).toBe(normalizeForMatch('David’s life'));
    expect(normalizeForMatch('David&#8217;s life')).toBe('david s life');
  });
  it('decodes a numeric hex entity (&#x2019; == ’)', () => {
    expect(normalizeForMatch('it&#x2019;s')).toBe(normalizeForMatch('it’s'));
  });
  it('decodes named punctuation entities (mdash, hellip, rsquo)', () => {
    expect(normalizeForMatch('a&mdash;b&hellip;c&rsquo;d')).toBe('a b c d');
  });
  it('decodes accented-letter entities identically to the literal character', () => {
    // The meaningful property: the entity form and the real-char form normalize
    // to the same string (NFKD leaves a combining mark, which is fine — it is
    // symmetric across quote and body).
    expect(normalizeForMatch('M&uuml;ller')).toBe(normalizeForMatch('Müller'));
    expect(isNormalizedSubstring('Müller', 'by M&uuml;ller, 1890')).toBe(true);
  });
  it('leaves unrecognized names untouched (no regression, cannot invent a match)', () => {
    // A made-up entity name is not decoded; only the trailing ';' folds (as
    // before this change), and crucially the '&' is preserved unchanged.
    expect(normalizeForMatch('x &notarealentity; y')).toBe('x &notarealentity y');
  });
  it('does not throw on malformed/oversized numeric entities', () => {
    expect(() => normalizeForMatch('&#999999999999; &# &#x; &;')).not.toThrow();
  });
});

describe('isNormalizedSubstring: the fix in situ', () => {
  it('MATCHES a real quote against an entity-encoded source span', () => {
    const source = 'We do not know at what period of David&#8217;s life it was written&mdash;but it sounds.';
    const quote = 'at what period of David’s life it was written—but it sounds';
    expect(isNormalizedSubstring(quote, source)).toBe(true);
  });
  it('STILL REJECTS genuine word-level drift (does not accept near-matches)', () => {
    // The MacLaren case: verbatim opening, then the model stitches a non-adjacent
    // sentence. Decoding entities must NOT rescue this — it is real drift.
    const source =
      'sings this little psalm of Him who is the true Shepherd and King of men. ' +
      'We do not know at what period of David&#8217;s life it was written.';
    const drifted =
      'sings this little psalm of Him who is the true Shepherd and King of men. ' +
      'There is a fulness of experience about it.';
    expect(isNormalizedSubstring(drifted, source)).toBe(false);
  });
  it('rejects an empty quote', () => {
    expect(isNormalizedSubstring('   ', 'anything')).toBe(false);
  });
});
