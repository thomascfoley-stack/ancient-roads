// Mint Neon connection strings in-process — never print API keys or connection URLs.
import { execFileSync } from 'node:child_process';
import { hostOf, endpointId, instrumentTargetMatches, PROD_ENDPOINT, DEV_ENDPOINT } from './target-guard.mjs';

export const DEFAULT_NEON_PROJECT = 'spring-heart-74819093';
export const INSTRUMENT_ROLE = 'app_runtime';

const BRANCH_BY_ENDPOINT = {
  [PROD_ENDPOINT]: 'production',
  [DEV_ENDPOINT]: 'dev',
};

export function scrubCredentialText(text, apiKey) {
  if (text == null || text === '') return text;
  let s = String(text);
  if (apiKey) s = s.split(apiKey).join('[REDACTED_API_KEY]');
  s = s.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[REDACTED_DATABASE_URL]');
  s = s.replace(/--api-key(?:=\S+|\s+\S+)/g, '--api-key [REDACTED]');
  return s;
}

export function branchForTarget(target) {
  if (process.env.NEON_BRANCH) return process.env.NEON_BRANCH;
  const id = endpointId(target) ?? String(target).toLowerCase().trim();
  const branch = BRANCH_BY_ENDPOINT[id];
  if (!branch) {
    throw new Error(
      `no Neon branch mapping for endpoint '${target}' — set NEON_BRANCH to the branch name for this target`,
    );
  }
  return branch;
}

/** Fetch a connection string via neonctl. API key travels in env only — never argv. */
export function mintNeonConnectionString({ branch, role, project, apiKey }) {
  if (!apiKey) throw new Error('mintNeonConnectionString: apiKey required');
  try {
    const url = execFileSync(
      'npx',
      [
        '--yes', 'neonctl', 'connection-string', branch,
        '--project-id', project,
        '--role-name', role,
        '--database-name', 'neondb',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, NEON_API_KEY: apiKey },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
    if (!url) throw new Error(`neonctl returned empty connection string for branch ${branch}`);
    return url;
  } catch (e) {
    const msg = scrubCredentialText(e?.message ?? String(e), apiKey);
    const stderr = scrubCredentialText(e?.stderr?.toString?.() ?? '', apiKey);
    const stdout = scrubCredentialText(e?.stdout?.toString?.() ?? '', apiKey);
    throw new Error([msg, stderr, stdout].filter(Boolean).join('\n'));
  }
}

/**
 * Assert, AT THE SERVER, that this session cannot write and is who it claims to be.
 *
 * Both legs are server-side answers, not local beliefs: `SHOW transaction_read_only`
 * is what Postgres will actually enforce, and `current_user` is the role the server
 * resolved — a minted URL that says `app_runtime` proves nothing if the endpoint
 * mapped it to the owner. This lives here, next to the minting, so that the CLI has
 * exactly one call to make and a test can drive it with a fake client instead of a
 * production connection.
 *
 * @param client an open pg client
 * @param expectedRole the role the session must be running as
 */
export async function assertReadOnlySession(client, { role = INSTRUMENT_ROLE } = {}) {
  const ro = (await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only;
  if (ro !== 'on') {
    throw new Error(`STOP: read-only transaction not in force (transaction_read_only=${ro ?? 'unknown'})`);
  }
  const actualRole = (await client.query('SELECT current_user')).rows[0]?.current_user;
  if (actualRole !== role) {
    throw new Error(`STOP: connected role is '${actualRole ?? 'unknown'}', expected '${role}'`);
  }
  return { readOnly: true, role: actualRole };
}

/**
 * Resolve connection for unit_ordinal instrument.
 * Exactly ONE credential source: NEON_API_KEY. No DATABASE_URL fallback chain.
 */
export function resolveInstrumentConnection({ target, role = INSTRUMENT_ROLE }) {
  if (!target) throw new Error('--target=<endpoint-id> is required (exact Neon endpoint id)');

  const apiKey = process.env.NEON_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error(
      'NEON_API_KEY is required. No DATABASE_URL / APP_DATABASE_URL / CUTOVER_DATABASE_URL fallback — ambient owner credentials are never picked up.',
    );
  }

  const project = process.env.NEON_PROJECT ?? process.env.NEON_PROJECT_ID ?? DEFAULT_NEON_PROJECT;
  const branch = branchForTarget(target);
  const url = mintNeonConnectionString({ branch, role, project, apiKey });
  if (!instrumentTargetMatches(url, target)) {
    throw new Error(`STOP: minted host ${hostOf(url)} is not the declared target '${target}'`);
  }
  return { url, source: 'neonctl', role, branch };
}
