// A MOCK WHOSE EXPORT SET IS NARROWER THAN THE MODULE IT REPLACES IS A TEST THAT CANNOT SEE THE
// ROUTE IT CLAIMS TO COVER.
//
// D43 (2026-08-23, `c11bc84`) gave 19 API routes a third session import: `authFailureResponse`,
// which is what tells an auth-SERVICE outage (503) apart from "nobody is signed in" (401). Every
// test that faked `@/lib/session` had hand-listed exactly the two functions it knew about, so on
// the day the routes adopted the third, each of those mocks became a trap that springs only when
// the 401 path actually executes — vitest throws `No "authFailureResponse" export is defined on
// the mock` at ACCESS time, not at mock time.
//
// Two of them sprang immediately (`library-shelf-round-trip`, `reading-progress-round-trip`) and
// SIXTEEN did not, because their signed-out legs did not reach the catch. Those sixteen were not
// passing — they were waiting. And the two that failed went unnoticed for fifteen days because
// the `audit` workflow runs on branches and pull requests and never on a push to `main`, so
// `main`'s own red was invisible to everyone. (Measured 2026-09-07: `origin/main` red on exactly
// these two, both green here.)
//
// This is the repo's standing failure shape, the one MASTER's watchlist states in one line: *a
// hand-maintained expected set that nothing enforces*. Fixing eighteen files by hand and calling
// it done would re-arm it on the twentieth route — so the remedy is not the eighteen edits, it is
// this file. The rule it enforces is deliberately about SHAPE, not about one export name: spread
// the real module, and the next export the routes adopt arrives in every mock for free.
//
// The check is a source scan because that is the only place the property lives. There is no
// runtime moment at which "every session mock is complete" can be observed — an incomplete one is
// indistinguishable from a complete one until the missing member is touched, which is the whole
// defect. It reads the FACTORY BODY only, so a file that merely mentions `auth-failure` in prose
// cannot satisfy it (the `-mx-2.5` red-proof of 2026-09-06 is the precedent: a check a comment
// could satisfy is a check that cannot fail).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TEST_ROOT = join(__dirname, '..');

function everyTestFile(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { out.push(...everyTestFile(p)); continue; }
    if (/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

/**
 * Strip comments so a mention in prose can never satisfy the check — with string literals kept
 * whole, in ONE pass, so a `/*` inside a line comment or a string can never open a phantom block
 * comment. The first draft stripped block comments first, and a header line reading `/api/*`
 * swallowed forty lines of db-fault-returns-envelope.test.ts INCLUDING its real mock: the guard
 * was silently not guarding one of its own files, and its floor had six files of headroom to
 * hide it in (deep audit, 2026-09-07). The positive control below is what would have caught it.
 */
function code(src: string): string {
  return src.replace(
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match: string, str: string | undefined) => (str !== undefined ? str : ''),
  );
}

const MOCK_CALL = /vi\.mock\(\s*['"]@\/lib\/session['"]/;
const THIS_FILE = 'session-mock-surface.test.ts';

/**
 * The factory body of a `vi.mock('@/lib/session', ...)` call, by brace balance from the call's
 * opening paren. Balance-matching rather than a line window: several of these factories are one
 * line, others run twenty, and a fixed window would silently read the wrong text in both.
 */
function sessionMockFactory(src: string): string | null {
  const start = src.search(/vi\.mock\(\s*['"]@\/lib\/session['"]/);
  if (start === -1) return null;
  let depth = 0;
  for (let i = src.indexOf('(', start); i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

const ALL_TEST_FILES = everyTestFile(TEST_ROOT).filter((f) => !f.endsWith(THIS_FILE));
const FILES_WITH_A_SESSION_MOCK = ALL_TEST_FILES
  .filter((f) => MOCK_CALL.test(code(readFileSync(f, 'utf8'))));
/** The same set found WITHOUT stripping — every file that so much as mentions the call. */
const FILES_MENTIONING_THE_MOCK = ALL_TEST_FILES
  .filter((f) => MOCK_CALL.test(readFileSync(f, 'utf8')));

describe('every @/lib/session mock carries the module’s real failure surface', () => {
  // ANTI-VACUITY. If a refactor renames the module or the mocks move, this suite would otherwise
  // pass by having nothing to check — the "gate nobody runs" entry on the same watchlist. The
  // floor is close to the count measured on the day it was written (22), with room to delete a
  // couple — not six, which was enough headroom to hide a dropped file.
  it('finds the session mocks at all', () => {
    expect(FILES_WITH_A_SESSION_MOCK.length).toBeGreaterThanOrEqual(20);
  });

  // POSITIVE CONTROL ON THE STRIPPER. Every file that mentions the call in its raw text must
  // still be found after comments are stripped — otherwise the stripper, not the mock, decides
  // what this suite covers. (A file that mentioned the call ONLY in prose would legitimately
  // diverge here; none does today, and one appearing should be a deliberate edit to this line.)
  it('the comment stripper drops no file that carries the mock', () => {
    expect([...FILES_WITH_A_SESSION_MOCK].sort()).toEqual([...FILES_MENTIONING_THE_MOCK].sort());
  });

  it.each(FILES_WITH_A_SESSION_MOCK.map((f) => [f.slice(TEST_ROOT.length + 1), f]))(
    '%s spreads the real @/lib/auth-failure',
    (_label, file) => {
      const factory = sessionMockFactory(code(readFileSync(file, 'utf8')));
      expect(factory, 'the mock call could not be parsed').not.toBeNull();
      // The property: the factory REACHES FOR THE REAL MODULE. Not "mentions the name" and not
      // "defines a function called authFailureResponse" — a stub would satisfy either while
      // reporting 401 for an outage, which is the bug D43 exists to prevent.
      // Both spellings count — a plain dynamic `import()` and vitest's `importActual`, the latter
      // usually carrying a `<typeof import(...)>` type argument. The FIRST draft of this regex
      // omitted the generics and so failed two files that were already correct; a check whose
      // false positives you fix by editing correct code is a check that has stopped measuring the
      // property. What it must not accept is a hand-listed member, however real its value.
      const SPREADS_THE_MODULE =
        /\.\.\.\s*\(\s*await\s+(?:vi\.importActual|import)\s*(?:<[^>]*>)?\s*\(\s*['"]@\/lib\/auth-failure['"]\s*\)/;
      expect(
        SPREADS_THE_MODULE.test(factory!),
        'hand-listing the exports re-arms the trap: spread `...(await import("@/lib/auth-failure"))` '
        + 'into the factory instead, so the next export the routes adopt arrives here for free',
      ).toBe(true);
    },
  );
});
