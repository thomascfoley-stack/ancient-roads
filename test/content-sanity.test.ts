// Integrity-gate check: ingested content must be decodable to entity-free text,
// and the detector must recognize quote-breaking entities so new sources can be
// caught before they poison verbatim-quote matching. Runs in `npm run audit`.

import { describe, expect, it } from 'vitest';
import { sanitizeForIngest, hasQuoteBreakingEntities } from '../src/ingest/content-sanity';
import { isNormalizedSubstring } from '../src/verifier/normalize';

describe('content-sanity: sanitizeForIngest', () => {
  it('decodes Greek/Hebrew numeric hex entities to real characters', () => {
    // The corpus reality: Greek/Hebrew words stored as numeric hex entities.
    expect(sanitizeForIngest('the Word was &#x3b8;&#x3b5;&#x3cc;&#x3c2;')).toBe('the Word was θεός');
    expect(sanitizeForIngest('&#x5d7;')).toBe('ח');
  });
  it('decodes a curly apostrophe entity but preserves surrounding text verbatim', () => {
    expect(sanitizeForIngest('David&#8217;s life')).toBe('David’s life');
  });
  it('leaves already-clean text untouched (idempotent-ish, no false decode)', () => {
    const clean = 'The Lord is my shepherd; I shall not want.';
    expect(sanitizeForIngest(clean)).toBe(clean);
  });
  it('makes decoded content matchable by the verifier', () => {
    const stored = sanitizeForIngest('at what period of David&#8217;s life');
    expect(isNormalizedSubstring('at what period of David’s life', stored)).toBe(true);
  });
});

describe('content-sanity: hasQuoteBreakingEntities (gate detector)', () => {
  it('flags numeric char refs and named prose entities', () => {
    expect(hasQuoteBreakingEntities('the Word &#x3b1;')).toBe(true);
    expect(hasQuoteBreakingEntities('David&#8217;s')).toBe(true);
    expect(hasQuoteBreakingEntities('a&mdash;b')).toBe(true);
    expect(hasQuoteBreakingEntities('M&uuml;ller')).toBe(true);
  });
  it('does NOT flag benign structural/symbol entities', () => {
    expect(hasQuoteBreakingEntities('© 1890 &sect;12 &para;')).toBe(false);
    expect(hasQuoteBreakingEntities('spaced&emsp;out')).toBe(false);
  });
  it('does NOT flag clean prose', () => {
    expect(hasQuoteBreakingEntities('The Lord is my shepherd.')).toBe(false);
  });
});
