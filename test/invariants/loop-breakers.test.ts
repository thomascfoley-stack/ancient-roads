// Red-proofs for src/ingest/loop-breakers.ts and loop-digest.ts — every
// breaker is watched trip at its threshold and watched NOT trip below it, and
// the novel-fork stop is watched escalate. (THE_LOOP rule 4.)
import { describe, it, expect } from 'vitest';
import {
  checkBreakers,
  classifyFailure,
  KNOWN_FAILURE_CODES,
  DEFAULT_BREAKERS,
  type LoopBreakerState,
} from '../../src/ingest/loop-breakers.js';
import { buildDigest, digestMarkdown, type DigestRow } from '../../src/ingest/loop-digest.js';

const state = (over: Partial<LoopBreakerState> = {}): LoopBreakerState => ({
  attempted: 0,
  quarantined: 0,
  stagedThisRun: 0,
  recentCodes: [],
  elapsedMs: 0,
  ...over,
});

describe('quarantine-rate breaker', () => {
  it('does not trip before the minimum attempts, even at 100% failure', () => {
    expect(checkBreakers(state({ attempted: 3, quarantined: 3 }))).toBeNull();
  });
  it('RED: trips HALT above 30% once minAttempts is reached', () => {
    const t = checkBreakers(state({ attempted: 4, quarantined: 2 }));
    expect(t?.breaker).toBe('quarantine-rate');
    expect(t?.action).toBe('halt');
  });
  it('holds at exactly 30%', () => {
    expect(checkBreakers(state({ attempted: 10, quarantined: 3 }))).toBeNull();
  });
});

describe('consecutive-failure breaker', () => {
  it('does not trip on mixed codes', () => {
    expect(checkBreakers(state({ recentCodes: ['parse', 'parse', 'fetch', 'parse', 'parse'] }))).toBeNull();
  });
  it('does not trip below the limit even with identical codes', () => {
    expect(checkBreakers(state({ recentCodes: ['parse', 'parse'] }))).toBeNull();
  });
  it('RED: trips HALT on N identical codes in a row and names the code', () => {
    const t = checkBreakers(state({ recentCodes: ['fetch', 'parse', 'parse', 'parse'] }));
    expect(t?.breaker).toBe('consecutive-failure');
    expect(t?.action).toBe('halt');
    expect(t?.reason).toContain("'parse'");
  });
  it('halt-class precedence: consecutive-failure beats a same-work staged-cap pause', () => {
    const t = checkBreakers(state({
      recentCodes: ['parse', 'parse', 'parse'],
      stagedThisRun: DEFAULT_BREAKERS.stagedCap,
    }));
    expect(t?.action).toBe('halt');
  });
});

describe('staged-backlog breaker', () => {
  it('does not trip below the cap', () => {
    expect(checkBreakers(state({ stagedThisRun: 29 }))).toBeNull();
  });
  it('RED: trips PAUSE at the cap — pace to owner review', () => {
    const t = checkBreakers(state({ stagedThisRun: 30 }));
    expect(t?.breaker).toBe('staged-backlog');
    expect(t?.action).toBe('pause');
  });
});

describe('budget breaker', () => {
  it('RED: trips PAUSE at the elapsed cap', () => {
    const t = checkBreakers(state({ elapsedMs: DEFAULT_BREAKERS.maxElapsedMs }));
    expect(t?.breaker).toBe('budget');
    expect(t?.action).toBe('pause');
  });
  it('RED: trips PAUSE at an attempts cap when one is set', () => {
    const t = checkBreakers(state({ attempted: 5 }), { ...DEFAULT_BREAKERS, maxAttempts: 5 });
    expect(t?.breaker).toBe('budget');
    expect(t?.action).toBe('pause');
  });
  it('RED: an exhausted provider 429 trips PAUSE, never a halt or a quarantine', () => {
    const t = checkBreakers(state({ rateLimited: true, attempted: 2 }));
    expect(t?.breaker).toBe('budget');
    expect(t?.action).toBe('pause');
    expect(t?.reason).toContain('429');
  });
  it('no caps set means no budget trip', () => {
    expect(checkBreakers(state({ attempted: 9999, elapsedMs: 999999 }), { ...DEFAULT_BREAKERS, maxElapsedMs: 0, maxAttempts: 0 })).toBeNull();
  });
});

describe('failure classification (the novel-fork stop)', () => {
  it('maps known failures to decision-tree codes', () => {
    expect(classifyFailure('DeepInfra 429 engine_overloaded')).toBe('embed-429');
    expect(classifyFailure('fetch failed: ECONNREFUSED')).toBe('fetch');
    expect(classifyFailure('HTTP 500 from archive.org')).toBe('fetch');
    expect(classifyFailure('license record missing')).toBe('license');
    expect(classifyFailure('no sections parsed')).toBe('parse');
  });
  it('every mapped code is a code the tree covers', () => {
    for (const msg of ['429', 'ECONNRESET', 'licence denied', 'empty result']) {
      expect(KNOWN_FAILURE_CODES).toContain(classifyFailure(msg));
    }
  });
  it('RED: an unmapped failure is unknown — the loop escalates, never invents a fix', () => {
    expect(classifyFailure('the djvu shingle containment regressed mysteriously')).toBe('unknown');
    expect(KNOWN_FAILURE_CODES).not.toContain('unknown');
  });
});

describe('digest', () => {
  const rows: DigestRow[] = [
    { slug: 'a-work', adapter: 'ccel', sourceType: 'hymn', result: 'staged', units: 120, anchored: 118, embedded: 120 },
    { slug: 'b-work', adapter: 'gutenberg', sourceType: 'sermon', result: 'quarantined', code: 'parse', reason: 'parse: no sections' },
    { slug: 'c-work', adapter: 'ccel', sourceType: 'father', result: 'escalated', code: 'unknown', reason: 'unknown: novel fork' },
  ];
  const d = buildDigest(rows, { startedAt: 't0', endedAt: 't1', outcome: 'halted', outcomeReason: 'consecutive-failure: test' });

  it('counts every result kind and never inflates the headline', () => {
    expect(d.counts).toEqual({ published: 0, staged: 1, skipped: 0, quarantined: 1, escalated: 1 });
    expect(d.staged.map((r) => r.slug)).toEqual(['a-work']);
    expect(d.escalations.map((r) => r.slug)).toEqual(['c-work']);
    expect(d.quarantined.map((r) => r.slug)).toEqual(['b-work']);
  });

  it('the markdown carries per-work numbers and the outcome reason, not a blanket ✓', () => {
    const md = digestMarkdown(d);
    expect(md).toContain('120 units · 118 anchored · 120 embedded');
    expect(md).toContain('consecutive-failure: test');
    expect(md).toContain('## Escalations — a human decides these (1)');
    expect(md).not.toContain('corpus ingested ✓');
  });
});
