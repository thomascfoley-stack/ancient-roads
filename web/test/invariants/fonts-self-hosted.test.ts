// F1-fonts — THE FONT STACK MUST BE SERVED FROM 'self'.
//
// Exit test for block `F1-fonts`, written before the fix (§0.1).
//
// THE DEFECT. `layout.tsx` loaded EB Garamond, Literata and Source Sans 3 from
// `fonts.googleapis.com`, while the production CSP header is `style-src 'self' 'unsafe-inline'`
// and `font-src 'self' data:`. The browser blocked the stylesheet and NOT ONE of the three
// families was ever downloaded — every reader saw the CSS fallback chain (Georgia / Times).
//
// WHY IT SURVIVED EVERY AUDIT, which is the part worth encoding:
//
//   1. The fallback chain hides it on exactly the machines that would catch it. Designers and
//      developers tend to have these faces installed locally — they were chosen by someone who
//      had them — so the page renders correctly and the CSP block appears only in console noise.
//   2. **The obvious probe agrees with the wrong answer.** `document.fonts.check('16px "EB
//      Garamond"')` returns `true` — and so does `document.fonts.check('16px "Zzz Not A Font"')`,
//      because the API answers "can text in this family be rendered", which a fallback always
//      satisfies. Any browser check that calls `check()` is worthless here. The rendered proof
//      must ENUMERATE `[...document.fonts]` and look for the actual loaded faces. That check is
//      X3 and is `BROWSER`; it stays unticked by any agent.
//
// So this file asserts the AGENT-level half: the source requests no external font host, and the
// self-hosting mechanism is actually present. It does not claim to prove the faces render — that
// is X3/X5's job and the block says so.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

/** Every .ts/.tsx/.css file under web/src, so the scan cannot be outrun by moving the link. */
function sourceFiles(dir = SRC, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(tsx?|css)$/.test(name)) acc.push(full);
  }
  return acc;
}

const FONT_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/;

/**
 * Source with comments stripped.
 *
 * SECOND TIME THIS WEEK. `prayers-c9.test.ts` needed the same helper for the same reason: the
 * first run of this test went RED on `layout.tsx`'s own header, which explains — using the words
 * `fonts.googleapis.com` — why the font stack must NOT be loaded from there. A check that fires on
 * a comment warning against X makes deleting the warning the cheapest way to green, which loses
 * the reasoning and keeps the risk. Scan code, not prose.
 */
const code = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // NOT `/\/\/.*$/gm`. That was the first version, and it made this entire file INCAPABLE OF
    // FAILING: the `//` in `https://fonts.googleapis.com` is a line-comment start to that regex,
    // so it deleted the URL — the exact string being hunted — before the scan ran. Seeded the
    // real <link> back into layout.tsx and watched the suite stay GREEN. A comment stripper that
    // eats URLs cannot police URLs. Only strip `//` that does not follow a `:`.
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('F1-fonts — no external font host is requested', () => {
  // SEED: put the <link href="https://fonts.googleapis.com/css2?..."> back in layout.tsx -> RED.
  it('web/src requests no font from an external host', () => {
    const files = sourceFiles();
    expect(files.length, 'scanned no files — this check would be vacuous').toBeGreaterThan(20);
    const offenders = files
      .filter((f) => FONT_HOSTS.test(code(f)))
      .map((f) => path.relative(SRC, f));
    expect(
      offenders,
      'the production CSP is `font-src \'self\' data:` and `style-src \'self\'`, so an external ' +
        'font host is not merely third-party — it is BLOCKED, and the family silently falls back',
    ).toEqual([]);
  });

  it('the CSP itself is unchanged — self-hosting is the fix, not widening', () => {
    // The ruling: self-host, no CSP widening. If a future change "fixes" fonts by allowing
    // Google's hosts instead, that is the rejected remedy and this fails.
    const csp = code(path.join(SRC, '..', 'next.config.ts'));
    expect(csp, 'the CSP must not be widened to admit a font host').not.toMatch(FONT_HOSTS);
    expect(csp, "font-src must still be locked to 'self'").toMatch(/font-src 'self' data:/);
  });
});

describe('F1-fonts — the faces are self-hosted by next/font', () => {
  // SEED: delete the next/font import from layout.tsx -> RED. Without it nothing supplies the
  // families at all, and the previous test would still pass — an app with no webfonts whatsoever
  // also "requests no external host". This is the non-vacuity guard on the test above.
  it('layout.tsx loads all three families through next/font/google', () => {
    const layout = readFileSync(path.join(SRC, 'app/layout.tsx'), 'utf8');
    expect(layout, 'next/font/google is what makes the faces self-hosted').toMatch(
      /from 'next\/font\/google'/,
    );
    for (const family of ['EB_Garamond', 'Literata', 'Source_Sans_3']) {
      expect(layout, `${family} is not loaded via next/font — it would fall back silently`).toMatch(
        new RegExp(`\\b${family}\\b`),
      );
    }
  });

  it('each family is bound to a -face variable the theme composes', () => {
    const layout = readFileSync(path.join(SRC, 'app/layout.tsx'), 'utf8');
    for (const v of ['--font-display-face', '--font-serif-face', '--font-sans-face']) {
      expect(layout, `${v} is not fed by a next/font variable`).toMatch(
        new RegExp(`variable:\\s*'${v}'`),
      );
    }
  });

  // ── CORRECTED MID-BLOCK, AND THE REASON IS THE FINDING ────────────────────────────────────────
  // The first version of the two checks above asserted `variable: '--font-display'` and, for the
  // fallback, that globals.css CONTAINED "Georgia". Both passed. Both were wrong, and the pair was
  // self-contradictory: binding next/font directly to `--font-display` was MEASURED in the browser
  // to override the whole `@theme` declaration, so the computed value became
  // `"EB Garamond", "EB Garamond Fallback"` — Georgia gone at runtime — while the string "Georgia"
  // sat in globals.css keeping the fallback test green.
  //
  // **A test that reads the stylesheet cannot see a value the cascade overrode.** It could not
  // fail for the regression it names. Flagged in the block's Findings log rather than quietly
  // rewritten; the fix changed to compose `var(--font-*-face)` INTO the chain, and the check below
  // now asserts that composition, which is the thing that actually keeps Georgia reachable.
  it('the fallback chains survive — composed, not overridden', () => {
    const css = readFileSync(path.join(SRC, 'app/globals.css'), 'utf8');
    // SEED: drop `var(--font-display-face), ` from globals.css -> RED (self-hosted face unused).
    // SEED: replace the whole chain with just `var(--font-display-face)` -> RED (Georgia dropped).
    for (const [v, fallback] of [['display', 'Georgia'], ['serif', 'Georgia'], ['sans', 'system-ui']] as const) {
      const decl = new RegExp(`--font-${v}:([^;]*);`).exec(css)?.[1];
      expect(decl, `--font-${v} declaration not found`).toBeTruthy();
      expect(decl, `--font-${v} does not use the self-hosted face`).toContain(`var(--font-${v}-face)`);
      expect(decl, `--font-${v} lost its ${fallback} fallback — next/font's own fallback is not a substitute for the chain`).toContain(fallback);
    }
  });
});
