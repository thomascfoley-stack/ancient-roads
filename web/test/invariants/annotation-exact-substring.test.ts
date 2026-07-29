// Library Reader Phase 1 red-first check (work order §2.1): a selection spanning MULTIPLE
// text nodes must persist the EXACT canonical substring — span_start/span_end taken against
// the verse text, with the expected substring HARDCODED (not derived through the code under
// test, so the oracle is independent).
//
// Proven RED before shipping by seeding web/src/lib/highlight-range.ts:
//   seed A (the classic BUG-1 drift): offsetInVerse returns `offsetWithin` (drops the
//     preceding-piece sum) → the multi-node mapping collapses to in-node offsets → red.
//   seed B (the off-by-one on the PERSISTED offset): snapToWords returns `{ start: s, end: e - 1 }`
//     → the stored span loses its last character → the exact-substring assertions go red.
// Then restored → green. (Word-snapping deliberately absorbs ±1 drift in the RAW selection
// offsets — mid-word boundaries snap to the same word — so the honest seed points are the
// piece-sum and the snapped/persisted offsets, which is exactly what reaches the database.)
//
// The DB half proves round-trip persistence with the repo's two-account tenancy pattern
// (programmatic users, RLS + belt), same shape as highlight-tenancy.test.ts.
import { afterAll, describe, expect, it } from 'vitest';
import { flattenToSegments, rangeToOffsets, snapToWords } from '@/lib/highlight-range';
import { createHighlight, getChapterAnnotations, removeHighlightById, type Highlight } from '@/lib/annotations';
import { runAsUser } from '@/lib/db';
import { requireDbInCi } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

// John 3:16 (KJV), the canonical verse text the offsets anchor into.
const VERSE =
  'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';

// Once any highlight exists, the verse container renders as several text nodes (segment
// spans), so the DOM reports selection boundaries per-node. Simulate that split:
//   piece 0 [0,17)  'For God so loved '
//   piece 1 [17,40) 'the world, that he gave'
//   piece 2 [40,…)  ' his only begotten Son, that whosoever…'
const PIECES = [VERSE.slice(0, 17), VERSE.slice(17, 40), VERSE.slice(40)];
const PIECE_LENGTHS = PIECES.map((p) => p.length);

// A selection dragged from mid-"loved" (piece 0, in-node offset 13) to mid-"begotten"
// (piece 2, in-node offset 15). The independent oracle for what must persist:
const EXPECTED = 'loved the world, that he gave his only begotten';

function selectionOffsets(): { start: number; end: number } {
  const raw = rangeToOffsets(PIECE_LENGTHS, 0, 13, 2, 15, VERSE.length);
  expect(raw).not.toBeNull();
  const snapped = snapToWords(VERSE, raw!.start, raw!.end);
  expect(snapped).not.toBeNull();
  return snapped!;
}

describe('§P1 multi-node selection → exact canonical substring', () => {
  it('sums preceding text-node lengths: the multi-node mapping is NOT the in-node offsets', () => {
    const raw = rangeToOffsets(PIECE_LENGTHS, 0, 13, 2, 15, VERSE.length);
    // 13 into piece 0 stays 13; 15 into piece 2 is 17 + 23 + 15 = 55 into the verse.
    expect(raw).toEqual({ start: 13, end: 55 });
  });

  it('the snapped offsets denote EXACTLY the expected verse substring (the persisted span)', () => {
    const { start, end } = selectionOffsets();
    expect(VERSE.slice(start, end)).toBe(EXPECTED);
    expect(start).toBe(11);
    expect(end).toBe(58);
  });

  it('the persisted span renders through flattenToSegments without corrupting the verse', () => {
    const { start, end } = selectionOffsets();
    const segs = flattenToSegments(VERSE.length, [{ start, end, color: 'amber' }]);
    // Tiling invariant: slice-and-rejoin reproduces the verse byte-for-byte…
    expect(segs.map((s) => VERSE.slice(s.start, s.end)).join('')).toBe(VERSE);
    // …and the colored segment is exactly the selection.
    const colored = segs.filter((s) => s.color === 'amber');
    expect(colored).toHaveLength(1);
    expect(VERSE.slice(colored[0]!.start, colored[0]!.end)).toBe(EXPECTED);
  });
});

// ---- Persistence (two-account pattern, executed against the dev DB when configured) ---------
const dbUrl = requireDbInCi();
const userA = `qa-p1-substr-a-${Date.now()}`;
const userB = `qa-p1-substr-b-${Date.now()}`;
const BOOK = 43;
const CHAPTER = 3;
const VERSE_ID = BOOK * 1_000_000 + CHAPTER * 1_000 + 16; // John 3:16
let spanId = '';

// A DB-less run must READ as NOT RUN, not as coverage — see helpers/loud-skip.ts.
const SKIP = announceSkip(
  '§P1 the exact substring survives the persistence round-trip (RLS)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'that the exact highlighted substring survives the persistence round-trip under RLS',
);

describe.skipIf(SKIP)('§P1 the exact substring survives the persistence round-trip (RLS)', () => {
  afterAll(async () => {
    // HARD-delete this run's seeded rows — removeHighlightById only SOFT-deletes, which left the
    // row in the shared dev DB on every run (see highlight-tenancy.test.ts for the same fix).
    for (const u of [userA, userB]) {
      await runAsUser(u, (sql) => [sql`DELETE FROM highlights WHERE user_id = ${u}`]);
    }
  }, 30_000);

  it('span_start/span_end read back slice the verse to the EXACT selected substring', async () => {
    const { start, end } = selectionOffsets();
    const created = await createHighlight(userA, {
      verseId: VERSE_ID,
      color: 'amber',
      spanStart: start,
      spanEnd: end,
      translation: 'kjv',
    });
    spanId = created.id;
    const { highlights } = await getChapterAnnotations(userA, BOOK, CHAPTER);
    const mine = highlights.find((h: Highlight) => h.id === spanId);
    expect(mine).toBeTruthy();
    expect(VERSE.slice(mine!.span_start!, mine!.span_end!)).toBe(EXPECTED);
    expect(mine!.translation).toBe('kjv');
  }, 30_000);

  it('user B cannot read user A’s span (RLS + belt)', async () => {
    const { highlights } = await getChapterAnnotations(userB, BOOK, CHAPTER);
    expect(highlights.some((h: Highlight) => h.id === spanId)).toBe(false);
  }, 30_000);
});
