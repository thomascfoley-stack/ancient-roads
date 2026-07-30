// Mint Neon connection strings in-process — never type or log credentials.
// Pattern matches .github/workflows/audit.yml (neonctl + --api-key).
import { execFileSync } from 'node:child_process';
import { hostOf, endpointId, instrumentTargetMatches, PROD_ENDPOINT, DEV_ENDPOINT } from './target-guard.mjs';

export const DEFAULT_NEON_PROJECT = 'spring-heart-74819093';

/** Neon branch name for a declared endpoint id. Override with NEON_BRANCH when rehearsing on a fork. */
const BRANCH_BY_ENDPOINT = {
  [PROD_ENDPOINT]: 'production',
  [DEV_ENDPOINT]: 'dev',
};

export function branchForTarget(target) {
  if (process.env.NEON_BRANCH) return process.env.NEON_BRANCH;
  const id = endpointId(target);
  if (id === null) throw new Error(`invalid --target (not an endpoint id): ${target}`);
  const branch = BRANCH_BY_ENDPOINT[id];
  if (!branch) {
    throw new Error(
      `no Neon branch mapping for endpoint '${id}' — set NEON_BRANCH to the branch name for this target`,
    );
  }
  return branch;
}

/** Fetch a connection string via neonctl. Never logs the URL. */
export function mintNeonConnectionString({ branch, role, project, apiKey }) {
  const url = execFileSync(
    'npx',
    [
      '--yes', 'neonctl', 'connection-string', branch,
      '--project-id', project,
      '--role-name', role,
      '--database-name', 'neondb',
      '--api-key', apiKey,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
  if (!url) throw new Error(`neonctl returned empty connection string for branch ${branch}`);
  return url;
}

/**
 * Resolve a database URL for the unit_ordinal instrument.
 * Prefers NEON_API_KEY mint (app_runtime) over any env URL — credentials never echoed.
 */
export function resolveInstrumentConnection({ target, role = 'app_runtime' }) {
  if (!target) throw new Error('--target=<endpoint-id> is required (exact Neon endpoint id)');

  const apiKey = process.env.NEON_API_KEY;
  const project = process.env.NEON_PROJECT ?? process.env.NEON_PROJECT_ID ?? DEFAULT_NEON_PROJECT;

  if (apiKey) {
    const branch = branchForTarget(target);
    const url = mintNeonConnectionString({ branch, role, project, apiKey });
    if (!instrumentTargetMatches(url, target)) {
      throw new Error(`STOP: minted host ${hostOf(url)} is not the declared target '${target}'`);
    }
    return { url, source: 'neonctl', role, branch };
  }

  const url =
    process.env.UNIT_ORDINAL_DATABASE_URL ??
    process.env.APP_DATABASE_URL ??
    process.env.CUTOVER_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'NEON_API_KEY unset and no DATABASE_URL — cannot connect. Mint via NEON_API_KEY or set a dev/test URL.',
    );
  }
  if (!instrumentTargetMatches(url, target)) {
    throw new Error(`STOP: host ${hostOf(url)} is not the declared target '${target}'`);
  }
  return { url, source: 'env', role: null, branch: null };
}
