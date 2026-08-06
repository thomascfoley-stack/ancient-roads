// The door itself. `sec1-upload-gate.test.ts` proves the POLICY (uploadDenial) and the CI gate;
// this proves the thing the six route handlers actually call resolves that policy into a response.
//
// Together with the grep that no `requireUser` remains anywhere under
// `web/src/app/api/user-corpus/`, that is the whole chain: every handler goes through `guardUser`,
// and `guardUser` denies.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

let currentUser: { id: string; email: string } | null = { id: 'someone', email: 'a@example.com' };
vi.mock('@/lib/session', () => ({
  requireUser: async () => {
    if (!currentUser) throw new Error('Unauthorized');
    return currentUser;
  },
}));

const { guardUser } = await import('@/lib/user-corpus/route-guard');

afterEach(() => {
  vi.unstubAllEnvs();
  currentUser = { id: 'someone', email: 'a@example.com' };
});

describe('every user-corpus route goes through the guard', () => {
  // DERIVED by walking the route tree, never a typed list of route files. A hand-listed set here
  // would be the exact defect MASTER.md's watchlist names first, and it would fail in the way that
  // matters: silently, on the SEVENTH route, the one added after the list was written.
  const ROUTES_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../src/app/api/user-corpus',
  );

  function routeFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return routeFiles(p);
      return e.name === 'route.ts' ? [p] : [];
    });
  }

  const files = routeFiles(ROUTES_DIR);

  it('finds the route files at all', () => {
    // Non-vacuity: if the tree moves, every assertion below passes over an empty list.
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files.map((f) => [path.relative(ROUTES_DIR, f), f]))(
    '%s calls guardUser and never requireUser directly',
    (_name, file) => {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('guardUser');
      // Bypassing the guard means calling requireUser straight from the route, which authenticates
      // without ever consulting the §4 allowlist -- the precise shape of the hole this closes.
      expect(src).not.toMatch(/requireUser/);
    },
  );
});

describe('guardUser', () => {
  it('401s with no session, before consulting the allowlist', async () => {
    currentUser = null;
    const g = await guardUser();
    expect(g.denied?.status).toBe(401);
  });

  it('403s an authenticated account that is not allowlisted in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('USER_CORPUS_OWNER_IDS', 'the-owner');
    currentUser = { id: 'not-the-owner', email: 'b@example.com' };
    const g = await guardUser();
    expect(g.denied?.status).toBe(403);
    expect(g.user).toBeUndefined();
  });

  it('403s everyone in production when the allowlist is unset (fails closed)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const g = await guardUser();
    expect(g.denied?.status).toBe(403);
  });

  it('admits the allowlisted owner in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('USER_CORPUS_OWNER_IDS', 'the-owner');
    currentUser = { id: 'the-owner', email: 'o@example.com' };
    const g = await guardUser();
    expect(g.denied).toBeUndefined();
    expect(g.user?.id).toBe('the-owner');
  });
});
