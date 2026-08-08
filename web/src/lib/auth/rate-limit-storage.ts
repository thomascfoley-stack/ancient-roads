// Better Auth's rate limiter, backed by this repo's `api_rate_limit` table — audit A1-2 (HIGH).
//
// THE DEFECT. `authOptions` set neither `rateLimit.storage` nor `secondaryStorage`, so Better Auth
// fell through to its default:
//
//   storage: options.rateLimit?.storage || (options.secondaryStorage ? "secondary-storage" : "memory")
//
// "memory" is a module-level Map. On Vercel every concurrent lambda has its own, and every cold
// start resets it — so the library defaults (3 per 10s on sign-in/sign-up, 3 per 60s on
// forget-password) bounded ONE INSTANCE, not one attacker. Signup, signin and password-reset were
// effectively unthrottled at fleet width, on an app whose accounts are free and unverified.
//
// This repo already had the right mechanism and was not using it here: `api_rate_limit` (migration
// 008) backs `/api/gate` and `/api/ask`. Nothing new is needed — no table, no migration, no
// dependency. The grant is already in place (`008:29`).
//
// WHY `rateLimit.customStorage` AND NOT `secondaryStorage`. Setting `secondaryStorage` would ALSO
// relocate session storage, which is a far larger blast radius than the finding. `customStorage` is
// consulted first (`getRateLimitStorage`) and touches nothing else.
//
// WHY `consume` AND NOT `get`/`set`. Better Auth prefers an atomic `consume` and falls back to
// `legacyConsume` otherwise — whose own comment reads: "Non-atomic check-then-increment ... Under
// concurrency this is best-effort: simultaneous requests can each pass the check before either
// write lands." A limiter that loses races is not a limiter, and the attack this closes is by
// definition concurrent. One INSERT ... ON CONFLICT DO UPDATE ... RETURNING settles it in the
// database, which is the same shape `bump()` in lib/rate-limit.ts already uses.

import { getDb } from '@/lib/db';

type Sql = ReturnType<typeof getDb>;

/** Better Auth's per-rule settings for the path being consumed. `window` is seconds. */
export interface ConsumeRule {
  window: number;
  max: number;
}

export interface ConsumeResult {
  allowed: boolean;
  /** `null`, never `undefined` — Better Auth's `BetterAuthRateLimitStorage` types it that way. */
  retryAfter: number | null;
}

/**
 * Truncate to the start of the current fixed window.
 *
 * A fixed window, not a sliding one, because that is what `api_rate_limit`'s primary key
 * `(user_id, bucket, window_start)` expresses and what the existing ask limiter uses. The known
 * cost is the boundary burst — up to `2 * max` across an instant spanning two windows. That is
 * accepted here for the same reason it is accepted for `/api/ask`: it bounds the attack by a
 * constant factor, and the alternative (a sliding log) is a row per request.
 */
export function windowStart(rule: ConsumeRule, now: number): string {
  const ms = Math.max(rule.window, 1) * 1000;
  return new Date(Math.floor(now / ms) * ms).toISOString();
}

/** The row shape Better Auth's legacy path expects back from `get`. */
interface StoredRateLimit {
  key: string;
  count: number;
  lastRequest: number;
}

/**
 * The storage object handed to Better Auth as `rateLimit.customStorage`.
 *
 * `key` is whatever Better Auth chose to key the rule on (an IP, or a user id). It is stored in
 * `user_id` because that is the column's role in this table — the subject being limited — and it is
 * `text NOT NULL`, which an IP satisfies. The `auth` bucket keeps these rows distinguishable from
 * `ask:min` / `ask:day` / the gate's, so one sweep and one table serve all of them.
 */
export function createAuthRateLimitStorage(sqlFor: () => Sql = getDb) {
  // `get` and `set` exist because `BetterAuthRateLimitStorage` requires them, NOT because they run:
  // `onRequestRateLimit` calls `consume` when it is present and only falls back to `legacyConsume`
  // otherwise. They are implemented faithfully rather than stubbed, so that if a future Better Auth
  // ever bypasses `consume`, the fallback is still database-backed and still fails closed — a
  // throwing stub would turn that upgrade into an outage, and a permissive stub into an open door.
  //
  // `lastRequest` is reported as the window's START. Better Auth's legacy model is a sliding window
  // keyed on the last request; ours is a fixed window. Returning the window start makes its own test
  // (`now - lastRequest > windowInMs`) false inside the window and true after it, which is exactly
  // the fixed-window behaviour `consume` implements. The two paths therefore agree.
  const DEFAULT_WINDOW = 10;

  const readCount = async (key: string, start: string): Promise<number | null> => {
    const rows = (await sqlFor().query(
      `SELECT count FROM api_rate_limit WHERE user_id = $1 AND bucket = 'auth' AND window_start = $2`,
      [key, start],
    )) as Array<{ count: number }>;
    return rows[0] ? Number(rows[0].count) : null;
  };

  return {
    async get(key: string): Promise<StoredRateLimit | null> {
      const start = windowStart({ window: DEFAULT_WINDOW, max: 0 }, Date.now());
      try {
        const count = await readCount(key, start);
        return count === null ? null : { key, count, lastRequest: Date.parse(start) };
      } catch {
        // A read failure must not read as "no prior requests", which would ALLOW. Report the window
        // as already exhausted; the caller's own comparison then denies.
        return { key, count: Number.MAX_SAFE_INTEGER, lastRequest: Date.now() };
      }
    },

    async set(key: string, value: StoredRateLimit): Promise<void> {
      const start = windowStart({ window: DEFAULT_WINDOW, max: 0 }, Date.now());
      await sqlFor().query(
        `INSERT INTO api_rate_limit (user_id, bucket, window_start, count)
         VALUES ($1, 'auth', $2, $3)
         ON CONFLICT (user_id, bucket, window_start) DO UPDATE SET count = EXCLUDED.count`,
        [key, start, value.count],
      );
    },

    async consume(key: string, rule: ConsumeRule): Promise<ConsumeResult> {
      const start = windowStart(rule, Date.now());
      try {
        const rows = (await sqlFor().query(
          `INSERT INTO api_rate_limit (user_id, bucket, window_start, count)
           VALUES ($1, 'auth', $2, 1)
           ON CONFLICT (user_id, bucket, window_start)
           DO UPDATE SET count = api_rate_limit.count + 1
           RETURNING count`,
          [key, start],
        )) as Array<{ count: number }>;

        // NOT `rows[0]!.count`. A zero-row return — a missing grant, a pooler hiccup — would throw
        // a TypeError into the catch below, and the catch DENIES. Being explicit keeps the
        // fail-closed decision visible rather than incidental. Same reasoning as `bump()`.
        if (!rows[0]) throw new Error('auth rate-limit consume returned no row');

        const count = Number(rows[0].count);
        if (count <= rule.max) return { allowed: true, retryAfter: null };

        // Seconds until this window closes, so the client is not told to retry into the same bucket.
        const elapsed = (Date.now() - Date.parse(start)) / 1000;
        return { allowed: false, retryAfter: Math.max(1, Math.ceil(rule.window - elapsed)) };
      } catch {
        // FAIL CLOSED, matching `checkAskRateLimit`. If the limiter cannot answer, the request does
        // not proceed — an outage must not become an open door on sign-in and password-reset. The
        // error is deliberately not surfaced to the caller; Better Auth renders its own 429.
        return { allowed: false, retryAfter: rule.window };
      }
    },
  };
}
