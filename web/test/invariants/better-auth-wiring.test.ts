// Two wiring properties that typecheck cannot see, both found the hard way in a browser.
//
// 1. THE CLIENT AND SERVER MUST AGREE ON basePath. `authOptions.basePath` decides where Better
//    Auth mounts its routes; `createAuthClient({ basePath })` decides where the browser posts. If
//    they drift, every form fails at runtime with a 404 and tsc is perfectly happy, because the two
//    values live in different files and are never compared.
//
// 2. VALUES THE SERVER READS MUST NOT LIVE IN A 'use client' MODULE. `AUTH_PATHS` was exported
//    from `components/auth-forms.tsx`, which carries 'use client'. A server component importing a
//    plain value from a client module does not get the value, it gets a client reference proxy, so
//    `generateStaticParams` called `.map` on it and /auth/* 500'd with "AUTH_PATHS.map is not a
//    function". tsc types the import as the array it textually is, so this is invisible to it and
//    to every unit test that imports the module directly. Only a request finds it.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { authOptions } from '@/lib/auth/better-auth';
import { AUTH_PATHS } from '@/lib/auth/paths';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

describe('the auth client and server agree', () => {
  it('mounts and posts to the same basePath', () => {
    const client = read('lib/auth/client.ts');
    const declared = client.match(/basePath:\s*'([^']+)'/)?.[1];
    expect(declared, 'client.ts declares no basePath').toBeDefined();
    expect(declared).toBe(authOptions.basePath);
  });

  it('serves a handler at that basePath', () => {
    // The catch-all route file must actually exist where basePath says it is. A rename of either
    // leaves the other pointing at nothing.
    const seg = authOptions.basePath.replace(/^\//, '');
    expect(() => read(path.join('app', seg, '[...path]', 'route.ts'))).not.toThrow();
  });
});

describe('the /auth route table is readable by the server', () => {
  it('lives outside the client boundary', () => {
    expect(read('lib/auth/paths.ts')).not.toMatch(/^\s*'use client'/m);
  });

  it('is a real array here, not a client reference proxy', () => {
    // Non-vacuity, and the exact shape of the failure: the proxy has no .map.
    expect(Array.isArray(AUTH_PATHS)).toBe(true);
    expect(AUTH_PATHS.length).toBeGreaterThan(0);
    expect(() => AUTH_PATHS.map((p) => ({ path: p }))).not.toThrow();
  });

  it('is imported by the page from the server-safe module, never from the client component', () => {
    const page = read('app/auth/[path]/page.tsx');
    expect(page).toMatch(/import \{[^}]*AUTH_PATHS[^}]*\} from '@\/lib\/auth\/paths'/);
    expect(page).not.toMatch(/import \{[^}]*AUTH_PATHS[^}]*\} from '@\/components\/auth-forms'/);
  });

  it('covers every path the page will statically generate', () => {
    // generateStaticParams + dynamicParams=false means anything absent here is a hard 404.
    for (const p of ['sign-in', 'sign-up', 'forgot-password', 'reset-password']) {
      expect(AUTH_PATHS).toContain(p);
    }
  });
});

describe('the Neon auth SDK is gone', () => {
  it('is not a dependency of web/', () => {
    const pkg = JSON.parse(read('../package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty(
      '@neondatabase/auth',
    );
  });

  it('leaves no import behind, including the CSS entry', () => {
    // The stale `@import '@neondatabase/auth/ui/tailwind'` in globals.css survived the dependency
    // removal and broke the dev server with an unresolvable module. Prose mentioning the package
    // in a comment is fine; an actual import is not.
    const offenders: string[] = [];
    for (const rel of ['app/globals.css', 'app/layout.tsx', 'lib/session.ts']) {
      const src = read(rel);
      if (/^\s*@import\s+'@neondatabase\/auth/m.test(src)) offenders.push(`${rel} (css @import)`);
      if (/^\s*import .*'@neondatabase\/auth/m.test(src)) offenders.push(`${rel} (js import)`);
    }
    expect(offenders).toEqual([]);
  });
});
