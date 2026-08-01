// web/vercel.json IS SCHEMA-VALIDATED BY VERCEL, AND NOTHING LOCAL WAS CHECKING IT.
//
// THE DEFECT THIS EXISTS FOR. The first version of that file carried a `"//"` key holding the
// rationale — the convention npm's own package.json allows. Vercel rejects unknown top-level
// properties outright, and the deploy died before uploading a byte:
//
//   Error: Invalid vercel.json - should NOT have additional property `//`. Please remove it.
//
// A clean tree, a green `npm run audit`, a passing local `next build`, and the first thing in the
// chain that could see it was the remote. That is the SECOND instance in one session of the same
// class — a check that runs somewhere production does not — after the `web/` upload-root import
// (test/invariants/web-upload-root.test.ts). The prose moved to DEPLOY_PREFLIGHT §10, where a
// reader meets it; the file keeps only what the schema allows.
//
// This does NOT fetch Vercel's schema: a test on the legal rail must not depend on a network
// round-trip. It pins the small set of keys this project actually uses, so an unknown key — the
// thing the schema rejects — is caught here. If a future key is genuinely needed, add it here in
// the same commit that adds it there, which is the point.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(REPO, 'web/vercel.json');

/** Deliberately narrow. Widening it is a decision, taken alongside the config change. */
const ALLOWED_TOP_LEVEL = new Set(['$schema', 'installCommand', 'buildCommand', 'outputDirectory', 'framework', 'headers', 'redirects', 'rewrites', 'regions', 'crons']);

describe('web/vercel.json is something Vercel will accept', () => {
  it('parses, and carries no key outside the allowed set', () => {
    // SEED: add a `"//"` comment key (the exact shape that failed) -> RED.
    expect(existsSync(FILE)).toBe(true);
    const cfg = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, unknown>;
    const unknown = Object.keys(cfg).filter((k) => !ALLOWED_TOP_LEVEL.has(k));
    expect(
      unknown,
      `Vercel rejects unknown top-level properties and fails the deploy before uploading: ${unknown.join(', ')}. ` +
        'JSON has no comments — put the rationale in docs/DEPLOY_PREFLIGHT.md.',
    ).toEqual([]);
  });

  it('still pins the install command — the whole reason the file exists (M13)', () => {
    // SEED: delete installCommand -> RED. Without it Vercel runs `npm install`, which honours the
    // lockfile but silently UPDATES it when package.json disagrees; `npm ci` fails instead.
    const cfg = JSON.parse(readFileSync(FILE, 'utf8')) as { installCommand?: string };
    expect(cfg.installCommand).toMatch(/^npm ci\b/);
    // --legacy-peer-deps must match web/.npmrc or npm's strict resolver rejects
    // @neondatabase/auth@0.4.2-beta's peer on next>=16.
    const npmrc = readFileSync(path.join(REPO, 'web/.npmrc'), 'utf8');
    if (/legacy-peer-deps\s*=\s*true/.test(npmrc)) {
      expect(cfg.installCommand).toContain('--legacy-peer-deps');
    }
  });
});
