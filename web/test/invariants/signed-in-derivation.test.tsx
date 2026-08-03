// @vitest-environment jsdom

// WHO IS SIGNED IN IS A SESSION FACT, NOT A FETCH RESULT — owner-reported, 2026-08-02.
//
// Two places inferred it from `GET /api/annotations` returning ok. Any failure of that one request
// — a 500, a 429 from the throttle, one dropped connection on a phone, which is this app's core
// use context — told a genuinely signed-in reader they were signed OUT, and four surfaces changed
// under them: the popover's highlight swatches, the bookmark button, and the study panel's
// highlight row and notes tab. Reading the status code instead would not have helped:
// `api/annotations/route.ts` wraps auth AND the DB query in one try and answers 401 for both, so a
// database outage arrives at the client as "Unauthorized".
//
// Two properties are asserted here, and they need different kinds of test:
//   - BEHAVIOUR: the hook must not render the signed-in branch on the first client render, because
//     the server rendered the signed-out one. That is the React #418 the A7b walk found throwing on
//     every reader page load in production, and it is why `mounted` exists.
//   - EXTINCTION: no module may go back to deriving auth from that fetch. A behavioural test cannot
//     see a second module doing it, so that half is a static walk with an anti-vacuity floor.

import { render } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { codeOnly } from '../../../scripts/lib/source-scan.mjs';

// A mutable ref, not two hoisted constants: both directions are exercised in one file, and
// `vi.mock` is hoisted above any per-test assignment.
const sessionRef = vi.hoisted(() => ({ data: null as { user: { id: string } } | null }));
vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: sessionRef.data }) },
}));

import { useSignedIn } from '@/lib/auth/use-signed-in';

beforeEach(() => {
  sessionRef.data = null;
});
afterEach(() => vi.clearAllMocks());

/** Records the hook's value on EVERY render, so the first one can be asserted separately. */
function probe(): boolean[] {
  const seen: boolean[] = [];
  function Probe() {
    seen.push(useSignedIn());
    return null;
  }
  render(<Probe />);
  return seen;
}

describe('useSignedIn derives from the session, and never desyncs the first render', () => {
  it('a signed-in reader renders signed-OUT first, then signed-in', () => {
    sessionRef.data = { user: { id: 'u1' } };
    const seen = probe();
    // RED-PROOF: delete `mounted &&` from use-signed-in.ts -> seen[0] is true -> this fails. That
    // is the hydration mismatch, not a cosmetic ordering detail.
    expect(seen[0], 'the first client render must match the server, which has no session').toBe(false);
    expect(seen.at(-1), 'and it must settle on the real answer').toBe(true);
  });

  it('a signed-out reader is false on every render', () => {
    sessionRef.data = null;
    const seen = probe();
    // RED-PROOF: `return mounted;` -> the last render is true -> this fails.
    expect(seen.every((v) => v === false)).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('no module may go back to inferring auth from a fetch', () => {
  const WEB_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) return walk(p);
      return /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }

  const FILES = walk(WEB_SRC);
  const rel = (f: string) => path.relative(WEB_SRC, f);
  // codeOnly, not the raw text: three of the five files that mention this route only DOCUMENT it,
  // including the hook that replaced the inference. A check that goes red on its own explanatory
  // comment teaches people to delete comments.
  const callsAnnotationsRoute = FILES.filter((f) => /fetch\(\s*[`'"][^`'"]*\/api\/annotations/.test(codeOnly(readFileSync(f, 'utf8')))).map(rel);

  // The modules allowed to CALL the annotations routes. Both fetch annotation DATA, which is what
  // the routes are for; neither reads auth off the result. `persist-write.ts` is not here because
  // it is handed a URL by its caller rather than naming one.
  const ALLOWED = ['lib/use-annotation-writes.ts', 'app/library/notes/page.tsx'];

  it('anti-vacuity: the walk found real files, including the known caller', () => {
    // Point WEB_SRC at a nonexistent directory and this fails, instead of every case below passing
    // over an empty set.
    expect(FILES.length, 'the walk must reach web/src').toBeGreaterThan(50);
    expect(callsAnnotationsRoute, 'the known caller must be in the set the check reasons about').toContain(
      'lib/use-annotation-writes.ts',
    );
  });

  it('only the annotations loader talks to /api/annotations', () => {
    // RED-PROOF: restore the deleted session probe in work/[slug]/page.tsx -> RED.
    // An allowlist on purpose: a future legitimate caller edits this line, in a diff a reviewer sees.
    expect(callsAnnotationsRoute.filter((f) => !ALLOWED.includes(f))).toEqual([]);
  });

  it('setSignedIn exists nowhere — auth is not a piece of component state to be assigned', () => {
    // RED-PROOF: add `const [signedIn, setSignedIn] = useState(false)` to any file under web/src.
    const offenders = FILES.filter((f) => readFileSync(f, 'utf8').includes('setSignedIn')).map(rel);
    expect(offenders).toEqual([]);
  });
});
