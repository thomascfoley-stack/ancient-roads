// @vitest-environment jsdom
//
// Rail row marks (owner ruling 2026-09-07, ADR-124): a row carries a mark ONLY when the mark
// distinguishes that row from its siblings. The same glyph on every row of a labelled section
// restates the header N times — ink with no information — so it moves UP to the header and the
// rows go quiet. The one mark that survives is My studies' per-study colour dot, because it is
// the only mark in the rail that identifies a ROW rather than a section.
//
// Also under the same ruling: the pre-N4 "custom sections" (MY SERMONS, JOURNALS…) are hidden.
// Their data stays exactly where it is — `study-sections:v1:<userId>` in localStorage — because
// that key is the prayer carry-forward's only recovery source and the owner may revive the
// concept later (teams / classroom organisation). Hidden is not deleted.
//
// Written before the fix. Legs 1, 2, 4 and 5 are RED on the pre-ruling rail; 3, 6 and 7 are
// positive controls that must stay green throughout.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ current: { user: { id: 'u-owner' } } as { user: { id: string } } | null }));
const pathname = vi.hoisted(() => ({ current: '/prayers' }));
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: session.current }) } }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }

import { SidebarNavContent } from '@/components/sidebar';

const PRAYERS = [
  { id: 'p1', body: 'For Sarah, before Tuesday', created_at: '2026-09-06T08:00:00Z' },
  { id: 'p2', body: 'Gratitude — the move is done', created_at: '2026-09-05T08:00:00Z' },
  { id: 'p3', body: "Wisdom for the elders' meeting", created_at: '2026-09-03T08:00:00Z' },
];
const STUDIES = [
  { id: 'romans-8', title: 'Romans 8 — no condemnation', pinned_at: null, updated_at: '2026-09-05T00:00:00Z' },
  { id: 'psalm-23', title: 'Psalm 23 for the funeral', pinned_at: null, updated_at: '2026-09-01T00:00:00Z' },
];
const THREADS = [{ id: '11111111-1111-4111-8111-111111111111', title: 'the good shepherd' }];
const DOCS = [
  { id: 'd1', title: 'Whitsun sermon 2026', status: 'ready' },
  { id: 'd2', title: 'Notes on Hebrews', status: 'embedding' },
];

const SECTIONS_KEY = 'study-sections:v1:u-owner';
const LEGACY_SECTIONS = JSON.stringify([
  { id: 'sec-1', kind: 'group', name: 'MY SERMONS', items: [{ id: 'it-1', name: 'My Sermon' }] },
  { id: 'sec-2', kind: 'group', name: 'JOURNALS', items: [{ id: 'it-2', name: 'Test' }] },
]);

/** The `dayStamp` shape the prayer rows used to carry: "Sat 6". NO leading `\b`: in
 *  `textContent` the label and the date are adjacent ("…TuesdaySun 6"), and a word boundary
 *  between two letters never matches — the first draft of this regex was green before the fix
 *  for exactly that reason. Red-proofed after the correction. */
const DAY_STAMP = /(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}(?!\d)/;

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith('/api/research')) return Response.json({ threads: THREADS });
    if (u.startsWith('/api/studies')) return Response.json({ studies: STUDIES });
    if (u.startsWith('/api/prayers')) return Response.json({ prayers: PRAYERS });
    if (u.startsWith('/api/plans')) return Response.json({ plans: [{ id: 'pl1', title: 'John in 30 days' }] });
    if (u.startsWith('/api/user-corpus/documents')) return Response.json({ documents: DOCS, queue: [] });
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function panel(key: string): HTMLElement {
  const el = document.getElementById(`rail-group-${key}-rail`);
  if (!el) throw new Error(`group panel "${key}" is not open`);
  return el;
}

