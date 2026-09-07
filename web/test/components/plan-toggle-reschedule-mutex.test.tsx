// @vitest-environment jsdom
//
// DAY-TOGGLE ↔ RESCHEDULE MUTUAL EXCLUSION — closing the race between the
// optimistic paint and the reschedule's hard-replacing refetch.
//
// toggle() paints a day complete via onDayPainted() and intentionally does NOT
// refetch on success: it relies on the invariant that "the painted state IS the
// server state." That invariant held only while toggle was the SOLE writer to
// `open` during its own POST. reschedule() calls onChanged() → openPlan() →
// setOpen(fresh), a DIRECT setState that hard-replaces any committed optimistic
// paint with a server snapshot. When both actions run concurrently, the
// reschedule's GET can read before the toggle's POST commits, setOpen(fresh)
// discards the paint, and the toggle's success arm (no re-read) leaves the UI
// showing the day UNCHECKED while the server recorded it READ. The server-side
// day_date also drifts — a completed day retaining its rescheduled (non-historical)
// date, violating reschedulePlan's docstring.
//
// The fix closes both orderings with symmetric one-line predicates: toggle
// buttons carry `disabled={busyDay === d.day_index || rescheduling}` and the
// reschedule button carries `disabled={rescheduling || busyDay !== null}`. While
// either action is in flight the other is unclickable, so no concurrent
// setOpen(writer) can clobber a paint, and no toggle+reschedule can interleave on
// the server.
//
// These tests make the catch-up card VISIBLE (the existing optimistic suite
// deliberately dates its fixture in 2099 to keep it off) so the "Resume from today"
// button is reachable, and they drive both actions concurrently to prove the
// buttons go disabled at exactly the moments the race was reachable.
//
// SEED (both orderings): drop `|| rescheduling` from the toggle predicates OR
// `|| busyDay !== null` from the reschedule predicate and the corresponding
// `isDisabled` assertion fails — RED.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { PlansClient } from '@/components/plans-client';

// VerseRef consults input capability (`(hover: hover)`), which jsdom has no
// matchMedia for. The shared helpers/match-media stub only parses min/max-width
// clauses and would THROW on this query; hover is not this file's subject, so a
// fixed no-hover stub (the verse-ref-preview pattern).
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  // The catch-up card's "Keep the original dates" persists its dismissal; clear
  // it so every test starts with the card (and the "Resume from today" button)
  // on screen.
  try { localStorage.clear(); } catch { /* storage unavailable */ }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ID = '11111111-2222-4333-8444-555555555555';

function iso(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The plan is ≥ 2 days behind: day 1's date is 5 days in the past and unread, so
// `upNext` is day 1 and `daysBehind >= 2` — the catch-up card is visible with its
// "Resume from today" button. Both days are unread so every toggle is reachable.
const BEHIND = {
  plan: { id: ID, title: 'Romans in a month' },
  days: [
    { day_index: 1, day_date: iso(-5), verse_start: 45001001, verse_end: 45001016, completed_at: null },
    { day_index: 2, day_date: iso(-4), verse_start: 45002001, verse_end: 45002016, completed_at: null },
  ],
  readings: [],
};

// After a reschedule the not-yet-read days move to the future — the catch-up card
// disappears (daysBehind drops to 0). Day 1 stays unread so the toggle remains
// present in the "All readings" list for the re-enabled assertion.
const AHEAD = {
  plan: { id: ID, title: 'Romans in a month' },
  days: [
    { day_index: 1, day_date: iso(+5), verse_start: 45001001, verse_end: 45001016, completed_at: null },
    { day_index: 2, day_date: iso(+6), verse_start: 45002001, verse_end: 45002016, completed_at: null },
  ],
  readings: [],
};

const OK_DAY = { ok: true, status: 200, json: async () => ({ ok: true }) };
const OK_RESCHEDULE = { ok: true, status: 200, json: async () => ({ ok: true, moved: 2 }) };
const LIST = {
  ok: true,
  status: 200,
  json: async () => ({ plans: [{ id: ID, title: BEHIND.plan.title, total_days: 2, read_days: 0 }] }),
};

interface FetchOpts {
  // When provided, the reschedule POST is held in a deferred promise so the test
  // can assert the disabled state mid-flight; calling the captured function
  // releases it. When omitted, the POST resolves immediately.
  holdReschedule?: (release: (res: unknown) => void) => void;
  // Same for the day-toggle POST.
  holdDay?: (release: (res: unknown) => void) => void;
  // Return AHEAD (future dates) on the GET after a reschedule, so the catch-up
  // card disappears and re-enable can be asserted. Defaults true.
  aheadAfterReschedule?: boolean;
}

function stubFetch(opts: FetchOpts = {}): { posts: { body?: string }[] } {
  const posts: { body?: string }[] = [];
  const aheadAfter = opts.aheadAfterReschedule ?? true;
  let getCalls = 0;

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const u = String(url);
    if (init?.method === 'POST' && u === `/api/plans/${ID}`) {
      posts.push({ body: init.body });
      const body = JSON.parse(init.body ?? '{}');
      if (body.kind === 'reschedule') {
        return new Promise((resolve) =>
          opts.holdReschedule ? opts.holdReschedule(resolve) : resolve(OK_RESCHEDULE),
        );
      }
      return new Promise((resolve) =>
        opts.holdDay ? opts.holdDay(resolve) : resolve(OK_DAY),
      );
    }
    if (u === '/api/plans') return LIST;
    if (u === `/api/plans/${ID}`) {
      getCalls++;
      return { ok: true, status: 200, json: async () => (getCalls > 1 && aheadAfter ? AHEAD : BEHIND) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  }));

  return { posts };
}

