// PROPERTY: the read-only production instrument runs under plain `node`, with no
// transpiler in its path and nothing fetched from a package registry at run time.
//
// WHY THIS IS A SAFETY PROPERTY, not tidiness. scripts/lib/target-guard.d.mts already
// states the rule for the prod-target guard: "a prod-safety guard must not depend on a
// transpiler being present." The unit_ordinal instrument broke it — to decide which
// published works were legally safe to excerpt into a committed log, it shelled out to
// `npx tsx scripts/lib/excerpt-sample-policy.mts`. That put two things production could
// not see between the operator and the legal filter: a transpiler that must be installed,
// and an `npx` that will happily go to the network to fetch one. A registry outage, a
// stale cache, or a compromised package sat on the path of the check that decides whether
// an aggregator's compilation gets written to disk.
//
// TWO LEGS, because they fail differently:
//   - static: nothing on the instrument's own import graph is TypeScript, and no file on
//     it invokes a transpiler.
//   - runtime: the measurement modules actually load and compute under a `node` that has
//     an EMPTY PATH (so `npx`/`tsx` cannot be found at all) and an unreachable registry.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'scripts/unit-ordinal-instrument.mjs');

const TRANSPILER = /\btsx\b|\bts-node\b|--experimental-strip-types|--loader\b/;

/**
 * Drop comment lines. The files on this path explain AT LENGTH why they no longer shell
 * out to a transpiler, so scanning raw source would flag the explanation and the only way
 * to get green would be to delete the reasoning. Whole-line comments only: a code line
 * carrying a URL must not be mistaken for a comment.
 */
function codeOnly(src: string): string {
  return src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n');
}

/** Every local file reachable from `entry` by static relative import. */
function importGraph(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:^|[\s(])(?:import|export)[\s\S]*?from\s*['"](\.[^'"]+)['"]/g)) {
      const resolved = path.resolve(path.dirname(file), m[1]!);
      if (existsSync(resolved)) queue.push(resolved);
    }
  }
  return [...seen];
}

describe('production instrument path — static shape', () => {
  const graph = importGraph(ENTRY);

  it('reaches more than the entry file (the walker is not blind)', () => {
    // A regex that matched nothing would make every assertion below vacuously true.
    expect(graph.length).toBeGreaterThan(3);
    expect(graph).toContain(path.join(ROOT, 'scripts/lib/excerpt-sample-policy.mjs'));
    expect(graph).toContain(path.join(ROOT, 'src/ingest/forbidden-provenance.mjs'));
  });

  it('contains no TypeScript — plain node can load every file on it', () => {
    const ts = graph.filter((f) => /\.(ts|mts|cts|tsx)$/.test(f));
    expect(ts.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('invokes no transpiler', () => {
    const offenders = graph.filter((f) => TRANSPILER.test(codeOnly(readFileSync(f, 'utf8'))));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('still catches the exact call that was removed', () => {
    // Positive control: without it, a codeOnly() that over-stripped would turn the
    // assertion above into "no file contains anything", which passes forever.
    const removed = [
      '// the CLI used to shell out to a transpiler; it no longer does',
      `const out = execFileSync('npx', ['tsx', 'scripts/lib/excerpt-sample-policy.mts', '--select'], opts);`,
    ].join('\n');
    expect(TRANSPILER.test(codeOnly(removed))).toBe(true);
    expect(codeOnly(removed)).not.toMatch(/used to shell out/);
  });
});

describe('production instrument path — runs under plain node with no PATH and no registry', () => {
  it('loads and computes the excerpt decision with npx unreachable', () => {
    const policy = pathToFileURL(path.join(ROOT, 'scripts/lib/excerpt-sample-policy.mjs')).href;
    const core = pathToFileURL(path.join(ROOT, 'scripts/lib/unit-ordinal-instrument.mjs')).href;
    const guard = pathToFileURL(path.join(ROOT, 'scripts/lib/target-guard.mjs')).href;

    const harness = `
      import { buildExcerptReport, loadManifestById, renderExcerptLines } from ${JSON.stringify(policy)};
      import { backfillSqlFromMigration } from ${JSON.stringify(core)};
      import { isProdHost } from ${JSON.stringify(guard)};
      const report = buildExcerptReport(
        [{ slug: 'john-gill', source_type: 'commentary', status: 'published', provenance: { url: 'https://bible.helloao.org/x' } }],
        { rows: [], truncated: false },
        loadManifestById(),
      );
      if (report.sampleSlugs.length !== 1) throw new Error('excerpt decision did not run: ' + JSON.stringify(report.sampleSlugs));
      const line = renderExcerptLines([{ unit_ordinal: 1, ordinal: 2, heading: 'h' }])[0];
      if (line !== 'u1.2\\th') throw new Error('formatter drift under plain node: ' + JSON.stringify(line));
      if (!/UPDATE\\s+sections/i.test(backfillSqlFromMigration())) throw new Error('024 backfill not readable');
      if (typeof isProdHost !== 'function') throw new Error('target guard did not load');
      console.log('PLAIN_NODE_OK');
    `;

    // An empty directory as the entire PATH: `npx`, `tsx`, `pnpm` and `sh` are all gone.
    // node itself is reached by absolute path, so only child processes are affected —
    // which is exactly the thing being ruled out.
    const emptyPath = mkdtempSync(path.join(os.tmpdir(), 'no-path-'));
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', harness], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        PATH: emptyPath,
        HOME: os.tmpdir(),
        // If anything did try to install, make it fail fast rather than hang or succeed.
        npm_config_offline: 'true',
        npm_config_registry: 'http://127.0.0.1:9',
      },
    });
    expect(out).toContain('PLAIN_NODE_OK');
  });
});