async function openAll(): Promise<void> {
  // /prayers opens the prayer group by itself; the rest by hand.
  for (const name of [/Research history/, /My studies/, /My Works/i, /Reading plans/]) {
    fireEvent.click(screen.getByRole('button', { name }));
  }
  await waitFor(() => screen.getByText(/For Sarah/));
  await waitFor(() => screen.getByText(STUDIES[0]!.title));
  await waitFor(() => screen.getByText(THREADS[0]!.title));
  await waitFor(() => screen.getByText(DOCS[0]!.title));
  await waitFor(() => screen.getByText('John in 30 days'));
}

describe('rail row marks — a mark only where it distinguishes the row', () => {
  // SEED: put `icon: <PrayerIcon />` back on the prayer rows -> RED.
  it('1. prayer rows carry no glyph; the glyph is on the section header instead', async () => {
    render(<SidebarNavContent />);
    await waitFor(() => screen.getByText(/For Sarah/));
    const rows = panel('prayers');
    expect(rows.querySelectorAll('svg').length, 'a praying figure on every row restates the header three times').toBe(0);
    const header = screen.getByRole('button', { name: /Prayer journal/ });
    expect(header.querySelector('svg'), 'the section glyph names the section ONCE, on its header').not.toBeNull();
    // The glyph must not leak into the header's name: the svg is aria-hidden, so the text is
    // the label alone.
    expect(header.textContent?.trim()).toBe('Prayer journal');
  });

  // SEED: put `meta: dayStamp(...)` back on the prayer rows -> RED.
  it('2. prayer rows carry no date — the journal page keeps the dates', async () => {
    render(<SidebarNavContent />);
    await waitFor(() => screen.getByText(/For Sarah/));
    expect(panel('prayers').textContent ?? '').not.toMatch(DAY_STAMP);
  });

  // POSITIVE CONTROL — must stay green: this is the one mark doing work.
  it('3. study rows KEEP their per-study colour dot', async () => {
    render(<SidebarNavContent />);
    await openAll();
    const dots = panel('studies').querySelectorAll('span.rounded-full[style*="background-color"]');
    expect(dots.length, 'the colour is per study — the only row mark that identifies a row').toBe(STUDIES.length);
  });

  // SEED: put `icon: <BookStackIcon />` / `<CalendarIcon />` / `accentDot` back on the rows -> RED.
  it('4. research, works and plan rows carry no repeated section glyph or uniform dot', async () => {
    render(<SidebarNavContent />);
    await openAll();
    for (const key of ['research', 'works', 'plans']) {
      const p = panel(key);
      expect(p.querySelectorAll('svg').length, `${key}: no per-row glyph`).toBe(0);
      expect(p.querySelectorAll('span.rounded-full').length, `${key}: no uniform dot`).toBe(0);
    }
  });

  // SEED: render `StudySectionView` from localStorage again -> RED.
  it('5. legacy custom sections are hidden — and their storage is untouched', async () => {
    window.localStorage.setItem(SECTIONS_KEY, LEGACY_SECTIONS);
    render(<SidebarNavContent />);
    await waitFor(() => screen.getByText(/For Sarah/));
    expect(screen.queryByText('MY SERMONS')).toBeNull();
    expect(screen.queryByText('JOURNALS')).toBeNull();
    expect(screen.queryByText('My Sermon')).toBeNull();
    // Hidden, not deleted: the key is the prayer carry-forward's recovery source.
    expect(window.localStorage.getItem(SECTIONS_KEY)).toBe(LEGACY_SECTIONS);
  });

  // POSITIVE CONTROL — must stay green: a status that is worth knowing about still rides along.
  it('6. a work still shows its indexing status as meta', async () => {
    render(<SidebarNavContent />);
    await openAll();
    expect(within(panel('works')).getByText('embedding')).toBeTruthy();
  });

  // POSITIVE CONTROL — must stay green: the alignment slot survives so text lines up across groups.
  it('7. every row keeps its leading slot, so labels align whether or not a mark is present', async () => {
    render(<SidebarNavContent />);
    await openAll();
    for (const key of ['research', 'studies', 'prayers', 'works', 'plans']) {
      const slots = panel(key).querySelectorAll('span.w-4');
      expect(slots.length, `${key}: rows keep the 16px leading slot`).toBeGreaterThan(0);
    }
  });
});
