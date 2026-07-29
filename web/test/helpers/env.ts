import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Read a var from process.env or web/.env.local (local dev only). */
export function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = path.join(__dirname, '../../.env.local');
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8')
    .match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]
    ?.trim()
    .replace(/^"|"$/g, '');
}

/** Ensure getDb() can see a URL discovered in web/.env.local. */
export function ensureDbEnv(): string | undefined {
  const url = localEnv('APP_DATABASE_URL') ?? localEnv('DATABASE_URL');
  if (!url) return undefined;
  if (!process.env.APP_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.APP_DATABASE_URL = url;
  }
  return url;
}

export function runtimeDbUrl(): string | undefined {
  return process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? ensureDbEnv();
}

/**
 * DB URL for the behavioral invariants (licensing, tenancy). Returns undefined when no DB is
 * configured so the suite can `describe.skipIf`.
 *
 * THROWS only in the dedicated `db-invariants` CI job, which sets REQUIRE_DB=1 and runs ONLY
 * when the Neon test-branch secret is present (.github/workflows/audit.yml). There, a missing
 * URL is a misconfiguration and must fail loudly. The main `audit` job runs WITHOUT REQUIRE_DB,
 * so these suites skip there (they still get a real run in the separate db-invariants job, and
 * locally where .env.local supplies a DB). This split (owner-approved 2026-07-15) replaced the
 * always-throw-in-CI that red-failed every push while the test branch was pending — perpetual
 * red is an ignored signal, not a live one. The honesty is preserved by the SEPARATE job, which
 * is visibly skipped (with a warning annotation) until the secret exists, not a silent in-suite skip.
 */
export function requireDbInCi(): string | undefined {
  const url = ensureDbEnv();
  if (!url && process.env.REQUIRE_DB === '1') {
    throw new Error(
      'db-invariants job has no APP_DATABASE_URL — the APP_DATABASE_URL_TEST secret (Neon test branch) is ' +
        'missing/empty. This job must run against a real test DB. See docs/SECURITY.md / OWNER_ACTIONS §1.',
    );
  }
  return url;
}
