// Reader annotation toolbelt §7 — tenancy for sub-verse highlights, executed two-account against
// the real DB (RLS via app.current_user_id + the explicit user_id belt). This also exercises the
// new persistence round-trip: createHighlight → getChapterAnnotations returns the span with its
// offsets/colors/translation intact; removeHighlightById scopes to the owner.
//
// It is the repo's executed-invariant proof (same shape as tenancy.test.ts): if isolation broke,
// user B would read/delete user A's span and these assertions would go RED.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHighlight, getChapterAnnotations, removeHighlightById, type Highlight } from '@/lib/annotations';
import { requireDbInCi } from '../helpers/env';

const dbUrl = requireDbInCi();
const userA = `qa-hl-a-${Date.now()}`;
const userB = `qa-hl-b-${Date.now()}`;
// John 3:16 canonical id (book 43, ch 3, v 16). Off in QA-user space so it can't collide.
const BOOK = 43;
const CHAPTER = 3;
const VERSE_ID = 43 * 1_000_000 + 3 * 1_000 + 16;
let spanId = '';
let created = false;

describe.skipIf(!dbUrl)('§7 sub-verse highlight tenancy (two-account, executed)', () => {
  beforeAll(async () => {
    const h = await createHighlight(userA, {
      verseId: VERSE_ID,
      color: 'green',
      spanStart: 4,
      spanEnd: 11,
      translation: 'kjv',
    });
    spanId = h.id;
    created = true;
  }, 30_000);

  afterAll(async () => {
    if (!created || !dbUrl) return;
    await removeHighlightById(userA, spanId);
  }, 30_000);

  it('round-trips the span: A reads back its offsets, color, and translation', async () => {
    const { highlights } = await getChapterAnnotations(userA, BOOK, CHAPTER);
    const mine = highlights.find((h: Highlight) => h.id === spanId);
    expect(mine).toBeTruthy();
    expect(mine!.span_start).toBe(4);
    expect(mine!.span_end).toBe(11);
    expect(mine!.color).toBe('green');
    expect(mine!.translation).toBe('kjv');
  });

  it('user B cannot read user A sub-verse highlight (RLS + belt)', async () => {
    const { highlights } = await getChapterAnnotations(userB, BOOK, CHAPTER);
    expect(highlights.some((h: Highlight) => h.id === spanId)).toBe(false);
  });

  it('user B cannot delete user A span by id (no-op under RLS), A still sees it', async () => {
    await removeHighlightById(userB, spanId); // must not affect A's row
    const { highlights } = await getChapterAnnotations(userA, BOOK, CHAPTER);
    expect(highlights.some((h: Highlight) => h.id === spanId)).toBe(true);
  });
});
