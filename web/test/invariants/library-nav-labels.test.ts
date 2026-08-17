// Q2 — A NAV LABEL AND THE PAGE IT OPENS SAY THE SAME WORD.
//
// The defect (2026-08-16 QA fleet): three hand-maintained copies of each library route's name had
// drifted, so "Saved" named two different destinations depending on which nav you used, and the
// feature the Slice 1 order calls "My Works" was advertised by both navs as "My uploads".
//
// `lib/library-nav.ts` closes the nav-vs-nav half BY CONSTRUCTION — both surfaces read one string,
// so they cannot disagree, and no test is needed for that. This file holds the half derivation
// cannot reach: THE PAGE'S OWN HEADING is written in the page, and nothing stops someone editing it
// back out of agreement with its nav entry.
//
// WHY THIS READS SOURCE TEXT, STATED PLAINLY. These are server components behind `requireUser()`
// and live DB reads; rendering them in jsdom would mean mocking the session, the pool and the
// queries, and a test that mocks everything the page does proves only that the mocks agree. The
// property here is narrow and textual — "the heading string equals the label string" — so the file
// is read as text. That is a real limitation: this catches a heading edited to a different literal,
// and would NOT catch a heading moved into a variable or built at runtime. The `expect` on each
// match below is what makes that failure loud rather than silent (a regex that stops matching
// fails the test instead of vacuously passing), which is the trap `false-confidence-audit` names.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBRARY_LABELS } from '../../src/lib/library-nav';

const SRC = join(__dirname, '../../src');

/** Where each route's user-visible heading actually lives, and how it is written there. */
const HEADINGS: Record<string, { file: string; extract: RegExp }> = {
  '/library/notes': { file: 'app/library/notes/page.tsx', extract: /<h1[^>]*>([^<{]+)<\/h1>/ },
  '/library/word-study': { file: 'app/library/word-study/page.tsx', extract: /<h1[^>]*>([^<{]+)<\/h1>/ },
  // A ComingSoon stub: its heading is a prop, not an <h1> in the page.
  '/library/books': { file: 'app/library/books/page.tsx', extract: /title="([^"]+)"/ },
  // Rendered by a client component, so the heading lives there rather than in the route file.
  '/library/uploads': { file: 'components/my-works.tsx', extract: /<h1[^>]*>([^<{]+)<\/h1>/ },
};

describe('Q2 — every library nav label matches the heading of the page it opens', () => {
  for (const [href, { file, extract }] of Object.entries(HEADINGS)) {
    it(`${href} is called "${LIBRARY_LABELS[href as keyof typeof LIBRARY_LABELS]}" by its nav and by itself`, () => {
      const src = readFileSync(join(SRC, file), 'utf8');
      const m = src.match(extract);
      // A regex that has stopped matching must FAIL, not silently skip: that is exactly how this
      // check would rot into a green no-op after a refactor.
      expect(m, `no heading found in ${file} — this check has gone blind, fix the extractor`).toBeTruthy();
      expect(m![1].trim()).toBe(LIBRARY_LABELS[href as keyof typeof LIBRARY_LABELS]);
    });
  }

  it('no two library routes share a label — "Saved" named two destinations before this', () => {
    const labels = Object.values(LIBRARY_LABELS);
    expect(new Set(labels).size, `duplicate label in LIBRARY_LABELS: ${labels.join(', ')}`).toBe(labels.length);
  });
});
