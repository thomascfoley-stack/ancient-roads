// T1 / T3 — the first run lands in the product, and the mobile page clears the tab bar.
//
// ── T1 ─────────────────────────────────────────────────────────────────────────────────────────
// A new reader's first screen was `/home`, a devotional feed that teaches nothing about what makes
// this app different. The one idea that does is the verse drawer: tap a verse, see how the church
// has read it, quoted and cited, never interpreted.
//
// **The block assumed the deep link for that already existed** ("a redirect target plus an
// initial-state flag — both already supported, since deep links to verses exist"). **It did not.**
// The reader parses `#v<n>` from `window.location.hash` and only SCROLLS; there are no query
// params on that route and no way to open the drawer from a URL. Recorded in T1's Findings log.
// The hash was extended to `#v<n>:study`, reusing the effect and the `openStudy` callback already
// in that file — the smallest change that makes the block's premise true.
//
// A hash rather than a query string is deliberate and load-bearing: the reader reads it in an
// effect precisely because a hash is never sent to the server, so no first client render can
// disagree with it. A `?v=` would reintroduce the hydration-mismatch shape that file spent an
// afternoon removing.
//
// ── T3 ─────────────────────────────────────────────────────────────────────────────────────────
// The page-level scroll container must reserve the mobile tab bar's height plus the device's safe
// area, or the bar covers the last lines of scripture. That fix is already in `app-shell.tsx`;
// this is the regression guard on it, and it is deliberately NOT a claim that T3 is verified —
// `env(safe-area-inset-bottom)` resolves to 0 in any desktop window, so no test here and no
// resized browser can prove the notched-device case. That is T3's `DEVICE` check and it stays open.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

describe('T1 — a new account lands in the reader, not on the dashboard', () => {
  // SEED: point FIRST_RUN_DESTINATION back at '/home' -> RED.
  it('sign-up redirects to John 1 with the study drawer open', () => {
    const forms = read('components/auth-forms.tsx');
    const dest = /FIRST_RUN_DESTINATION = '([^']+)'/.exec(forms)?.[1];
    expect(dest, 'FIRST_RUN_DESTINATION is not declared').toBeTruthy();
    expect(dest, 'a new reader must land in the reader, not on the devotional feed').toMatch(/^\/read\//);
    expect(dest, 'the drawer must be open — landing on the chapter alone teaches nothing').toMatch(/#v\d+:study$/);
  });

  it('the email and Google paths share one destination, so they cannot drift', () => {
    const forms = read('components/auth-forms.tsx');
    // SEED: hard-code '/home' into the google() callbackURL -> RED.
    expect(forms, "google sign-in must use the same constant").toMatch(/callbackURL: FIRST_RUN_DESTINATION/);
    expect(forms, 'sign-up must use the same constant').toMatch(/router\.push\(FIRST_RUN_DESTINATION\)/);
  });

  it('SIGN-IN still goes to /home — a returning reader keeps their own place', () => {
    // The guard against over-applying T1. Sending someone back to John 1 on every sign-in would
    // override the place they chose to be, which is the opposite of the block's point.
    const forms = read('components/auth-forms.tsx');
    expect(forms, "sign-in's /home redirect was removed along with sign-up's").toMatch(/router\.push\('\/home'\)/);
  });

  // SEED: revert the hash regex to /^#v(\d+)$/ -> RED. The redirect would then scroll to verse 1
  // and silently not open the drawer — the failure would be invisible from the URL alone.
  it('the reader can actually honour that URL', () => {
    const reader = read('app/read/[book]/[chapter]/page.tsx');
    expect(reader, 'the hash parser does not accept the :study suffix').toMatch(/\^#v\\d\+\)\(:study\)\?\$|:study/);
    expect(reader, 'nothing opens the drawer from the hash').toMatch(/if \(m\[2\]\) openStudy\(/);
  });
});

describe('T3 — the page scroll container clears the mobile tab bar', () => {
  // SEED: remove the pb-[calc(...)] from app-shell.tsx -> RED.
  it('reserves the tab bar height plus the safe-area inset, and only on mobile', () => {
    const shell = read('components/app-shell.tsx');
    expect(shell, 'no bottom padding — the tab bar covers the last lines of the chapter').toMatch(
      /pb-\[calc\(3\.75rem\+env\(safe-area-inset-bottom\)\)\]/,
    );
    expect(shell, 'the padding must not persist on desktop, where there is no tab bar').toMatch(/md:pb-0/);
  });
});
