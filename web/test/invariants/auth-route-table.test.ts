// THE /auth ROUTE TABLE MUST BE READABLE BY THE SERVER.
//
// PRESERVED from `better-auth-wiring.test.ts`, which was deleted on 2026-08-08 when the Better
// Auth system it guarded was removed (owner ruling, bylaw 3). These four checks were the live half
// of that file and have nothing to do with which auth system is mounted — they guard a production
// 500 that actually happened, and they would have been thrown away with the filename.
//
// THE DEFECT THEY EXIST FOR. `AUTH_PATHS` was exported from `components/auth-forms.tsx`, which
// carries 'use client'. A server component importing a plain value from a client module does not
// get the value — it gets a client reference proxy. So `generateStaticParams` called `.map` on it
// and every /auth/* route 500'd with "AUTH_PATHS.map is not a function".
//
// tsc cannot see this: it types the import as the array it textually is. Neither can a unit test
// that imports the module directly, because that resolves the real value. Only a request finds it,
// which is why it reached production.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AUTH_PATHS } from '@/lib/auth/paths';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

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
