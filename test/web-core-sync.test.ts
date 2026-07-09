import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The web app can't bundle root `src/` (separate package, no cross-dir transpile),
// so the integrity core — the contract schema/types and the V1 verifier — is
// copied into web/src and MUST stay byte-identical. Same guard as bible-sync.
// If you change the verifier or contract in src/, copy it to web/src (or vice
// versa) or this fails. Ported glue (teacher/ retrieval/ llm) is intentionally
// NOT synced — only the spec-enforcing core.
const ROOT = join(__dirname, '..');

const PAIRS: Array<[string, string]> = [
  ['src/contract/schema.json', 'web/src/contract/schema.json'],
  ['src/contract/types.ts', 'web/src/contract/types.ts'],
  ['src/verifier/v1.ts', 'web/src/verifier/v1.ts'],
  ['src/verifier/screens.ts', 'web/src/verifier/screens.ts'],
  ['src/verifier/normalize.ts', 'web/src/verifier/normalize.ts'],
  ['src/verifier/types.ts', 'web/src/verifier/types.ts'],
];

describe('src ↔ web/src contract+verifier sync guard', () => {
  for (const [srcRel, webRel] of PAIRS) {
    it(`${srcRel} is byte-identical to ${webRel}`, () => {
      const src = readFileSync(join(ROOT, srcRel), 'utf8');
      const web = readFileSync(join(ROOT, webRel), 'utf8');
      expect(web).toBe(src);
    });
  }
});
