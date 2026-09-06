// @vitest-environment jsdom
//
// REPOSITION ON THE CARD'S OWN CONTENT GROWTH — the popover's placement input includes the
// card's measured `offsetWidth`/`offsetHeight`, but that input only re-ran `reposition` on
// `pending`/scroll/resize. The card's content grows AFTER placement on two surfaces:
//
//   * Bible reader: the `define` row (Option A) resolves asynchronously over a lexicon fetch and
//     inserts into the card subordinate (`{defineBlock && <div className="mt-2">{defineBlock}</div>}`).
//     `verse-display.tsx` sets `define=null` at selection time, then `setDefine(r)` when the fetch
//     settles — which is a different paint from the popover's first measure.
//   * Work reader: `SaveToStudy`'s "Saved to <study>." toast grows the card from its OWN useState
//     (`saved`/`notice`), with no change to any `SelectionPopover` prop at all.
//
// Neither growth re-ran `reposition`, so the card kept its old `top` and its grown bottom edge
// intruded into the selection (above placement) or spilled past the viewport-bottom clearance it
// was placed to clear (below). The fix is a `ResizeObserver` on the card — it fires `reposition`
// for EVERY size change, prop-driven or not, so both growth sources are covered. A deps-array
// fix keyed on `define` alone would patch the Bible reader and LEAVE the Work-reader toast
// unpatched; the test below that grows the card with NO prop change is what pins the observer
// as the fix rather than the narrower one.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. jsdom lays out nothing — every element reports 0x0, so
// no test here can measure the grown card's height the way a browser does. What jsdom CAN prove is
// the WIRING: that `reposition` is re-invoked when the card's size changes. To exercise that
// against the real placement math (`placePopover`, not a mock), mutable `offsetWidth`/`offsetHeight`
// getters are installed on the portal'd card after render and a controllable `ResizeObserver`
// stub stands in for the browser's observer. The geometry of the resulting `top` is then read
// from the card's inline `style.top`, exactly as a browser would apply `pos.top` to the fixed card.
// The reported overlap (grown `top` + grown `height` past `anchor.top`) follows from that `top`,
// and is asserted here against the real `placePopover`, not a stub of it.

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockSession: { data: { user: { id: string } } | null } = { data: null };
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => mockSession } }));

import { SelectionPopover } from '@/components/selection-popover';
import { POPOVER_GAP } from '@/lib/popover-position';
import type { PendingAnnotation } from '@/lib/use-text-annotation';
import type { DefineResolution } from '@/lib/original';

// ── a controllable ResizeObserver ──────────────────────────────────────────────────────────
// jsdom implements no ResizeObserver, and the product's effect guards on
// `typeof ResizeObserver === 'undefined'`, so without a stub the observer path is a no-op here.
// The stub RECORDS the observe call (so the wiring is assertable) and lets the test FIRE the
// callback on demand — a real browser fires it when the observed element's content box changes,
// which is exactly the growth event the fix is built to catch. The component constructs the
// observer with `() => reposition()`, so firing the callback re-runs `reposition` against
// whatever the card now measures.
type RoCallback = (entry: ResizeObserverEntry) => void;

class ControllableResizeObserver {
  static instances: ControllableResizeObserver[] = [];
  private readonly cb: RoCallback;
  private readonly targets = new Set<Element>();

  constructor(cb: RoCallback) {
    this.cb = cb;
    ControllableResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.targets.add(target);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
  }
  isObserving(target: Element): boolean {
    return this.targets.has(target);
  }
  /** Fire the callback once per observed target, as a browser does when one resizes. */
  fire(): void {
    for (const target of this.targets) this.cb({ target } as ResizeObserverEntry);
  }
}

// Stubbed in `beforeEach` (not at module level) so a `vi.unstubAllGlobals()` in `afterEach` —
// which removes the per-test `getSelection` stub — does not also remove this one across tests.

// ── typed fixtures (no `as DOMRect` cast — the annotation's drift is what tsc catches here) ─
const ANCHOR_TOP = 300;
const ANCHOR_HEIGHT = 20;
const ANCHOR_LEFT = 200;
const ANCHOR_WIDTH = 100;

const pending: PendingAnnotation = {
  kind: 'verse',
  key: '1',
  start: 0,
  end: 6,
  text: 'heaven',
  rect: {
    top: ANCHOR_TOP,
    bottom: ANCHOR_TOP + ANCHOR_HEIGHT,
    left: ANCHOR_LEFT,
    right: ANCHOR_LEFT + ANCHOR_WIDTH,
    width: ANCHOR_WIDTH,
    height: ANCHOR_HEIGHT,
  },
};

const theos = { w: 'θεὸν', l: 'θεός', tr: 'theós', s: 'G2316', m: 'N- ----ASM-', g: 'God' };
const one: DefineResolution = {
  english: 'heaven',
  lang: 'greek',
  lexiconDown: false,
  count: 1148,
  matches: [{ word: theos, index: 0 }],
};

