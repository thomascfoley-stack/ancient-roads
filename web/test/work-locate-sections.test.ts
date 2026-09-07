// locateSections — the DB-free half: shape and bounds, with the driver mocked.
//
// The executed half (a real published section resolves to its ordinal; unknown and staged
// works resolve to null) lives in work-locate-sections-db.test.ts and needs APP_DATABASE_URL.
// This file pins what must hold WITHOUT a database: an empty batch never touches the driver,
// the whole batch is ONE statement (never one query per row), the result is index-aligned
// with the input, and the batch is capped — anything past the cap is null, not queried.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ getDb: () => ({ query }) }));

import { locateSections, LOCATE_SECTIONS_MAX } from '@/lib/work';

const loc = (i: number) => ({ work: `work-${i}`, verseId: 43001001 + i, verseEnd: 43001001 + i, content: `body ${i}` });

beforeEach(() => {
  query.mockReset();
});

describe('locateSections — shape and bounds', () => {
  it('an empty batch resolves to [] without a query', async () => {
    await expect(locateSections([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('one statement for the whole batch, index-aligned, unmatched rows null', async () => {
    // The driver answers for rows 0 and 2 only (1-based `i` on the wire).
    query.mockResolvedValueOnce([
      { i: 3, ordinal: 30 },
      { i: 1, ordinal: 10 },
    ]);
    await expect(locateSections([loc(0), loc(1), loc(2)])).resolves.toEqual([10, null, 30]);
    expect(query).toHaveBeenCalledTimes(1);
    // The four parallel arrays are the batch, in input order.
    const params = query.mock.calls[0]![1] as unknown[];
    expect(params[0]).toEqual(['work-0', 'work-1', 'work-2']);
    expect(params[1]).toEqual([43001001, 43001002, 43001003]);
    expect(params[2]).toEqual([43001001, 43001002, 43001003]);
    expect(params[3]).toEqual(['body 0', 'body 1', 'body 2']);
  });

  it('caps the batch: rows past the cap are null and never sent', async () => {
    query.mockResolvedValueOnce([{ i: 1, ordinal: 1 }]);
    const input = Array.from({ length: LOCATE_SECTIONS_MAX + 5 }, (_, i) => loc(i));
    const out = await locateSections(input);
    expect(out).toHaveLength(input.length);
    expect(out[0]).toBe(1);
    expect(out.slice(LOCATE_SECTIONS_MAX)).toEqual(new Array(5).fill(null));
    const params = query.mock.calls[0]![1] as unknown[][];
    expect(params[0]).toHaveLength(LOCATE_SECTIONS_MAX);
  });

  it('coerces driver strings (bigint/ordinality arrive as text) to numbers', async () => {
    query.mockResolvedValueOnce([{ i: '2', ordinal: '77' }]);
    await expect(locateSections([loc(0), loc(1)])).resolves.toEqual([null, 77]);
  });
});
