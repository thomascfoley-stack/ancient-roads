// NOTHING UNDER web/src MAY IMPORT A PATH THAT ESCAPES web/.
//
// THE DEFECT THIS EXISTS FOR, and it cost a production deploy. `vercel --prod` uploads `web/`
// ALONE — `deploy.sh` runs from `web/` and the repo root is not in the archive. So a specifier
// like `../../../src/ingest/forbidden-provenance.mjs` resolves everywhere it is checked and
// nowhere it is shipped:
//
//   local `next build`   ✓ the whole repo is on disk
//   CI `next build`      ✓ the whole repo is checked out
//   `npm run audit`      ✓ vitest resolves from the repo root
//   Vercel               ✗ Module not found
//
// Deploy `98124b2`, 2026-08-02: full green audit, clean tree, local build passed, six of seven
// deploy.sh steps passed, and the remote build died on exactly that import. This is the
// watchlist's "a gate nobody runs is not a gate" with a twist worth naming on its own — **a gate
// that runs in a different tree shape than production**. Adding `next build` to CI (`19798ec`)
// closed the first and could never close this one, because CI builds inside the whole repo.
//
// Two files had it: search-sections.ts (shipped in the H6 fix, never deployed until now) and
// legal-corpus.ts (added by the H4/H5 fix). Both now import web/src/lib/forbidden-provenance.mjs,
// a byte-identical copy held in step by test/web-core-sync.test.ts — the mechanism this repo
// already uses for the contract schema and the V1 verifier.
//
// This check is static and runs in every `npm run audit`, so the next one is caught at commit time
// rather than at step 7 of an irreversible operation.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeOnly } from '../../scripts/lib/source-scan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_SRC = path.join(REPO, 'web/src');

/** Every `from '...'` / `import('...')` / `require('...')` specifier in a file. */
function specifiers(code: string): string[] {
  return [...code.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx|mts|mjs|js|jsx)$/.test(n) ? [p] : [];
  });
}

describe('the deployed tree is self-contained', () => {
  it('no file under web/src imports outside web/', () => {
    // SEED: change the forbidden-provenance import in legal-corpus.ts back to
    // '../../../src/ingest/forbidden-provenance.mjs' -> RED, which is the exact deploy failure.
    const escapes: string[] = [];
    const files = walk(WEB_SRC);
    for (const file of files) {
      for (const spec of specifiers(codeOnly(readFileSync(file, 'utf8')))) {
        if (!spec.startsWith('.')) continue; // bare specifiers are package deps, resolved by install
        const resolved = path.resolve(path.dirname(file), spec);
        if (!resolved.startsWith(path.join(REPO, 'web') + path.sep)) {
          escapes.push(`${path.relative(REPO, file)} -> ${spec}`);
        }
      }
    }
    expect(
      escapes,
      `these resolve in the repo but NOT in the Vercel upload (which is web/ alone):\n  ${escapes.join('\n  ')}`,
    ).toEqual([]);
  });

  it('is not vacuous — it actually read the tree and found relative imports to judge', () => {
    // A walker pointed at the wrong directory returns no files and therefore no escapes, which is
    // indistinguishable from a clean tree. The counts below are the floor, not the measurement.
    const files = walk(WEB_SRC);
    expect(files.length).toBeGreaterThan(50);
    const relative = files.flatMap((f) => specifiers(codeOnly(readFileSync(f, 'utf8'))).filter((s) => s.startsWith('.')));
    expect(relative.length).toBeGreaterThan(50);
  });
});
