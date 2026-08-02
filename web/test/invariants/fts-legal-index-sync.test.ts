// §6 THE ROT (2026-07-13). Migration 009's partial FTS index predicate DRIFTED from
// LEGAL_COMMENTARY_ENTRIES_PREDICATE when §1b broadened the query predicate — the planner
// silently stopped using the index and the slow common-word scan came back. Nothing caught
// it. This guard asserts the newest migration that (re)builds idx_commentary_fts_legal
// carries a predicate byte-identical (modulo whitespace) to the constant the search query
// ANDs — so any future change to the constant that forgets a rebuild migration turns red.
// Static (reads the migration file + the constant); runs in CI with no DB.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEGAL_COMMENTARY_ENTRIES_PREDICATE } from '@/lib/legal-corpus';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations', import.meta.url));
const strip = (s: string) => s.replace(/\s+/g, '');

describe('§6 — partial legal FTS index predicate stays in sync with the query predicate', () => {
  it('the newest idx_commentary_fts_legal migration matches LEGAL_COMMENTARY_ENTRIES_PREDICATE', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8').includes('idx_commentary_fts_legal'))
      .sort(); // zero-padded numeric prefixes sort correctly
    expect(files.length, 'expected at least one fts-legal migration').toBeGreaterThan(0);

    const newest = files[files.length - 1]!;
    const sqlText = readFileSync(`${MIGRATIONS_DIR}/${newest}`, 'utf8');

    // The predicate is the WHERE clause of the CREATE INDEX statement (up to its ';') — and it
    // must be the CREATE INDEX for THIS index.
    //
    // THIS USED TO BE `/CREATE INDEX[\s\S]*?WHERE\s*([\s\S]*?);/i`: the FIRST CREATE INDEX in the
    // file, whichever index that built. Every fts-legal migration so far built exactly one index,
    // so the shortcut was invisible — until 037 rebuilt the sermon HNSW index and this one in a
    // single file (one served-list change, two dependent predicates) and the guard compared the
    // HNSW predicate to LEGAL_COMMENTARY_ENTRIES_PREDICATE.
    //
    // That direction was a loud red, which is lucky rather than correct — the guard was reading
    // a different index's predicate and reporting it as this one's. Stated precisely, because the
    // false-green here is narrow and worth naming exactly: it needs a migration whose FIRST
    // CREATE INDEX carries a predicate that DOES equal LEGAL_COMMENTARY_ENTRIES_PREDICATE while
    // the fts-legal rebuild later in the same file has drifted. A second index over the same
    // legal population — a btree for sorting, say — is an ordinary thing to want and produces
    // exactly that shape. Then: green, on a drifted serving index.
    //
    // The general point is the cheap one: a guard that picks an arbitrary index out of a file is
    // not checking the index it is named after, whatever today's file happens to contain.
    //
    // Statements end in ';' and the predicate contains none, so `[^;]` cannot cross a statement
    // boundary — this cannot match a DROP/ALTER, and cannot run past its own statement.
    // SEED: revert to the unanchored regex and put the FTS half second -> the wrong predicate is
    // compared.
    const creates = [...sqlText.matchAll(/CREATE INDEX[^;]*?\bidx_commentary_fts_legal\w*\b[^;]*?WHERE\s*([^;]*);/gi)];
    expect(creates.length, `expected exactly one CREATE INDEX ... idx_commentary_fts_legal ... WHERE in ${newest}`).toBe(1);

    const indexPredicate = strip(creates[0]![1]!);
    const constantPredicate = strip(LEGAL_COMMENTARY_ENTRIES_PREDICATE);
    expect(
      indexPredicate,
      `${newest} index predicate drifted from LEGAL_COMMENTARY_ENTRIES_PREDICATE — ` +
        `add a rebuild migration (the planner will silently stop using the partial index).`,
    ).toBe(constantPredicate);
  });
});
