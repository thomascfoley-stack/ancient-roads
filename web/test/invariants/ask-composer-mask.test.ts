// THE /ask COMPOSER'S MASK IS COUPLED TO ANOTHER FILE'S PADDING, AND NOTHING ENFORCED IT.
//
// `app-shell.tsx` makes `main` the scroll container and reserves the mobile tab bar with
// `pb-[calc(3.75rem+env(safe-area-inset-bottom))]`. `ask-client.tsx` then sticks the composer
// inside that scroller and paints a background strip below it. Three separate values have to
// agree for the strip to cover the slot exactly, and all three live in class strings that a
// formatter, a redesign, or a well-meant "simplify the calc" can change independently:
//
//   offset   the sticky inset, measured from `main`'s CONTENT box (which the padding above
//            has ALREADY inset by the bar's height — adding it again is the 2026-08-17 bug)
//   height   must equal offset + `main`'s padding-bottom, so the strip reaches the bottom of
//            the scrollport's padding box rather than the top of a bar whose rendered height
//            (an emergent 53px) no CSS here can name
//   top      must clear the composer's own bottom border
//
// This is the repo's standing failure shape — "a hand-maintained expected set that nothing
// enforces" — sitting on the mechanism whose failure mode is CONTENT APPEARING UNDER THE
// COMPOSER. P5 shipped a hand-computed 68px against an assumed 60px bar and left a 4px strip
// of document live at every scroll offset; nothing went red.
//
// So this test DERIVES all three values from the two source files and checks the relationship.
// It is deliberately not a snapshot of the class string: it re-derives, so a legitimate
// redesign that keeps the invariant passes, and any change that breaks the arithmetic fails.
//
// The two `+1px` terms are not decoration and are asserted separately, because both encode the
// same trap: an absolutely-positioned child resolves against the PADDING box, so `top-full`
// starts one border-width ABOVE the border edge (painting over the composer's own hairline and
// the bottom of its focus ring), and a bare negative `inset-x` likewise falls one border-width
// short of the border box on each side.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src', 'components');
const appShell = readFileSync(join(SRC, 'app-shell.tsx'), 'utf8');
const askClient = readFileSync(join(SRC, 'ask-client.tsx'), 'utf8');

/** `3.75rem` / `0.25rem` / `4px` -> px. rem is 16px at the app's root font size. */
function toPx(term: string): number {
  const m = /^(-?[\d.]+)(rem|px)$/.exec(term.trim());
  if (!m) throw new Error(`unparseable length: ${term}`);
  return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
}

/** Sum the numeric terms of a `calc()` body, ignoring the safe-area term (0 on a headless
 *  viewport and, more importantly, identical on both sides of the comparison so it cancels). */
function sumCalc(body: string): number {
  const withoutEnv = body.replace(/env\([^)]*\)/g, '0');
  const terms = withoutEnv.split('+').map((t) => t.trim()).filter((t) => t && t !== '0');
  return terms.reduce((acc, t) => acc + toPx(t), 0);
}

/** Tailwind spacing scale: `bottom-1` -> 4px, `after:h-4` -> 16px. */
const SPACING_PX = 4;

