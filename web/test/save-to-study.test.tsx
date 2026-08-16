// @vitest-environment jsdom
//
// P2/W4 — the Save-to-study affordance (design §7.5) and the sidebar MY STUDIES section
// (design §7.1). What is pinned here, and why each one is worth a check:
//
//   * resolveVoiceSourceId — an ask answer's voice block carries a PROMPT-LOCAL section_id
//     (a 1..N index into a re-sorted subset of retrieval — web/src/lib/teacher/teach.ts
//     `selectVoices`), never a corpus key. The only honest route from a voice to a saveable
//     `source_id` is matching it back against `result.retrieval`, and a WRONG match saves the
//     wrong passage's bytes. The rule: the verifier guarantees the quote is verbatim in the
//     cited chunk, so quote containment is proof; attribution is a fallback only when it names
//     exactly one row; anything ambiguous resolves to NOTHING (no affordance), never a guess.
//   * orderStudiesForNav — §7.1's "pinned, then updated_at recents" for the sidebar and the
//     picker's list. The API already returns updated_at-desc, so this is a stable partition,
//     and the test pins BOTH the partition and the stability.
//   * The one-tap flow (E7, ruled "always auto-save, never ask"): a stored last-target means
//     one tap saves with NO picker; the picker is the second tap, only when wanted.
//   * Sidebar: MY STUDIES renders pinned-first with an "All studies" link when signed in, and
//     is simply absent when signed out (a signed-out visitor has no studies; an error state
//     would be the app reporting its own auth state as a fault — the prayer-journal lesson).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Session state is per-test; the name satisfies vitest's mock-hoisting rule.
let mockSession: { data: { user: { id: string } } | null } = { data: { user: { id: 'u-test' } } };
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => mockSession } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/ask' }));

// jsdom lacks ResizeObserver, which the rail's useMoreBelow constructs on mount — the stub
// observes nothing because these tests assert on anchors/text, not scroll fades (same
// reasoning as sidebar-catalog-nav.test.tsx's header).
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

import {
  SaveToStudy,
  orderStudiesForNav,
  resolveVoiceSourceId,
  LAST_TARGET_KEY_PREFIX,
} from '@/components/save-to-study';
import { SidebarNavContent } from '@/components/sidebar';

// ── fixtures ────────────────────────────────────────────────────────────────────────────────

const RETRIEVAL = [
  {
    sourceId: 'commentary:jhn:1:1-5:Matthew Henry',
    content: 'In the beginning was the Word,\nand the Word was with God, and the Word was God.',
    metadata: { author: 'Matthew Henry', sourceTitle: 'Commentary on John' },
  },
  {
    sourceId: 'commentary:jhn:1:1-5:John Calvin',
    content: 'A different passage about something else entirely.',
    metadata: { author: 'John Calvin', sourceTitle: 'Commentary on John' },
  },
];

const STUDIES = [
  { id: 's-recent-1', title: 'Perseverance', pinned_at: null, updated_at: '2026-08-12T10:00:00Z' },
  { id: 's-pinned-1', title: 'Rahab', pinned_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-11T09:00:00Z' },
  { id: 's-recent-2', title: 'John 1', pinned_at: null, updated_at: '2026-08-10T08:00:00Z' },
  { id: 's-pinned-2', title: 'Sermon on the Mount', pinned_at: '2026-07-30T00:00:00Z', updated_at: '2026-08-09T07:00:00Z' },
];

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

/** A fetch stub dispatching on METHOD + URL; every call is recorded as `${method} ${url}`. */
function stubFetch(routes: Record<string, Response>) {
  const calls: { key: string; body?: unknown }[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${String(input)}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    // Longest prefix first, or 'POST /api/studies' swallows 'POST /api/studies/<id>/blocks'.
    const hit = Object.entries(routes)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([k]) => key === k || key.startsWith(k));
    if (!hit) throw new Error(`unexpected fetch: ${key}`);
    return hit[1];
  });
  vi.stubGlobal('fetch', mock);
  return calls;
}

beforeEach(() => {
  mockSession = { data: { user: { id: 'u-test' } } };
  localStorage.clear();
});

// vitest runs this suite without globals, so @testing-library's auto-cleanup never registers;
// without it every render accumulates into the next test's DOM.
afterEach(cleanup);

// ── voice → source_id resolution ─────────────────────────────────────────────────────────────

