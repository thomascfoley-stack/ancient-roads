// THE WELD between migration 044's backfill and the frozen record the verifier trusts.
//
// verify-served-backfill.mjs proves "044 changed the mechanism and no answer" by diffing
// `embeddings.served` against scripts/lib/served-backfill-frozen.mjs. That proof is only as good
// as one premise: THE FROZEN RECORD IS WHAT 044 ACTUALLY RUNS. Both ends have failed once:
//
//   - The first verifier derived its expectation from the live routing.ts, and the same commit
//     rewrote routing.ts out from under it (2026-08-03 audit, finding 1, CONFIRMED).
//   - The first version of THIS file proved substring CONTAINMENT and called it identity. A
//     bylaw-4 refuter ran its own logic against five mutated 044s and got 9/9 green on every
//     one: a lowercase fifth backfill leg, a leg widened with a trailing `OR work='smuggled'`
//     (which by precedence also escaped `user_id IS NULL`), the old predicate parked in a
//     comment while the live one gained a slug, a DROP split across lines, and an extra
//     slug-listed index in a non-CONCURRENTLY form. Containment proves the frozen text is
//     PRESENT; it says nothing about what ELSE the migration serves.
//
// So this file now proves SET-EQUALITY AT THE STATEMENT LEVEL: comments are stripped first, the
// migration's UPDATE statements are extracted case-insensitively and their WHERE clauses must
// equal the frozen legs exactly (as a set, whitespace-normalized) — no fifth leg, no widened
// leg, no commented decoy. Index and drop checks run on the same stripped text with
// whitespace-tolerant forms.

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
  FROZEN_UNION,
} from '../../scripts/lib/served-backfill-frozen.mjs';

const MIGRATION = fileURLToPath(
  new URL('../../db/migrations/044_embeddings_served_expand.sql', import.meta.url),
);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
/** SQL with every `-- …` comment removed — full-line AND trailing. Checks run on THIS, never raw. */
const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

describe('served-backfill frozen record stays welded to migration 044', () => {
  const raw = readFileSync(MIGRATION, 'utf8');
  const sqlOnly = stripComments(raw);
  /** Statements, split on ';' — safe here because 044 carries no string literal containing ';'. */
  const statements = sqlOnly
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  it('the backfill UPDATE statements equal the frozen legs EXACTLY, as a set', () => {
    const updates = statements.filter((s) => /^update\s+embeddings\s+set\s+served\s*=\s*true\b/i.test(s));
    expect(updates.length, '044 must carry exactly four backfill legs (case-insensitive, comment-stripped)').toBe(4);

    const actualWheres = updates.map((u) => {
      const m = /where\s([\s\S]*)$/i.exec(u);
      expect(m, `backfill UPDATE has no WHERE clause: ${u.slice(0, 60)}…`).not.toBeNull();
      return norm(m![1]!);
    });
    // `AND NOT served` is the WRITE-SUPPRESSION guard (a re-run after a lock_timeout abort
    // rewrites zero rows instead of re-bloating the vector table); it narrows which rows are
    // TOUCHED, never which rows END UP served, so the frozen record — the SET of served rows —
    // is unchanged by it and the verifier needs no knowledge of it.
    const expectedWheres = FROZEN_LEGS.map((l) => norm(`user_id IS NULL AND NOT served AND ${l.sql}`));
    // Set-equality, not containment: a widened leg, an extra leg, or a missing leg all fail.
    expect([...actualWheres].sort(), 'the four WHERE clauses must BE the four frozen legs').toEqual(
      [...expectedWheres].sort(),
    );
  });

  it('the six frozen pieces compose the legs exactly (no duplicated or dropped lane)', () => {
    const pieces = [FROZEN_PROSE_TYPES, FROZEN_LEGAL_FILTER, FROZEN_SONG_TYPES, FROZEN_SONG_WORKS, FROZEN_SERMON_WORKS, FROZEN_THEOLOGY_WORKS];
    const union = norm(FROZEN_UNION);
    for (const p of pieces) {
      const n = norm(p);
      const count = union.split(n).length - 1;
      expect(count, `piece appears ${count}x in FROZEN_UNION (must be exactly once): ${n.slice(0, 50)}…`).toBe(1);
    }
    const sqls = FROZEN_LEGS.map((l) => norm(l.sql));
    expect(new Set(sqls).size, 'FROZEN_LEGS must be four DISTINCT legs').toBe(4);
    expect(FROZEN_LEGS.length).toBe(4);
  });

  it('044 drops nothing and renames nothing (the expand half of expand/contract)', () => {
    // Whitespace-tolerant: `DROP\n  INDEX` evaded the old /DROP INDEX/ literal.
    expect(/drop\s+index/i.test(sqlOnly), '044 must not DROP').toBe(false);
    expect(/alter\s+index\s+\S+\s+rename/i.test(sqlOnly), '044 must not RENAME').toBe(false);
  });

  it('exactly six indexes, every form counted; the four HNSW are served-predicated and slugless', () => {
    // ANY create-index form counts — the refuter smuggled one past `CONCURRENTLY IF NOT EXISTS`.
    const creates = statements.filter((s) => /^create\s+(unique\s+)?index\b/i.test(s));
    expect(creates.length, '044 must create exactly six indexes').toBe(6);

    const byName = new Map<string, string>();
    for (const s of creates) {
      const m = /^create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(\S+)[\s\S]*?where\s*\(([\s\S]*)\)\s*$/i.exec(s);
      expect(m, `index statement missing name or WHERE predicate: ${s.slice(0, 70)}…`).not.toBeNull();
      byName.set(m![1]!, norm(m![2]!));
    }
    const hnsw = ['idx_embeddings_served_legal', 'idx_embeddings_served_song_verse', 'idx_embeddings_served_sermon', 'idx_embeddings_served_theology'];
    for (const name of hnsw) {
      const pred = byName.get(name);
      expect(pred, `${name} must exist`).toBeDefined();
      expect(pred!.includes('served'), `${name} predicate must carry served`).toBe(true);
      expect(/metadata->>'work'/.test(pred!), `${name} hand-lists work slugs — the treadmill 044 removes`).toBe(false);
    }
    // The two btrees, by exact expected predicate — not merely "has served", which the work-key
    // btree deliberately does not carry (un-serve targets rows in both states).
    expect(byName.get('idx_embeddings_verseid_served')).toBe(norm(`user_id IS NULL AND served`));
    expect(byName.get('idx_embeddings_work')).toBe(norm(`user_id IS NULL`));
  });
});
