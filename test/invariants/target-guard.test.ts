// The four accidental-prod paths found by the 2026-07-27 deep-audit.
//
// Endpoint ids are DNS labels and DNS is case-INSENSITIVE, but `new URL()` only
// normalizes the host for *special* schemes (http/https/ws/wss/ftp/file). For
// `postgresql:` it preserves case verbatim — so every guard that compared a raw
// `new URL(u).host` against a lowercase literal failed OPEN on an uppercase URL.
// Separately, a substring test with a length floor let CUTOVER_EXPECT_HOST="neon.tech"
// authorize every endpoint in the account, production included.
//
// These tests are the red-proof. Before the fix they FAIL (the guards allow prod);
// after it they pass. The prod-shaped hosts below use the reserved `.invalid` TLD so
// that a regression can never actually reach a database.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { endpointId, hostOf, isProdHost, isDevHost, declaredMatches } from '../../scripts/lib/target-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Real prod/dev endpoint ids, UPPERCASED on purpose (the case defect), and retaining the
// literal "neon.tech" so the CUTOVER_EXPECT_HOST substring defect is genuinely exercised.
// The trailing reserved `.invalid` label makes them unresolvable, so a regression fails to
// connect rather than reaching a real database.
const PROD_UPPER = 'postgresql://u:p@EP-ODD-FOG-ATNYKUDM.c-9.us-east-1.aws.neon.tech.invalid/db';
const PROD_MIXED = 'postgresql://u:p@Ep-Odd-Fog-atnykudm.c-9.us-east-1.aws.neon.tech.invalid/db';
const DEV_UPPER = 'postgresql://u:p@EP-TINY-HAT-ATDGPISX.c-9.us-east-1.aws.neon.tech.invalid/db';
const FORK = 'postgresql://u:p@ep-fresh-fork-at000000.c-9.us-east-1.aws.neon.tech.invalid/db';

describe('target-guard: host comparison is case-insensitive', () => {
  it('lowercases the host of a postgresql: URL', () => {
    expect(hostOf(PROD_UPPER)).toBe('ep-odd-fog-atnykudm.c-9.us-east-1.aws.neon.tech.invalid');
  });

  it('recognises production regardless of case', () => {
    for (const u of [PROD_UPPER, PROD_MIXED]) expect(isProdHost(u)).toBe(true);
  });

  it('recognises dev regardless of case', () => {
    expect(isDevHost(DEV_UPPER)).toBe(true);
  });

  it('does not mistake a fresh fork for prod or dev', () => {
    expect(isProdHost(FORK)).toBe(false);
    expect(isDevHost(FORK)).toBe(false);
  });
});

describe('target-guard: the declared target is an exact endpoint id, never a substring', () => {
  it('extracts the endpoint id from a host', () => {
    expect(endpointId('ep-fresh-fork-at000000.c-9.aws.neon.tech')).toBe('ep-fresh-fork-at000000');
    expect(endpointId('EP-ODD-FOG-ATNYKUDM.c-9.aws.neon.tech')).toBe('ep-odd-fog-atnykudm');
  });

  it('rejects a generic domain as an endpoint id', () => {
    for (const s of ['neon.tech', 'aws.neon.tech', 'c-9.us-east-1.aws.neon.tech', '', undefined])
      expect(endpointId(s as string)).toBeNull();
  });

  it('CUTOVER_EXPECT_HOST="neon.tech" authorizes NOTHING', () => {
    for (const u of [PROD_UPPER, DEV_UPPER, FORK]) expect(declaredMatches(u, 'neon.tech')).toBe(false);
  });

  it('a declared id authorizes only its own endpoint', () => {
    expect(declaredMatches(FORK, 'ep-fresh-fork-at000000')).toBe(true);
    expect(declaredMatches(PROD_UPPER, 'ep-fresh-fork-at000000')).toBe(false);
    // and the operator may paste the whole host rather than the bare id
    expect(declaredMatches(FORK, 'ep-fresh-fork-at000000.c-9.aws.neon.tech')).toBe(true);
  });

  it('a prefix of a real endpoint id does not match it', () => {
    expect(declaredMatches(PROD_UPPER, 'ep-odd-fog')).toBe(false);
  });
});

// Wiring: the shipped scripts must actually USE the guard. A correct module that
// nothing imports is the failure mode this repo has hit before.
const runGuard = (script: string, env: Record<string, string>) => {
  try {
    execFileSync('node', [script], {
      cwd: ROOT, encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, ...env },
    });
    return { refused: false, out: '' };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { refused: true, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}` };
  }
};

// A refusal must come from the TARGET GUARD, not from a failed DNS lookup — otherwise
// "it errored" would count as "it refused" and the test would pass vacuously.
const refusedByGuard = (out: string) =>
  /REFUS|not allowed|is production|not the declared|STOP:/i.test(out) &&
  !/ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED/i.test(out);

describe('the shipped scripts refuse an uppercase production URL', () => {
  // The operator uppercases the endpoint in BOTH vars — one copy-paste from a console.
  // That is what makes the old case-sensitive guards wave prod through: the declared
  // check matches (both uppercase) and the prod check then misses (literal is lowercase).
  it('cutover-gate-redproof.mjs refuses prod (it deliberately corrupts its target)', () => {
    const r = runGuard('scripts/cutover-gate-redproof.mjs', {
      CUTOVER_DATABASE_URL: PROD_UPPER, CUTOVER_EXPECT_HOST: 'EP-ODD-FOG-ATNYKUDM',
    });
    expect(r.refused).toBe(true);
    expect(refusedByGuard(r.out)).toBe(true);
  });

  it('cutover-gate-redproof.mjs refuses dev too', () => {
    const r = runGuard('scripts/cutover-gate-redproof.mjs', {
      CUTOVER_DATABASE_URL: DEV_UPPER, CUTOVER_EXPECT_HOST: 'EP-TINY-HAT-ATDGPISX',
    });
    expect(r.refused).toBe(true);
    expect(refusedByGuard(r.out)).toBe(true);
  });

  it('register-label-embeddings.mjs refuses a generic CUTOVER_EXPECT_HOST', () => {
    const r = runGuard('scripts/register-label-embeddings.mjs', {
      DATABASE_URL: PROD_UPPER, CUTOVER_ALLOW: '1', CUTOVER_EXPECT_HOST: 'neon.tech',
    });
    expect(r.refused).toBe(true);
    expect(refusedByGuard(r.out)).toBe(true);
  });

  it('cutover-e4-slice-all.mjs refuses a generic CUTOVER_EXPECT_HOST', () => {
    const r = runGuard('scripts/cutover-e4-slice-all.mjs', {
      DATABASE_URL: PROD_UPPER, CUTOVER_ALLOW: '1', CUTOVER_EXPECT_HOST: 'neon.tech',
    });
    expect(r.refused).toBe(true);
    expect(refusedByGuard(r.out)).toBe(true);
  });
});
