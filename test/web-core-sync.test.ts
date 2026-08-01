import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The web app can't bundle root `src/` (separate package, no cross-dir transpile),
// so the integrity core is copied into web/src and MUST stay byte-identical. Same
// guard as bible-sync. This covers (a) the contract schema/types + V1 verifier and
// (b) the teacher PROMPT — the composer's behavioural spec that enforces PRINCIPLES;
// CLI/web prompt drift would mean proving one thing and shipping another. The prompt
// imports no package-specific type (it defines a local PromptSource shape), which is
// what lets the two copies stay identical. If you change any of these in src/, copy
// it to web/src (or vice versa) or this fails. Other ported glue (retrieval/ llm/
// teach orchestration) is intentionally NOT synced.
const ROOT = join(__dirname, '..');

const PAIRS: Array<[string, string]> = [
  ['src/contract/schema.json', 'web/src/contract/schema.json'],
  ['src/contract/types.ts', 'web/src/contract/types.ts'],
  ['src/verifier/v1.ts', 'web/src/verifier/v1.ts'],
  ['src/verifier/screens.ts', 'web/src/verifier/screens.ts'],
  ['src/verifier/normalize.ts', 'web/src/verifier/normalize.ts'],
  ['src/verifier/types.ts', 'web/src/verifier/types.ts'],
  ['src/teacher/prompt.ts', 'web/src/lib/teacher/prompt.ts'],
  // THE FORBIDDEN-AGGREGATOR LIST (ADR-008). Added 2026-08-02 after deploy `98124b2` FAILED on
  // Vercel with "Module not found: Can't resolve '../../../src/ingest/forbidden-provenance.mjs'".
  // `vercel --prod` uploads `web/` ALONE, so a specifier that escapes it resolves in the repo
  // checkout, in CI, and in a local `next build`, and does not exist in the deployment. Copying it
  // in is the only shape that survives the upload boundary; this guard is what keeps the copy from
  // becoming the drifted second list that H8 found on the legal rail.
  ['src/ingest/forbidden-provenance.mjs', 'web/src/lib/forbidden-provenance.mjs'],
  ['src/ingest/forbidden-provenance.d.mts', 'web/src/lib/forbidden-provenance.d.mts'],
];

describe('src ↔ web/src integrity-core sync guard', () => {
  for (const [srcRel, webRel] of PAIRS) {
    it(`${srcRel} is byte-identical to ${webRel}`, () => {
      const src = readFileSync(join(ROOT, srcRel), 'utf8');
      const web = readFileSync(join(ROOT, webRel), 'utf8');
      expect(web).toBe(src);
    });
  }
});