describe('resolveVoiceSourceId', () => {
  it('resolves an exact verbatim quote to its chunk', () => {
    const id = resolveVoiceSourceId(RETRIEVAL, {
      quote: 'and the Word was with God',
      attribution: { author: 'Matthew Henry', work: 'Commentary on John' },
    });
    expect(id).toBe('commentary:jhn:1:1-5:Matthew Henry');
  });

  it('resolves across whitespace differences (the composer copies, newlines differ)', () => {
    const id = resolveVoiceSourceId(RETRIEVAL, {
      quote: 'In the beginning was the Word, and the Word was with God',
      attribution: { author: 'Matthew Henry', work: 'Commentary on John' },
    });
    expect(id).toBe('commentary:jhn:1:1-5:Matthew Henry');
  });

  it('falls back to attribution only when it names exactly one row', () => {
    const id = resolveVoiceSourceId(RETRIEVAL, {
      quote: 'a quote that appears in no chunk',
      attribution: { author: 'John Calvin', work: 'Commentary on John' },
    });
    expect(id).toBe('commentary:jhn:1:1-5:John Calvin');
  });

  it('resolves to NOTHING when the quote matches nothing and attribution is ambiguous', () => {
    const two = [
      ...RETRIEVAL,
      {
        sourceId: 'commentary:jhn:3:16-21:John Calvin',
        content: 'Yet another chunk.',
        metadata: { author: 'John Calvin', sourceTitle: 'Commentary on John' },
      },
    ];
    const id = resolveVoiceSourceId(two, {
      quote: 'a quote that appears in no chunk',
      attribution: { author: 'John Calvin', work: 'Commentary on John' },
    });
    // A guess here saves the WRONG passage's bytes into the user's study. No affordance at
    // all is the only honest failure mode.
    expect(id).toBeNull();
  });

  it('resolves to NOTHING when nothing matches', () => {
    const id = resolveVoiceSourceId(RETRIEVAL, {
      quote: 'a quote that appears in no chunk',
      attribution: { author: 'Nobody', work: 'Nothing' },
    });
    expect(id).toBeNull();
  });
});

// ── sidebar/picker ordering ──────────────────────────────────────────────────────────────────

describe('orderStudiesForNav (design §7.1: pinned, then updated_at recents)', () => {
  it('pinned studies first, then recents, each group keeping the API order', () => {
    const ordered = orderStudiesForNav(STUDIES, 10).map((s) => s.id);
    expect(ordered).toEqual(['s-pinned-1', 's-pinned-2', 's-recent-1', 's-recent-2']);
  });

  it('caps the list', () => {
    expect(orderStudiesForNav(STUDIES, 3).map((s) => s.id)).toEqual(['s-pinned-1', 's-pinned-2', 's-recent-1']);
  });

  it('empty in, empty out', () => {
    expect(orderStudiesForNav([], 5)).toEqual([]);
  });
});

// ── the affordance itself ────────────────────────────────────────────────────────────────────

