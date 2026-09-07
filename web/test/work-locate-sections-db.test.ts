// locateSections — executed against the real DB (skips loudly without APP_DATABASE_URL).
//
// The /ask result card deep-links into the reader by section ordinal. Classic commentary rows
// carry no section id on their sourceId, so the ordinal is recovered from what the row DOES
// carry — the work slug, the anchor range and the body — by equality on section_anchors
// (anchors_range_idx) with `body = content` as the tiebreak. What is pinned here:
//
//   * a real published, anchored section resolves to its own ordinal (the expected value is
//     computed by an INDEPENDENT query, not read back from the function under test);
//   * an unknown slug resolves to null, and the batch stays index-aligned around it;
//   * a STAGED work resolves to null — the published boundary holds on this read path too,
//     so a result card can never mint a link into a work the reader would 404.
//
// The fixture is CHOSEN AT RUNTIME with a deterministic ORDER BY (never a bare LIMIT 1), so the
// test binds to whatever this database holds rather than to a slug someone typed once.
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { locateSections } from '@/lib/work';
import { runtimeDbUrl } from './helpers/env';
import { announceSkip } from './helpers/loud-skip';

const dbUrl = runtimeDbUrl();

const SKIP = announceSkip(
  'locateSections (executed against the real DB)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'section-ordinal resolution for /ask result links: published section -> ordinal, unknown -> null, staged -> null',
);

interface Fixture { slug: string; ordinal: number; vstart: number; vend: number; body: string }

/** The first anchored section (by slug, ordinal, anchor) of the first anchored source with `status`. */
async function pickAnchored(status: 'published' | 'staged'): Promise<Fixture | null> {
  const sql = getDb();
  const rows = (await sql.query(
    `WITH w AS (
       SELECT src.id, src.slug
         FROM sources src
        WHERE src.status = $1
          AND EXISTS (SELECT 1 FROM sections s JOIN section_anchors a ON a.section_id = s.id WHERE s.source_id = src.id)
        ORDER BY src.slug
        LIMIT 1)
     SELECT w.slug, s.ordinal::int AS ordinal, a.verse_id_start AS vstart, a.verse_id_end AS vend, s.body
       FROM w
       JOIN sections s ON s.source_id = w.id
       JOIN section_anchors a ON a.section_id = s.id
      ORDER BY s.ordinal, a.verse_id_start
      LIMIT 1`,
    [status],
  )) as Array<{ slug: string; ordinal: number; vstart: number; vend: number; body: string }>;
  const r = rows[0];
  return r ? { slug: r.slug, ordinal: Number(r.ordinal), vstart: Number(r.vstart), vend: Number(r.vend), body: r.body } : null;
}

/** The ordinal locateSections SHOULD return for a fixture, by a different query: the lowest ordinal
 *  among that source's sections carrying exactly this range AND this body. */
async function expectedOrdinal(f: Fixture): Promise<number | null> {
  const sql = getDb();
  const rows = (await sql.query(
    `SELECT min(s.ordinal)::int AS ordinal
       FROM sections s
       JOIN section_anchors a ON a.section_id = s.id
       JOIN sources src ON src.id = s.source_id
      WHERE src.slug = $1 AND a.verse_id_start = $2 AND a.verse_id_end = $3 AND s.body = $4`,
    [f.slug, f.vstart, f.vend, f.body],
  )) as Array<{ ordinal: number | null }>;
  return rows[0]?.ordinal === null || rows[0]?.ordinal === undefined ? null : Number(rows[0].ordinal);
}

describe.skipIf(SKIP)('locateSections (executed against the real DB)', () => {
  it('resolves a published, anchored section to its ordinal; an unknown slug to null; index-aligned', async () => {
    const f = await pickAnchored('published');
    expect(f, 'this database holds no published work with an anchored section — nothing to prove').not.toBeNull();
    const want = await expectedOrdinal(f!);
    expect(want, 'the fixture must be findable by range + body').not.toBeNull();

    const out = await locateSections([
      { work: 'no-such-work-qa', verseId: f!.vstart, verseEnd: f!.vend, content: f!.body },
      { work: f!.slug, verseId: f!.vstart, verseEnd: f!.vend, content: f!.body },
      // Same range, a body no section has: the tiebreak loses, the range still resolves to SOME
      // section of that work (the anchor is the locator; the body only prefers the exact chunk).
      { work: f!.slug, verseId: f!.vstart, verseEnd: f!.vend, content: 'qa: no section carries this body' },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(want);
    expect(typeof out[2]).toBe('number');
  });

  it('resolves a STAGED work to null — the published boundary holds on this path too', async ({ skip }) => {
    const f = await pickAnchored('staged');
    if (!f) {
      // The boundary case cannot be exercised on a database with no staged, anchored work; say
      // so rather than pass vacuously. (Dev holds one — this ran, not skipped, on 2026-09-06.)
      console.warn('locateSections staged-boundary case NOT RUN: no staged work with an anchored section on this database');
      skip();
    }
    await expect(locateSections([{ work: f!.slug, verseId: f!.vstart, verseEnd: f!.vend, content: f!.body }])).resolves.toEqual([null]);
  });
});
