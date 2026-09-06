// @vitest-environment jsdom

// TWO A7b DEFECTS, both the same shape: a route that exists and does not do its job.
//
//   /settings          — a ComingSoon stub behind a FIRST-CLASS NAV ENTRY, whose own copy promised
//                        "your default translation, reading theme, and account will live here".
//                        A nav item leading to a promise costs a tap to learn nothing, and
//                        re-teaches the reader on every visit that part of the app is not real.
//   /auth/sign-in      — served a full login form to a signed-IN reader, with "Sign out" visible
//                        in the same viewport: an invitation to do the thing they had done, next
//                        to the control that undoes it.
//
// The settings CONTROLS all existed already (theme and size in the reader's Aa popover,
// translation in its header). The risk in building this page was therefore never "can it be
// built" but "will there now be two definitions of what reader-theme means" — the defect shape
// this repo names more than any other. Hence the shared-hook assertions below.

import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsForm } from '@/app/settings/settings-form';
import { DARK_CLASS, READING_SIZES, SIZE_KEY, THEME_KEY } from '@/lib/reading-prefs';
import { TRANSLATIONS } from '@/lib/bible';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8');

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});
afterEach(cleanup);

describe('/settings is a settings page, not a promise', () => {
  it('no longer renders ComingSoon', () => {
    // SEED: restore the stub -> RED. This is the defect verbatim.
    // The IMPORT and the ELEMENT, not the word: this file's own header explains what the stub
    // was, and a bare word-match would fail on its own documentation — the same trap the
    // archiver's `published` grep hit an hour earlier.
    const src = read('web/src/app/settings/page.tsx');
    expect(src, '/settings imports ComingSoon again').not.toMatch(/import\s*\{[^}]*ComingSoon/);
    expect(src, '/settings renders a ComingSoon stub again').not.toMatch(/<ComingSoon/);
    expect(src, '/settings does not render the real form').toMatch(/<SettingsForm\s*\/>/);
  });

  it('offers all three controls the old stub promised', () => {
    const { container } = render(<SettingsForm />);
    const text = container.textContent ?? '';
    for (const label of ['Reading theme', 'Text size', 'Default translation']) {
      expect(text, `missing control: ${label}`).toContain(label);
    }
  });

  it('lists every shipped translation, derived — not a hand-typed subset', () => {
    // SEED: hardcode two or three abbreviations in the page -> RED as soon as a translation is
    // added or removed anywhere else.
    const { container } = render(<SettingsForm />);
    for (const t of TRANSLATIONS) {
      expect(container.textContent, `translation missing from settings: ${t.abbr}`).toContain(t.abbr);
    }
  });
});

