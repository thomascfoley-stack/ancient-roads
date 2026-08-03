// @vitest-environment jsdom

// AN ASK CITATION MUST EITHER LAND ON ITS VERSE OR LAND NOWHERE — never on a substitute — Bug 2,
// filed 2026-08-02.
//
// `ask-client.tsx` defined its own local `readerHref(verseId)`, a second copy of the reader-link
// logic in `lib/verse-link.ts`'s `verseHref`, and it diverged in two ways at once:
//   1. it built `/read/<slug>/<chapter>` with no `#v<verse>` fragment at all, so every citation
//      landed at the top of the chapter instead of the cited verse;
//   2. worse, when the verse id's book number didn't resolve (`BOOK_BY_NUM.get(book)` miss) it
//      fell back to `?? 'jhn'` — so a citation with a broken book number rendered a plausible,
//      clickable link to the GOSPEL OF JOHN instead of an inert link. `verseHref` already gets
//      this right (returns '#'), and had exactly one call site before this fix.
//
// The illustrative case named for this bug is a citation for 3 John 1:4 — chosen because "3 John"
// itself contains the word "John", so silently substituting the Gospel of John is the most
// deceptive possible failure: the reader has no reason to suspect the swap. Here that's modeled
// directly as a verse id whose CHAPTER:VERSE matches 3 John 1:4 but whose BOOK NUMBER is the part
// that's corrupted (0, which resolves to no book) — that is exactly the shape of failure
// `BOOK_BY_NUM.get(book)` misses on, independent of which real book the citation was ever for.
//
// Driven through the real component (stream a citation in -> read the rendered <a> hrefs), not a
// copy of the href logic, so a regression here has to break the shipped render path.

import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeVerseId } from '@bible/verse-id';
import { AskClient } from '@/components/ask-client';

const JOHN_3_16 = encodeVerseId({ book: 43, chapter: 3, verse: 16 });
// Decodes to book 0 (no such book), chapter 1, verse 4 — the same chapter:verse as 3 John 1:4,
// with the book digits corrupted, which is precisely what `BOOK_BY_NUM.get(book)` can miss on.
const UNRESOLVABLE_BOOK_1_4 = 1_004;

function streamOf(events: unknown[]): Response {
  const text = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  return new Response(new TextEncoder().encode(text), {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  // jsdom has no scroll layout, so it doesn't implement scrollIntoView — AskClient calls it
  // (unconditionally, on every turn) to keep the newest answer in view. Not under test here.
  Element.prototype.scrollIntoView = vi.fn();
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    streamOf([
      {
        stage: 'done',
        result: {
          kind: 'composed',
          response: {
            blocks: [
              { type: 'framing', text: 'Commentators differ on how this is applied today.' },
              {
                type: 'passages',
                items: [
                  { start: JOHN_3_16, end: JOHN_3_16, translation: 'kjv' },
                  { start: UNRESOLVABLE_BOOK_1_4, end: UNRESOLVABLE_BOOK_1_4, translation: 'kjv' },
                ],
              },
            ],
          },
          retrieval: [],
        },
      },
    ])) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('a passage citation links to its verse, or to nothing — never to a substitute book', () => {
  it('SEED: restore the local `readerHref` -> a resolvable cite loses its verse and an unresolvable one points at John', async () => {
    const { container } = render(<AskClient />);
    const textarea = container.querySelector('textarea');
    const form = container.querySelector('form');
    if (!textarea || !form) throw new Error('composer shape changed');

    fireEvent.change(textarea, { target: { value: 'What does 3 John say about walking in truth?' } });
    fireEvent.submit(form);

    const hrefs = await waitFor(() => {
      const anchors = Array.from(container.querySelectorAll('a[href]'));
      if (anchors.length < 2) throw new Error('passage links not rendered yet');
      return anchors.map((a) => a.getAttribute('href'));
    });

    // The resolvable citation carries its verse — the fragment the old local copy dropped.
    expect(hrefs).toContain('/read/jhn/3#v16');
    // The unresolvable citation is inert, not a plausible-looking substitute.
    expect(hrefs).toContain('#');
    expect(hrefs.some((h) => h?.startsWith('/read/jhn/1'))).toBe(false);
  });
});
