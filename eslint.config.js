import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Root lint config. Scoped to src/ and test/; the web/ app has its own ESLint.
export default tseslint.config(
  { ignores: ['web/**', 'node_modules/**', 'coverage/**', 'data/**', '**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Legacy one-off data scripts and pre-existing test scaffolding: `any` is a
    // warning, not a gate failure. Product code (retrieval/contract/verifier/bible)
    // stays strict via the rule above. Tighten these to 'error' as they're cleaned.
    files: ['src/ingest/**/*.ts', 'test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' },
  },
);
