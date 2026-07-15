import { getDb } from './db';
import { logEvent } from './observability';

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

// Site-gate brute-force throttle, per client IP. The gate password is the ONLY barrier on
// the pre-launch site (SEC-1 open), and the check had no throttle — a wordlist could pick it
// with no signal. Tight caps: a human types the password once or twice, so 10/min + 60/hour
// per IP is generous for a human and hostile to a script. Env-tunable, no deploy needed.
const GATE_LIMIT_PER_MIN = Number(process.env.GATE_LIMIT_PER_MIN ?? 10);
const GATE_LIMIT_PER_HOUR = Number(process.env.GATE_LIMIT_PER_HOUR ?? 60);

type Sql = ReturnType<typeof getDb>;

export interface RateLimitResult {
  ok: boolean;
  limited?: 'min' | 'day' | 'hour';
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

// M8: the sweep migration 008 promised. No cron infra, so run it opportunistically on
// ~1% of checks (served by the api_rate_limit_window_idx index) — bounds table growth
// without new infrastructure. Its own try swallows errors: a sweep must never affect a
// request. Windows older than 2 days can never be current (day window is 1 day).
async function maybeSweep(sql: Sql): Promise<void> {
  if (Math.random() >= 0.01) return;
  try {
    await sql.query(`DELETE FROM api_rate_limit WHERE window_start < now() - interval '2 days'`);
  } catch { /* sweep failure is irrelevant to the caller */ }
}

// `sql` is injectable so the helper can be exercised against the real DB in tests
// and driven with a throwing handle to prove the fail-open path.
export async function checkAskRateLimit(userId: string, sql: Sql = getDb()): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const minStart = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
    const d = new Date(now);
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();

    // H4: check the minute bucket FIRST and bail before touching the day bucket, so a
    // per-minute-limited burst (double-click / retry loop) cannot burn the daily quota.
    // Only requests that clear the minute cap consume a daily slot.
    const minCount = await bump(sql, userId, 'ask:min', minStart);
    if (minCount > LIMIT_PER_MIN) {
      logEvent('rate_limit_hit', { userId, cap: 'min', count: minCount, limit: LIMIT_PER_MIN });
      return { ok: false, limited: 'min', retryAfterSec: 60 };
    }
    const dayCount = await bump(sql, userId, 'ask:day', dayStart);
    if (dayCount > LIMIT_PER_DAY) {
      logEvent('rate_limit_hit', { userId, cap: 'day', count: dayCount, limit: LIMIT_PER_DAY });
      return { ok: false, limited: 'day', retryAfterSec: 3600 };
    }
    await maybeSweep(sql);
    return { ok: true };
  } catch (e) {
    // FAIL OPEN (allow) but log loudly — a limiter outage must not down the product.
    logEvent('rate_limit_fail_open', { userId, error: (e as Error).message });
    return { ok: true };
  }
}

// Per-IP brute-force throttle for the site-password gate. Same fail-open asymmetry as the
// ask limiter: a limiter outage must not lock legitimate visitors out (the password is still
// required regardless), but each throttled attempt is logged. Minute cap checked first so a
// burst can't burn the hour bucket (H4 pattern). `ip` should already be a single client IP.
export async function checkGateRateLimit(ip: string, sql: Sql = getDb()): Promise<RateLimitResult> {
  const key = `gate:${ip}`;
  try {
    const now = Date.now();
    const minStart = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
    const hourStart = new Date(Math.floor(now / 3_600_000) * 3_600_000).toISOString();

    const minCount = await bump(sql, key, 'gate:min', minStart);
    if (minCount > GATE_LIMIT_PER_MIN) {
      logEvent('gate_rate_limit_hit', { ip, cap: 'min', count: minCount, limit: GATE_LIMIT_PER_MIN });
      return { ok: false, limited: 'min', retryAfterSec: 60 };
    }
    const hourCount = await bump(sql, key, 'gate:hour', hourStart);
    if (hourCount > GATE_LIMIT_PER_HOUR) {
      logEvent('gate_rate_limit_hit', { ip, cap: 'hour', count: hourCount, limit: GATE_LIMIT_PER_HOUR });
      return { ok: false, limited: 'hour', retryAfterSec: 3600 };
    }
    await maybeSweep(sql);
    return { ok: true };
  } catch (e) {
    logEvent('rate_limit_fail_open', { userId: key, error: (e as Error).message });
    return { ok: true };
  }
}