describe('the controls actually write the same keys the reader reads', () => {
  // This is the half that matters. A settings page whose buttons move only its own state is
  // indistinguishable from a stub the moment the reader navigates away.
  it('DARK_CLASS is the class globals.css actually keys the dark: variant off', () => {
    // THE FIRST VERSION OF THE TEST BELOW ASSERTED `classList.contains(DARK_CLASS)` — importing
    // the same constant it was seeding, so changing 'reader-dark' to 'dark' changed the assertion
    // too and it stayed green. An algebraic identity, which is a named entry on this repo's own
    // failure-mode watchlist. The constant is only meaningful relative to the CSS, so that is
    // what it is checked against.
    // SEED: set DARK_CLASS to 'dark' (next-themes' class, which gets rewritten every load) -> RED.
    const css = read('web/src/app/globals.css');
    const m = /@custom-variant dark \(&:where\(\.([a-z-]+),/.exec(css);
    expect(m, 'globals.css no longer declares a class-based dark variant').not.toBeNull();
    expect(DARK_CLASS, 'the theme constant and the CSS selector disagree').toBe(m![1]);
  });

  it('no plain-CSS rule is stranded on a bare `.dark` selector', () => {
    // The test above pins the `dark:` VARIANT to DARK_CLASS, but it has a blind spot: a hand-written
    // plain-CSS rule keyed on a bare `.dark` class — `html.dark`, `.dark { ... }`, `.dark :focus-visible`
    // — needs no `dark:` utility and was therefore never checked. Nothing in the runtime writes a
    // bare `dark` token onto <html> (the inline script and the hook both toggle `.reader-dark`), so
    // such a rule can never match and silently ships dead. That is exactly the SEC-1 regression:
    // three rules left on `.dark` made the dark-mode `:focus-visible` outline stay at accent-600 and
    // fail WCAG 2.1 1.4.11 on the passage-pane close button.
    //
    // The check is over the CSS WITH COMMENTS STRIPPED: the file's own header documents this history
    // using the words `.dark`, and a check that fires on its own documentation would green by deleting
    // the reasoning. Scan selectors, not prose.
    // SEED: change any of `html.reader-dark` / `.reader-dark {` / `.reader-dark :focus-visible` back
    // to `.dark` -> RED.
    const cssNoComments = read('web/src/app/globals.css')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const stranded = /\.dark(?![\w-])/.exec(cssNoComments);
    expect(
      stranded,
      'a plain-CSS rule is keyed on `.dark`, a class nothing writes to <html> — retarget it ' +
        'to `.reader-dark` (the class the inline script, the hook, and the `dark:` variant all use)',
    ).toBeNull();
    // Non-vacuity: stripping every dark rule must not be a way to green. The three retargeted rules
    // are present, so a regex that found none of them would mean the check is looking at the wrong file.
    expect(cssNoComments, 'html.reader-dark color-scheme rule was lost').toMatch(/html\.reader-dark\s*\{[^}]*color-scheme:\s*dark/);
    expect(cssNoComments, 'the dark token block (which owns --ring) is not keyed on .reader-dark')
      .toMatch(/\.reader-dark\s*\{[\s\S]*?--ring:\s*var\(--color-accent-400\)/);
    expect(cssNoComments, 'the dark :focus-visible override is not keyed on .reader-dark')
      .toMatch(/\.reader-dark\s+:focus-visible\s*\{[\s\S]*?outline-color:\s*var\(--color-accent-400\)/);
  });

  it('choosing Dark sets that class, and persists it', () => {
    const css = read('web/src/app/globals.css');
    const cssClass = /@custom-variant dark \(&:where\(\.([a-z-]+),/.exec(css)![1]!;
    const { getByText } = render(<SettingsForm />);
    fireEvent.click(getByText('Dark'));
    expect(document.documentElement.classList.contains(cssClass)).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('choosing Light removes it — the add-only bug, in the other surface', () => {
    // The pre-hydration script was add-only until today, so Light could never take effect. The
    // same one-way-latch mistake is available here and is asserted against.
    const { getByText } = render(<SettingsForm />);
    fireEvent.click(getByText('Dark'));
    fireEvent.click(getByText('Light'));
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('text size writes a real size value, not an index', () => {
    // SEED: store `sizeIdx` rather than READING_SIZES[idx] -> RED. The reader applies this value
    // straight to a CSS custom property, where "2" is not a length.
    const { getByLabelText } = render(<SettingsForm />);
    fireEvent.click(getByLabelText('Larger text'));
    const stored = localStorage.getItem(SIZE_KEY);
    expect(READING_SIZES as readonly string[]).toContain(stored);
    expect(document.documentElement.style.getPropertyValue('--reading-size')).toBe(stored);
  });

  it('the translation choice lands under the key the reader loads', () => {
    // SEED: write 'default-translation' or 'settings.translation' -> RED. The reader reads
    // 'translation'; a different key is a setting that silently does nothing.
    const { getByText } = render(<SettingsForm />);
    fireEvent.click(getByText('KJV'));
    expect(localStorage.getItem('translation')).toBe('kjv');
  });
});

describe('one definition of the reading preferences', () => {
  it('both surfaces call the shared hook rather than re-implementing it', () => {
    // SEED: paste the localStorage/classList logic back into reader-settings.tsx -> RED.
    for (const rel of ['web/src/components/reader-settings.tsx', 'web/src/app/settings/settings-form.tsx']) {
      expect(read(rel), `${rel} does not use useReadingPrefs`).toMatch(/useReadingPrefs/);
    }
    const popover = read('web/src/components/reader-settings.tsx');
    expect(popover, 'reader-settings still writes reader-theme itself').not.toMatch(/setItem\(\s*['"]reader-theme/);
    expect(popover, 'reader-settings still toggles the theme class itself').not.toMatch(/classList\.toggle/);
  });
});

describe('/auth/sign-in does not invite a signed-in reader to sign in', () => {
  const src = read('web/src/app/auth/[path]/page.tsx');

  it('redirects when a session exists', () => {
    // SEED: delete the redirect line -> RED. Driving the real page needs a Next request scope and
    // an auth backend, neither of which exists here; what IS checkable is that the guard is
    // present, runs on the signed-out-only paths, and precedes the render.
    expect(src, 'no redirect on the auth page').toMatch(/redirect\(['"]\/home['"]\)/);
    expect(src, 'the guard does not consult the session').toMatch(/currentUser\(\)/);
    const guard = src.indexOf('redirect(');
    const render = src.indexOf('return (');
    expect(guard, 'the redirect runs AFTER the page renders').toBeLessThan(render);
  });

  it('guards sign-in and sign-up ONLY — not sign-out or password reset', () => {
    // Over-guarding is the opposite failure and just as real: redirecting /auth/sign-out would
    // make signing out impossible.
    const m = /SIGNED_OUT_ONLY = new Set\(\[([^\]]*)\]\)/.exec(src);
    expect(m, 'the guarded-path set is no longer derivable').not.toBeNull();
    const paths = m![1]!.split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean).sort();
    expect(paths).toEqual(['sign-in', 'sign-up']);
  });

  it('currentUser returns null rather than throwing, so a page need not catch', () => {
    // SEED: implement it as try { requireUser() } catch { return null } -> RED. That swallows a
    // real auth failure as "signed out", which is a security-relevant difference, not a style one.
    const session = read('web/src/lib/session.ts');
    const fn = session.slice(session.indexOf('export async function currentUser'));
    expect(fn).toMatch(/return data\?\.user \?/);
    expect(fn, 'currentUser swallows errors as signed-out').not.toMatch(/catch/);
  });
});
