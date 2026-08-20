// history-search pure lib — HISTORY_RETRIEVAL_DESIGN §3. Written RED against a wrong stub.
import { describe, expect, it } from 'vitest';
import {
  HISTORY_RANK_WEIGHTS, assertExcerptVerbatim, makeExcerpt,
  matchEntities, parsePeriod, periodsOverlap, scoreSection,
} from '@/lib/history-search';

describe('ranking weights — pre-registered ORDINAL priors (§3.4)', () => {
  it('the ORDER is the design claim: entity > period > cosine > fts', () => {
    const lone = (p: Partial<Parameters<typeof scoreSection>[0]>) =>
      scoreSection({ entityHit: false, periodOverlap: false, cosine: 0, fts: 0, ...p });
    expect(lone({ entityHit: true })).toBeGreaterThan(lone({ periodOverlap: true }));
    expect(lone({ periodOverlap: true })).toBeGreaterThan(lone({ cosine: 1 }));
    expect(lone({ cosine: 1 })).toBeGreaterThan(lone({ fts: 1 }));
  });
  it('magnitudes come from the exported constant, nowhere else', () => {
    expect(scoreSection({ entityHit: true, periodOverlap: true, cosine: 1, fts: 1 })).toBe(
      HISTORY_RANK_WEIGHTS.entity + HISTORY_RANK_WEIGHTS.period + HISTORY_RANK_WEIGHTS.cosine + HISTORY_RANK_WEIGHTS.fts,
    );
  });
  it('cosine and fts are clamped to 0..1 — a broken normalizer must not outvote an entity hit', () => {
    expect(scoreSection({ entityHit: false, periodOverlap: false, cosine: 99, fts: 0 }))
      .toBe(HISTORY_RANK_WEIGHTS.cosine);
    expect(scoreSection({ entityHit: false, periodOverlap: false, cosine: -1, fts: -5 })).toBe(0);
  });
});

describe('parsePeriod — verbatim forms + the natural-span table, deterministic (§3.2)', () => {
  it('verbatim A.D. / B.C. single years', () => {
    expect(parsePeriod('the council in A.D. 325')).toEqual({ start: 325, end: 325 });
    expect(parsePeriod('destroyed in 586 B.C.')).toEqual({ start: -586, end: -586 });
    expect(parsePeriod('in AD 70 the temple fell')).toEqual({ start: 70, end: 70 });
  });
  it('explicit ranges', () => {
    expect(parsePeriod('between A.D. 100-325')).toEqual({ start: 100, end: 325 });
    expect(parsePeriod('from A.D. 100 to 325')).toEqual({ start: 100, end: 325 });
  });
  it('natural spans', () => {
    expect(parsePeriod('the first century church')).toEqual({ start: 1, end: 100 });
    expect(parsePeriod('fourth century councils')).toEqual({ start: 301, end: 400 });
    expect(parsePeriod('second century B.C. texts')).toEqual({ start: -200, end: -101 });
  });
  it('explicit years beat natural spans; no date → null', () => {
    expect(parsePeriod('first century, specifically A.D. 70')).toEqual({ start: 70, end: 70 });
    expect(parsePeriod('tell me about the church at Ephesus')).toBeNull();
  });
});

describe('periodsOverlap — null-ended sections included', () => {
  it('intersecting, disjoint, and open-ended', () => {
    expect(periodsOverlap({ start: 60, end: 80 }, { start: 66, end: 73 })).toBe(true);
    expect(periodsOverlap({ start: 60, end: 80 }, { start: 100, end: 325 })).toBe(false);
    expect(periodsOverlap({ start: 60, end: 80 }, { start: 70, end: null })).toBe(true);
    expect(periodsOverlap({ start: 60, end: 80 }, { start: null, end: null })).toBe(false);
  });
});

describe('the excerpt gate — v1 faithfulness (§1)', () => {
  const body = 'Now it came to pass that Vespasian sent Titus against Jerusalem in the spring.';
  it('makeExcerpt returns an EXACT substring, capped', () => {
    const ex = makeExcerpt(body, 40);
    expect(ex.length).toBeLessThanOrEqual(40);
    expect(body.includes(ex)).toBe(true);
  });
  it('assertExcerptVerbatim throws on ANY mutation — the seeded-breach red', () => {
    expect(() => assertExcerptVerbatim(body, makeExcerpt(body, 40))).not.toThrow();
    expect(() => assertExcerptVerbatim(body, `${makeExcerpt(body, 40)}…`)).toThrow();
    expect(() => assertExcerptVerbatim(body, 'Vespasian sent Titus against Rome')).toThrow();
  });
});

describe('matchEntities — verbatim, word-bounded, derived vocab (§3.1)', () => {
  const vocab = [
    { slug: 'ephesus', label: 'Ephesus' },
    { slug: 'herod-the-great', label: 'Herod the Great' },
    { slug: 'rome', label: 'Rome' },
  ];
  it('matches whole labels case-insensitively', () => {
    expect(matchEntities('when did the church at ephesus cease', vocab).map((e) => e.slug)).toEqual(['ephesus']);
  });
  it('word boundaries — no substring leakage', () => {
    expect(matchEntities('the Ephesusville festival', vocab)).toEqual([]);
    expect(matchEntities('chromered palaces', vocab)).toEqual([]);
  });
  it('multi-word labels match only as the whole phrase', () => {
    expect(matchEntities('was herod the great a builder', vocab).map((e) => e.slug)).toEqual(['herod-the-great']);
    expect(matchEntities('herod alone should not match the multi-word label', vocab)).toEqual([]);
  });
});
