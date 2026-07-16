import { neon, type NeonQueryFunction, type NeonQueryPromise } from '@neondatabase/serverless';

type Sql = NeonQueryFunction<false, false>;

// Runtime connection uses the LEAST-PRIVILEGE, non-BYPASSRLS role (app_runtime) so
// Postgres RLS actually binds. `neondb_owner` (BYPASSRLS) is used only for
// migrations/DDL, never at runtime. Falls back to DATABASE_URL if APP_DATABASE_URL
// is unset (e.g., a dev box before the SEC-2 migration) — RLS is inert there, but the
// explicit WHERE user_id filters still isolate.
function isProd(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function runtimeUrl(): string {
  const app = process.env.APP_DATABASE_URL;
  // SECURITY (§0): in production the runtime MUST use the least-privilege app_runtime role
  // (APP_DATABASE_URL). Silently falling back to the BYPASSRLS owner (DATABASE_URL) makes
  // RLS inert for every private row — one missing Vercel env var = total isolation loss.
  // Fail hard rather than serve unprotected.
  if (isProd() && !app) {
    throw new Error(
      'SECURITY: APP_DATABASE_URL (least-privilege app_runtime) is required in production; ' +
        'refusing to fall back to the BYPASSRLS owner role (RLS would be inert).',
    );
  }
  const url = app ?? process.env.DATABASE_URL;
  if (!url) throw new Error('APP_DATABASE_URL or DATABASE_URL must be set');
  return url.replace(/^"|"$/g, '');
}

export function getDb(): Sql {
  return neon(runtimeUrl());
}

// Boot-time assertion (call from instrumentation.ts). Catches the case the sync config
// guard cannot: APP_DATABASE_URL is set but still points at a BYPASSRLS role. Runs once at
// startup, never per request.
//
// It is a CANARY, not the enforcement (that is per-request RLS in runAsUser). So it must not
// be a single point of total failure: a boot check that throws on a transient Neon hiccup
// ("other side closed" at serverless cold-start) takes the WHOLE app down with a 500 on every
// function. Therefore:
//   - retry across transient connection failures (survive cold-start),
//   - HARD-FAIL only on the real security condition: it connected and the role has BYPASSRLS,
//   - if it simply cannot reach the DB after retries, log loudly and SERVE anyway (per-request
//     RLS still binds; an unreachable DB fails per-request on its own, it does not leak).
const BOOT_ATTEMPTS = 4;
const BOOT_BACKOFF_MS = [200, 500, 1000];

export async function assertAppRuntimeRole(sql: Sql = getDb()): Promise<void> {
  if (!isProd()) return;
  let rows: { rolname: string; rolbypassrls: boolean }[] | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt < BOOT_ATTEMPTS; attempt++) {
    try {
      rows = (await sql`SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = current_user`) as {
        rolname: string;
        rolbypassrls: boolean;
      }[];
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < BOOT_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, BOOT_BACKOFF_MS[attempt] ?? 1000));
      }
    }
  }
  if (!rows) {
    // Could not reach the DB after retries. Do NOT brick the server.
    console.error(
      '[boot] assertAppRuntimeRole: could not reach the DB to verify the runtime role after ' +
        `${BOOT_ATTEMPTS} attempts; serving anyway (per-request RLS still binds). Last error: ` +
        String((lastErr as Error)?.message ?? lastErr),
    );
    return;
  }
  const role = rows[0];
  if (!role) {
    console.error('[boot] assertAppRuntimeRole: pg_roles empty for current_user; cannot verify. Serving anyway.');
    return;
  }
  if (role.rolbypassrls) {
    // THE security condition: connected fine, but the role can bypass RLS. Fail hard.
    throw new Error(
      `SECURITY: runtime DB role '${role.rolname}' has BYPASSRLS in production — RLS is inert. ` +
        'Point APP_DATABASE_URL at the app_runtime role.',
    );
  }
}

// Run user-scoped queries in ONE transaction with `app.current_user_id` set, so RLS
// binds for the request's user. EVERY query that touches a user-scoped table MUST go
// through this — if the var is not set, RLS returns zero rows (the backstop). The
// stateless HTTP driver cannot hold a session var across requests, so it is set LOCAL
// inside each transaction (survives the pooler's transaction-mode pooling).
//
// Returns the caller queries' result sets in order (the set_config result is dropped).
export async function runAsUser(
  userId: string,
  build: (sql: Sql) => NeonQueryPromise<false, false>[],
): Promise<unknown[][]> {
  const sql = getDb();
  const results = await sql.transaction([
    sql`select set_config('app.current_user_id', ${userId}, true)`,
    ...build(sql),
  ]);
  return results.slice(1) as unknown[][];
}