// ── layout constants ───────────────────────────────────────────────────────────────────────
// NO_DEFINE_HEIGHT is the card's measured height at placement time (before the define row
// resolves). GROWN_HEIGHT is the same card after the row appears. The geometry the bug turns on:
//   no-define  top = ANCHOR_TOP - POPOVER_GAP - NO_DEFINE_HEIGHT = 300 - 10 - 60 = 230
//              bottom = 230 + 60 = 290  <=  ANCHOR_TOP (300)  -> CLEAR
//   grown      top = ANCHOR_TOP - POPOVER_GAP - GROWN_HEIGHT   = 300 - 10 - 120 = 170
//              bottom = 170 + 120 = 290  <=  ANCHOR_TOP (300)  -> CLEAR (after reposition)
//   bug        top retained at 230 after growth
//              bottom = 230 + 120 = 350  >   ANCHOR_TOP (300) -> 50px INTO the selection
const CARD_WIDTH = 320;
const NO_DEFINE_HEIGHT = 60;
const GROWN_HEIGHT = 120; // the define row (Option A) adds ~60px of card height
const TOAST_DELTA = 20; // the SaveToStudy "Saved to <study>." toast adds ~20px of card height

// jsdom's default viewport is 1024x768 — ANCHOR_TOP=300 keeps the selection well inside it, so
// placePopover keeps the prefer-above placement (the case where growth intrudes into the
// selection) rather than flipping below.

function desktopCard(): HTMLElement {
  return document.body.querySelector('[role="toolbar"][aria-label="Annotate selection"]')!;
}

function topOf(card: HTMLElement): number {
  return Number.parseInt(card.style.top, 10);
}

function leftOf(card: HTMLElement): number {
  return Number.parseInt(card.style.left, 10);
}

/** Install mutable `offsetWidth`/`offsetHeight` getters on the card so `reposition` reads the
 *  test-controlled size instead of jsdom's 0x0. Mutate `dims` to simulate the card growing. */
function installDims(card: HTMLElement, dims: { width: number; height: number }): void {
  Object.defineProperty(card, 'offsetWidth', { configurable: true, get: () => dims.width });
  Object.defineProperty(card, 'offsetHeight', { configurable: true, get: () => dims.height });
}

/** The observer the fix wires to the card, or undefined if the fix is absent. */
function observerFor(card: Element): ControllableResizeObserver | undefined {
  return ControllableResizeObserver.instances.find((o) => o.isObserving(card));
}

