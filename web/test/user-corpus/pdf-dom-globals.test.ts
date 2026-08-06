// The guard for the defect that made every PDF upload fail on production.
//
// pdfjs-dist 5.x runs `new DOMMatrix()` at MODULE SCOPE in the canvas code that ships inside
// pdf.mjs, so under Node the IMPORT throws `DOMMatrix is not defined` before any PDF is read. It
// self-polyfills only from `@napi-rs/canvas`, a native binary this project does not install, and
// then merely warns before carrying on to the throw. Production said:
//
//     Gave up after 3 attempts. The last error was: DOMMatrix is not defined
//
// on every PDF, while docx and markdown indexed normally — so the pipeline looked healthy in
// aggregate and was broken for a whole file type.
//
// The first test is the one that matters: it imports the REAL pdfjs the way the parser does. A
// test that only exercised our polyfill class would have stayed green through the entire outage.

import { describe, expect, it } from 'vitest';
import { DomMatrix2D, installPdfDomGlobals } from '@/lib/user-corpus/dom-matrix';

// ── WHAT THIS SUITE CAN AND CANNOT PROVE, STATED UP FRONT ────────────────────────────────────────
// pdfjs declares `@napi-rs/canvas` as an OPTIONAL dependency and self-polyfills from it. This
// development machine HAS it (pnpm installed the darwin-arm64 binary), so importing pdfjs here
// defines DOMMatrix whether or not our fix exists — a test that merely imported pdfjs and checked
// the global would be green on a machine that cannot reproduce the bug, which is this repo's
// "unearned green" exactly. Vercel's serverless bundle does not carry that binary: Next traces the
// bundled pdfjs but not its runtime `createRequire(...)("@napi-rs/canvas")`, so production warns
// "Cannot polyfill `DOMMatrix`" and then throws on the module-scope `new DOMMatrix()`.
//
// So the property asserted below is the one that IS checkable here and does the real work:
// after installPdfDomGlobals(), OUR matrix is the one in play — the optional native package is not
// load-bearing on any runtime. The end-to-end proof is a PDF uploaded through the deployed app.

describe('the PDF globals do not depend on the optional native canvas', () => {
  it('installs OUR matrix, so a runtime without @napi-rs/canvas behaves identically', () => {
    const g = globalThis as Record<string, unknown>;
    delete g.DOMMatrix;
    installPdfDomGlobals();
    expect(g.DOMMatrix).toBe(DomMatrix2D);
  });

  it('loads the real pdfjs module with our matrix already in place', async () => {
    installPdfDomGlobals();
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // getDocument is the entry point parse-pdf.ts calls; if the module evaluated, it is here.
    expect(typeof pdfjs.getDocument).toBe('function');
  });

  it('is idempotent and leaves a navigator for pdfjs to read', () => {
    installPdfDomGlobals();
    const g = globalThis as Record<string, unknown>;
    expect((g.navigator as { language?: string })?.language).toBeTruthy();
    const first = g.DOMMatrix;
    installPdfDomGlobals();
    expect(g.DOMMatrix).toBe(first);
  });
});

describe('DomMatrix2D — the affine algebra, against hand-computed values', () => {
  it('starts as the identity', () => {
    const m = new DomMatrix2D();
    expect([m.a, m.b, m.c, m.d, m.e, m.f]).toEqual([1, 0, 0, 1, 0, 0]);
    expect(m.isIdentity).toBe(true);
    expect(m.is2D).toBe(true);
  });

  it('multiplies in DOMMatrix order — the right-hand matrix applies first', () => {
    // scale(2) then translate(10,0): the translation is scaled, so e = 20, not 10. Getting this
    // backwards is the classic silent error, so it is asserted on a case where the two differ.
    const m = new DomMatrix2D([2, 0, 0, 2, 0, 0]).multiply(new DomMatrix2D([1, 0, 0, 1, 10, 0]));
    expect([m.a, m.d, m.e, m.f]).toEqual([2, 2, 20, 0]);
  });

  it('preMultiplySelf applies the other matrix last', () => {
    const m = new DomMatrix2D([1, 0, 0, 1, 10, 0]).preMultiplySelf(new DomMatrix2D([2, 0, 0, 2, 0, 0]));
    expect([m.a, m.d, m.e]).toEqual([2, 2, 20]);
  });

  it('translate and scale round-trip through their inverse', () => {
    const m = new DomMatrix2D().translate(3, -7).scale(2, 4);
    const back = m.inverse().multiply(m);
    expect(back.a).toBeCloseTo(1);
    expect(back.d).toBeCloseTo(1);
    expect(back.e).toBeCloseTo(0);
    expect(back.f).toBeCloseTo(0);
  });

  it('inverts a known matrix to known numbers', () => {
    const m = new DomMatrix2D([2, 0, 0, 4, 6, 8]).invertSelf();
    expect([m.a, m.b, m.c, m.d, m.e, m.f]).toEqual([0.5, -0, -0, 0.25, -3, -2]);
  });

  it('does not pretend to invert a singular matrix', () => {
    const m = new DomMatrix2D([0, 0, 0, 0, 0, 0]).invertSelf();
    expect(Number.isNaN(m.a)).toBe(true);
  });

  it('refuses what it cannot represent rather than flattening it', () => {
    expect(() => new DomMatrix2D('translate(10px)')).toThrow(TypeError);
    expect(() => new DomMatrix2D([1, 2, 3])).toThrow(TypeError);
  });

  it('accepts a 16-element matrix that is genuinely 2D', () => {
    // column-major 4x4 for scale(2,3) translate(4,5)
    const m = new DomMatrix2D([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 4, 5, 0, 1]);
    expect([m.a, m.b, m.c, m.d, m.e, m.f]).toEqual([2, 0, 0, 3, 4, 5]);
  });
});
