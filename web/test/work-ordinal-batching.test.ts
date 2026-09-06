// findWorkOrdinalsForVerseId — the BATCHED F-158 ordinal lookup (web/src/lib/work.ts).
//
// The pre-batch page fanned the lookup across every work: one `publishedSourceId` slug→id query
// and one ordinal-join query PER work, across up to PAGE_SIZE works — two waves of up to ~100
// HTTPS fetches each (~200 per render) where one fetch does the same work. The batched helper
// takes the page's works (ids already in hand from listCatalogWorks) and one verse id, and
// issues a single grouped query.
//
// DB-less: `getDb` is mocked so the subject is the QUERY SHAPE and the RESULT MAPPING, not what
// Postgres returns — the property that breaks under the N+1 regression is the call COUNT.
//
// SEED to watch a case RED: reintroduce the per-work helper (slug→id query + join per work) — the
// "ONE query" and "no slug→id wave" cases both redden.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ getDb: () => ({ query }) }));

import { findWorkOrdinalsForVerseId } from '@/lib/work';

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue([]); // safe default; tests with rows override it
});

const JOHN_3_1 = 43_003_001; // encodeVerseId({ book: 43, chapter: 3, verse: 1 })

describe('findWorkOrdinalsForVerseId — batched over the page', () => {
  it('issues ONE query for the whole page, not one query-pair per work', async () => {
    query.mockResolvedValue([
      { source_id: '11', ordinal: 8075 },
      { source_id: '22', ordinal: 12 },
    ]);
    const works = [
      { id: '11', slug: 'adam-clarke' },
      { id: '22', slug: 'matthew-henry' },
      { id: '33', slug: 'spurgeon-sermons' },
    ];
    await findWorkOrdinalsForVerseId(works, JOHN_3_1);
    // The N+1 regression fires 2 × works.length queries; the batched form fires exactly one.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('collapses the slug→id wave — no `SELECT id FROM sources WHERE slug` query', async () => {
    query.mockResolvedValue([]);
    await findWorkOrdinalsForVerseId([{ id: '11', slug: 'adam-clarke' }], JOHN_3_1);
    expect(query).toHaveBeenCalledTimes(1);
    const text = query.mock.calls[0]![0] as string;
    // The per-work helper ran a slug→id lookup before the join; the batched helper does not,
    // because the caller carries sources.id out of listCatalogWorks.
    expect(text).not.toMatch(/FROM sources WHERE slug/i);
  });

  it('batches by id with a grouped aggregate: ANY($1::bigint[]) and GROUP BY s.source_id', async () => {
    query.mockResolvedValue([{ source_id: '11', ordinal: 8075 }]);
    const works = [
      { id: '11', slug: 'adam-clarke' },
      { id: '22', slug: 'matthew-henry' },
    ];
    await findWorkOrdinalsForVerseId(works, JOHN_3_1);
    const [text, params] = query.mock.calls[0] as [string, unknown[]];
    // Same min(s.ordinal) … JOIN section_anchors shape the per-work query used, grouped not filtered.
    expect(text).toContain('min(s.ordinal)');
    expect(text).toContain('JOIN section_anchors a ON a.section_id = s.id');
    expect(text).toContain('s.source_id = ANY($1::bigint[])');
    expect(text).toContain('GROUP BY s.source_id');
    expect(text).toContain('a.verse_id_start <= $2');
    expect(text).toContain('a.verse_id_end >= $2');
    // The whole page's ids go in as ONE array parameter, not one bind per work.
    expect(params[0]).toEqual(['11', '22']);
    expect(params[1]).toBe(JOHN_3_1);
  });

  it('maps each work to its min(s.ordinal); works with no anchor in range map to null', async () => {
    query.mockResolvedValue([
      { source_id: '11', ordinal: 8075 },
      { source_id: '22', ordinal: 12 },
    ]);
    const works = [
      { id: '11', slug: 'adam-clarke' },
      { id: '22', slug: 'matthew-henry' },
      { id: '33', slug: 'spurgeon-sermons' }, // no row returned → no anchor overlapping the passage
    ];
    const result = await findWorkOrdinalsForVerseId(works, JOHN_3_1);
    expect(result.get('adam-clarke')).toBe(8075);
    expect(result.get('matthew-henry')).toBe(12);
    expect(result.get('spurgeon-sermons')).toBeNull();
    // A no-row query still maps every work to null (slugs are keyed up front, not only on hits).
    const empty = await findWorkOrdinalsForVerseId(
      [{ id: '44', slug: 'unanchored' }],
      JOHN_3_1,
    );
    expect(empty.get('unanchored')).toBeNull();
  });

  it('issues NO query for an empty work set (the page with zero works never fetches)', async () => {
    const result = await findWorkOrdinalsForVerseId([], JOHN_3_1);
    expect(query).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});
