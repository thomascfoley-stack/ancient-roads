// @vitest-environment jsdom
//
// B016 — A NON-EMPTY UPLOAD MUST NEVER REPORT ITS SIZE AS ZERO.
//
// A ~130-byte text file displayed as "0 KB" on the My Works status wall. The reader had just
// uploaded a file that plainly has words in it, and the product told them it was nothing — next to
// a status line whose whole job (§8, "a wall of status, not a wall of red") is to say truthfully
// what happened to their document. "0 KB" beside "Ready" reads as "we lost it".
//
// THIS IS A FORMATTING BUG, NOT A DATA BUG, and that was checked rather than assumed before the
// fix was written. `web/src/app/api/user-corpus/upload/route.ts:59` stores `bytes.byteLength` — the
// real length of the uploaded buffer — and `web/src/lib/user-corpus/documents.ts:45` reads it back
// as `Number(r.byte_size)`. So a truthful 130 reaches the component and the component rounds it
// away: the old formatter was `Math.round(n / 1024)` for everything under a megabyte, and
// Math.round(130 / 1024) === Math.round(0.127) === 0.
//
// TESTED AS A PURE FUNCTION, DELIBERATELY. `fmtBytes` used to be a private const in the module, so
// the only way to reach it was to render the whole client component and read a span — which drags
// in fetch stubs, effects and polling to test arithmetic. Exporting it makes the boundaries (0, 1,
// 130, 1023, 1024, 1 MB) directly assertable, which is the part that was actually wrong. One
// rendered case is kept at the bottom so the pure function is proven to be the one the row uses.
//
// RED-PROOF: restore `Math.round(n / 1024)` as the sub-megabyte branch and the 1/130/1023 cases go
// red with "0 KB", as does the never-zero sweep and the rendered case.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));

import { fmtBytes, MyWorksClient } from '../../src/components/my-works';

describe('B016 — fmtBytes reports small files truthfully', () => {
  it('renders exact bytes below 1 KB, where rounding to KB destroys the number', () => {
    // 130 is the finding's own file. 1 and 1023 are the ends of the same branch: every one of
    // these rounded to "0 KB" before the fix, i.e. the whole sub-kilobyte range was a lie.
    expect(fmtBytes(1)).toBe('1 byte');
    expect(fmtBytes(130)).toBe('130 bytes');
    expect(fmtBytes(1023)).toBe('1023 bytes');
  });

  it('says "0 bytes" for a genuinely empty file — the one case where zero is the truth', () => {
    // Not folded into the sweep below: an empty upload SHOULD read as empty. The bug is claiming
    // zero about a file that has content, not the ability to say zero at all.
    expect(fmtBytes(0)).toBe('0 bytes');
  });

  it('switches to KB at exactly 1024, and to MB at exactly 1 MB', () => {
    expect(fmtBytes(1024)).toBe('1 KB');
    expect(fmtBytes(1536)).toBe('2 KB'); // 1.5 KB rounds up, not down to a bare "1"
    expect(fmtBytes(1024 * 1024)).toBe('1.0 MB');
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(fmtBytes(25 * 1024 * 1024)).toBe('25.0 MB'); // the upload cap
  });

  it('never prints "1024 KB" — the KB branch hands off before it can name a megabyte', () => {
    // Math.round pushes any size at or above 1023.5 KB up to "1024 KB", a unit that should never
    // appear. Guarded because the naive `n < 1024 * 1024` threshold sends the value to the KB
    // branch and only the ROUNDED value reveals the problem.
    //
    // SWEPT, NOT SPOT-CHECKED, and that is a scar: the first version of this test named the
    // handoff by hand as 1047553 and was simply wrong arithmetic (1047553 / 1024 is 1023.001,
    // which rounds DOWN). The real boundary is 1023.5 * 1024 = 1048064. A hand-computed constant
    // in the test is the same class of error as the one in the code, so the whole top of the
    // range is walked instead and the exact crossover is asserted from the definition.
    for (let n = 1_047_000; n < 1024 * 1024; n += 1) {
      expect(fmtBytes(n), `${n} bytes`).not.toBe('1024 KB');
    }
    expect(fmtBytes(1024 * 1024 - 1)).toBe('1.0 MB');
    expect(fmtBytes(1_048_064)).toBe('1.0 MB'); // 1023.5 KB — the first value that rounds up
    expect(fmtBytes(1_048_063)).toBe('1023 KB'); // one byte below it
  });

  it('returns nothing for a size that is not known', () => {
    // The call site guards on `!= null`, so this is contract rather than display: an unknown size
    // must render as absent, never as "0".
    expect(fmtBytes(null)).toBe('');
  });

  it('THE INVARIANT: no non-empty size formats to a leading zero', () => {
    // The property B016 is really about, swept rather than sampled — one example passing is how a
    // formatter with a hole in one branch stays green. Every byte count from 1 to 4096 plus a
    // spread across the KB/MB branches.
    const sizes = [
      ...Array.from({ length: 4096 }, (_, i) => i + 1),
      5000, 10_000, 100_000, 1_000_000, 1_047_551, 1_047_552, 1_048_575,
      1_048_576, 2_000_000, 25 * 1024 * 1024,
    ];
    for (const n of sizes) {
      const out = fmtBytes(n);
      expect(out, `${n} bytes formatted to an empty string`).not.toBe('');
      // Both legs on purpose: the string must not START zero ("0 KB"), and the number it leads
      // with must be positive — which also catches a hypothetical "0.0 MB".
      expect(out, `${n} bytes displayed as "${out}"`).not.toMatch(/^0(\D|$)/);
      expect(Number.parseFloat(out), `${n} bytes displayed as "${out}"`).toBeGreaterThan(0);
    }
  });
});

describe('B016 — the status wall shows the real size', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/user-corpus/documents')) {
        return Response.json({
          documents: [{
            id: 'doc-1',
            title: 'My sermon on John 10',
            status: 'ready',
            parseError: null,
            mimeType: 'txt',
            pageCount: null,
            byteSize: 130, // the finding's file, as the API actually reports it
            createdAt: '2026-08-17T00:00:00.000Z',
          }],
        });
      }
      return Response.json({});
    }));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('a 130-byte upload renders "130 bytes", not "0 KB"', async () => {
    // Ties the pure function to the row: proves `fmtBytes` is the code path the list uses, so the
    // boundary tests above are testing the shipped display and not a lookalike.
    render(<MyWorksClient />);
    expect(await screen.findByText('130 bytes')).toBeTruthy();
    expect(screen.queryByText('0 KB'), 'the row still shows "0 KB"').toBeNull();
  });
});
