// @vitest-environment jsdom
//
// The library panel's contract (editor v2): search goes to the auth-walled library-search
// endpoint one register group at a time; "Add to study" sends a REFERENCE — sectionId plus the
// heading as the attribution reference — and NEVER quote or attribution text (S-1's client
// half: there is nothing here a tampered response could smuggle into a table, because the
// panel never possesses writable text). The added block flows back through onAdded with the
// placement the editor pinned.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyLibraryPanel } from '../../src/components/study-library-panel';
import type { EditorBlock } from '../../src/components/study-editor';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const STUDY_ID = '11111111-1111-4111-8111-111111111111';

const ROW = {
  sectionId: 631786,
  slug: 'matthew-henry-commentary',
  title: 'Commentary on the Whole Bible',
  author: 'Matthew Henry',
  sourceType: 'commentary',
  ordinal: 5,
  heading: 'Joshua 2',
  snippet: 'She had heard what <mark>God</mark> had done',
};

interface Call { url: string; method: string; body: Record<string, unknown> | null }

function stubApi() {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ url, method, body });
      if (method === 'GET') {
        return new Response(
          JSON.stringify({ results: [ROW], total: 1, totalCapped: false }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          block: {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            position: 'W',
            kind: 'clipping',
            body: null,
            work_slug: ROW.slug,
            ordinal: ROW.ordinal,
            quote: 'She had heard what God had done, and she believed.',
            attribution: { author: ROW.author, work_title: ROW.title, reference: ROW.heading },
            trim_start: null,
            trim_end: null,
          },
        }),
        { status: 201 },
      );
    }),
  );
  return calls;
}

describe('StudyLibraryPanel', () => {
  it('searches the active register group and renders labelled rows', async () => {
    const calls = stubApi();
    render(
      <StudyLibraryPanel studyId={STUDY_ID} takePlacement={() => ({})} onAdded={() => {}} focusToken={0} />,
    );

    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'rahab' } });
    // The debounce is real time (the suite's rule); the request names the group and the query.
    await waitFor(
      () => expect(calls.some((c) => c.method === 'GET')).toBe(true),
      { timeout: 3000 },
    );
    expect(calls.find((c) => c.method === 'GET')!.url).toContain('/api/studies/library-search?q=rahab&group=commentaries');

    expect(await screen.findByText('Matthew Henry')).toBeTruthy();
    // The register label rides every row (S-5).
    expect(screen.getByText('commentary')).toBeTruthy();
  });

  it('Add sends a REFERENCE (sectionId + placement), never quote/attribution text, and hands the block back', async () => {
    const calls = stubApi();
    const added: EditorBlock[] = [];
    render(
      <StudyLibraryPanel
        studyId={STUDY_ID}
        takePlacement={() => ({ afterBlockId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })}
        onAdded={(b) => added.push(b)}
        focusToken={0}
      />,
    );

    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'rahab' } });
    fireEvent.click(await screen.findByRole('button', { name: '+ Add to study' }, { timeout: 3000 }));

    await waitFor(() => expect(added).toHaveLength(1), { timeout: 3000 });
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toBe(`/api/studies/${STUDY_ID}/blocks`);
    expect(post.body).toMatchObject({
      kind: 'clipping',
      sectionId: ROW.sectionId,
      reference: 'Joshua 2',
      afterBlockId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    // S-1's client half: the panel never sends text the server should be snapshotting itself.
    // SEED: include the snippet as `quote` in the POST -> RED here (and 400 in the real app).
    expect('quote' in post.body!).toBe(false);
    expect('attribution' in post.body!).toBe(false);

    expect(added[0]!.renderState).toBe('clipping');
    expect(added[0]!.quote).toContain('she believed');
    expect(await screen.findByText('Added')).toBeTruthy();
  });

  it('a 409 from the write renders the not-servable refusal on that row', async () => {
    stubApi();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'GET') {
          return new Response(JSON.stringify({ results: [ROW], total: 1, totalCapped: false }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ error: { code: 'NOT_SERVABLE', message: 'x' } }),
          { status: 409 },
        );
      }),
    );
    render(
      <StudyLibraryPanel studyId={STUDY_ID} takePlacement={() => ({})} onAdded={() => {}} focusToken={0} />,
    );
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'rahab' } });
    fireEvent.click(await screen.findByRole('button', { name: '+ Add to study' }, { timeout: 3000 }));
    expect(await screen.findByText(/Not currently servable/)).toBeTruthy();
  });
});
