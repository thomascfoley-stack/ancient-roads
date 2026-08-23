// Reference/pericope intent routing (retrieval): scanReferences finds numeric
// refs in prose, resolveIntent maps named passages — high precision
// (topical queries route to nothing). Ranges are canonical verse IDs.

import { describe, expect, it } from 'vitest';
import { scanReferences } from '../src/bible/ref-parse';
import { resolveIntent } from '../src/bible/pericopes';

const vid = (book: number, ch: number, v = 1) => book * 1_000_000 + ch * 1_000 + v;
const hasStart = (ranges: { start: number }[], start: number) => ranges.some((r) => r.start === start);

describe('scanReferences (numeric refs in prose)', () => {
  it('finds a reference embedded in a natural-language query', () => {
    const refs = scanReferences('1 Corinthians 13 the greatest of these is love');
    expect(refs.flatMap((r) => r.ranges).some((r) => r.start === vid(46, 13))).toBe(true);
  });
  it('handles ordinal books, chapter:verse, and multiple refs', () => {
    expect(scanReferences('Isaiah 53 the suffering servant').some((r) => r.ranges[0]!.start === vid(23, 53))).toBe(true);
    expect(scanReferences('John 3:16 for God so loved the world').some((r) => r.ranges[0]!.start === vid(43, 3, 16))).toBe(true);
  });
  it('is high-precision — non-book words and topical queries yield nothing', () => {
    expect(scanReferences('the good shepherd lays down his life')).toEqual([]);
    expect(scanReferences('propitiation for our sins')).toEqual([]);
    expect(scanReferences('top 6 results in chapter form')).toEqual([]);
  });
});

describe('resolveIntent (named passages)', () => {
  it('resolveIntent unions numeric refs + pericopes into inject, dedupes', () => {
    expect(hasStart(resolveIntent('Romans 8 nothing can separate us').inject, vid(45, 8))).toBe(true);
    expect(hasStart(resolveIntent('the good shepherd lays down his life for the sheep').inject, vid(43, 10))).toBe(true);
  });
  it('floors numeric references unconditionally (a chapter number is explicit intent)', () => {
    expect(hasStart(resolveIntent('Romans 8 nothing can separate us').floor, vid(45, 8))).toBe(true);
  });
  it('floors a pericope only with corroboration; idiomatic use injects but never floors', () => {
    const genuine = resolveIntent('the ten commandments given to Moses'); // "Moses" corroborates
    expect(hasStart(genuine.floor, vid(2, 20))).toBe(true);
    const idiom = resolveIntent('the good shepherd insurance company reviews'); // no biblical context
    expect(hasStart(idiom.inject, vid(43, 10))).toBe(true); // soft-boost still fires (harmless)
    expect(idiom.floor).toEqual([]); // but the floor cannot hijack a topical query
  });
  it('leaves genuinely topical queries unrouted (empty)', () => {
    expect(resolveIntent('propitiation for our sins')).toEqual({ inject: [], floor: [] });
    expect(resolveIntent('justification by faith apart from works')).toEqual({ inject: [], floor: [] });
  });
});
