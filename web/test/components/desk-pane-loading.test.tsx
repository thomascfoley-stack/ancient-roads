// @vitest-environment jsdom
//
// B011 — A NEW PANE MUST NOT ASSERT WHAT IT DOES NOT YET KNOW.
//
// THE DEFECT. A work pane is created from a URL that carries a slug and nothing else, so between
// mount and the `/api/work/[slug]` response the header rendered two things that were not true:
//
//     title    = source?.title ?? pane.slug          -> "spurgeon-sermons", as though a slug were
//                                                       the work's name
//     register = paneRegisterLabel(source?.source_type) -> undefined falls through to "Unlabelled"
//
// so every pane flashed `UNLABELLED · spurgeon-sermons` before becoming itself. The register half
// is the one that matters. "Unlabelled" is the register wall's signal for a work whose source_type
// this build does not recognise — a rare, investigate-me state. Printing it on every ordinary pane
// load spends that signal on a condition that is not it, and trains everyone (including whoever
// reads a screenshot in a bug report) to treat UNLABELLED as noise.
//
// The same frame carried a third false statement in the body: `busy` started false and is set true
// only by the effect, which runs after the first paint, so `sections.length === 0 && !busy` held
// and the pane said "Nothing to read here yet." about a work it had not yet asked for.
//
// WHAT IS ASSERTED. Both directions, because only the pair is a real check: while loading, none of
// the three false strings appear anywhere a reader or a screen reader can reach them; once the
// metadata lands, the real title and the real register DO appear. An assertion that only checked
// the absence would pass just as happily against a pane that never rendered anything at all.
//
// THE SCRIPTURE CONTROL is the "already-known title" case: a Scripture pane's title and register
// are derivable from the URL itself, so it must show them immediately and must NOT take the
// skeleton path. That is the honest form of "prefer the real title over a placeholder" — the desk
// shows what it genuinely knows at mount, and a work pane knows nothing but an identifier.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, push: () => {} }) }));

import { DeskPane } from '@/components/desk-pane';

const SLUG = 'spurgeon-sermons';

const META = {
  source: {
    slug: SLUG,
    title: 'Sermons on the Psalms',
    author: 'Charles Spurgeon',
    tradition: 'Baptist',
    source_type: 'sermon',
  },
  toc: [],
};

/** A promise plus its resolver, so the test decides exactly when the metadata lands. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** The two fields the pane reads off a fetch Response, and nothing else. */
function jsonOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const metaResponse = deferred<Response>();

beforeEach(() => {
  vi.stubGlobal('fetch', (url: string) =>
    // The section page is answered immediately; only the METADATA is held, because it is the
    // metadata the header is waiting on and the header is the subject.
    url.includes('/sections') ? Promise.resolve(jsonOk({ sections: [], nextAfter: null })) : metaResponse.promise,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a work pane before its metadata arrives', () => {
  it('shows neither the raw slug nor "Unlabelled" anywhere a reader can see them', () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);

    expect(screen.queryByText(SLUG)).toBeNull();
    expect(screen.queryByText(/unlabelled/i)).toBeNull();
  });

  it('does not put the slug or "Unlabelled" into the accessible names either', () => {
    // The pane's own label was `${title} (${register})` = "spurgeon-sermons (Unlabelled)", and the
    // close button's was "Close spurgeon-sermons". A screen reader heard the defect that a sighted
    // reader saw, so both are checked.
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);

    expect(screen.queryByLabelText(new RegExp(SLUG))).toBeNull();
    expect(screen.queryByLabelText(/unlabelled/i)).toBeNull();
    expect(screen.getByRole('region').getAttribute('aria-busy')).toBe('true');
  });

  it('says it is loading', () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);

    expect(screen.getByText(/loading/i)).toBeTruthy();
  });
});

describe('the very first frame — before any effect has run', () => {
  // WHY renderToStaticMarkup AND NOT render(). The body's third false statement ("Nothing to read
  // here yet.") lived in the initial commit only: `busy` started false, and the effect that sets
  // it true is a PASSIVE effect, which React runs after paint. RTL's `render` wraps everything in
  // act(), which flushes those effects before a single assertion runs — so the frame this defect
  // lives in is already gone by the time `screen` can be queried, and an assertion written that
  // way passes against the broken code (verified: it did).
  //
  // renderToStaticMarkup runs the render function and no effects at all, which is exactly the
  // initial commit the browser paints. It is the only honest way to see this frame from a test.

  it('claims neither an empty work, nor a register, nor a title it does not have', () => {
    const html = renderToStaticMarkup(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);

    expect(html).not.toContain('Nothing to read here yet');
    expect(html).not.toContain('Unlabelled');
    // Not as a title, and not in the `/work/<slug>` href either — while loading there is no title
    // link to carry it, so the slug must not appear in the markup at all.
    expect(html).not.toContain(SLUG);
    expect(html).toContain('Loading');
  });

  it('a Scripture pane, by contrast, has its title in that very first frame', () => {
    const html = renderToStaticMarkup(
      <DeskPane pane={{ kind: 'scripture', book: 'john', chapter: 3 }} onClose={() => {}} onReplace={() => {}} />,
    );

    expect(html).toContain('John 3');
    expect(html).toContain('Scripture');
  });
});

describe('a work pane once its metadata arrives', () => {
  it('shows the real title, the real register and the author line', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    metaResponse.resolve(jsonOk(META));

    // Without this half the absence assertions above would be satisfied by a pane that rendered
    // nothing forever.
    await waitFor(() => expect(screen.getByText('Sermons on the Psalms')).toBeTruthy());
    expect(screen.getByText('Sermon')).toBeTruthy();
    expect(screen.getByText('Charles Spurgeon · Baptist')).toBeTruthy();
    expect(screen.getByRole('region').getAttribute('aria-busy')).toBeNull();
    expect(screen.getByLabelText(`Close ${META.source.title}`)).toBeTruthy();
  });
});

describe('a Scripture pane knows its title at mount and shows it', () => {
  it('renders the book, chapter and register immediately — no skeleton', () => {
    // Held on the same never-settling chapter fetch as the work pane above, to prove the title is
    // coming from the URL rather than from a request that quietly resolved.
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    render(<DeskPane pane={{ kind: 'scripture', book: 'john', chapter: 3 }} onClose={() => {}} onReplace={() => {}} />);

    expect(screen.getByText('John 3')).toBeTruthy();
    expect(screen.getByText('Scripture')).toBeTruthy();
    expect(screen.getByRole('region').getAttribute('aria-busy')).toBeNull();
    expect(screen.queryByText(/unlabelled/i)).toBeNull();
  });
});
