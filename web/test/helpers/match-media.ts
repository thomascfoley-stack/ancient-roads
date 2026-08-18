/**
 * A `window.matchMedia` for jsdom, which ships none at all — `typeof window.matchMedia` is
 * literally `'undefined'` in jsdom 29, so any component that consults a media query throws inside
 * its own effect and takes the whole render down with it.
 *
 * STUBBED IN THE TEST, NOT GUARDED IN THE COMPONENT, for the reason `sidebar-catalog-nav.test.tsx`
 * already writes down about ResizeObserver: the gap is in this environment, not in the product.
 * A `typeof window.matchMedia === 'function'` guard in shipped code would be a branch that only
 * ever runs in jsdom, and it would silently disable the responsive behaviour in any real browser
 * that lacked the API — the failure mode you least want to hide.
 *
 * IT EVALUATES THE QUERY, IT DOES NOT PARROT IT. The stub parses the real query string against a
 * width, so a component asking for the WRONG range (`max-width: 767px`, say, or `min-width:
 * 1024px`) gets the wrong answer here and the test goes red. A stub that returned a fixed
 * `matches` would be a mock asserting what it was told, which this repo has a name for.
 *
 * It refuses what it cannot evaluate rather than returning `false`: a query form this parser does
 * not know (`orientation`, `prefers-*`, a comma-separated list) would otherwise read as "no match"
 * and quietly turn the assertion into a tautology.
 */
import { vi } from 'vitest';

type ChangeListener = (event: MediaQueryListEvent) => void;

/** `(min-width: 768px) and (max-width: 1023.98px)` — the only shape this stub claims to know. */
function evaluate(query: string, width: number): boolean {
  return query
    .split(' and ')
    .map((clause) => clause.trim())
    .every((clause) => {
      const parsed = /^\(\s*(min|max)-width:\s*([0-9.]+)px\s*\)$/.exec(clause);
      if (!parsed) {
        throw new Error(
          `stubMatchMedia cannot evaluate "${clause}" (from "${query}"). It understands only ` +
            '`and`-joined (min-width: Npx) / (max-width: Npx) clauses. Teach it the new form ' +
            'rather than letting an unknown query read as a non-match.',
        );
      }
      const px = Number(parsed[2]);
      return parsed[1] === 'min' ? width >= px : width <= px;
    });
}

class StubMediaQueryList {
  matches: boolean;
  private readonly listeners = new Set<ChangeListener>();

  constructor(readonly media: string, width: number) {
    this.matches = evaluate(media, width);
  }

  addEventListener(type: 'change', listener: ChangeListener): void {
    if (type === 'change') this.listeners.add(listener);
  }

  removeEventListener(type: 'change', listener: ChangeListener): void {
    if (type === 'change') this.listeners.delete(listener);
  }

  /** Re-evaluate at a new width, firing `change` ONLY when the answer actually flips — which is
   *  what a browser does, and the difference a "does resizing stomp the reader's own toggle?"
   *  test depends on. */
  resizeTo(width: number): void {
    const next = evaluate(this.media, width);
    if (next === this.matches) return;
    this.matches = next;
    const event = { matches: next, media: this.media } as MediaQueryListEvent;
    for (const listener of [...this.listeners]) listener(event);
  }
}

export interface MatchMediaStub {
  /**
   * Move the viewport. Every query created so far re-evaluates and the ones whose answer changed
   * emit `change`, so a component that listens sees a real crossing and one that only read
   * `matches` on mount does not. Wrap the call in `act()` — the listeners call `setState`.
   *
   * IT ALSO FIRES `window.resize`, on EVERY call and not only on a flip, because that is what a
   * browser does and the difference between the two events is a real distinction a component can
   * get wrong: `change` says "you crossed a boundary", `resize` says "a pixel moved". Without the
   * resize leg an implementation that re-read `matches` on every resize — and so stamped its
   * default over a reader who had just toggled — would sail past a test written to catch exactly
   * that. `window.innerWidth` is moved with it so a listener that reads it sees the same world.
   */
  setWidth(px: number): void;
}

/** Install the stub for this test file. Undone by `vi.unstubAllGlobals()`. */
export function stubMatchMedia(initialWidth: number): MatchMediaStub {
  let width = initialWidth;
  const live: StubMediaQueryList[] = [];

  vi.stubGlobal('matchMedia', (query: string) => {
    const mql = new StubMediaQueryList(query, width);
    live.push(mql);
    // The shape is a deliberate subset of MediaQueryList — the four members a listener actually
    // uses. Cast rather than implement `onchange`, `dispatchEvent` and the deprecated
    // add/removeListener pair, none of which this codebase calls.
    return mql as unknown as MediaQueryList;
  });

  return {
    setWidth(px: number) {
      width = px;
      Object.defineProperty(window, 'innerWidth', { value: px, configurable: true });
      for (const mql of live) mql.resizeTo(px);
      window.dispatchEvent(new Event('resize'));
    },
  };
}
