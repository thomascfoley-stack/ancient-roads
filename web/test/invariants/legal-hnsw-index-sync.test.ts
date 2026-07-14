// §7 guard (2026-07-14). The partial legal HNSW index (migration 012) only speeds up the
// base pool if its WHERE predicate matches the query's — i.e. LEGAL_CORPUS_FILTER. If the
// filter changes and no rebuild migration follows, the planner silently falls back to the
// full-table index and the ef=40 post-filter starvation returns (5 rows, not 50) with no
// error — exactly how migration 009 died. This asserts the newest migration that builds
// idx_embeddings_vector_legal still contains the current LEGAL_CORPUS_FILTER. Static, CI, no DB.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEGAL_CORPUS_FILTER } from '@/lib/teacher/routing';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations', import.meta.url));
const strip = (s: string) => s.replace(/\s+/g, '');

describe('§7 — partial legal HNSW index predicate stays in sync with LEGAL_CORPUS_FILTER', () => {
  it('the newest idx_embeddings_vector_legal migration contains the current LEGAL_CORPUS_FILTER', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8').includes('idx_embeddings_vector_legal'))
      .sort();
    expect(files.length, 'expected a migration that builds idx_embeddings_vector_legal').toBeGreaterThan(0);

    const newest = readFileSync(`${MIGRATIONS_DIR}/${files[files.length - 1]!}`, 'utf8');
    // The index WHERE wraps LEGAL_CORPUS_FILTER in `user_id IS NULL AND source_type=... AND (…)`.
    // Assert the filter body is present verbatim (whitespace-insensitive), so a drift in
    // routing.ts without a rebuild migration turns this red.
    expect(
      strip(newest).includes(strip(LEGAL_CORPUS_FILTER)),
      'migration 012 (partial legal HNSW) no longer contains LEGAL_CORPUS_FILTER — add a rebuild migration',
    ).toBe(true);
  });
});