describe('the /ask composer mask covers the slot below it, exactly', () => {
  // --- derive `main`'s reserved padding, from app-shell.tsx ---
  const mainPb = /pb-\[calc\(([^\]]+)\)\]/.exec(appShell);
  it('derives main\'s padding-bottom from app-shell.tsx', () => {
    expect(mainPb, 'app-shell.tsx no longer has a pb-[calc(...)] on the scroll container').not.toBeNull();
  });
  const mainPbPx = sumCalc(mainPb![1]);

  // --- derive the composer's three values, from ask-client.tsx ---
  const formClass = /className="edge sticky ([^"]+)"/.exec(askClient);
  it('finds the sticky composer form in ask-client.tsx', () => {
    expect(formClass, 'the composer <form> class string moved or was renamed').not.toBeNull();
  });
  const cls = formClass![1];

  const offset = /(?:^|\s)bottom-(\d+)(?:\s|$)/.exec(cls);
  const maskH = /after:h-\[calc\(([^\]]+)\)\]/.exec(cls);
  const maskTop = /after:top-\[calc\(([^\]]+)\)\]/.exec(cls);
  const maskInsetX = /after:inset-x-\[calc\(([^\]]+)\)\]/.exec(cls);

  it('the mobile sticky offset does NOT re-add the tab bar main already reserves', () => {
    // The 2026-08-17 defect: the offset was an arbitrary `calc()` that re-stated the tab-bar
    // token. A sticky inset resolves against the scroller's CONTENT box, so that counted the bar
    // twice and floated the composer a whole tab bar above the tab bar.
    //
    // NOTE — do NOT write the offending class literally in this file, not even in a comment.
    // Tailwind v4 auto-detects content and scans `web/test/**`, so a class-like string here is
    // COMPILED into globals.css. Writing the old class out with an ellipsis standing in for the
    // safe-area argument generated a rule whose value contained that ellipsis — invalid CSS, so
    // the stylesheet failed to parse and EVERY route 500'd. Typecheck and the whole test suite
    // stayed green; only `next build` and the running app catch it. Describe, do not quote.
    expect(cls).not.toMatch(/(?:^|\s)bottom-\[calc\([^\]]*3\.75rem/);
    expect(offset, 'the composer lost its plain `bottom-N` mobile offset').not.toBeNull();
  });

  it('the mask height equals the offset plus main\'s reserved padding', () => {
    expect(maskH, 'the mask lost its after:h-[calc(...)]').not.toBeNull();
    const offsetPx = Number(offset![1]) * SPACING_PX;
    // This is the whole invariant: reach the bottom of the scrollport's padding box.
    expect(sumCalc(maskH![1])).toBe(offsetPx + mainPbPx);
  });

  it('the mask starts BELOW the composer\'s border, not over it', () => {
    // `after:top-full` resolves against the padding box and paints over the form's own bottom
    // hairline and the bottom of its focus ring. It must carry the border width.
    expect(cls).not.toMatch(/after:top-full/);
    expect(maskTop, 'the mask lost its after:top-[calc(...)]').not.toBeNull();
    expect(maskTop![1].replace(/\s+/g, '')).toBe('100%+1px');
  });

  it('the mask is wide enough for the result cards that overhang the composer', () => {
    // ResultLink is `-mx-2.5` (10px per side); the mask must cover that plus the border, or a
    // hovered/focused row paints beside it. A y-scan down the centre line cannot see this.
    const overhang = /-mx-2\.5/.test(askClient);
    expect(overhang, 'ResultLink no longer uses -mx-2.5; re-derive the mask inset').toBe(true);
    expect(maskInsetX, 'the mask inset must carry both the overhang and the border').not.toBeNull();
    const body = maskInsetX![1].replace(/\s+/g, '');
    expect(body).toBe('-0.625rem-1px');
  });

  it('the desktop pair still covers its own smaller gap', () => {
    const dTop = /md:bottom-(\d+)/.exec(cls);
    const dMask = /md:after:h-(\d+)/.exec(cls);
    expect(dTop, 'md:bottom-N missing').not.toBeNull();
    expect(dMask, 'md:after:h-N missing').not.toBeNull();
    // main is md:pb-0, so the desktop strip only has to span the offset itself.
    expect(Number(dMask![1]) * SPACING_PX).toBeGreaterThanOrEqual(Number(dTop![1]) * SPACING_PX);
    expect(appShell).toMatch(/md:pb-0/);
  });

  it('the mask paints the PAGE background in both themes, not the composer\'s', () => {
    // body is `bg-stone-50 dark:bg-stone-950` (layout.tsx). If these diverge, the strip reads as
    // a band of the wrong colour under the composer rather than as page.
    expect(cls).toMatch(/after:bg-stone-50/);
    expect(cls).toMatch(/dark:after:bg-stone-950/);
  });
});
