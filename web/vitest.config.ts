import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// ESM-safe: `__dirname` is undefined here, so derive the web/ dir from the config's
// own URL. Otherwise the `@` alias + root resolve to the CWD (repo root) when the
// suite is invoked from root via the audit, and every `@/lib/*` import 404s.
const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: webRoot,
  resolve: {
    alias: {
      '@': path.join(webRoot, 'src'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
