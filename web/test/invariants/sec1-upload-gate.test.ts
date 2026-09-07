// A7 - the SEC-1 gate (UPLOADER_DESIGN §8): assert NOT (multi-user uploads enabled AND an in-path
// account-takeover advisory is still present in `pnpm.auditConfig.ignoreGhsas`).
//
// ── THE ADVISORY SET IS DERIVED, NOT TYPED ──────────────────────────────────────────────────────
// A hand-typed array of GHSA ids here would be the repo's most-punished defect: "a hand-maintained
// expected set that nothing enforces" (MASTER.md, twelve instances). The eleventh had a test
// standing guard over it, built from the same wrong list, and so certified the gap for the life of
// the defect. So the set is READ from the table in docs/SECURITY.md that adjudicates which
// advisories are in our path - the document where that judgement is actually made. Adding a row
// marked in-path there arms this gate automatically.
//
// ── THE PARSE MUST ANCHOR ON THE HEADER, AND HERE IS WHY ────────────────────────────────────────
// docs/SECURITY.md carries TWO GHSA tables. The first is the adjudication:
//     | GHSA | Sev | In our path? | Notes |
// The second is the ignore-list ledger, whose third column is a different question entirely:
//     | GHSA | Root | In ignoreGhsas? | Status | Closes when |
// A parse that just read "column 3 contains yes" over every table row would sweep up nine rows
// from the ledger - including ones adjudicated "not in path" - and derive a set that is wrong in
// both directions. The parse therefore finds the header naming "In our path?" and reads only the
// rows beneath it, and asserts it found that header at all.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MULTI_USER_ENV, MULTI_USER_UPLOADS, multiUserUploadsEnabled, uploadDenial } from '@/lib/user-corpus/access';

/** The ceiling must stay a literal CI can read; see "cannot be raised by the environment alone". */
const ACCESS_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/lib/user-corpus/access.ts',
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const IGNORED: string[] =
  JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).pnpm?.auditConfig
    ?.ignoreGhsas ?? [];

/** GHSA ids that docs/SECURITY.md's adjudication table marks as in our path. */
function inPathAdvisories(): string[] {
  const lines = readFileSync(path.join(ROOT, 'docs/SECURITY.md'), 'utf8').split('\n');
  const header = lines.findIndex((l) => /^\|/.test(l) && /In our path\?/i.test(l));
  if (header === -1) {
    throw new Error(
      'docs/SECURITY.md has no advisory table with an "In our path?" column. The A7 gate derives ' +
        'its set from that table; without it this check would silently pass. Restore the table or ' +
        'update this derivation deliberately.',
    );
  }
  const ids: string[] = [];
  // Skip the header and its `|---|` separator, then read until the table ends.
  for (let i = header + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i].split('|').map((c) => c.replaceAll('*', '').trim());
    // cells[0] is the empty string before the leading pipe.
    const id = cells[1] ?? '';
    const inPath = cells[3] ?? '';
    if (/^GHSA-[\w-]+$/.test(id) && /\byes\b/i.test(inPath)) ids.push(id);
  }
  return ids;
}

