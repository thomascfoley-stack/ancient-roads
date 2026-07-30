// Every branch listed in docs/PROTECTED_BRANCHES.json must still exist in Neon.
// Prevention (refusal to delete) can fail; detection must not.
//
// Runs in the db-invariants job when NEON_API_KEY is set. Without it, announces NOT RUN.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { announceSkip } from '../helpers/loud-skip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REGISTRY = JSON.parse(
  readFileSync(path.join(ROOT, 'docs/PROTECTED_BRANCHES.json'), 'utf8'),
) as { branches: { id: string; name?: string }[] };

const NEON_API_KEY = process.env.NEON_API_KEY;
const NEON_PROJECT = process.env.NEON_PROJECT ?? 'spring-heart-74819093';

const SKIP = announceSkip(
  'protected-branches-exist',
  [{ name: 'NEON_API_KEY (Neon branch inventory)', present: Boolean(NEON_API_KEY) }],
  'every registered rollback branch id still exists in Neon',
);

describe.skipIf(SKIP)('protected branches registry — every registered id still exists', () => {
  it('lists each protected branch via neonctl', () => {
    const raw = execFileSync(
      'npx',
      ['--yes', 'neonctl', 'branches', 'list', '--project-id', NEON_PROJECT, '--output', 'json'],
      { encoding: 'utf8', env: { ...process.env, NEON_API_KEY } },
    );
    const branches = JSON.parse(raw) as { id: string; name?: string }[];
    const ids = new Set(branches.map((b) => b.id));

    for (const entry of REGISTRY.branches) {
      expect(ids.has(entry.id), `protected branch ${entry.id} (${entry.name ?? '?'}) missing from Neon`).toBe(true);
    }
  });
});
