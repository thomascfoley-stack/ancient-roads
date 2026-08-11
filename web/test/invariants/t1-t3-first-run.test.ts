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
// The reader now honours `?firstrun=1`, read from `window.location.search` in the SAME effect
// that already reads the hash — so hydration safety is unchanged (no `useSearchParams`, no
// Suspense boundary, nothing evaluated during render).
//
// **It was a hash first, and that took production auth down.** See the fragment test below: a
// `callbackURL` is validated by Neon's HOSTED auth server, and a fragment is never transmitted, so
// it can only ever be rejected. A query param is the only form that survives an OAuth round trip.
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
    expect(dest, 'the drawer must be open — landing on the chapter alone teaches nothing').toMatch(/firstrun=1/);
  });

  // ── THE CHECK THAT WAS MISSING, AND IT TOOK PRODUCTION AUTH DOWN ─────────────────────────────
  // The first version of this block set FIRST_RUN_DESTINATION to `/read/jhn/1#v1:study`. That is
  // fine for `router.push`, and it BREAKS OAuth: `callbackURL` is validated by Neon's HOSTED auth
  // server, which refuses a fragment — "callbackURL must be an absolute URL or a safe relative
  // path starting with /". The value DOES start with `/`, so the message points away from the
  // real cause. The error rendered on the sign-in page and sign-in stopped working.
  //
  // Nothing in this repo could have caught it: the validator is remote, the type is `string`, and
  // every local check passed. What CAN be checked is the property that makes it safe — a
  // `callbackURL` must survive a server round trip, and a fragment never does. A fragment is by
  // definition never transmitted, so putting one in a value the server must validate is always
  // wrong, whatever this particular server happens to say.
  //
  // SEED: restore the `#v1:study` form -> RED.
  it('the destination survives an OAuth round trip — no URL fragment', () => {
    const forms = read('components/auth-forms.tsx');
    const dest = /FIRST_RUN_DESTINATION = '([^']+)'/.exec(forms)?.[1] ?? '';
    expect(
      dest.includes('#'),
      'a fragment is never sent to the server, so it cannot survive an OAuth callback — and ' +
        "Neon's hosted validator rejects the whole value rather than ignoring it",
    ).toBe(false);
    expect(dest.startsWith('/'), 'callbackURL must be a safe relative path').toBe(true);
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
    expect(reader, 'the reader ignores ?firstrun=1, so the redirect would open no drawer').toMatch(/firstrun/);
    expect(reader, 'nothing opens the drawer for a first run').toMatch(/openStudy\(1, 'commentaries'\)/);
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
