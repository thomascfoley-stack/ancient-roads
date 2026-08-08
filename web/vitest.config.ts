import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// ESM-safe: `__dirname` is undefined here, so derive the web/ dir from the config's
// own URL. Otherwise the `@` alias + root resolve to the CWD (repo root) when the
// suite is invoked from root via the audit, and every `@/lib/*` import 404s.
const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: webRoot,
  esbuild: {
    // Next's tsconfig uses "jsx": "preserve"; vitest's esbuild defaults to the classic
    // runtime, so component tests need the automatic one set explicitly.
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.join(webRoot, 'src'),
      // mirror tsconfig paths — some app modules (e.g. lib/bible.ts) import via @bible;
      // without this a web test that pulls one in fails to resolve @bible/* (LONG_NIGHT).
      '@bible': path.join(webRoot, 'src', 'bible'),
      // see test/helpers/server-only-stub.ts — lets invariants import the SHIPPED
      // server modules rather than re-implementing them.
      'server-only': path.join(webRoot, 'test', 'helpers', 'server-only-stub.ts'),
    },
  },
  test: {
    // .tsx for the Book Reader component tests (jsdom per-file via the
    // `@vitest-environment jsdom` docblock — the suite default stays node).
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    server: {
      deps: {
        // @neondatabase/auth's next/server entry does `import ... from 'next/headers'` with no
        // extension. Next's own bundler resolves that fine (custom resolution it controls); left
        // external, vitest hands the .mjs to Node's native loader, which requires an exact
        // extension for ESM subpath imports and throws MODULE_NOT_FOUND even though
        // next/headers.js exists on disk. Inlining routes it through Vite's resolver instead,
        // which is lenient the way bundlers are expected to be.
        inline: [/@neondatabase\/auth/],
      },
    },
  },
});
