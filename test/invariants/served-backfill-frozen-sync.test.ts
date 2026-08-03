// THE WELD between migration 042's backfill and the frozen record the verifier trusts.
//
// verify-served-backfill.mjs proves "042 changed the mechanism and no answer" by diffing
// `embeddings.served` against scripts/lib/served-backfill-frozen.mjs. That proof is only as good
// as one premise: THE FROZEN RECORD IS WHAT 042 ACTUALLY RAN. These tests pin the premise from
// both ends, because each end has already failed once:
//
//   - The first verifier derived its expectation from the live routing.ts, and the same commit
//     rewrote routing.ts out from under it (2026-08-03 audit, finding 1, CONFIRMED). Hence the
//     frozen module.
//   - A frozen module nothing compares to the migration is a hand-maintained copy — artefact 1
//     on the MASTER.md watchlist, the repo's most-repeated defect. Hence these tests.
//
// If 042 is ever edited (it may be, until it is applied to a real database), the frozen module
// moves WITH it or this goes red. After 042 lands anywhere, both are history and neither moves.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FROZEN_LEGS,
  FROZEN_LEGAL_FILTER,
  FROZEN_PROSE_TYPES,
  FROZEN_SONG_TYPES,
  FROZEN_SONG_WORKS,
  FROZEN_SERMON_WORKS,
  FROZEN_THEOLOGY_WORKS,
} from '../../scripts/lib/served-backfill-frozen.mjs';

const MIGRATION = fileURLToPath(
  new URL('../../db/migrations/042_embeddings_served_expand.sql', import.meta.url),
);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('served-backfill frozen record stays welded to migration 042', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const sqlNorm = norm(sql);

  const pieces: [string, string][] = [
    ['FROZEN_PROSE_TYPES', FROZEN_PROSE_TYPES],
    ['FROZEN_LEGAL_FILTER', FROZEN_LEGAL_FILTER],
    ['FROZEN_SONG_TYPES', FROZEN_SONG_TYPES],
    ['FROZEN_SONG_WORKS', FROZEN_SONG_WORKS],
    ['FROZEN_SERMON_WORKS', FROZEN_SERMON_WORKS],
    ['FROZEN_THEOLOGY_WORKS', FROZEN_THEOLOGY_WORKS],
  ];

  for (const [name, predicate] of pieces) {
    it(`042 contains ${name} verbatim (whitespace-normalized)`, () => {
      expect(
        sqlNorm.includes(norm(predicate)),
        `${name} does not appear in 042_embeddings_served_expand.sql. Either the migration was ` +
          'edited without moving the frozen record, or vice versa. They must move together — the ' +
          'verifier is only sound while they are identical.',
      ).toBe(true);
    });
  }

  it('the frozen legs cover exactly the four UPDATE statements in 042', () => {
    const updates = sqlNorm.match(/UPDATE embeddings SET served = true/g) ?? [];
    expect(updates.length, '042 must carry exactly four backfill legs').toBe(4);
    expect(FROZEN_LEGS.length, 'the frozen record must carry exactly four legs').toBe(4);
  });

  it('042 drops nothing and renames nothing (the expand half of expand/contract)', () => {
    // The drop-while-live defect (audit finding, deploy-ops M1): the original 039 dropped the
    // old serving indexes in the same file that built the new ones, starving /ask for the
    // deploy window. The expand migration must never drop or rename; 043 owns the contract.
    const sqlOnly = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(/DROP INDEX/i.test(sqlOnly), '042 must not DROP').toBe(false);
    expect(/ALTER INDEX .* RENAME/i.test(sqlOnly), '042 must not RENAME').toBe(false);
  });

  it('every index 042 creates is served-predicated and names no work slug', () => {
    const sqlOnly = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    const creates = [...sqlOnly.matchAll(/CREATE INDEX CONCURRENTLY IF NOT EXISTS\s+(\S+)[\s\S]*?WHERE\s*\(([^;]*)\);/gi)];
    expect(creates.length, 'expected the five new indexes').toBe(5);
    for (const m of creates) {
      const name = m[1] ?? '(unparsed)';
      const predicate = m[2] ?? '';
      expect(predicate.includes('served'), `${name} predicate must carry served`).toBe(true);
      expect(
        /metadata->>'work'/.test(predicate),
        `${name} hand-lists work slugs — the treadmill 042 exists to remove`,
      ).toBe(false);
    }
  });
});
