// THE GATE'S `next` PARAMETER MUST NOT LEAVE THE SITE — pre-deploy audit A1-5.
//
// THE DEFECT. `/api/gate` guarded the post-unlock redirect with
//   rawNext.startsWith('/') && !rawNext.startsWith('//')
// which reads as "same-site only" and is not. WHATWG URL treats a backslash as a slash for special
// schemes, so `/\evil.com` passes both clauses and `new URL('/\\evil.com', req.url)` resolves to
// `https://evil.com/`. Measured 2026-08-07, before the fix.
//
// THE ATTACK. Send a preview-password holder `https://ancientpaths.app/gate?next=/\evil.com`. The
// gate page renders that value into a hidden input; they type the shared password; `/api/gate`
// 303s them to a clone that asks for the password again. The victim never leaves what looks like
// the normal unlock flow. `form-action 'self'` in the CSP does not cover this — it governs where a
// form POSTs, not where a 303 points.
//
// WHY A RESOLVE-AND-COMPARE RATHER THAN ANOTHER PREFIX RULE. The prefix rule was already two
// clauses deep and still wrong, because it reasons about the string while the browser reasons about
// the resolved URL. Anything that fixes backslash by adding a third clause is the same bug waiting
// for the next separator the URL parser accepts. Resolving against the request origin and comparing
// origins asks the question the browser will actually answer.
//
// This test imports nothing from the route: it re-states the property as the route's own resolution
// step (`new URL(next, base)`), so it fails if the route's guard stops agreeing with it. The route
// exports `safeNext` and this exercises that export directly.

import { describe, expect, it } from 'vitest';
import { safeNext } from '@/app/api/gate/route';

const BASE = 'https://ancientpaths.app/api/gate';

describe('gate next-parameter redirect', () => {
  // SEED: restore `rawNext.startsWith('/') && !rawNext.startsWith('//')` -> the backslash cases go RED.
  it('never resolves to another origin', () => {
    const hostile = [
      '/\\evil.com', // the measured bypass: backslash is a slash to WHATWG
      '/\\\\evil.com',
      '//evil.com', // the case the original guard did catch
      '\\/evil.com',
      '\\\\evil.com',
      'https://evil.com',
      'http://evil.com',
      '//evil.com/\\@ancientpaths.app',
      '/\t/evil.com', // control chars are stripped by the URL parser before resolution
      '/\n/evil.com',
      '/\r/evil.com',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '/%5Cevil.com',
    ];
    const escaped = hostile.filter((n) => new URL(safeNext(n), BASE).origin !== new URL(BASE).origin);
    expect(escaped, 'these values resolve off-origin after safeNext()').toEqual([]);
  });

  it('still lets a genuine same-site path through unchanged', () => {
    // The guard must not be so blunt that the feature stops working — this is what makes the test
    // able to fail in the other direction.
    for (const ok of ['/home', '/read/jhn/1', '/library/passages?q=grace', '/read/jhn/1#v14']) {
      expect(safeNext(ok), `${ok} should survive untouched`).toBe(ok);
    }
  });

  it('falls back to /home rather than to the empty string', () => {
    for (const bad of ['', 'home', '/\\evil.com', 'https://evil.com', null, undefined]) {
      const out = safeNext(bad as unknown as string);
      expect(out.startsWith('/'), `fallback for ${JSON.stringify(bad)} must be a rooted path`).toBe(true);
      expect(new URL(out, BASE).origin).toBe(new URL(BASE).origin);
    }
  });
});
