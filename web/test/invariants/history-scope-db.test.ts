// BEHAVIORAL scope test (design §6 test 4, amended after review — never a string match on SQL):
// every result the history search returns belongs to a PUBLISHED HISTORIAN work, and every
// excerpt is a verbatim substring of its stored section. Fully derived: the probe entity comes
// from the vocabulary itself, never hand-typed.
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { searchHistory } from '@/lib/history-search-db';
import { assertExcerptVerbatim } from '@/lib/history-search';
import { requireDbInCi } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const dbUrl = requireDbInCi();
const SKIP = announceSkip(
  'history search scope (DB)',
  [
    { name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) },
    { name: 'DEEPINFRA_API_KEY (query embedding)', present: Boolean(process.env.DEEPINFRA_API_KEY) },
  ],
  'that history results are historian-only, published-only, with verbatim excerpts',
);

describe.skipIf(SKIP)('history search — scope and excerpt gate against a real DB', () => {
  it('returns historian/published works only, every excerpt verbatim', async () => {
    const sql = getDb();
    // Derive a probe entity from the served vocabulary — a corpus with none is NOT a pass.
    const vocab = (await sql.query(
      `SELECT DISTINCT a.entity_label AS label FROM section_history_anchors a
         JOIN history_embeddings he ON he.section_id = a.section_id
        WHERE he.served LIMIT 1`,
    )) as { label: string }[];
    expect(vocab.length, 'no served anchored entities — cannot exercise the scope; NOT a pass').toBeGreaterThan(0);

    const res = await searchHistory(`tell me about ${vocab[0]!.label}`);
    expect(res.results.length, 'the derived probe entity returned nothing').toBeGreaterThan(0);
    expect(res.closest?.matched).toContain('entity');

    const slugs = res.results.map((g) => g.work.slug);
    const kinds = (await sql.query(
      `SELECT slug, source_type, status FROM sources WHERE slug = ANY($1)`, [slugs],
    )) as { slug: string; source_type: string; status: string }[];
    for (const k of kinds) {
      expect(k.source_type, `${k.slug} leaked into history results`).toBe('historian');
      expect(k.status).toBe('published');
    }
    for (const g of res.results) {
      for (const s of g.sections) {
        const body = (await sql.query(`SELECT body FROM sections WHERE id = $1`, [s.sectionId])) as { body: string }[];
        expect(() => assertExcerptVerbatim(body[0]!.body, s.excerpt)).not.toThrow();
      }
    }
  }, 60_000);
});
