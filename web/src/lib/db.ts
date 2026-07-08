import { neon, type NeonQueryFunction, type NeonQueryPromise } from '@neondatabase/serverless';

type Sql = NeonQueryFunction<false, false>;

// Runtime connection uses the LEAST-PRIVILEGE, non-BYPASSRLS role (app_runtime) so
// Postgres RLS actually binds. `neondb_owner` (BYPASSRLS) is used only for
// migrations/DDL, never at runtime. Falls back to DATABASE_URL if APP_DATABASE_URL
// is unset (e.g., a dev box before the SEC-2 migration) — RLS is inert there, but the
// explicit WHERE user_id filters still isolate.
function runtimeUrl(): string {
  const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('APP_DATABASE_URL or DATABASE_URL must be set');
  return url.replace(/^"|"$/g, '');
}

export function getDb(): Sql {
  return neon(runtimeUrl());
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
