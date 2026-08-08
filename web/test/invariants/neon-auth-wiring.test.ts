// Neon equivalent of the wiring half of better-auth-wiring.test.ts (ADR-107/108/109,
// docs/AUTH_V2_IMPLEMENTATION.md §5/§6/§8).
//
// Better Auth's client and server had to be told the SAME basePath, and drifting them was a
// runtime-only 404 invisible to tsc. Neon's client (`createAuthClient()`) takes no baseURL/
// basePath argument at all -- it defaults to same-origin `/api/auth`, which is Next's request
// path, not a value either file declares. So the wiring risk moves from "two files agree on a
// string" to "the route file exists at the one path the client cannot be told to change", and
// "nothing re-introduces a basePath/baseURL override that would create the very drift Neon's
// client was designed not to need."

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

describe('the Neon auth client and route agree on the implicit path', () => {
  it('serves a handler at /api/auth/[...path], the path createAuthClient() defaults to', () => {
    expect(() => read(path.join('app', 'api', 'auth', '[...path]', 'route.ts'))).not.toThrow();
  });

  it('the client does not override the default with an explicit baseURL/basePath', () => {
    // Passing one back in would be exactly the drift risk Neon's parameterless client removes --
    // and it would silently stop matching wherever the route file actually lives.
    const client = read('lib/auth/client.ts');
    expect(client).not.toMatch(/baseURL\s*:/);
    expect(client).not.toMatch(/basePath\s*:/);
  });

  it('client.ts uses the Neon SDK, not the better-auth client it replaced', () => {
    const client = read('lib/auth/client.ts');
    expect(client).toMatch(/from '@neondatabase\/auth\/next'/);
    expect(client).not.toMatch(/from 'better-auth\/react'/);
  });

  it('the route handler uses the Neon SDK, not better-auth/next-js', () => {
    const route = read(path.join('app', 'api', 'auth', '[...path]', 'route.ts'));
    const imports = route.match(/^import .*$/gm) ?? [];
    expect(imports.some((l) => l.includes('@/lib/auth/neon-auth'))).toBe(true);
    expect(imports.some((l) => l.includes('better-auth'))).toBe(false);
  });

  it('session.ts reads Neon Auth, not Better Auth', () => {
    const session = read('lib/session.ts');
    const imports = session.match(/^import .*$/gm) ?? [];
    expect(imports.some((l) => l.includes('./auth/neon-auth'))).toBe(true);
    expect(imports.some((l) => l.includes('better-auth'))).toBe(false);
  });
});
