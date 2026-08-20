// Preload for RUNNER SCRIPTS ONLY (node --require): makes `import 'server-only'` a no-op so a
// script can execute the SHIPPED web modules instead of forking them. The alternative was
// re-implementing embedQuery in the runner — the exact pipeline-fork scar eval-heldout.mts and
// the 2026-08-15 bait-harness rewrite both carry. Vitest solves this with an alias
// (web/vitest.config.ts); this is the same idea for plain node+tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const M = require('node:module');
const orig = M._load;
M._load = function load(request, ...rest) {
  if (request === 'server-only') return {};
  return orig.call(this, request, ...rest);
};
