// PR1c — PRAYER-SURFACE POLISH. Two defects found by the owner's post-deploy verification of PR1a.
//
// Exit tests, written before the fix.
//
// ── ITEM 1: DEAD AFFORDANCES RENDERED AS LIVE NAVIGATION ───────────────────────────────────────
// `N4` removed the two SEEDED sidebar sections, but readers who had already created their own —
// `MY SERMONS`, `BIBLE STUDIES` — still have them in `localStorage`, and their items still render
// as links. Both destinations are dead: `/channel/[id]` now redirects to `/prayers` (N4), and
// `/study/[id]` is a `ComingSoon` placeholder — the same fake door N4 exists to close, one branch
// of the same ternary over.
//
// N4's own exit check ("no orphaned channels or study partners remain") was reopened for exactly
// this. The items themselves are not lost: `PR1a`'s carry-forward already migrated them into the
// prayer journal, which is *why* `/prayers` is a truthful destination for them rather than a
// convenient one.
//
// ── ITEM 2: A NATIVE DIALOG IN THE DELETE PATH ─────────────────────────────────────────────────
// `window.confirm` froze the renderer for 60+ seconds during verification and is impassable to
// automation and to assistive tech. A modal that blocks the main thread is not a confirmation, it
// is an outage with a button on it — and on the prayer surface the thing behind it is someone's
// own words.
//
// The exit test that matters is the one the owner specified: **a headless delete completes end to
// end without patching the page context.** A test that stubs `window.confirm` proves the opposite
// of what is wanted — it proves the dialog is still there and that only a patched environment can
// get past it.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');
/** Comments stripped — NOT with /\/\/.*$/gm, which eats the `//` in any URL (F1-fonts finding). */
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('PR1c item 1 — no rail entry links to a dead destination', () => {
  // SEED: restore `` `/channel/${item.id}` `` -> RED.
  it('the sidebar links no item to /channel/[id]', () => {
    expect(
      code('components/sidebar.tsx'),
      '/channel/[id] redirects to /prayers — rendering it as navigation shows a live affordance ' +
        'for a destination that no longer exists',
    ).not.toMatch(/\/channel\/\$\{/);
  });

  // SEED: restore `` `/study/${item.id}` `` -> RED. This is the branch N4 did not reach: same
  // ternary, same defect, and leaving it would ship the identical fake door one line over.
  it('the sidebar links no item to /study/[id], which is still a placeholder', () => {
    expect(
      existsSync(path.join(SRC, 'app/study/[id]/page.tsx')),
      'precondition: /study/[id] exists — if it were deleted this check would be vacuous',
    ).toBe(true);
    expect(
      code('app/study/[id]/page.tsx'),
      'precondition: /study/[id] is still a ComingSoon placeholder',
    ).toMatch(/ComingSoon/);
    expect(
      code('components/sidebar.tsx'),
      'linking to a ComingSoon placeholder is the fake door N4 exists to close',
    ).not.toMatch(/\/study\/\$\{/);
  });

  // RE-POINTED 2026-09-07 under ADR-124, not edited to pass (C1). The property this leg pinned
  // was "resolve somewhere real OR stop rendering as links"; PR1c chose the first arm. The owner's
  // ruling chose the second — the sections are HIDDEN from the rail — so the first arm's literal
  // (`href="/prayers"` on a section item) no longer exists and the leg went RED for the right
  // reason. What must now hold: no section is rendered, and the storage that made `/prayers` a
  // truthful destination is left exactly where it was.
  it('carried-forward items are no longer rendered — and their storage is untouched', () => {
    const src = code('components/sidebar.tsx');
    // SEED: render `StudySectionView` again -> RED.
    expect(src, 'ADR-124 hides the pre-N4 sections from the rail').not.toMatch(/StudySectionView/);
    // SEED: add `localStorage.removeItem(\`study-sections…\`)` -> RED. The key is the prayer
    // carry-forward's only recovery source; clearing it turns a half-finished migration into
    // silent data loss.
    expect(src, 'the sidebar must never clear the study-sections key').not.toMatch(/removeItem\(/);
    expect(
      code('lib/prayer-carry-forward.ts'),
      'precondition: the carry-forward still owns the key string — if it stopped, this leg would be guarding nothing',
    ).toMatch(/study-sections:v1:/);
  });
});

describe('PR1c item 2 — the delete path uses no blocking native dialog', () => {
  // SEED: restore `window.confirm('Delete this prayer?')` -> RED.
  it('the prayer journal calls no native confirm/alert/prompt', () => {
    const src = code('components/prayer-journal.tsx');
    expect(
      src,
      'window.confirm blocks the renderer and is impassable to automation and assistive tech — ' +
        'a modal that freezes the main thread is an outage with a button on it',
    ).not.toMatch(/window\.(confirm|alert|prompt)\b|(?<![.\w])(confirm|alert|prompt)\(/);
  });

  it('an in-page confirmation exists and is a real two-step', () => {
    // Removing the dialog must not remove the confirmation. Deleting someone's prayer on a single
    // unguarded click is worse than the dialog was.
    const src = read('components/prayer-journal.tsx');
    expect(src, 'no confirming state — the guard was removed rather than replaced').toMatch(
      /confirmingDelete|setConfirmingDelete/,
    );
  });
});
