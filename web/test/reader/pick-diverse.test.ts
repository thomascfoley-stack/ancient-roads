// Locks the pickDiverse primacy fix (§1a, re-verified 2026-07-14). The reader shows only
// `max` of hundreds of commentators per verse; the OLD code took each tradition bucket in
// raw file order, so at John 1:1 the top slot went to a 13th-c catena paraphrase ("Alcuin
// of York (as quoted by Aquinas, AD 1274)") while the primary fathers were dropped. The fix
// ranks each bucket earliest-year-first (primary ahead of derivative). This asserts the
// property so it cannot silently drift back to file order.

import { describe, expect, it } from 'vitest';
import { pickDiverse } from '@/components/commentary-panel';
import type { CommentaryEntry } from '@/lib/bible';

const e = (author: string, year: number, tradition: string): CommentaryEntry =>
  ({ author, year, tradition, text: `${author} on the verse`, verseStart: 1, verseEnd: 1 }) as CommentaryEntry;

describe('pickDiverse — primacy, not file order', () => {
  it('surfaces the earliest voice in a tradition, not whatever was ingested first', () => {
    // Deliberately list the late catena FIRST (file order) to prove file order does not win.
    const entries = [
      e('Alcuin of York (as quoted by Aquinas, AD 1274)', 1274, 'Patristic'),
      e('Augustine of Hippo', 400, 'Patristic'),
      e('John Chrysostom', 407, 'Patristic'),
      e('Irenaeus', 202, 'Patristic'),
      e('John Calvin', 1554, 'Reformed'),
      e('Matthew Henry', 1710, 'Reformed'),
    ];
    const picked = pickDiverse(entries, 3);
    // The top Patristic voice must be the earliest primary father, never the 1274 catena.
    expect(picked[0]!.author).toBe('Irenaeus');
    expect(picked.map((p) => p.author)).not.toContain('Alcuin of York (as quoted by Aquinas, AD 1274)');
    // Result is ordered earliest-first.
    const years = picked.map((p) => p.year ?? 9999);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it('returns all entries unchanged when at or under the cap', () => {
    const entries = [e('Irenaeus', 202, 'Patristic'), e('John Calvin', 1554, 'Reformed')];
    expect(pickDiverse(entries, 5)).toEqual(entries);
  });
});
