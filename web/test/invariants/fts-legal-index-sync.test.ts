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

    // The predicate is the WHERE clause of the CREATE INDEX statement (up to its ';').
    const m = sqlText.match(/CREATE INDEX[\s\S]*?WHERE\s*([\s\S]*?);/i);
    expect(m, `could not find a CREATE INDEX ... WHERE in ${newest}`).not.toBeNull();

    const indexPredicate = strip(m![1]!);
    const constantPredicate = strip(LEGAL_COMMENTARY_ENTRIES_PREDICATE);
    expect(
      indexPredicate,
      `${newest} index predicate drifted from LEGAL_COMMENTARY_ENTRIES_PREDICATE — ` +
        `add a rebuild migration (the planner will silently stop using the partial index).`,
    ).toBe(constantPredicate);
  });
});