describe('A7 - the SEC-1 upload gate', () => {
  const inPath = inPathAdvisories();

  it('derives a non-empty in-path advisory set from docs/SECURITY.md', () => {
    // Non-vacuity. If the table's shape drifts, the derivation returns [] and every assertion
    // below passes for the wrong reason - the gate would report green having checked nothing.
    expect(inPath.length).toBeGreaterThan(0);
    expect(inPath.every((id) => /^GHSA-/.test(id))).toBe(true);
  });

  it('does not sweep up the ignore-list ledger table', () => {
    // The ledger marks pw9m and 7w99 "not in path"; both sit in ignoreGhsas with "yes" in ITS
    // third column. If either appears here, the parse has crossed into the second table.
    expect(inPath).not.toContain('GHSA-pw9m-5jxm-xr6h');
    expect(inPath).not.toContain('GHSA-7w99-5wm4-3g79');
  });

  it('keeps multi-user uploads disabled while an in-path advisory is ignored', () => {
    const stillIgnored = inPath.filter((id) => IGNORED.includes(id));
    // UNCONDITIONAL. This was `if (stillIgnored.length > 0) { expect(...) }`, and the ignore list
    // is empty today — so the body never ran and the `it()` reported green having asserted
    // NOTHING: the exact shape of the open 2026-08-31 finding, in the gate that guards SEC-1
    // (false-confidence audit, 2026-09-07). Written as an implication instead, so the assertion
    // always executes and its truth is the property: no in-path advisory is ignored, OR the
    // ceiling is down.
    // Negation, not `=== false`: `MULTI_USER_UPLOADS` narrows to the literal `true`, so an
    // equality comparison against `false` is a TS2367 typecheck error (and an annotated `const`
    // does not widen it). The property is the runtime value, which `!` reads without comparing.
    expect(
      stillIgnored.length === 0 || !MULTI_USER_UPLOADS,
      stillIgnored.length === 0
        ? ''
        : `SEC-1 is open: ${stillIgnored.join(', ')} still in pnpm.auditConfig.ignoreGhsas. ` +
          'UPLOADER_DESIGN §4 forbids multi-user upload until the Better Auth direct cutover ' +
          'lands and these ids are removed. Set MULTI_USER_UPLOADS back to false.',
    ).toBe(true);
  });

  it('cannot be raised by the environment alone', () => {
    // The ceiling is the committed constant; the env switch only narrows it. Without this, a CI
    // assertion on the constant would say nothing about what production is actually serving.
    //
    // THE ASSERTION IS THE COMPOSITION, NOT THE OUTCOME. This read
    // `expect(multiUserUploadsEnabled(on)).toBe(MULTI_USER_UPLOADS)`, which the day the constant
    // became `true` collapsed into `expect(true).toBe(true)` — dropping `MULTI_USER_UPLOADS &&`
    // from access.ts left it green (false-confidence audit, 2026-09-07). Both factors are now
    // exercised INDEPENDENTLY, which no single value of the constant can satisfy vacuously:
    // with the env off the answer is false whatever the ceiling says, and with the env on the
    // answer is the ceiling itself.
    const on = { [MULTI_USER_ENV]: 'true' };
    const off = { [MULTI_USER_ENV]: 'false' };
    expect(multiUserUploadsEnabled(off), 'the env switch is not consulted').toBe(false);
    expect(multiUserUploadsEnabled({}), 'an unset env switch must not open uploads').toBe(false);

    // AND THE CEILING IS CONSULTED — which, while the ceiling is `true`, NO runtime assertion can
    // observe: `true && B` and `B` are the same function, so every input gives the same answer.
    // That is exactly how the previous version died — `expect(multiUserUploadsEnabled(on))
    //   .toBe(MULTI_USER_UPLOADS)` became `expect(true).toBe(true)` the day the constant flipped,
    // and deleting `MULTI_USER_UPLOADS &&` from access.ts stayed green. Re-proved on 2026-09-07:
    // the runtime rewrite went green against that same seed too.
    //
    // So the check is STRUCTURAL, and says so rather than pretending otherwise. Comments are
    // stripped first: a check a comment can satisfy is a check that cannot fail (the lesson from
    // session-mock-surface.test.ts the same night).
    const accessCode = readFileSync(ACCESS_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const fn = /export function multiUserUploadsEnabled\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(accessCode);
    expect(fn, 'multiUserUploadsEnabled moved or was renamed').not.toBeNull();
    expect(
      fn![1],
      'the env switch alone decides multi-user upload — the committed ceiling is not in the expression, '
        + 'so CI can no longer see what production is serving',
    ).toMatch(/MULTI_USER_UPLOADS/);
    // The ceiling is a literal, not an env read: a `MULTI_USER_UPLOADS = process.env.X === '1'`
    // would satisfy everything above while making it invisible to this suite again.
    expect(accessCode).toMatch(/export const MULTI_USER_UPLOADS = (?:true|false);/);
  });
});

describe('the owner-only beta carve-out (§4 condition 2)', () => {
  const prod = (extra: Record<string, string> = {}) => ({ NODE_ENV: 'production', ...extra });

  it('denies every account in production when no allowlist is set', () => {
    expect(uploadDenial('anyone', prod())).toMatch(/not enabled/i);
  });

  it('admits an allowlisted id and denies a second account', () => {
    const env = prod({ USER_CORPUS_OWNER_IDS: 'owner-1, owner-2' });
    expect(uploadDenial('owner-1', env)).toBeNull();
    expect(uploadDenial('owner-2', env)).toBeNull();
    expect(uploadDenial('attacker', env)).toMatch(/not enabled/i);
  });

  it('stands down outside production', () => {
    expect(uploadDenial('anyone', { NODE_ENV: 'test' })).toBeNull();
  });
});