describe('SaveToStudy (design §7.5; E7)', () => {
  const clip = { sourceId: 'commentary:jhn:1:1-5:Matthew Henry' };

  it('no stored target: the FIRST tap opens the picker (there is no default to save to)', async () => {
    const calls = stubFetch({
      'GET /api/studies': jsonResponse(200, { studies: STUDIES }),
    });
    render(<SaveToStudy clip={clip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    // The picker lists pinned studies before recents — same §7.1 order as the sidebar.
    const rows = await screen.findAllByRole('button', { name: /Rahab|Perseverance|Sermon on the Mount|John 1/ });
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Rahab'),
      expect.stringContaining('Sermon on the Mount'),
      expect.stringContaining('Perseverance'),
      expect.stringContaining('John 1'),
    ]);
    expect(calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it('choosing a study in the picker saves there and toasts "Saved to <title>. Change?"', async () => {
    stubFetch({
      'GET /api/studies': jsonResponse(200, { studies: STUDIES }),
      'POST /api/studies/s-recent-1/blocks': jsonResponse(201, { block: { id: 'b-1' } }),
    });
    render(<SaveToStudy clip={clip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    fireEvent.click(await screen.findByRole('button', { name: /Perseverance/ }));
    await screen.findByText(/Saved to Perseverance\./);
    expect(screen.getByRole('button', { name: 'Change?' })).toBeTruthy();
    // The picker target becomes the new default — the next one-tap save goes there.
    expect(localStorage.getItem(`${LAST_TARGET_KEY_PREFIX}:u-test`)).toContain('s-recent-1');
  });

  it('a stored target makes save ONE TAP — no picker, no list fetch (E7)', async () => {
    localStorage.setItem(`${LAST_TARGET_KEY_PREFIX}:u-test`, JSON.stringify({ id: 's-pinned-1', title: 'Rahab' }));
    const calls = stubFetch({
      'POST /api/studies/s-pinned-1/blocks': jsonResponse(201, { block: { id: 'b-2' } }),
    });
    render(<SaveToStudy clip={clip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    await screen.findByText(/Saved to Rahab\./);
    expect(calls.map((c) => c.key)).toEqual(['POST /api/studies/s-pinned-1/blocks']);
    const body = calls[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({ kind: 'clipping', sourceId: clip.sourceId });
    // S-1's client half: the affordance never sends quote text — only a reference.
    expect('quote' in body).toBe(false);
    expect('attribution' in body).toBe(false);
  });

  it('a stored target that is GONE (404) clears the default and opens the picker', async () => {
    localStorage.setItem(`${LAST_TARGET_KEY_PREFIX}:u-test`, JSON.stringify({ id: 's-deleted', title: 'Gone' }));
    const calls = stubFetch({
      'POST /api/studies/s-deleted/blocks': jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No such study.' } }),
      'GET /api/studies': jsonResponse(200, { studies: STUDIES }),
    });
    render(<SaveToStudy clip={clip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    await screen.findByRole('button', { name: /Rahab/ });
    expect(localStorage.getItem(`${LAST_TARGET_KEY_PREFIX}:u-test`)).toBeNull();
    expect(calls.map((c) => c.key)).toEqual(['POST /api/studies/s-deleted/blocks', 'GET /api/studies']);
  });

  it('"New study" is titled from context and the clipping lands in it', async () => {
    const calls = stubFetch({
      'GET /api/studies': jsonResponse(200, { studies: STUDIES }),
      'POST /api/studies': jsonResponse(201, { study: { id: 's-new', title: 'What about Rahab?' } }),
      'POST /api/studies/s-new/blocks': jsonResponse(201, { block: { id: 'b-3' } }),
    });
    render(<SaveToStudy clip={clip} contextTitle="What about Rahab?" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    fireEvent.click(await screen.findByRole('button', { name: /New study/ }));
    await screen.findByText(/Saved to What about Rahab\?\./);
    expect(calls.map((c) => c.key)).toEqual([
      'GET /api/studies',
      'POST /api/studies',
      'POST /api/studies/s-new/blocks',
    ]);
    expect(calls[1]!.body).toEqual({ title: 'What about Rahab?' });
  });

  it('401 is a signed-out reader, stated as such — not a generic failure', async () => {
    stubFetch({
      'GET /api/studies': jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }),
    });
    render(<SaveToStudy clip={clip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    await screen.findByText(/Sign in to save to a study\./);
  });

  it('a failed save says so and stores NO default target', async () => {
    stubFetch({
      'GET /api/studies': jsonResponse(200, { studies: STUDIES }),
      'POST /api/studies/s-pinned-1/blocks': jsonResponse(409, { error: { code: 'NOT_SERVABLE', message: 'That passage is not currently servable from the library.' } }),
    });
    render(<SaveToStudy clip={clip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    fireEvent.click(await screen.findByRole('button', { name: /Rahab/ }));
    await screen.findByText(/not currently servable/);
    expect(localStorage.getItem(`${LAST_TARGET_KEY_PREFIX}:u-test`)).toBeNull();
  });
});

// ── the sidebar section ──────────────────────────────────────────────────────────────────────

describe('sidebar MY STUDIES (design §7.1)', () => {
  it('renders pinned studies first, then recents, then "All studies" — signed in', async () => {
    stubFetch({ 'GET /api/studies': jsonResponse(200, { studies: STUDIES }) });
    const { container } = render(<SidebarNavContent />);
    await waitFor(() => {
      expect(container.querySelector('a[href="/studies/s-pinned-1"]')).toBeTruthy();
    });
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    const studyHrefs = hrefs.filter((h) => h === '/studies' || h?.startsWith('/studies/'));
    expect(studyHrefs).toEqual([
      '/studies/s-pinned-1',
      '/studies/s-pinned-2',
      '/studies/s-recent-1',
      '/studies/s-recent-2',
      '/studies',
    ]);
    expect(screen.getByText('My studies')).toBeTruthy();
    expect(container.querySelector('a[href="/studies"]')?.textContent).toContain('All studies');
  });

  it('is absent entirely for a signed-out visitor — they have no studies, and an error line would be a false alarm', async () => {
    mockSession = { data: null };
    const calls = stubFetch({});
    const { container } = render(<SidebarNavContent />);
    // Let effects flush, then assert: no section, no fetch.
    await waitFor(() => expect(container.querySelector('a[href="/prayers"]')).toBeTruthy());
    expect(container.textContent).not.toContain('My studies');
    expect(calls).toEqual([]);
  });

  it('a failed fetch is an honest quiet line, with the "All studies" link still reachable', async () => {
    stubFetch({ 'GET /api/studies': jsonResponse(500, { error: { code: 'INTERNAL', message: 'x' } }) });
    const { container } = render(<SidebarNavContent />);
    // Scoped to the STUDIES line: the rail now has a second fetch-backed section
    // (RESEARCH HISTORY, 2026-08-16) whose own honest error line matches the loose regex.
    await screen.findByText(/studies could not be loaded|studies couldn't be loaded/i);
    expect(container.querySelector('a[href="/studies"]')).toBeTruthy();
  });
});
