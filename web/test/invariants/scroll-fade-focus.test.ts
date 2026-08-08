// N2 — THE OVERFLOW HINT MUST NOT SWALLOW A FOCUSED ROW.
//
// Exit test for the `N2` REWORK. The block's original ask — signal that the sidebar scrolls —
// shipped at `e196e4b` and works. The pre-deploy deep audit (2026-08-07, finding 8) then measured
// what it cost:
//
//   At 1280x720 the rail's scrollport is 622px and "Hymns & Poetry" occupies 589-621 — ENTIRELY
//   inside the 32px mask ramp, rendered from ~3% opacity down to 0 while remaining a live link.
//   Because the row is already fully in view, Tab does NOT scroll it (`scrollTop` was 0 before and
//   after `focus()`), so the global `:focus-visible` ring is faded away with it.
//
// That is WCAG 2.4.7 (Focus Visible) on every page that renders the rail, and the same shape at
// 390px in the mobile sheet, where the sheet is scrollable the instant it opens.
//
// WHY A CSS-SOURCE ASSERTION AND NOT A RENDERED MEASUREMENT. jsdom does not implement `mask-image`,
// `getComputedStyle` resolution for it, or layout — so a rendered test here would assert nothing.
// The honest AGENT-level check is that the rule expresses the property; the rendered proof is the
// BROWSER check the block already carries and which stays unticked. Stated plainly rather than
// dressed up as a behavioural test.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const css = () => readFileSync(path.join(SRC, 'app/globals.css'), 'utf8');
const rule = () => {
  const m = /\.scroll-fade-b\s*\{([\s\S]*?)\}/.exec(css());
  if (!m) throw new Error('.scroll-fade-b not found — N2 is not wired at all');
  return m[1]!;
};

describe('N2 — the scroll fade does not hide a focusable row', () => {
  it('is still applied only while something is below', () => {
    // The property e196e4b established, re-asserted so this rework cannot quietly undo it.
    // A fade that is always on is decoration, not a signal.
    const sidebar = readFileSync(path.join(SRC, 'components/sidebar.tsx'), 'utf8');
    expect(sidebar).toMatch(/moreBelow \? 'scroll-fade-b' : ''/);
  });

  // SEED: remove the padding declaration -> RED. That is the state the audit measured, where a
  // fully-visible row sits inside the ramp at ~3% opacity with its focus ring faded out.
  it('reserves space below the last row so no row can sit inside the ramp', () => {
    expect(
      rule(),
      'the scrollport needs bottom padding at least the ramp height, or the last row renders ' +
        'inside the fade — and Tab will not scroll a row that is already fully in view, so its ' +
        'focus ring fades with it (WCAG 2.4.7, pre-deploy audit finding 8)',
    ).toMatch(/padding-bottom:/);
  });

  it('the reserved space is at least the ramp height', () => {
    const r = rule();
    const ramp = /transparent\)/.test(r) ? /calc\(100% - ([\d.]+)rem\)/.exec(r)?.[1] : null;
    const pad = /padding-bottom:\s*([\d.]+)rem/.exec(r)?.[1];
    expect(ramp, 'could not read the ramp height from the gradient').toBeTruthy();
    expect(pad, 'could not read padding-bottom').toBeTruthy();
    expect(
      Number(pad),
      `padding-bottom ${pad}rem is smaller than the ${ramp}rem ramp — a row can still land inside it`,
    ).toBeGreaterThanOrEqual(Number(ramp));
  });
});
