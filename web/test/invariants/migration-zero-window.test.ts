// Zero-window rebuild guard (reconcile-A, 2026-07-18). Migration 009 died because a
// rebuild DROPPED the live serving index before its replacement existed — during that
// window the planner fell back to the full-table HNSW at hnsw.ef_search=40, the selective
// LEGAL_CORPUS_FILTER post-filtered the 40 neighbours down to ~5, and the base pool
// silently starved (5 rows, not 50). No error, just a serving-quality collapse on prod.
//
// This guard parses 018 and 019 and FAILS if any *serving* index is rebuilt DROP-before-
// CREATE. The safe pattern (see migration 011) is: CREATE INDEX CONCURRENTLY <idx>_v<n>
// (new name, same predicate) → let it go VALID → DROP INDEX CONCURRENTLY <idx> (old) →
// ALTER INDEX <idx>_v<n> RENAME TO <idx>. Never a bare DROP-then-CREATE of the live name,
// and never a DROP of the live name with its replacement built only afterwards.
// Static (reads the migration SQL); runs in CI with no DB.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations', import.meta.url));

// The canonical serving index names whose rebuild must never open a window.
const SERVING_INDEXES = [
  'idx_embeddings_vector_legal',
  'idx_embeddings_vector_song_verse',
  'idx_embeddings_vector_sermon',
  'idx_embeddings_vector_theology',
  'idx_embeddings_verseid_registers',
  'idx_commentary_fts_legal',
];

const FILES = ['018_register_partial_indexes.sql', '019_register_columns_fts.sql'];

// Strip SQL line comments (`-- ... EOL`). This drops the `--SPLIT--` markers AND — the
// reason this must run first — the rollback comments that literally spell
// `DROP INDEX CONCURRENTLY IF EXISTS <name>`, which would otherwise parse as real DROPs.
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

type Stmt =
  | { kind: 'drop'; name: string }
  | { kind: 'create'; name: string }
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'other' };

function parse(sql: string): Stmt[] {
  return stripComments(sql)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw): Stmt => {
      let m: RegExpMatchArray | null;
      if ((m = raw.match(/^DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?([A-Za-z0-9_.]+)/i)))
        return { kind: 'drop', name: m[1]! };
      if ((m = raw.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_.]+)/i)))
        return { kind: 'create', name: m[1]! };
      if ((m = raw.match(/^ALTER\s+INDEX\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_.]+)\s+RENAME\s+TO\s+([A-Za-z0-9_.]+)/i)))
        return { kind: 'rename', from: m[1]!, to: m[2]! };
      return { kind: 'other' };
    });
}

const isTempOf = (name: string, base: string) =>
  name.startsWith(base) && /^_v\d+$/.test(name.slice(base.length));

// Returns a human-readable violation string if the rebuild of serving index `X` in `stmts`
// opens a window, or null if the rebuild is zero-window (or X is not rebuilt in this file).
function windowViolation(stmts: Stmt[], X: string): string | null {
  const dropIdx = stmts.findIndex((s) => s.kind === 'drop' && s.name === X);
  if (dropIdx === -1) return null; // X is not rebuilt in this file

  // (A) bare DROP-then-CREATE of the SAME live name (how 018 currently rebuilds).
  const recreateSameName = stmts.findIndex((s) => s.kind === 'create' && s.name === X);
  if (recreateSameName > dropIdx)
    return (
      `DROP INDEX ${X} (stmt #${dropIdx + 1}) precedes CREATE INDEX ${X} (stmt #${recreateSameName + 1}): ` +
      `the live serving index is dropped before its same-name replacement is built — ef=40 post-filter starvation window.`
    );

  // (B) DROP of the live name with NO create-first temp `<X>_v<n>` built before the drop
  // (how 019 currently rebuilds: DROP idx_commentary_fts_legal, then CREATE ..._v4 after).
  const tempBeforeDrop = stmts.slice(0, dropIdx).some((s) => s.kind === 'create' && isTempOf(s.name, X));
  if (!tempBeforeDrop)
    return (
      `DROP INDEX ${X} (stmt #${dropIdx + 1}) has no CREATE INDEX CONCURRENTLY ${X}_v<n> replacement built before it — ` +
      `the serving index is dropped with no valid replacement in place (window).`
    );

  // (C) safe so far — a temp exists before the drop; confirm it is renamed back to X so the
  // serving name is actually restored.
  const renamedBack = stmts.some((s) => s.kind === 'rename' && s.to === X && isTempOf(s.from, X));
  if (!renamedBack)
    return `${X}_v<n> was built and ${X} dropped, but no ALTER INDEX ${X}_v<n> RENAME TO ${X} restores the serving name.`;

  return null;
}

describe('zero-window index rebuilds — 018/019 must never DROP a live serving index before its replacement is valid', () => {
  for (const file of FILES) {
    const stmts = parse(readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8'));
    const rebuilt = SERVING_INDEXES.filter((X) => stmts.some((s) => s.kind === 'drop' && s.name === X));

    it(`${file}: rebuilds at least one serving index (sanity — the file is parsed)`, () => {
      expect(rebuilt.length, `no serving-index DROP found in ${file}; parser or file changed`).toBeGreaterThan(0);
    });

    for (const X of rebuilt) {
      it(`${file}: rebuild of ${X} is zero-window (create-first → drop old → rename)`, () => {
        const v = windowViolation(stmts, X);
        expect(v, v ?? undefined).toBeNull();
      });
    }
  }
});