function dayTogglePosts(posts: { body?: string }[]): { kind: string; dayIndex: number; completed: boolean }[] {
  return posts
    .map((p) => (p.body ? JSON.parse(p.body) : null))
    .filter((b): b is { kind: string; dayIndex: number; completed: boolean } => b !== null && b.kind === 'day');
}

// @testing-library/jest-dom's `toBeDisabled` matcher is not installed in this
// suite; assert the DOM `disabled` IDL attribute directly (every subject here is
// a <button>, so the cast is sound).
function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled === true;
}

describe('day-toggle ↔ reschedule mutual exclusion', () => {
  it('disables every day toggle while a reschedule is in flight (resume-first ordering)', async () => {
    // SEED: drop `|| rescheduling` from the readings-list toggle predicate and
    // the "Mark day 1 read" assertion goes RED — the button is enabled mid-flight.
    let releaseReschedule!: (res: unknown) => void;
    stubFetch({ holdReschedule: (r) => { releaseReschedule = r; } });
    render(<PlansClient initialPlanId={ID} />);

    const resumeBtn = await screen.findByRole('button', { name: 'Resume from today' });
    fireEvent.click(resumeBtn);

    // The POST is still hanging. The button shows the in-flight label.
    await screen.findByRole('button', { name: 'Moving the schedule…' });

    // Every day toggle is disabled — both readings-list toggles AND the upNext
    // "Mark as read" button. The race's entry door is closed.
    await waitFor(() => expect(isDisabled(screen.getByRole('button', { name: 'Mark day 1 read' }))).toBe(true));
    expect(isDisabled(screen.getByRole('button', { name: 'Mark day 2 read' }))).toBe(true);
    expect(isDisabled(screen.getByRole('button', { name: 'Mark as read' }))).toBe(true);

    // Let the reschedule finish: POST → onChanged → GET (returns AHEAD) →
    // rescheduling=false. The catch-up card unmounts but the reading-list toggles
    // stay on screen and re-enable.
    releaseReschedule(OK_RESCHEDULE);
    await waitFor(() => expect(isDisabled(screen.getByRole('button', { name: 'Mark day 1 read' }))).toBe(false));
    expect(isDisabled(screen.getByRole('button', { name: 'Mark day 2 read' }))).toBe(false);
  });

  it('sends no day-toggle POST while a reschedule is in flight', async () => {
    // SEED: if the toggle fired during reschedule, a day POST would appear among
    // the recorded posts — RED.
    let releaseReschedule!: (res: unknown) => void;
    const { posts } = stubFetch({ holdReschedule: (r) => { releaseReschedule = r; } });
    render(<PlansClient initialPlanId={ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Resume from today' }));
    await screen.findByRole('button', { name: 'Moving the schedule…' });

    // Only the reschedule POST should have been recorded — no day POST leaked
    // through from a toggle click that the disabled state is meant to prevent.
    expect(dayTogglePosts(posts)).toHaveLength(0);
    expect(posts.some((p) => { const b = p.body ? JSON.parse(p.body!) : null; return b && b.kind === 'reschedule'; })).toBe(true);

    releaseReschedule(OK_RESCHEDULE);
  });

  it('disables "Resume from today" while any day toggle is in flight (toggle-first ordering)', async () => {
    // After the optimistic paint of day 1, upNext shifts to day 2 (still 4 days
    // behind), so the catch-up card stays and the reschedule button remains on
    // screen — exactly the reachability the toggle-first ordering needs.
    // SEED: drop `|| busyDay !== null` from the reschedule predicate and this
    // assertion goes RED — the button is enabled while a toggle POST is pending.
    let releaseDay!: (res: unknown) => void;
    stubFetch({ holdDay: (r) => { releaseDay = r; } });
    render(<PlansClient initialPlanId={ID} />);

    const resumeBtn = await screen.findByRole('button', { name: 'Resume from today' });
    expect(isDisabled(resumeBtn)).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: 'Mark day 1 read' }));

    // The day POST is still hanging. The reschedule button must be disabled.
    await waitFor(() => expect(isDisabled(resumeBtn)).toBe(true));

    // Let the toggle finish. busyDay clears and the reschedule re-enables.
    releaseDay(OK_DAY);
    await waitFor(() => expect(isDisabled(resumeBtn)).toBe(false));
  });

  it('keeps the reschedule disabled while a toggle on a non-upNext day is in flight', async () => {
    // The reschedule predicate is `busyDay !== null` (not `busyDay === upNext`), so
    // toggling ANY day — here day 2, which is not the "up next" day — must still
    // lock the reschedule button. SEED: narrow the reschedule predicate to
    // `busyDay === upNext.day_index` and this goes RED.
    let releaseDay!: (res: unknown) => void;
    stubFetch({ holdDay: (r) => { releaseDay = r; } });
    render(<PlansClient initialPlanId={ID} />);

    const resumeBtn = await screen.findByRole('button', { name: 'Resume from today' });
    fireEvent.click(screen.getByRole('button', { name: 'Mark day 2 read' }));

    await waitFor(() => expect(isDisabled(resumeBtn)).toBe(true));

    releaseDay(OK_DAY);
    await waitFor(() => expect(isDisabled(resumeBtn)).toBe(false));
  });

  it('still lets the optimistic toggle paint and the reschedule act work in isolation', async () => {
    // Regression guard: the new predicates do not change single-action behavior.
    // A lone toggle still paints optimistically; a lone reschedule still moves
    // the schedule and refetches. Neither action is disabled when the other is
    // idle.
    let releaseDay!: (res: unknown) => void;
    const { posts } = stubFetch({ holdDay: (r) => { releaseDay = r; } });
    render(<PlansClient initialPlanId={ID} />);

    // Lone toggle paints before the server answers (the L2 step 2 guarantee).
    fireEvent.click(await screen.findByRole('button', { name: 'Mark day 1 read' }));
    const painted = await screen.findByRole('button', { name: 'Mark day 1 unread' });
    expect(painted.className).toContain('bg-accent-700');

    // The reschedule button is disabled only DURING the toggle; once the POST
    // resolves it is enabled again, and clicking it reschedules successfully.
    const resumeBtn = screen.getByRole('button', { name: 'Resume from today' });
    await waitFor(() => expect(isDisabled(resumeBtn)).toBe(true));

    releaseDay(OK_DAY);
    await waitFor(() => expect(isDisabled(resumeBtn)).toBe(false));

    // The paint survived the successful toggle (no rollback).
    expect(screen.getByRole('button', { name: 'Mark day 1 unread' })).toBeTruthy();

    // Now click the reschedule — it succeeds and returns the AHEAD fixture. The
    // recorded posts show exactly one day POST and exactly one reschedule POST.
    fireEvent.click(resumeBtn);
    await waitFor(() =>
      expect(posts.some((p) => { const b = p.body ? JSON.parse(p.body!) : null; return b && b.kind === 'reschedule'; })).toBe(true),
    );
    expect(dayTogglePosts(posts)).toHaveLength(1);
  });
});
