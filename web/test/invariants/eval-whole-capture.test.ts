import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// WHOLE-CAPTURE, guarded on every push.
//
// `eval-heldout.mts` used to emit to stdout ONLY, so a truncated pipe was indistinguishable in the
// output from a complete run — which is how the 2026-08-19 P4.n commentary-flip adjudication came
// to rest on 41 of 120 queries while reading as whole. The harness now writes its own artifact with
// a `complete` flag and exits non-zero when it is false.
//
// This test drives the REAL script as a SUBPROCESS rather than importing `captureVerdict`. That is
// deliberate: importing it drags the module's top-level `neon()` construction and the whole
// routing.ts graph, which is what stopped the check being guarded when it first shipped. A
// subprocess needs none of that — and it exercises the artifact, the exit code and the loop
// together, which an import of the pure function never could.
//
// It runs OFFLINE: `--frozen --cats control` touches neither the database nor DeepInfra (controls
// only call `resolveIntent`), so there is no credential and no provider spend in CI. The dummy
// APP_DATABASE_URL exists solely so the module-level `neon()` constructs.

const webRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const script = path.join(webRoot, 'src', 'scripts', 'eval-heldout.mts');
const tmp = mkdtempSync(path.join(tmpdir(), 'whole-capture-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

type Run = { status: number; artifact: { expected: number; captured: number; complete: boolean; records: unknown[] } };

function run(outName: string, extra: string[]): Run {
  const out = path.join(tmp, outName);
  let status = 0;
  try {
    execFileSync('npx', ['tsx', script, '--frozen', '--cats', 'control', '--out', out, ...extra], {
      cwd: webRoot,
      env: { ...process.env, APP_DATABASE_URL: 'postgresql://u:p@ep-dummy.example.neon.tech/db', DEEPINFRA_API_KEY: 'unused' },
      stdio: 'pipe',
    });
  } catch (e) {
    status = (e as { status?: number }).status ?? 1;
  }
  return { status, artifact: JSON.parse(readFileSync(out, 'utf8')) };
}

describe('eval-heldout whole-capture', () => {
  it('GREEN: a complete run writes every record and exits 0', () => {
    const { status, artifact } = run('green.json', []);
    expect(artifact.expected).toBe(10); // FROZEN's control stratum
    expect(artifact.captured).toBe(artifact.expected);
    expect(artifact.records).toHaveLength(artifact.expected);
    expect(artifact.complete).toBe(true);
    expect(status).toBe(0);
  }, 120_000);

  // The leg that makes this a test rather than a smoke check. Without it, a regression that
  // silently stopped writing records — or stopped failing on a short run — would stay green.
  it('RED: a short run is marked incomplete and exits NON-ZERO', () => {
    const { status, artifact } = run('red.json', ['--stop-after', '3']);
    expect(artifact.expected).toBe(10);
    expect(artifact.captured).toBe(3);
    expect(artifact.complete).toBe(false);
    expect(status).not.toBe(0); // the property: a partial run is loud, never silently green
  }, 120_000);
});
