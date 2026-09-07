// @vitest-environment jsdom
//
// RENAMING A DOCUMENT, AND ACCEPTING WHAT THE MANUSCRIPT SAYS ITS NAME IS.
//
// The title on this page is the uploaded filename minus its extension, and nothing could change
// it. Beside it sits a chip reading "Looks like: Romans 8 · 21 March 1871" — extracted from the
// manuscript head at parse time (migration 124) and deliberately display-only, because "a wrong
// suggestion is a chip, not a renamed document".
//
// Both halves are fixed by ONE affordance rather than two. Rename is the user's own edit; "Use
// this" is the same edit with the suggestion already filled in, so the reader sees exactly what
// they would get and confirms it. That is the confirm flow the design deferred
// (MY_WORKS_DRAFT_AND_METADATA_DESIGN §"Deliberately NOT in v1"), and it keeps the property that
// deferral protected: nothing renames a document except a person looking at the words.
//
// What is pinned:
//   * The edit opens with the CURRENT title, not an empty box — a rename is usually a small edit.
//   * Escape cancels and the old name stands; the field does not save on blur, because a rename
//     that commits when you click away commits typos.
//   * "Use this" fills the SAME field with the suggestion, and does not save on its own.
//   * A failed save leaves the old name on screen and says so. The optimistic version of this is
//     a lie about what the account contains.
//   * The control is a real 44px target and names the document it renames — there is one per row.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/library/uploads', useRouter: () => ({ refresh: () => {} }) }));

import { MyWorksClient } from '@/components/my-works';

const DOC = {
  id: 'doc-1',
  title: 'sermon-draft-FINAL-v3',
  status: 'ready' as const,
  parseError: null,
  mimeType: 'docx',
  pageCount: 12,
  byteSize: 40_000,
  checksum: 'sum-1',
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-01T10:00:00Z',
  searchCategories: null,
  readingsStatus: null,
  readingsProgress: 0,
  readingsStep: null,
  readingsError: null,
  readingsDoneAt: null,
  suggestedReference: 'Romans 8',
  suggestedDate: '1871-03-21',
};

let patches: { url: string; body: unknown; contentType: string | null }[] = [];
let patchOk = true;
let title = DOC.title;

beforeEach(() => {
  patches = [];
  patchOk = true;
  title = DOC.title;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH') {
      const headers = new Headers(init.headers);
      patches.push({ url: u, body: JSON.parse(String(init.body)), contentType: headers.get('content-type') });
      // A bodyless 500 — the platform's own failure, not one of ours. That is the case the
      // client's own fallback sentence exists for; a refusal WITH a written message (the route's
      // "A document needs a name.") is the server's to phrase and is covered in
      // test/user-corpus/rename.test.ts.
      if (!patchOk) return new Response(null, { status: 500 });
      title = (JSON.parse(String(init.body)) as { title: string }).title;
      return Response.json({ document: { ...DOC, title } });
    }
    if (u.startsWith('/api/user-corpus/documents')) return Response.json({ documents: [{ ...DOC, title }] });
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const renameButton = () => screen.findByRole('button', { name: /Rename sermon-draft-FINAL-v3/i });
const field = () => screen.getByRole('textbox', { name: /name for this document/i });

describe('renaming a document in My Works', () => {
  it('opens the edit with the current title, and saves the new one', async () => {
    render(<MyWorksClient />);
    fireEvent.click(await renameButton());

    const input = field() as HTMLInputElement;
    expect(input.value, 'the edit opened empty — a rename is usually a small edit').toBe('sermon-draft-FINAL-v3');

    fireEvent.change(input, { target: { value: '  Romans 8 — no condemnation ' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]!.url).toBe('/api/user-corpus/documents/doc-1');
    // The CSRF floor refuses anything else, so the client must send it.
    expect(patches[0]!.contentType).toMatch(/application\/json/);
    expect(patches[0]!.body).toEqual({ title: '  Romans 8 — no condemnation ' });
    await waitFor(() => expect(screen.getByText('Romans 8 — no condemnation')).toBeTruthy());
    expect(screen.queryByRole('textbox', { name: /name for this document/i }), 'the edit stayed open').toBeNull();
  });

  it('Escape cancels, and nothing is sent', async () => {
    render(<MyWorksClient />);
    fireEvent.click(await renameButton());
    const input = field();
    fireEvent.change(input, { target: { value: 'a name nobody asked for' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('textbox', { name: /name for this document/i })).toBeNull());
    expect(patches, 'Escape saved').toHaveLength(0);
    expect(screen.getByText('sermon-draft-FINAL-v3')).toBeTruthy();
  });

  it('does NOT save on blur — clicking away commits typos', async () => {
    render(<MyWorksClient />);
    fireEvent.click(await renameButton());
    const input = field();
    fireEvent.change(input, { target: { value: 'half-typed' } });
    fireEvent.blur(input);
    await new Promise((r) => setTimeout(r, 20));
    expect(patches).toHaveLength(0);
  });

  it('"Use this" fills the SAME field with exactly what the chip claims, and does not save by itself', async () => {
    render(<MyWorksClient />);
    // The expected name is read off the CHIP rather than hardcoded: the chip's date runs through
    // toLocaleDateString, so a literal here would assert the test machine's locale and timezone
    // (en-US, and a UTC-midnight date that is the day before in the Americas) rather than the
    // property. The property is that the two agree — offering a name other than the one on the
    // chip is the defect this could have.
    const chip = await screen.findByText(/^Looks like:/);
    const offered = chip.textContent!.replace(/^Looks like:\s*/, '').trim();
    // Reference, separator, then a date in whatever shape the locale renders it.
    expect(offered).toMatch(/^Romans 8 · \S/);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Use this name: ${offered.slice(0, 8)}`, 'i') }));

    const input = field() as HTMLInputElement;
    expect(input.value).toBe(offered);
    expect(patches, 'the suggestion renamed the document without being confirmed').toHaveLength(0);

    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]!.body).toEqual({ title: offered });
  });

  it('a failed save says so, keeps what you typed, and leaves the document under its old name', async () => {
    patchOk = false;
    render(<MyWorksClient />);
    fireEvent.click(await renameButton());
    fireEvent.change(field(), { target: { value: 'a name the server will refuse' } });
    fireEvent.submit(field().closest('form')!);

    await waitFor(() => expect(patches).toHaveLength(1));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent, 'a failed rename said nothing').toMatch(/could not be renamed/i);

    // The editor stays OPEN holding what they typed: closing it on a failure throws away the
    // words and leaves them to retype from the old name.
    expect((field() as HTMLInputElement).value).toBe('a name the server will refuse');

    // And the document is still called what it was called — cancelling shows it unchanged.
    fireEvent.keyDown(field(), { key: 'Escape' });
    await waitFor(() => expect(screen.getByText('sermon-draft-FINAL-v3')).toBeTruthy());
    expect(patches, 'a retry was sent without being asked for').toHaveLength(1);
  });

  it('the control names its own row and meets the 44px floor', async () => {
    render(<MyWorksClient />);
    const btn = await renameButton();
    // One per row, and it says WHICH document — a screen-reader user hears "Rename <title>".
    expect(screen.getAllByRole('button', { name: /^Rename /i })).toHaveLength(1);
    expect(btn.className).toMatch(/min-h-\[44px\]|h-11/);
    // It sits in the row of the document it renames.
    expect(within(btn.closest('li')!).getByText('sermon-draft-FINAL-v3')).toBeTruthy();
  });
});
