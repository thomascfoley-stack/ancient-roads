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

  // /library/books IS NOT IN THE TABLE ABOVE, and that is the point rather than an omission.
  //
  // It was there while it was a ComingSoon stub with a hand-typed `title="My books"`. Ledger N3
  // made it a real page whose heading is `{libraryLabel('/library/books')}` — read from
  // LIBRARY_LABELS instead of typed — so there is no literal string in the file to compare, and
  // the extractor above correctly went blind the moment the page changed shape. (It failed loudly,
  // which is what the "no heading found" assertion exists for.)
  //
  // Comparing a derived value against its own source would be the tautology this repo's watchlist
  // is mostly made of: `LIBRARY_LABELS[x] === LIBRARY_LABELS[x]`, green forever. So the property
  // asserted for this route is the STRONGER one that replaced it — that the page derives its
  // heading at all. A page that derives cannot disagree; a page that types can, which is why the
  // three above still get the string comparison.
  it('/library/books derives its heading rather than typing one', () => {
    const src = readFileSync(join(SRC, 'app/library/books/page.tsx'), 'utf8');
    expect(
      src,
      'the books page should render {libraryLabel(...)} in its h1 — if it now types its heading, '
        + 'put it back in the HEADINGS table above so the string comparison covers it again',
    ).toMatch(/<h1[^>]*>\s*\{libraryLabel\('\/library\/books'\)\}/);
  });

  it('no two library routes share a label — "Saved" named two destinations before this', () => {
    const labels = Object.values(LIBRARY_LABELS);
    expect(new Set(labels).size, `duplicate label in LIBRARY_LABELS: ${labels.join(', ')}`).toBe(labels.length);
  });
});
