import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Root suite = the root test/ dir only. web/test/** runs via web/vitest.config.ts
    // (the `qa` gate) which carries the `@` alias; without this, vitest's default glob
    // sweeps web/test/** here too and every `@/…` import 404s.
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      all: true, // include untested source files so they surface as zero-coverage
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/types.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
