// THE UPLOAD ROOT SHIPS A LOCKFILE, AND IT IS A USABLE ONE — deep audit M13.
//
// THE DEFECT. `vercel --prod` uploads `web/`, and `web/` had no lockfile. So production resolved
// every `^` range fresh at build time with npm, while CI gated a pinned pnpm tree at the repo root
// — a lockfile that is not in the upload and therefore does not exist as far as the deploy is
// concerned. Two deploys of the same sha could ship different code, and did resolve differently in
// principle every time: `next: ^16.2.12`, `react: ^19.2.8`, `@neondatabase/auth: 0.4.2-beta` and
// their whole transitive closure. The 2026-08-02 deploy's own log reads "added 83 packages,
// removed 1 package, and changed 22 packages" against the local tree.
//
// THE TRAP THAT MAKES THIS A TEST AND NOT JUST A FILE. `npm install --package-lock-only` run
// INSIDE `web/` produces a lockfile whose every entry is a path like
// `../node_modules/.pnpm/next@16.2.12/node_modules/next` — npm walks up, finds the workspace's
// pnpm store, and records the symlink layout. Those paths do not exist in the upload, so that
// lockfile is worse than none: `npm ci` fails on it, or installs nothing. Measured: the first
// attempt produced 43 entries, all escaping. The correct file is generated from a copy of
// package.json + .npmrc in a directory with no ancestor `node_modules`, and has 738 self-contained
// entries.
//
// So this asserts the property that distinguishes the two, not merely that a file is present.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCK = path.join(REPO, 'web/package-lock.json');
const PKG = path.join(REPO, 'web/package.json');

interface Lock {
  lockfileVersion: number;
  packages: Record<string, { version?: string; resolved?: string }>;
}

describe('web/ ships a self-contained lockfile', () => {
  it('the lockfile exists at the upload root', () => {
    // SEED: delete web/package-lock.json -> RED.
    expect(existsSync(LOCK), 'web/package-lock.json is missing — production resolves ^ ranges fresh').toBe(true);
  });

  it('no entry escapes the upload root', () => {
    // SEED: regenerate the lockfile from inside web/ (inside the pnpm workspace) -> RED, every
    // entry becomes ../node_modules/.pnpm/... and npm ci cannot use it in the deployment.
    const lock = JSON.parse(readFileSync(LOCK, 'utf8')) as Lock;
    const escaping = Object.keys(lock.packages).filter((k) => k.startsWith('..'));
    expect(
      escaping.slice(0, 5),
      `${escaping.length} entries point outside web/ — generated inside the pnpm workspace. ` +
        'Regenerate from a copy of web/package.json + web/.npmrc in a directory with no ancestor node_modules.',
    ).toEqual([]);
  });

  it('is not vacuous — it actually resolved the tree', () => {
    // 43 entries was the broken shape; a real Next 16 + React 19 + vitest tree is in the hundreds.
    const lock = JSON.parse(readFileSync(LOCK, 'utf8')) as Lock;
    expect(Object.keys(lock.packages).length).toBeGreaterThan(300);
  });

  it('every direct dependency of web/package.json is pinned in it', () => {
    // The point of the lockfile is that the RANGES stop deciding. If a dependency were added to
    // package.json without regenerating, `npm ci` would refuse the deploy — this says so first.
    // SEED: add a dependency to web/package.json without regenerating -> RED.
    const lock = JSON.parse(readFileSync(LOCK, 'utf8')) as Lock;
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const direct = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(direct.length).toBeGreaterThan(5);
    const unpinned = direct.filter((d) => !lock.packages[`node_modules/${d}`]?.version);
    expect(unpinned, `not in the lockfile: ${unpinned.join(', ')} — run the regeneration recipe above`).toEqual([]);
  });
});