beforeEach(() => {
  ControllableResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', ControllableResizeObserver);
  // `getSelection` -> null so `reposition` falls back to `pending.rect` as the anchor, making
  // the placement input fully deterministic (the live selection's rect is not under test here).
  vi.stubGlobal('getSelection', () => null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockSession = { data: null };
  ControllableResizeObserver.instances = [];
});

describe('the card repositions when its own content grows after placement', () => {
  it('grows after the define row resolves: repositions to stay clear of the selection', () => {
    // SEED (red-proof): the introducing commit (b9acc90b) left `reposition` keyed on `[pending]`
    // only, with no content-size observer and `define` absent from the deps. Under that state
    // nothing re-runs `reposition` when the row appears, the grown `top` is retained at 230, and
    // `expect(...170)` below REDs.
    const dims = { width: CARD_WIDTH, height: NO_DEFINE_HEIGHT };
    const { rerender } = render(
      <SelectionPopover
        pending={pending}
        contextLabel="Revelation 21:1 · WEB"
        signedIn={false}
        define={null}
        onDismiss={() => {}}
      />,
    );
    const card = desktopCard();
    installDims(card, dims);
    // first placement against the no-define height — driven here by a scroll, which is the one
    // trigger that existed before the fix; under jsdom the mount-time layout effect saw 0x0.
    fireEvent.scroll(window);
    const placedTop = topOf(card);
    expect(placedTop).toBe(ANCHOR_TOP - POPOVER_GAP - NO_DEFINE_HEIGHT); // 230
    expect(placedTop + NO_DEFINE_HEIGHT).toBeLessThanOrEqual(ANCHOR_TOP); // clear

    // the define row arrives (async over the fetch) — the card grows to GROWN_HEIGHT. `define`
    // changing does NOT change `reposition`'s identity (its deps are `[pending]`), so the layout
    // effect does not re-run; only the card's measured size has moved.
    dims.height = GROWN_HEIGHT;
    rerender(
      <SelectionPopover
        pending={pending}
        contextLabel="Revelation 21:1 · WEB"
        signedIn={false}
        define={one}
        onPickDefine={() => {}}
        onOpenWordStudy={() => {}}
        onDismiss={() => {}}
      />,
    );

    // THE FIX: the card's size change is observed, and reposition runs against the new height.
    act(() => observerFor(card)?.fire());

    expect(topOf(card)).toBe(ANCHOR_TOP - POPOVER_GAP - GROWN_HEIGHT); // 170
    expect(topOf(card) + GROWN_HEIGHT).toBeLessThanOrEqual(ANCHOR_TOP); // 170+120=290 <= 300
  });

  it('grows from a NON-prop source (the SaveToStudy toast) and still repositions', () => {
    // THIS IS WHY THE FIX IS A ResizeObserver, NOT `define` IN THE DEPS ARRAY. `SaveToStudy`'s
    // "Saved to <study>." toast grows the card from its OWN useState (`saved`/`notice`) with no
    // change to any `SelectionPopover` prop — the Work reader passes no `define` at all.
    //
    // SEED (red-proof): replace the ResizeObserver effect with the narrower deps-array fix
    // (`reposition` keyed on `[pending, define]`, no observer) -> this growth changes no prop,
    // so `reposition` never re-runs, the card never fires an observer, and the grown `top` is
    // retained at 230 -> `expect(...210)` below REDs. The `define`-deps fix patches the row but
    // leaves this Work-reader instance unpatched; only an observer of the card covers both.
    const dims = { width: CARD_WIDTH, height: NO_DEFINE_HEIGHT };
    render(
      <SelectionPopover
        pending={pending}
        contextLabel="John Bunyan · The Pilgrim's Progress · Sermon XII"
        signedIn={false}
        onDismiss={() => {}}
      />,
    );
    const card = desktopCard();
    installDims(card, dims);
    fireEvent.scroll(window);
    expect(topOf(card)).toBe(ANCHOR_TOP - POPOVER_GAP - NO_DEFINE_HEIGHT); // 230

    // No prop changes here — the growth is internal to a child (the toast). Only the card's
    // measured height moves, which is exactly what a ResizeObserver catches and a deps-array
    // on `define` cannot.
    dims.height = NO_DEFINE_HEIGHT + TOAST_DELTA;
    act(() => observerFor(card)?.fire());

    expect(topOf(card)).toBe(ANCHOR_TOP - POPOVER_GAP - (NO_DEFINE_HEIGHT + TOAST_DELTA)); // 210
  });

  it('scroll still repositions (regression of the pre-existing trigger)', () => {
    // The fix ADDED a trigger; it must not have removed the one that was already there.
    //
    // SEED (red-proof): drop `window.addEventListener('scroll', reposition, true)` -> RED.
    const dims = { width: CARD_WIDTH, height: NO_DEFINE_HEIGHT };
    render(<SelectionPopover pending={pending} contextLabel="L" signedIn={false} onDismiss={() => {}} />);
    const card = desktopCard();
    installDims(card, dims);
    fireEvent.scroll(window);
    expect(topOf(card)).toBe(ANCHOR_TOP - POPOVER_GAP - NO_DEFINE_HEIGHT); // 230

    // grow, then drive reposition via the SCROLL listener (not the observer) — proving both
    // triggers coexist on the same card.
    dims.height = GROWN_HEIGHT;
    fireEvent.scroll(window);
    expect(topOf(card)).toBe(ANCHOR_TOP - POPOVER_GAP - GROWN_HEIGHT); // 170
  });

  it('resize still repositions (regression of the pre-existing trigger)', () => {
    // SEED (red-proof): drop `window.addEventListener('resize', reposition)` -> RED.
    const dims = { width: CARD_WIDTH, height: NO_DEFINE_HEIGHT };
    render(<SelectionPopover pending={pending} contextLabel="L" signedIn={false} onDismiss={() => {}} />);
    const card = desktopCard();
    installDims(card, dims);

    // Place at the jsdom default 1024px viewport, then shrink it so the horizontal clamp moves
    // the card — a visible, deterministic reposition driven by the resize listener.
    fireEvent.scroll(window); // first measure (offsetWidth was 0 at mount)
    const placedLeft = leftOf(card); // anchor-centered, unclamped at 1024px: anchor center 250 - 320/2 = 90

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 });
    fireEvent.resize(window);
    // at 300px the clamp pins the card to the left margin (POPOVER_MARGIN=8): the card moved.
    expect(leftOf(card)).not.toBe(placedLeft);
    expect(leftOf(card)).toBe(8);
  });

  it('a width-0 (mobile display:none) card stays hidden — the guard and the observer no-op there', () => {
    // The card is `hidden md:block`; on mobile it is `display:none`, so `offsetWidth === 0` and
    // `reposition` early-returns (the docked bar handles that surface). The observer must not
    // un-hide a card that reposition itself refuses to place.
    //
    // SEED (red-proof): drop the `card.offsetWidth === 0` guard in `reposition` -> placePopover
    // runs against a 0x0 card, sets a non-null `pos`, and the card's `top` leaves -9999 -> RED.
    const dims = { width: 0, height: 0 };
    render(<SelectionPopover pending={pending} contextLabel="L" signedIn={false} onDismiss={() => {}} />);
    const card = desktopCard();
    installDims(card, dims);
    fireEvent.scroll(window);
    expect(topOf(card)).toBe(-9999); // pos stayed null -> visibility:hidden off-screen slot

    const observer = observerFor(card);
    // The observer IS attached on mobile too (the JS Md/CSS hides it, not the effect); what
    // matters is that firing it does not place a card the guard refused.
    if (observer) {
      act(() => observer.fire());
      expect(topOf(card)).toBe(-9999); // still hidden — reposition early-returned on width 0
    }
  });
});
