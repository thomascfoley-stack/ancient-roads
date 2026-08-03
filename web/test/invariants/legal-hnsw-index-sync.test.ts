// §7 guard — the partial HNSW index predicates and the retrieval filters must stay in lockstep.
// If they drift the planner cannot use the partial index, falls back to the full-table index at
// the default ef_search, and the selective register filter post-guts the neighbour list until the
// base pool starves — silently, with no error. That is how migration 009 died.
//
// ── THIS GUARD INVERTED AT MIGRATION 039, AND THE INVERSION IS THE POINT ─────────────────────
//
// It used to assert "the newest index migration NAMES every served work slug". That was the
// correct guard for a design where four hand-typed slug lists in routing.ts were the serving
// switch — and it worked: it caught `spurgeon-talks-to-farmers` and forced migration 037.
//
// But the guard could only ever enforce the treadmill, never question it. Its green meant "the
// lists and the predicates agree", which stayed true while `sources.status='published'` and
// "served" drifted into two unrelated facts — 76 of the 77 works published to production on
// 2026-08-03 were readable on the shelf and invisible to /ask, and every one of those works was
// absent from both the lists and the predicates, so this file was green throughout.
//
// Migration 039 made `embeddings.served` the switch. There is now no list to keep in sync, so the
// guard asks the opposite question: **does any serving predicate name a work slug again?** A slug
// literal reappearing in either place is the regression — it means someone re-introduced the
// hand-maintained set (MASTER.md failure-mode watchlist, artefact 1) that 039 removed.
//
// The two halves below are deliberately different KINDS of check. The first is an anti-pattern
// scan (no slugs anywhere), which cannot tell you the predicates are RIGHT — only that they are
// not hand-listed. The second compares conjunct-by-conjunct against the shipped filters, which is
// what actually keeps the planner honest. Neither subsumes the other, and a single check that
// tried to be both would be weaker than the pair.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXEGETICAL_TYPE_SQL,
  LEGAL_CORPUS_FILTER,
  SERMON_CORPUS_FILTER,
  SONG_VERSE_CORPUS_FILTER,
  SONG_VERSE_TYPE_SQL,
  THEOLOGY_CORPUS_FILTER,
  SERVED_PROSE_WORKS,
  SERVED_SERMON_WORKS,
  SERVED_SONG_VERSE_WORKS,
  SERVED_THEOLOGY_WORKS,
} from '@/lib/teacher/routing';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations', import.meta.url));
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/[()]/g, '').trim().toLowerCase();

/**
 * The newest migration that mentions `needle` in ACTUAL SQL — comment lines are stripped before
 * searching, because prose mentions are not builds. 043's header names the new indexes while
 * instructing the operator's EXPLAIN check, and the naive version of this helper picked it as
 * "the newest migration building idx_embeddings_served_legal" (a file that builds nothing).
 * Same lesson db/apply-migration-concurrent.mjs already carries: its comment-naive parser once
 * extracted the phantom index name "nor" from 018's prose.
 */
