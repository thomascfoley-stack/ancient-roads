// @vitest-environment jsdom

// THE BOOKMARK FEATURE EXISTED EVERYWHERE EXCEPT WHERE A READER COULD REACH IT — A7b, 2026-08-02.
//
// Migration 026 shipped the `bookmarks` table, its RLS policy, its two partial unique indexes and
// its USER_TABLE_SPEC entry. `annotation-tables.test.ts` covers the constraints. What never
// shipped was the write path: `onBookmark` in selection-popover.tsx had ZERO call sites, and the
// popover renders the button only when a handler exists, so no reader ever saw it. A table, a
// policy, indexes and tests, and no way to make a row.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. The round trip (insert, toggle, soft-delete, re-add after
// delete) needs a real Postgres and lives with the other DB tests, which SKIP without
// APP_DATABASE_URL_TEST — so on a credential-less machine that half is NOT RUN, not covered.
// What is checkable here without a database is the failure that would take the feature down on
// first use, and it is a static one: an ON CONFLICT clause that does not correspond to a real
// unique index is not a slow path or a stale read, it is a runtime error on every press.

import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionPopover } from '@/components/selection-popover';
import { VerseDisplay } from '@/components/verse-display';
import type { ChapterData } from '@/lib/bible';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
// SelectionPopover renders null until it has MEASURED a placement, and jsdom reports every
// element as 0x0 — so without this the component renders nothing and an assertion about its
// buttons would be vacuously passing or failing for a reason that has nothing to do with them.
vi.mock('@/lib/popover-position', async (orig) => ({
  ...(await orig<typeof import('@/lib/popover-position')>()),
  placePopover: () => ({ top: 10, left: 10, side: 'below' as const }),
}));
afterEach(cleanup);

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();

describe('the upsert targets an index that actually exists', () => {
  it("createBookmark's ON CONFLICT clause matches a real partial unique index", () => {
    // SEED: change the clause to `ON CONFLICT (user_id, verse_id)` with no WHERE, or point it at
    // a column set no index covers -> RED. Postgres would otherwise raise "there is no unique or
    // exclusion constraint matching the ON CONFLICT specification" on the FIRST bookmark anyone
    // ever creates, and a static check is the only kind that can catch that without a database.
    const src = readFileSync(path.join(REPO, 'web/src/lib/annotations.ts'), 'utf8');
    // The WHERE is OPTIONAL in this match on purpose. Requiring it meant a clause that had lost
    // its predicate — the exact seed — failed as "no ON CONFLICT clause at all", which is a true
    // red for a false reason. An unqualified clause must be reported as UNMATCHED, because that
    // is what Postgres will say about it.
    const m = /on conflict\s*(\([^)]*\))\s*(where[^\n]*)?/i.exec(src);
    expect(m, 'createBookmark no longer carries an ON CONFLICT clause').not.toBeNull();

    const target = norm(m![1]!); // (user_id, verse_id)
    const predicate = norm(m![2] ?? ''); // where deleted_at is null and target_kind = 'verse'

    const migrations = readdirSync(path.join(REPO, 'db/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(path.join(REPO, 'db/migrations', f), 'utf8'))
      .join('\n');

    // Every partial unique index on `bookmarks`, derived from the migrations rather than named.
    const indexes = [...migrations.matchAll(/create unique index[^;]*?on bookmarks\s*(\([^)]*\))\s*(where[^;]*)/gi)].map(
      (x) => ({ target: norm(x[1]!), predicate: norm(x[2]!) }),
    );
    expect(indexes.length, 'no partial unique index on bookmarks found — the derivation broke').toBeGreaterThan(0);

    const match = indexes.find((i) => i.target === target && i.predicate === predicate);
    expect(
      match,
      `ON CONFLICT ${target} ${predicate} matches no index. Found: ${indexes.map((i) => `${i.target} ${i.predicate}`).join(' | ')}`,
    ).toBeTruthy();
  });

  it('the soft delete leaves the partial index free to accept a re-bookmark', () => {
    // The indexes are partial on `deleted_at IS NULL`, so a soft-deleted row must not block a new
    // one. removeBookmark therefore has to SET deleted_at, never DELETE — and never merely flip
    // some other flag, which would leave the row occupying the index.
    // SEED: change removeBookmark to a hard DELETE -> RED.
    const src = readFileSync(path.join(REPO, 'web/src/lib/annotations.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function removeBookmark'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/update bookmarks set deleted_at/i);
    expect(body, 'removeBookmark hard-deletes; the other annotation removals soft-delete').not.toMatch(/delete\s+from/i);
  });
});

describe('the button a reader presses', () => {
  const pending = {
    kind: 'verse' as const,
    key: '16',
    start: 0,
    end: 26,
    text: 'For God so loved the world',
    rect: { top: 10, left: 10, width: 100, height: 20, bottom: 30, right: 110 },
  };
  // SelectionPopover renders through a PORTAL into document.body, so `container` is empty and
  // asserting against it would have been a test that could never see the thing it names.
  const popover = (onBookmark?: () => void) =>
    render(
      <SelectionPopover
        pending={pending}
        contextLabel="John 3:16 · KJV"
        signedIn
        onDismiss={() => {}}
        onBookmark={onBookmark}
      />,
    );

  it('renders when a handler is supplied — the defect was that none ever was', () => {
    // SEED: unwire onBookmark in verse-display.tsx -> this stays green (it passes the handler
    // directly), which is why the wiring is asserted separately below. Kept because it pins the
    // popover's own contract: handler present => button present.
    popover(() => {});
    expect(document.body.textContent).toContain('Bookmark');
  });

  it('stays hidden with no handler, so a signed-out reader is not offered a dead control', () => {
    popover(undefined);
    expect(document.body.textContent).not.toContain('Bookmark');
  });

  it('verse-display actually PASSES a handler — the wiring, not the capability', () => {
    // SEED: delete the `onBookmark={...}` prop from the SelectionPopover call -> RED. This is the
    // assertion that would have caught the original defect; the two above would not have.
    const src = readFileSync(path.join(REPO, 'web/src/components/verse-display.tsx'), 'utf8');
    expect(src).toMatch(/onBookmark=\{/);
    expect(src, 'the handler is passed but never derived from a prop').toMatch(/onToggleBookmark/);
    // And gated on signedIn, so a signed-out reader is not shown a control whose write 401s.
    expect(src, 'the bookmark button is offered to signed-out readers').toMatch(/signedIn && onToggleBookmark/);
  });
});

describe('a bookmarked verse is marked in the reader', () => {
  const chapter: ChapterData = {
    book: 43,
    chapter: 3,
    verses: [
      { verse: 16, text: 'For God so loved the world.' },
      { verse: 17, text: 'For God sent not his Son to condemn the world.' },
    ],
  };
  const view = (bookmarked: number[]) =>
    render(
      <VerseDisplay
        data={chapter}
        bookName="John"
        translation="kjv"
        selectedVerse={null}
        bookmarkedVerses={new Set(bookmarked)}
        onVerseClick={() => {}}
      />,
    );

  it('marks only the bookmarked verse', () => {
    // Without a mark the bookmark is invisible until the reader opens My library, which makes it
    // indistinguishable from having failed.
    // SEED: drop the isBookmarked block -> RED.
    const { container } = view([16]);
    expect(container.querySelector('#v16')?.textContent).toContain('⚑');
    expect(container.querySelector('#v17')?.textContent).not.toContain('⚑');
  });

  it('marks nothing when nothing is bookmarked', () => {
    const { container } = view([]);
    expect(container.textContent).not.toContain('⚑');
  });
});
