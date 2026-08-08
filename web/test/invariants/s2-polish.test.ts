// S2 — the polish sweep's AGENT-verifiable items.
//
// Exit tests for block `S2` of docs/UX_REMEDIATION.md, written before the fixes (§0.1).
// Items 1, 6, 8 and 9 are BROWSER/HUMAN/DEVICE and are not asserted here.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

describe('S2 item 2 — the tradition tag is legible on a dark card', () => {
  // THE DEFECT (pre-deploy audit, and the audit deck): the tag carried `text-stone-500` with NO
  // `dark:` variant, so a light-mode value stayed on a dark card. Every other label on that card
  // pairs a light and a dark token.
  // SEED: drop the dark: variant -> RED.
  it('pairs a dark-mode token with the light one', () => {
    const tag = /className="rounded-full bg-stone-200\/50[^"]*"/.exec(read('components/commentary-panel.tsx'))?.[0];
    expect(tag, 'the tradition tag class was not found — has the markup moved?').toBeTruthy();
    expect(tag, 'a text colour with no dark: pair keeps a light value on a dark card').toMatch(/dark:text-/);
  });
});

describe('S2 item 3 — the Ask lane checkboxes use the terracotta', () => {
  // ALREADY SHIPPED at e196e4b; asserted so it cannot silently regress to browser blue. The old
  // class was `text-accent-700 focus:ring-accent-600` — the @tailwindcss/forms idiom, with that
  // plugin NOT installed, so both were inert. A dead class that looks like the fix.
  it('uses accent-color, not the forms-plugin idiom', () => {
    const c = read('components/ask-client.tsx');
    expect(c).toMatch(/accent-accent-700/);
    expect(c, 'the forms-plugin idiom is inert here — that plugin is not installed').not.toMatch(/text-accent-700 focus:ring-accent-600/);
  });
});

describe('S2 item 5 — the chapter grid can be jumped, not only scrolled', () => {
  // THE DEFECT (deck): Psalm 119 costs 150 taps of scrolling. One input filtering an array already
  // in memory. SEED: remove the input -> RED.
  it('the picker offers a jump-to-chapter input', () => {
    const p = read('components/book-picker.tsx');
    expect(p, 'no <input> in the picker — Psalm 119 is still 150 taps of scrolling').toMatch(/<input/);
    expect(p, 'the input must be labelled for screen readers').toMatch(/aria-label=/);
  });
});
