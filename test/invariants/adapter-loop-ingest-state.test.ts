// Red-proofs for ingestState (src/ingest/adapter-loop.ts) — LAUNCH_BLOCKERS #14.
// The completeness predicate must count BOTH embedding planes: flat `embeddings`
// (metadata->>'work') AND `section_embeddings` (per-section, via the sections
// join). Watched red pre-fix: the openbible-style case classified 'partial'
// (flat count short by 41 while section_embeddings was 1:1) and the
// sections-but-no-vectors case classified 'done'. (THE_LOOP rule 4.)
import { describe, it, expect } from 'vitest';
import type pg from 'pg';
import { ingestState } from '../../src/ingest/adapter-loop.js';

// One-row stub: ingestState issues a single aggregate query, so the db double
// just returns the census row. `se` is the section_embeddings count the fixed
// query selects; the pre-fix query never read it.
const stubDb = (row: { e: number; se: number; s: number; status: string | null }) =>
  ({ query: async () => ({ rows: [row] }) }) as unknown as pg.Client;

describe('ingestState — dual-plane completeness', () => {
  it('RED: sections + only section_embeddings → done (the openbible-topics case)', () => {
    // Prod measurement: 6711 sections, 6711 section_embeddings, flat count
    // coincidentally short by 41. Pre-fix: e<s → 'partial' for a complete work.
    const db = stubDb({ e: 6670, se: 6711, s: 6711, status: 'published' });
    return expect(ingestState(db, 'openbible-topics')).resolves.toBe('done');
  });

  it('RED: sections + no vectors in EITHER plane → NOT done', () => {
    // Prod measurement: 668 works with sections but zero section_embeddings and
    // zero flat rows fell through e===0 to 'done'. Pre-fix: 'done'.
    const db = stubDb({ e: 0, se: 0, s: 100, status: 'published' });
    return expect(ingestState(db, 'some-work')).resolves.toBe('partial');
  });

  it('sections + only flat embeddings → done (flat is that work’s model)', () => {
    const db = stubDb({ e: 120, se: 0, s: 120, status: 'published' });
    return expect(ingestState(db, 'flat-work')).resolves.toBe('done');
  });

  it('RED: a shortfall in the best-covered plane → partial', () => {
    // Neither plane reaches the section count: e<s AND se<s.
    const db = stubDb({ e: 95, se: 42, s: 100, status: 'published' });
    return expect(ingestState(db, 'short-work')).resolves.toBe('partial');
  });
});

describe('ingestState — preserved contract', () => {
  it('nothing anywhere → absent', () => {
    const db = stubDb({ e: 0, se: 0, s: 0, status: null });
    return expect(ingestState(db, 'ghost')).resolves.toBe('absent');
  });

  it("status 'ingesting' → partial even when the counts look complete (crashed mid-write)", () => {
    const db = stubDb({ e: 120, se: 120, s: 120, status: 'ingesting' });
    return expect(ingestState(db, 'crashed')).resolves.toBe('partial');
  });

  it('register work with flat embeddings and no sections → done (s=0 path unchanged)', () => {
    const db = stubDb({ e: 120, se: 0, s: 0, status: 'published' });
    return expect(ingestState(db, 'register-work')).resolves.toBe('done');
  });

  it('flat coverage beyond the section count → done (e>s, the old e>=s path)', () => {
    const db = stubDb({ e: 200, se: 0, s: 120, status: 'published' });
    return expect(ingestState(db, 'chunked-work')).resolves.toBe('done');
  });
});