const newestContaining = (needle: string) => {
  const sqlOnly = (text: string) => text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => sqlOnly(readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8')).includes(needle))
    .sort();
  expect(files.length, `expected a migration whose SQL contains ${needle}`).toBeGreaterThan(0);
  return { name: files[files.length - 1]!, sql: readFileSync(`${MIGRATIONS_DIR}/${files[files.length - 1]!}`, 'utf8') };
};

/**
 * The predicate of the CREATE INDEX statement that builds `indexName` (or its _vN twin).
 * Extracted rather than eyeballed, so the comparison below is against what Postgres will read.
 */
function indexPredicate(sql: string, indexName: string): string {
  const re = new RegExp(`CREATE INDEX[^;]*?${indexName}(?:_v\\d+)?\\b[^;]*?WHERE\\s*([\\s\\S]*?);`, 'i');
  const m = re.exec(sql);
  expect(m, `could not extract a WHERE predicate for ${indexName}`).not.toBeNull();
  return m![1]!;
}

// Every work slug the frozen backfill record knows about. If ANY of them reappears in a serving
// index predicate, the treadmill is back. Derived from the exports, never hand-listed here — a
// guard whose expected set is typed by the same hand that typed the thing it guards is not a
// second opinion (MASTER.md, the eleventh instance).
const ALL_KNOWN_SLUGS = [
  ...SERVED_PROSE_WORKS, ...SERVED_SERMON_WORKS, ...SERVED_THEOLOGY_WORKS, ...SERVED_SONG_VERSE_WORKS,
];

// The NEW final names from 042_embeddings_served_expand.sql. The old idx_embeddings_vector_*
// names survive until 043 (the contract half) solely so the pre-042 bundle keeps planning
// during the deploy window — they are deliberately NOT guarded here: their predicates are
// frozen history, and 043 removes them.
const SERVING_INDEXES = [
  'idx_embeddings_served_legal',
  'idx_embeddings_served_song_verse',
  'idx_embeddings_served_sermon',
  'idx_embeddings_served_theology',
] as const;

describe('§7 — partial HNSW index predicates stay in lockstep with the retrieval filters', () => {
  describe('no serving predicate names a work slug (migration 039 removed the treadmill)', () => {
    for (const idx of SERVING_INDEXES) {
      it(`${idx} names no work slug`, () => {
        const { name, sql } = newestContaining(idx);
        const predicate = indexPredicate(sql, idx);
        const named = ALL_KNOWN_SLUGS.filter((slug) => predicate.includes(`'${slug}'`));
        expect(
          named,
          `${name} hand-lists ${named.length} work slug(s) in ${idx}'s predicate (${named.slice(0, 3).join(', ')}…). ` +
          'Migration 039 made `embeddings.served` the switch precisely so this list would not exist. ' +
          'Serve a work by publishing it (scripts/publish-flip.mjs writes `served`), not by editing a predicate.',
        ).toEqual([]);
      });
    }
  });

  // The real lockstep check: each index predicate must carry exactly the conjuncts its query
  // carries. `user_id IS NULL` is in every predicate and every query and is asserted separately
  // so a missing one is named rather than folded into a generic mismatch.
  const LOCKSTEP: { index: (typeof SERVING_INDEXES)[number]; conjuncts: string[] }[] = [
    { index: 'idx_embeddings_served_legal', conjuncts: [LEGAL_CORPUS_FILTER, EXEGETICAL_TYPE_SQL] },
    { index: 'idx_embeddings_served_song_verse', conjuncts: [SONG_VERSE_CORPUS_FILTER, SONG_VERSE_TYPE_SQL] },
    { index: 'idx_embeddings_served_sermon', conjuncts: [SERMON_CORPUS_FILTER] },
    { index: 'idx_embeddings_served_theology', conjuncts: [THEOLOGY_CORPUS_FILTER] },
  ];

  for (const { index, conjuncts } of LOCKSTEP) {
    it(`${index}'s predicate implies every conjunct its query uses`, () => {
      const { name, sql } = newestContaining(index);
      const predicate = norm(indexPredicate(sql, index));
      expect(predicate.includes('user_id is null'), `${name}: ${index} predicate omits \`user_id IS NULL\``).toBe(true);
      for (const c of conjuncts) {
        // Each routing constant is a conjunction itself (`served AND source_type = 'sermon'`);
        // compare its parts, so parenthesisation and ordering differences do not read as drift.
        for (const part of norm(c).split(' and ')) {
          expect(
            predicate.includes(part),
            `${name}: ${index}'s predicate is missing \`${part}\`, which its query carries. ` +
            'The planner cannot prove the implication, so it will fall back to the full-table index and the pool starves silently.',
          ).toBe(true);
        }
      }
    });
  }

  // The FTS index over `commentary_entries` is NOT part of 039: that table has no `served`
  // column, so it still enumerates slugs and still needs the old-style guard. Keeping it here,
  // unchanged, is deliberate — dropping it because "039 fixed the slug lists" would silently
  // retire a live check over a table 039 never touched.
  it('the newest legal FTS index carries every served prose + song/verse slug', () => {
    const { sql } = newestContaining('idx_commentary_fts_legal');
    for (const slug of [...SERVED_PROSE_WORKS, ...SERVED_SONG_VERSE_WORKS]) {
      expect(sql.includes(`'${slug}'`), `FTS legal index missing served slug ${slug} — regenerate migration 019`).toBe(true);
    }
  });
});
