import { getDb } from './db';

// Per-user fixed-window rate limit for the paid teacher endpoints (wallet-DoS
// guard). One atomic upsert per bucket against api_rate_limit (migration 008).
// See docs/SITE_GATE_RATELIMIT_DESIGN.md. Limits are env-tunable without a deploy.
//
// FAIL-OPEN asymmetry (deliberate, and distinct from the fail-CLOSED site gate):
// if the limiter's own DB call throws, we ALLOW the request — a limiter outage
// must not take down the product; auth + the site gate still protect it — but we
// log loudly so the failure is visible.

const LIMIT_PER_MIN = Number(process.env.ASK_LIMIT_PER_MIN ?? 10);
const LIMIT_PER_DAY = Number(process.env.ASK_LIMIT_PER_DAY ?? 100);

type Sql = ReturnType<typeof getDb>;

export interface RateLimitResult {
  ok: boolean;
  limited?: 'min' | 'day';
  retryAfterSec?: number;
}

// Atomic increment of one (user, bucket, window) counter; returns the new count.
async function bump(sql: Sql, userId: string, bucket: string, windowStart: string): Promise<number> {
  const rows = (await sql.query(
    `INSERT INTO api_rate_limit (user_id, bucket, window_start, count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (user_id, bucket, window_start)
     DO UPDATE SET count = api_rate_limit.count + 1
     RETURNING count`,
    [userId, bucket, windowStart],
  )) as Array<{ count: number }>;
  return rows[0]!.count;
}

// `sql` is injectable so the helper can be exercised against the real DB in tests
// and driven with a throwing handle to prove the fail-open path.
export async function checkAskRateLimit(userId: string, sql: Sql = getDb()): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const minStart = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
    const d = new Date(now);
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();

    const [minCount, dayCount] = await Promise.all([
      bump(sql, userId, 'ask:min', minStart),
      bump(sql, userId, 'ask:day', dayStart),
    ]);

    if (minCount > LIMIT_PER_MIN) {
      console.warn(`[ratelimit] user=${userId} HIT per-min cap (${minCount}/${LIMIT_PER_MIN}) → 429`);
      return { ok: false, limited: 'min', retryAfterSec: 60 };
    }
    if (dayCount > LIMIT_PER_DAY) {
      console.warn(`[ratelimit] user=${userId} HIT per-day cap (${dayCount}/${LIMIT_PER_DAY}) → 429`);
      return { ok: false, limited: 'day', retryAfterSec: 3600 };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[ratelimit] FAIL-OPEN — limiter DB error, allowing request for user=${userId}: ${(e as Error).message}`);
    return { ok: true };
  }
}
