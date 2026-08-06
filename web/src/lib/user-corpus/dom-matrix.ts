// A 2D DOMMatrix for Node, because pdfjs needs the global to exist before it will load at all.
//
// pdfjs-dist 5.x builds `const SCALE_MATRIX = new DOMMatrix()` at MODULE SCOPE in its canvas
// module, which is bundled into the same file as the text-extraction code. So `import
// 'pdfjs-dist/legacy/build/pdf.mjs'` throws `DOMMatrix is not defined` under Node before a single
// byte of PDF is read — which is exactly what production did: every PDF upload failed with
// "Gave up after 3 attempts. The last error was: DOMMatrix is not defined", while docx and md
// went through. pdfjs tries to polyfill this itself, but ONLY from `@napi-rs/canvas`, a native
// binary; when that is absent it prints "Cannot polyfill `DOMMatrix`" and carries on to the throw.
//
// WHY A POLYFILL RATHER THAN THE NATIVE PACKAGE: @napi-rs/canvas ships a per-platform binary into
// the Vercel upload root, and this repo's deploy history is mostly lockfile and upload-root
// failures (A6). This is ~60 lines of standard affine algebra with a test, and no install.
//
// SCOPE, STATED HONESTLY: 2D affine only, which is all this codebase can reach — the upload path
// calls `getTextContent()` and never renders. Anything 3D throws rather than returning a plausible
// wrong number, because a silently wrong transform is the failure mode that would be hardest to
// ever notice.

/** The 2D affine subset of DOMMatrix: [a c e / b d f / 0 0 1]. */
export class DomMatrix2D {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[] | DomMatrix2D | string) {
    if (init instanceof DomMatrix2D) {
      Object.assign(this, { a: init.a, b: init.b, c: init.c, d: init.d, e: init.e, f: init.f });
      return;
    }
    if (Array.isArray(init)) {
      if (init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init as [number, number, number, number, number, number];
        return;
      }
      if (init.length === 16) {
        // A 4x4 that is actually 2D (no z/perspective terms) is accepted; anything else is not
        // representable here and must not be silently flattened.
        const [a, b, , , c, d, , , , , m33, , e, f, , m44] = init;
        if (m33 === 1 && m44 === 1) {
          Object.assign(this, { a: a!, b: b!, c: c!, d: d!, e: e!, f: f! });
          return;
        }
      }
      throw new TypeError('DomMatrix2D: only 6-element (or 2D-equivalent 16-element) matrices are supported');
    }
    if (typeof init === 'string' && init.trim() !== '') {
      throw new TypeError('DomMatrix2D: CSS transform strings are not supported');
    }
  }

  get is2D(): boolean {
    return true;
  }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
  }

  /** this × other, as DOMMatrix defines it (column vectors: `other` applies first). */
  multiply(other: DomMatrix2D): DomMatrix2D {
    const m = new DomMatrix2D(this);
    return m.multiplySelf(other);
  }

  multiplySelf(other: DomMatrix2D): this {
    const { a, b, c, d, e, f } = this;
    this.a = a * other.a + c * other.b;
    this.b = b * other.a + d * other.b;
    this.c = a * other.c + c * other.d;
    this.d = b * other.c + d * other.d;
    this.e = a * other.e + c * other.f + e;
    this.f = b * other.e + d * other.f + f;
    return this;
  }

  preMultiplySelf(other: DomMatrix2D): this {
    const { a, b, c, d, e, f } = this;
    this.a = other.a * a + other.c * b;
    this.b = other.b * a + other.d * b;
    this.c = other.a * c + other.c * d;
    this.d = other.b * c + other.d * d;
    this.e = other.a * e + other.c * f + other.e;
    this.f = other.b * e + other.d * f + other.f;
    return this;
  }

  translate(tx = 0, ty = 0): DomMatrix2D {
    return this.multiply(new DomMatrix2D([1, 0, 0, 1, tx, ty]));
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.multiplySelf(new DomMatrix2D([1, 0, 0, 1, tx, ty]));
  }

  scale(sx = 1, sy?: number): DomMatrix2D {
    return this.multiply(new DomMatrix2D([sx, 0, 0, sy ?? sx, 0, 0]));
  }

  scaleSelf(sx = 1, sy?: number): this {
    return this.multiplySelf(new DomMatrix2D([sx, 0, 0, sy ?? sx, 0, 0]));
  }

  /** Singular matrices become NaN-filled and `is2D` stays true, matching DOMMatrix's own behaviour. */
  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      this.a = this.b = this.c = this.d = this.e = this.f = NaN;
      return this;
    }
    const { a, b, c, d, e, f } = this;
    this.a = d / det;
    this.b = -b / det;
    this.c = -c / det;
    this.d = a / det;
    this.e = (c * f - d * e) / det;
    this.f = (b * e - a * f) / det;
    return this;
  }

  inverse(): DomMatrix2D {
    return new DomMatrix2D(this).invertSelf();
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

/**
 * Define the globals pdfjs reads at import time, if the runtime has none.
 *
 * Idempotent, and never overwrites a real implementation — in a browser, or a Node build that has
 * the native canvas, the platform's own DOMMatrix stays.
 */
export function installPdfDomGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  if (!g.DOMMatrix) g.DOMMatrix = DomMatrix2D;
  // pdfjs reads navigator.language while initialising; Node has no navigator before v21.
  if (!g.navigator) g.navigator = { language: 'en-US', platform: '', userAgent: '' };
}
