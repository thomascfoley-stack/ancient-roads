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

// ── the OWNER url, for suites that SEED their own fixtures ────────────────────
// Four invariants (library-published-boundary, sections-unit-ordinal,
// annotations-polymorphic, annotation-tables) INSERT into `sources`, which app_runtime is
// correctly refused (migration 010: SELECT only — probed 2026-07-29, "permission denied for
// table sources"). They therefore need an owner connection, separate from APP_DATABASE_URL.
//
// Each of them had hand-rolled the same check:
//     if (!/ep-tiny-hat|ep-holy-rice-athhpp5z|localhost|127\.0\.0\.1/.test(url)) return undefined;
// which is right about the danger — these suites seed AND DELETE, so they must never point at
// production — but it hardcodes the DEV endpoints, so a CI test branch can never satisfy it and
// all four skip in CI no matter which secrets are set. Four copies of one rule is also how the
// cutover's guards drifted into two distinct fail-open bugs (scripts/lib/target-guard.mjs).
//
// One definition, three rules:
//   1. PRODUCTION IS REFUSED LOUDLY — a throw, not a skip. A silent skip is how "never seed on
//      prod" would quietly become "did not run"; if someone points this at prod, they must see it.
//   2. dev and localhost are allowed, as before.
//   3. any other endpoint must be DECLARED, by exact endpoint id, in SEED_TEST_ENDPOINT — the
//      same declared-target discipline scripts/lib/target-guard.mjs uses, and compared as an
//      endpoint ID, never a substring (`CUTOVER_EXPECT_HOST=neon.tech` authorised the whole
//      account once already).
const PROD_ENDPOINT = 'ep-odd-fog';
const DEV_ENDPOINTS = ['ep-tiny-hat', 'ep-holy-rice-athhpp5z'];

/** The Neon endpoint id (first DNS label) of a host, connection string, or bare id; else null. */
export function endpointIdOf(s: string | undefined): string | null {
  if (!s) return null;
  const first = String(s).toLowerCase().replace(/^.*@/, '').split('/')[0]!.split('.')[0]!.trim();
  return /^ep-[a-z0-9]+(-[a-z0-9]+)+$/.test(first) ? first : null;
}

/** Owner URL for a seeding suite, or undefined to skip. THROWS if pointed at production. */
export function seedOwnerUrl(): string | undefined {
  const url = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
  if (!url) return undefined;
  const id = endpointIdOf(url);
  if (id === null) return /localhost|127\.0\.0\.1/.test(url) ? url : undefined;
  if (id.startsWith(PROD_ENDPOINT)) {
    throw new Error(
      `REFUSING: seeding suite pointed at PRODUCTION (${id}). These suites INSERT and DELETE; `
      + 'they may never run against prod. Unset DATABASE_URL or point it at a test branch.',
    );
  }
  if (DEV_ENDPOINTS.some((d) => id.startsWith(d))) return url;
  const declared = endpointIdOf(process.env.SEED_TEST_ENDPOINT);
  return declared !== null && declared === id ? url : undefined;
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
