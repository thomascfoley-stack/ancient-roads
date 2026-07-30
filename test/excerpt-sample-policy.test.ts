import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('excerpt-sample-policy (tsx self-test — single reader)', () => {
  it('passes --self-test red-proofs', () => {
    const out = execFileSync('pnpm', ['exec', 'tsx', 'scripts/lib/excerpt-sample-policy.mts', '--self-test'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out).toContain('self-test: OK');
  });
});
