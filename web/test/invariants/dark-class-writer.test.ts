// NO RUNTIME CODE WRITES A BARE `dark` TOKEN ONTO <html>.
//
// Every dark-mode rule in globals.css keys off `.reader-dark`: the inline pre-paint script in
// layout.tsx toggles it, the `useReadingPrefs` hook toggles it, and the `@custom-variant dark`
// targets it. A bare `.dark` class was once written too — but only by next-themes (0.4.6,
// transitive through the `@neondatabase/auth` UI provider), and SEC-1 removed the only mount
// site. With no writer left, any plain-CSS rule still keyed on `.dark` is dead CSS that can
// never match, which is exactly the SEC-1 regression: three stranded rules left the dark-mode
// `:focus-visible` outline at accent-600 and failed WCAG 2.1 1.4.11 on the passage-pane close
// button.
//
// This file is the UPSTREAM half of that fix. The DOWNSTREAM half — no stranded `.dark` selector
// in globals.css — is asserted in settings-and-auth-routes.test.tsx. Together they state the
// robustness property the bug report's history section argues from current state, made
// executable: nothing in the runtime writes the class a stranded `.dark` rule would need to fire.
//
// Two re-introduction paths are watched:
//   (1) a direct `classList.toggle|add|remove('dark')` anywhere in web/src;
//   (2) next-themes brought back into the tree — either imported directly, mounted as a
//       `<ThemeProvider>`, or through the re-mount of the `NeonAuthUIProvider` that hosted it.
//       next-themes only mutates <html> from inside a mounted provider, so guarding the import
//       and the mount site is what guards the property.
//
// Comments are stripped first: this codebase documents its own history using the words `dark`,
// `next-themes` and `NeonAuthUIProvider`, and a check that fired on its own documentation would
// green by deleting the reasoning. This is the same lesson fonts-self-hosted.test.ts and
// no-dead-user-table-writer.test.ts already recorded.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

/** Every .ts/.tsx file under web/src. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

/** Source with comments stripped — prose is not a call site. The `//` stripper deliberately
 *  does NOT fire on `://`, so `https://…` URLs (and the `https://` in this very header, if it
 *  ever moved inline) survive. See fonts-self-hosted.test.ts for the bug that motivates the
 *  `[^:]` guard: the first version ate `https://fonts.googleapis.com` before the scan ran. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = walk(SRC).map((p) => ({ p, code: stripComments(readFileSync(p, 'utf8')) }));

describe('no runtime code writes a bare `dark` class onto <html>', () => {
  // A guard that found nothing to guard would pass for the wrong reason. The app DOES own a
  // theme writer — the inline `.reader-dark` toggle — and it is present, so a scan that found
  // no writer at all would mean the derivation is looking at the wrong tree.
  it('the app still owns a `.reader-dark` writer (the inline pre-paint script)', () => {
    const layout = files.find((f) => f.p.endsWith(`${path.sep}app${path.sep}layout.tsx`));
    expect(layout, 'layout.tsx was not found under web/src/app').toBeDefined();
    expect(layout!.code, 'layout.tsx no longer toggles .reader-dark before paint')
      .toMatch(/classList\.toggle\(\s*['"]reader-dark['"]/);
  });

  // SEED: add `document.documentElement.classList.toggle('dark')` (or add/remove) anywhere in
  // web/src -> RED. The writer is dead weight that invites a stranded `.dark` plain-CSS rule to
  // fire (or, worse, to be written on the assumption a writer exists).
  it('no source file toggles/adds/removes a bare `dark` class', () => {
    const offenders = files
      .filter((f) => /classList\.(toggle|add|remove)\s*\(\s*['"]dark['"]/.test(f.code))
      .map((f) => path.relative(SRC, f.p));
    expect(
      offenders,
      'A bare `dark` class is being written to the classList, but every dark-mode rule keys off ' +
        '`.reader-dark`. The writer is dead weight that invites a stranded `.dark` rule to fire — ' +
        'retarget the writer to `.reader-dark` (the class the inline script, the hook, and the ' +
        '`dark:` variant all use).',
    ).toEqual([]);
  });

  // SEED: `import … from 'next-themes'` anywhere in web/src, or re-mount `<NeonAuthUIProvider>` in
  // layout.tsx (the host that pulled next-themes in transitively) -> RED. next-themes manages
  // <html> by REMOVING every theme value it recognises and adding its own, which would delete the
  // reader's saved `.reader-dark` — the measured 2026-08-02 defect SEC-1 closed.
  it('next-themes is not re-introduced into the runtime tree', () => {
    const direct = files
      .filter((f) => /\bfrom\s+['"]next-themes['"]|\brequire\(\s*['"]next-themes['"]/.test(f.code))
      .map((f) => path.relative(SRC, f.p));
    expect(
      direct,
      'next-themes is imported directly. It rewrites <html> on every load and deletes the ' +
        "reader's saved `.reader-dark` — the defect SEC-1 removed it for.",
    ).toEqual([]);

    const mounted = files
      .filter((f) => /<NeonAuthUIProvider[\s/>]/.test(f.code))
      .map((f) => path.relative(SRC, f.p));
    expect(
      mounted,
      'NeonAuthUIProvider is mounted again. It was the host that pulled next-themes (0.4.6, ' +
        'transitive) into the runtime, and next-themes rewrites <html>. SEC-1 removed it for that ' +
        'reason.',
    ).toEqual([]);
  });

  // next-themes remains a TRANSITIVE dependency of the still-imported `@neondatabase/auth`
  // headless factories (`web/src/lib/auth/client.ts`, `web/src/lib/auth/neon-auth.ts`), and that
  // is fine: tree-shaking keeps it out of the bundle because nothing imports it (asserted above)
  // and its `<ThemeProvider>` is not mounted (asserted above). This guards the direct-dependency
  // surface so a future `pnpm add next-themes` is caught before a mount is even written — the
  // package-lock.json entry is NOT asserted, because the transitive dependency is legitimate.
  it('next-themes is not a direct dependency in web/package.json', () => {
    const pkg = readFileSync(path.join(SRC, '..', 'package.json'), 'utf8');
    expect(
      pkg,
      'next-themes is listed as a DIRECT dependency in web/package.json. It only mutates <html> ' +
        'from a mounted provider, but adding it direct is the first step to re-mounting it; keep ' +
        'it transitive-only through @neondatabase/auth or remove that surface too.',
    ).not.toMatch(/["']next-themes["']\s*:/);
  });
});
