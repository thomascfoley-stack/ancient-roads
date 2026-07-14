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
 * DB URL for the behavioral invariants (licensing, tenancy). Locally, returns undefined
 * when no DB is configured so the suite can `describe.skipIf` (dev convenience). IN CI it
 * THROWS instead of skipping — a green gate that executed ZERO of the licensing/tenancy
 * assertions is worse than a red one. To make CI green: create a Neon test branch and set
 * the APP_DATABASE_URL secret (wired in .github/workflows/audit.yml).
 */
export function requireDbInCi(): string | undefined {
  const url = ensureDbEnv();
  if (!url && process.env.CI) {
    throw new Error(
      'CI has no APP_DATABASE_URL/DATABASE_URL — the licensing + tenancy invariants would SKIP and the ' +
        'gate would report green having run zero assertions. Wire a Neon test-branch secret into ' +
        'audit.yml (see docs/SECURITY.md). A red gate beats a green one that ran nothing.',
    );
  }
  return url;
}
