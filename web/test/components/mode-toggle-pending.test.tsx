// @vitest-environment jsdom
//
// "CLICKING HISTORY THE FIRST TIME IN A SESSION TAKES A LONG LONG TIME" — owner report,
// 2026-08-22. Two separate faults wearing one symptom, and this file pins both.
//
// 1. NOTHING SAYS THE CLICK LANDED. /ask reads searchParams, so both modes are one dynamic route.
//    A soft navigation to a dynamic route holds the CURRENT page on screen, unchanged, until the
//    server render arrives — no spinner, no dimming, nothing. On a cold function that is seconds
//    of a page that looks like it ignored you, and the reader clicks again.
// 2. THE CLICK PAYS FOR THE WHOLE RENDER. The App Router's default prefetch for a dynamic route
//    stops at the nearest `loading.js`; /ask has none, so nothing useful is prefetched and the
//    click is a cold round trip. `prefetch` on the tab you are NOT on fetches the route and its
//    data while the reader is still reading the page they are on.
//
// SEED to prove red: delete <TabPending /> from the History link (case 2 goes red), or drop the
// `prefetch` props (case 3 goes red).
//
// WHY CASE 3 IS A SOURCE SCAN. `prefetch` is a Link prop, not a DOM attribute — it appears
// nowhere in the rendered anchor, so a render assertion cannot see it and a test that pretended
// to check it would be checking nothing. Stated rather than dressed up as a behavioural test.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// useLinkStatus is pending only during a real navigation, which jsdom has no router for. Mocking
// the hook is what makes the pending BRANCH the subject; the real-navigation proof is the browser
// check that ships with this change.
let pending = false;
vi.mock('next/link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/link')>();
  return { ...actual, useLinkStatus: () => ({ pending }) };
});

const { ModeToggle } = await import('@/components/mode-toggle');

const SOURCE = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/components/mode-toggle.tsx'),
  'utf8',
);

afterEach(() => {
  pending = false;
  cleanup();
});

describe('the Voices | History toggle', () => {
  it('shows nothing extra when no navigation is in flight', () => {
    const { container } = render(<ModeToggle mode="voices" />);
    expect(container.querySelectorAll('.progress-travel')).toHaveLength(0);
  });

  it('shows a travelling bar on the tab that was clicked', () => {
    pending = true;
    const { container } = render(<ModeToggle mode="voices" />);
    const bar = container.querySelector('.progress-travel');
    expect(bar, 'a click on History changes nothing on screen until the server answers').not.toBeNull();
    // Inside the link, so it marks WHICH tab is loading rather than floating over the pair.
    expect(bar!.closest('a')).not.toBeNull();
  });

  it('prefetches the mode you are not on, and never the one you are', () => {
    expect(SOURCE).toMatch(/prefetch=\{mode !== 'voices'\}/);
    expect(SOURCE).toMatch(/prefetch=\{mode !== 'history'\}/);
  });

  it('paints no corners', () => {
    // The radius ladder is zeroed (globals.css) so `rounded-*` utilities are no-ops — but a BARE
    // `rounded` is not on the ladder and paints real corners, on the header surface, against
    // the PRD's square-corners rule (UX_POLISH_AUDIT P2, mode-toggle.tsx:42). SEED: add it -> RED.
    // Comments stripped first: the file's own header records the old class by name.
    const code = SOURCE.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\brounded\b/);
  });
});
