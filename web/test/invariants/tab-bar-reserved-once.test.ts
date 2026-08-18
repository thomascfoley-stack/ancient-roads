// N2 EXIT TEST — the mobile tab bar's height is reserved EXACTLY ONCE.
//
// THE DEFECT, measured at 390x844 on the dev server before the fix (computed style, not inferred):
//
//   main padding-bottom .............. 60px   (app-shell.tsx — the shell's reserve)
//   composer sticky `bottom` ......... 64px   (ask-client.tsx — the SAME reserve again, +4px)
//   composer bottom edge ............. 124px above the viewport bottom
//   tab bar top ...................... 53px  above the viewport bottom
//   => the composer floated 71px above the tab bar
//
// `main` is the scroll container and already pads its content box clear of the tab bar, so a
// sticky child whose `bottom` offset ALSO spells out the tab-bar height is reserving the same
// strip twice. The visible result was a composer hovering a whole tab-bar above the tab bar, with
// a 60px-tall `after:` mask underneath it to stop page content showing through the gap the
// double-count created — a second declaration whose only job was to hide the first one's effect.
//
// WHY A STATIC CHECK RATHER THAN A RENDERED ONE. The property is about two declarations in two
// files agreeing not to say the same thing, and jsdom has no layout engine — `getBoundingClientRect`
// returns zeroes there, so a rendered assertion would be the "check that cannot fail" this repo
// keeps finding. The real geometry is verified in a browser and recorded in WORKLOG; this test is
// what stops the double-count coming back silently afterwards.
//
// DERIVED, NOT TYPED. The reserve expression is read OUT of app-shell.tsx and then searched for
// elsewhere. Change the shell's reserve to a different value and this check follows it; it never
// compares a hand-copied literal against another hand-copied literal, which is the failure mode
// MASTER.md's watchlist is mostly made of.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const shell = readFileSync(path.join(SRC, 'components/app-shell.tsx'), 'utf8');

/** Every .ts/.tsx under web/src. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

// The shell's own reserve, taken from `main`'s padding-bottom utility:
//   pb-[calc(3.75rem+env(safe-area-inset-bottom))]
const RESERVE = /pb-\[calc\(([^\]]*env\(safe-area-inset-bottom\)[^\]]*)\)\]/.exec(shell);

describe('N2 — the mobile tab bar is reserved once, by the shell', () => {
  // The control. If this regex stops matching, every assertion below is vacuously true and the
  // check has quietly become a no-op — the exact rot this suite exists to refuse.
  it('the shell still reserves the tab bar on its scroll container', () => {
    expect(RESERVE, 'no pb-[calc(...env(safe-area-inset-bottom)...)] found on app-shell — this check has gone blind').toBeTruthy();
    expect(shell).toMatch(/<main/);
    expect(shell, 'the reserve should be on the scrolling <main>').toMatch(/overflow-y-auto/);
  });

  // STICKY ONLY, and the distinction is the whole geometry lesson rather than a carve-out.
  //
  // The first version of this check flagged EVERY `bottom-[calc(<reserve>…)]` and caught four
  // sites. Three are `fixed` — the reader's Continue chip, the verse popover, the chapter toast —
  // and for a fixed element the offset is resolved against the VIEWPORT, which the shell's padding
  // does not move. There the reserve is not a duplicate, it is the only thing lifting those chips
  // off the tab bar, and "fixing" them would have pushed all three underneath it.
  //
  // A `sticky` child of `main` is the opposite case: it resolves against the scroll container,
  // whose content box the shell has ALREADY lifted. Same token, same file even, opposite meaning —
  // so the check has to read the position type, not just the offset.
  it('no sticky element re-reserves the height the shell already reserved', () => {
    const reserve = RESERVE![1]!; // e.g. "3.75rem+env(safe-area-inset-bottom)"
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      if (file.endsWith(`components${path.sep}app-shell.tsx`)) continue; // the one legitimate site
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/bottom-\[calc\(([^\]]+)\)\]/g)) {
        if (!m[1]!.includes(reserve)) continue;
        // The class attribute this utility sits in — `sticky` and `bottom-…` are always siblings
        // in one className string.
        const start = src.lastIndexOf('"', m.index!);
        const attr = src.slice(start === -1 ? m.index! : start, src.indexOf('"', m.index!) + 1);
        if (/\bsticky\b/.test(attr)) offenders.push(`${path.relative(SRC, file)}: sticky bottom-[calc(${m[1]})]`);
      }
    }

    expect(
      offenders,
      'These add the tab-bar reserve a second time, on top of the shell\'s. `main` is the scroll '
        + 'container and its padding already lifts the content box clear of the tab bar, so a sticky '
        + 'child only needs its own small gap (see md:bottom-3). Measured cost of the duplicate: the '
        + '/ask composer floated 71px above the tab bar at 390x844.',
    ).toEqual([]);
  });

  // The control for the narrowing above: the three `fixed` users must still be there and must
  // still carry the reserve. If a later change strips it from them, they slide under the tab bar
  // and nothing else in this file would notice.
  it('fixed chrome still carries the reserve — it needs it, and this check must not talk it out of it', () => {
    const reserve = RESERVE![1]!;
    const fixedUsers = walk(SRC).filter((file) => {
      const src = readFileSync(file, 'utf8');
      return [...src.matchAll(/bottom-\[calc\(([^\]]+)\)\]/g)].some((m) => {
        if (!m[1]!.includes(reserve)) return false;
        const start = src.lastIndexOf('"', m.index!);
        return /\bfixed\b/.test(src.slice(start === -1 ? m.index! : start, src.indexOf('"', m.index!) + 1));
      });
    });
    expect(fixedUsers.length, 'expected the fixed bottom-anchored chrome to still reserve the tab bar').toBeGreaterThanOrEqual(3);
  });

  // The mask existed only to hide the gap the double-count opened. Once the offset is small, a
  // tab-bar-sized mask is both unnecessary and a hint the offset crept back.
  it('no sticky element masks a tab-bar-sized strip beneath itself', () => {
    const reserve = RESERVE![1]!;
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/after:h-\[calc\(([^\]]+)\)\]/g)) {
        if (m[1]!.includes(reserve)) offenders.push(`${path.relative(SRC, file)}: after:h-[calc(${m[1]})]`);
      }
    }
    expect(
      offenders,
      'A mask as tall as the tab bar is the double-count wearing a different hat — it hides the gap '
        + 'rather than closing it.',
    ).toEqual([]);
  });
});
