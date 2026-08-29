import { getDb } from './db';
import { logEvent } from './observability';

// Per-user fixed-window rate limit for the paid teacher endpoints (wallet-DoS
// guard). One atomic upsert per bucket against api_rate_limit (migration 008).
// See docs/SITE_GATE_RATELIMIT_DESIGN.md. Limits are env-tunable without a deploy.
//
// FAIL-CLOSED ON SPEND, fail-open on the site gate. These are deliberately different, and
// the ask limiter used to get it wrong (2026-08-02 deep audit, H2).
//
// The old reasoning — "a limiter outage must not take down the product; auth + the site gate
// still protect it" — does not survive the launch it was written for. The site gate comes off
// at SEC-1, registration is open, and every accepted /api/ask request is five paid upstream
// calls. So the fail-open branch meant: make the limiter's DB call throw, and the spend cap is
// gone. It was cheap to induce, because the limiter shares one Neon endpoint with the
// unauthenticated, unthrottled search routes — load on the free routes disabled the cap on the
// paid one. `bump()` also did `rows[0]!.count`, so a zero-row return was a TypeError, i.e. the
// fail-open path was reachable by RLS trouble or a pooler hiccup and not only by an outage.
//
// The honest trade: on a limiter fault, ask is briefly unavailable (503, retryable) rather than
// unmetered. The site-gate throttle keeps failing OPEN, because there the password is still
// required and locking real visitors out is the worse failure.

// Fail-fast on the env-tunable limits. `Number(process.env.X ?? d)` turned a typo — "ten",
// "1O", "10x" — into `NaN`, and `count > NaN` is always false, so one bad value silently
// disabled EVERY limit on its endpoint (cbd09b1 et al.). Validate at module load so a
// misconfiguration fails the boot with the offending name, rather than uncapping a paid
// route. Same shape as messages/route.ts's `parseLimit` (D12), applied to operator config.
export function parseRateLimitEnv(
  raw: string | undefined | null,
  defaultValue: number,
  name: string,
): number {
  if (raw === undefined || raw === null) return defaultValue;
  const n = Number(raw);
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid rate limit: ${name}="${raw}" must be a positive integer`);
  }
  return n;
}

const LIMIT_PER_MIN = parseRateLimitEnv(process.env.ASK_LIMIT_PER_MIN, 10, 'ASK_LIMIT_PER_MIN');
const LIMIT_PER_DAY = parseRateLimitEnv(process.env.ASK_LIMIT_PER_DAY, 100, 'ASK_LIMIT_PER_DAY');
// GLOBAL daily ceiling across ALL users (2026-08-02 deep audit, H1). The per-user caps bound
// what one account can spend; they bound the BILL only if accounts are scarce, and registration
// is open with no allowlist. This is the backstop that makes the worst case finite: it is not a
// fairness mechanism, it is the number above which something is wrong and a human should look.
// RAISED 2,000 -> 5,000 by owner ruling, 2026-08-07 (ADR-106), after pre-deploy audit A1-3 showed
// that 20 accounts at their full 100/day allowance exhausted the old ceiling for everyone. 5,000 is
// 50 accounts' worth, which does not close A1-3 — it is a bigger circuit breaker, not a fairness
// mechanism, and the ADR records that the real fix (reserved headroom / per-IP floor / priority
// tier) is deferred to before public launch.
//
// NOTE ON PRECEDENCE: this default is inert if `ASK_LIMIT_GLOBAL_PER_DAY` is set in the deployment
// environment. Raising the number in code does nothing on a host where the variable already exists.
const LIMIT_GLOBAL_PER_DAY = parseRateLimitEnv(process.env.ASK_LIMIT_GLOBAL_PER_DAY, 5_000, 'ASK_LIMIT_GLOBAL_PER_DAY');
/** The bucket key for the global cap. Not a user id — deliberately a constant. */
const GLOBAL_BUCKET_USER = '__global__';

// Site-gate brute-force throttle, per client IP. The gate password is the ONLY barrier on
// the pre-launch site (SEC-1 open), and the check had no throttle — a wordlist could pick it
// with no signal. Tight caps: a human types the password once or twice, so 10/min + 60/hour
// per IP is generous for a human and hostile to a script. Env-tunable, no deploy needed.
const GATE_LIMIT_PER_MIN = parseRateLimitEnv(process.env.GATE_LIMIT_PER_MIN, 10, 'GATE_LIMIT_PER_MIN');
const GATE_LIMIT_PER_HOUR = parseRateLimitEnv(process.env.GATE_LIMIT_PER_HOUR, 60, 'GATE_LIMIT_PER_HOUR');

// Auth-proxy throttle (owner directive 2026-08-15; finding: docs/UX_REMEDIATION.md §9,
// filed 2026-08-08). Since the Neon Auth cutover (ADR-107/108), better-auth runs on
// Neon's hosted servers and this app's /api/auth/[...path] route is a bare HTTP proxy —
// A1-2's Better Auth storage adapter has no plugin point to attach to (0 call sites),
// so sign-in, sign-up and password-reset were unthrottled at fleet width. This limiter
// sits IN FRONT OF the proxy, keyed by IP plus the email in the body when present (an
// attacker rotating IPs behind one target account still hits the email bucket).
//
// Neon's hosted service may enforce its own limits, but that is UNPROVEN from this repo
// (docs/AUTH_CUTOVER_V2_NEON.md: "Confirm Neon's limits, or the finding re-opens" — never
// confirmed), so the app-level limiter is built, not assumed away.
//
// FAIL-OPEN-WITH-LOG, deliberately — same posture as the site-gate throttle below, and
// deliberately UNLIKE the ask limiter and the old Better Auth adapter: these endpoints
// spend nothing (no embeddings, no mail on our bill), the credential itself remains the
// barrier, and failing closed here would turn a limiter-DB hiccup into a total sign-in
// outage while Neon's hosted auth service is still up. Every fail-open is logged
// (rate_limit_fail_open) so a silent open door is at least a loud one.
const AUTH_LIMIT_PER_MIN = parseRateLimitEnv(process.env.AUTH_LIMIT_PER_MIN, 10, 'AUTH_LIMIT_PER_MIN');
const AUTH_LIMIT_PER_HOUR = parseRateLimitEnv(process.env.AUTH_LIMIT_PER_HOUR, 60, 'AUTH_LIMIT_PER_HOUR');
const AUTH_EMAIL_LIMIT_PER_MIN = parseRateLimitEnv(process.env.AUTH_EMAIL_LIMIT_PER_MIN, 5, 'AUTH_EMAIL_LIMIT_PER_MIN');
const AUTH_EMAIL_LIMIT_PER_HOUR = parseRateLimitEnv(process.env.AUTH_EMAIL_LIMIT_PER_HOUR, 30, 'AUTH_EMAIL_LIMIT_PER_HOUR');

// The credential-bearing auth subpaths (hosted better-auth's route names, as they arrive
// at /api/auth/<segment>/...). Session reads (get-session, list-sessions, ...) are NOT
// throttled — they are high-frequency and unauthenticated-reading, and the proxy's GETs
// never reach the limiter anyway (the wrapper throttles POST only).
const AUTH_LIMITED_SEGMENTS = new Set([
  'sign-in',
  'sign-up',
  'forget-password',
  'request-password-reset',
  'reset-password',
  // D18 (DEEP_SWEEP): change-password is credential-bearing — better-auth verifies
  // `currentPassword` server-side, so an unthrottled proxy gave anyone holding a live session
  // (unattended shared device, stolen cookie) unlimited online guesses at the account password.
  // The brute-force class this limiter exists for, sitting outside its allowlist.
  'change-password',
  // D50: unthrottled verification mail is mail-spend and mailbox harassment keyed to any
  // registered address. Whether the hosted better-auth config enables it cannot be determined
  // from this repo — throttled regardless, because throttling an unused endpoint costs nothing.
  'send-verification-email',
]);

/** True when `pathname` is one of the credential-bearing auth endpoints. */
export function isAuthLimitedPath(pathname: string): boolean {
  const seg = pathname.replace(/^\/api\/auth\/?/, '').split('/')[0] ?? '';
  return AUTH_LIMITED_SEGMENTS.has(seg);
}

type Sql = ReturnType<typeof getDb>;

export interface RateLimitResult {
  ok: boolean;
  /** 'unavailable' = the limiter itself failed and the request was denied (fail-closed). */
  limited?: 'min' | 'day' | 'hour' | 'global' | 'unavailable';
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
  // NOT `rows[0]!.count`. A zero-row return — RLS on api_rate_limit, a missing grant, a pooler
  // hiccup — threw a TypeError, and the catch above used to turn that into an ALLOW. Explicit.
  if (!rows[0]) throw new Error(`rate-limit bump returned no row for bucket ${bucket}`);
  return rows[0].count;
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
    // Global ceiling last, so a single user's burst is attributed to them by the caps above
    // before it counts against everyone.
    const globalCount = await bump(sql, GLOBAL_BUCKET_USER, 'ask:global:day', dayStart);
    if (globalCount > LIMIT_GLOBAL_PER_DAY) {
      logEvent('rate_limit_hit', { userId, cap: 'global', count: globalCount, limit: LIMIT_GLOBAL_PER_DAY });
      return { ok: false, limited: 'global', retryAfterSec: 3600 };
    }
    await maybeSweep(sql);
    return { ok: true };
  } catch (e) {
    // FAIL CLOSED. See the header: an unmetered paid endpoint is the worse outcome, and this
    // branch was reachable by a zero-row return, not only by an outage.
    logEvent('rate_limit_fail_closed', { userId, error: (e as Error).message });
    return { ok: false, limited: 'unavailable', retryAfterSec: 30 };
  }
}

// Per-user throttle for user-corpus search, which spends a DeepInfra embedding on the request
// path (`embedChunks([q])`).
//
// ITS OWN BUCKETS, not `ask:*`. A corpus search is one embedding; an ask is a full teach() with
// retries. Charging searches against the ask quota would let a reader exhaust their questions by
// searching their own uploads, which is a worse failure than the one being fixed. Same table, new
// keys — `api_rate_limit` is keyed by an opaque bucket string, so this needs no migration.
//
// FAILS CLOSED, for the reason the ask limiter's header gives: an unmetered paid endpoint is the
// worse outcome. Until 2026-08-17 this route had NO limiter at all and the wallet invariant was
// green over it, because `routeSpendsMoney` matched `teach()` alone while being named for spend
// in general (pre-deploy audit finding 1).
const CORPUS_SEARCH_PER_MIN = parseRateLimitEnv(process.env.CORPUS_SEARCH_LIMIT_PER_MIN, 30, 'CORPUS_SEARCH_LIMIT_PER_MIN');
const CORPUS_SEARCH_PER_DAY = parseRateLimitEnv(process.env.CORPUS_SEARCH_LIMIT_PER_DAY, 500, 'CORPUS_SEARCH_LIMIT_PER_DAY');

export async function checkCorpusSearchRateLimit(userId: string, sql: Sql = getDb()): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const minStart = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
    const d = new Date(now);
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();

    // Minute before day, so a retry loop cannot burn the daily quota (the H4 pattern).
    const minCount = await bump(sql, userId, 'corpus-search:min', minStart);
    if (minCount > CORPUS_SEARCH_PER_MIN) {
      logEvent('rate_limit_hit', { userId, cap: 'corpus-search:min', count: minCount, limit: CORPUS_SEARCH_PER_MIN });
      return { ok: false, limited: 'min', retryAfterSec: 60 };
    }
    const dayCount = await bump(sql, userId, 'corpus-search:day', dayStart);
    if (dayCount > CORPUS_SEARCH_PER_DAY) {
      logEvent('rate_limit_hit', { userId, cap: 'corpus-search:day', count: dayCount, limit: CORPUS_SEARCH_PER_DAY });
      return { ok: false, limited: 'day', retryAfterSec: 3600 };
    }
    await maybeSweep(sql);
    return { ok: true };
  } catch (e) {
    logEvent('rate_limit_fail_closed', { userId, error: (e as Error).message });
    return { ok: false, limited: 'unavailable', retryAfterSec: 30 };
  }
}

// Per-user throttle for user-corpus UPLOAD and per-document RETRY (2026-08-20 uploader deep
// dive, H5a). Each accepted upload spends DeepInfra embedding money through the after() drain,
// and the retry route re-embeds the WHOLE document while zeroing `attempts` — so MAX_ATTEMPTS
// bounds consecutive failures, never spend. Until this limiter neither route had any meter, and
// the wallet invariant could not see them (`routeSpendsMoney` graded the route file's text while
// the spend sits one hop away in queue.ts's drain).
//
// ITS OWN BUCKETS, for checkCorpusSearchRateLimit's reason: an upload is a whole document's
// embedding batch, a search is one embedding, an ask is a full teach() — charging any against
// another's quota couples features that should degrade independently. FAILS CLOSED: an unmetered
// paid endpoint is the worse outcome (the ask limiter's header).
//
// Exported so the wallet/H5 suites pin the shipped numbers rather than restating them.
export const CORPUS_UPLOAD_PER_MIN = parseRateLimitEnv(process.env.CORPUS_UPLOAD_LIMIT_PER_MIN, 10, 'CORPUS_UPLOAD_LIMIT_PER_MIN');
export const CORPUS_UPLOAD_PER_DAY = parseRateLimitEnv(process.env.CORPUS_UPLOAD_LIMIT_PER_DAY, 100, 'CORPUS_UPLOAD_LIMIT_PER_DAY');

export async function checkCorpusUploadRateLimit(userId: string, sql: Sql = getDb()): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const minStart = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
    const d = new Date(now);
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();

    // Minute before day, so a retry loop cannot burn the daily quota (the H4 pattern).
    const minCount = await bump(sql, userId, 'corpus-upload:min', minStart);
    if (minCount > CORPUS_UPLOAD_PER_MIN) {
      logEvent('rate_limit_hit', { userId, cap: 'corpus-upload:min', count: minCount, limit: CORPUS_UPLOAD_PER_MIN });
      return { ok: false, limited: 'min', retryAfterSec: 60 };
    }
    const dayCount = await bump(sql, userId, 'corpus-upload:day', dayStart);
    if (dayCount > CORPUS_UPLOAD_PER_DAY) {
      logEvent('rate_limit_hit', { userId, cap: 'corpus-upload:day', count: dayCount, limit: CORPUS_UPLOAD_PER_DAY });
      return { ok: false, limited: 'day', retryAfterSec: 3600 };
    }
    await maybeSweep(sql);
    return { ok: true };
  } catch (e) {
    logEvent('rate_limit_fail_closed', { userId, error: (e as Error).message });
    return { ok: false, limited: 'unavailable', retryAfterSec: 30 };
  }
}

const HISTORY_SEARCH_PER_MIN = parseRateLimitEnv(process.env.HISTORY_SEARCH_LIMIT_PER_MIN, 30, 'HISTORY_SEARCH_LIMIT_PER_MIN');
const HISTORY_SEARCH_PER_DAY = parseRateLimitEnv(process.env.HISTORY_SEARCH_LIMIT_PER_DAY, 500, 'HISTORY_SEARCH_LIMIT_PER_DAY');

/** History search (HISTORY_RETRIEVAL_DESIGN §4). Same caps and FAIL-CLOSED posture as corpus
 *  search: a limiter outage refuses search rather than uncapping it — search is never
 *  load-bearing the way the site gate is, so the asymmetry argument cuts the other way here. */
export async function checkHistorySearchRateLimit(userId: string, sql: Sql = getDb()): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const minStart = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
    const d = new Date(now);
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
    // Minute before day, so a retry loop cannot burn the daily quota (the H4 pattern).
    const minCount = await bump(sql, userId, 'history-search:min', minStart);
    if (minCount > HISTORY_SEARCH_PER_MIN) {
      logEvent('rate_limit_hit', { userId, cap: 'history-search:min', count: minCount, limit: HISTORY_SEARCH_PER_MIN });
      return { ok: false, limited: 'min', retryAfterSec: 60 };
    }
    const dayCount = await bump(sql, userId, 'history-search:day', dayStart);
    if (dayCount > HISTORY_SEARCH_PER_DAY) {
      logEvent('rate_limit_hit', { userId, cap: 'history-search:day', count: dayCount, limit: HISTORY_SEARCH_PER_DAY });
      return { ok: false, limited: 'day', retryAfterSec: 3600 };
    }
    await maybeSweep(sql);
    return { ok: true };
  } catch (e) {
    logEvent('rate_limit_fail_closed', { userId, error: (e as Error).message });
    return { ok: false, limited: 'unavailable', retryAfterSec: 30 };
  }
}

// Per-IP brute-force throttle for the site-password gate. Same fail-open asymmetry as the
// ask limiter: a limiter outage must not lock legitimate visitors out (the password is still
// required regardless), but each throttled attempt is logged. Minute cap checked first so a
// burst can't burn the hour bucket (H4 pattern). `ip` should already be a single client IP.
export async function checkGateRateLimit(
  ip: string,
  sql: Sql = getDb(),
  /** Per-minute cap override. The public read routes reuse this limiter with a looser cap
   *  (2026-08-02 deep audit, H3) — same table, same window, same deliberate fail-OPEN posture,
   *  because a limiter outage must not black out a library of public-domain text. */
  perMin: number = GATE_LIMIT_PER_MIN,
): Promise<RateLimitResult> {
  const key = `gate:${ip}`;
  try {
    const now = Date.now();
    const minStart = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
    const hourStart = new Date(Math.floor(now / 3_600_000) * 3_600_000).toISOString();

    const minCount = await bump(sql, key, 'gate:min', minStart);
    if (minCount > perMin) {
      logEvent('gate_rate_limit_hit', { ip, cap: 'min', count: minCount, limit: perMin });
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

// Per-IP (and per-email, when the body carried one) throttle for the auth proxy's
// credential endpoints — see the header block above for why this exists and why it fails
// OPEN. Same table (api_rate_limit, migration 008), same atomic upsert, same
// minute-before-hour ordering (H4) so a refused burst can't burn the hourly bucket.
// `email` should already be lowercased by the caller; the key is lowercased again here
// so a mixed-case body can never split one account across two buckets.
export async function checkAuthRateLimit(
  ip: string,
  email: string | null,
  sql: Sql = getDb(),
): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const minStart = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
    const hourStart = new Date(Math.floor(now / 3_600_000) * 3_600_000).toISOString();

    // Subject keys: the IP always; the account under attack when the body names it.
    // One counter pair per subject, so each cap binds independently.
    const subjects: Array<{ key: string; perMin: number; perHour: number }> = [
      { key: `auth:ip:${ip}`, perMin: AUTH_LIMIT_PER_MIN, perHour: AUTH_LIMIT_PER_HOUR },
    ];
    if (email) {
      subjects.push({
        key: `auth:email:${email.toLowerCase()}`,
        perMin: AUTH_EMAIL_LIMIT_PER_MIN,
        perHour: AUTH_EMAIL_LIMIT_PER_HOUR,
      });
    }

    for (const { key, perMin, perHour } of subjects) {
      const minCount = await bump(sql, key, 'auth:min', minStart);
      if (minCount > perMin) {
        logEvent('rate_limit_hit', { userId: key, cap: 'min', count: minCount, limit: perMin });
        return { ok: false, limited: 'min', retryAfterSec: 60 };
      }
      const hourCount = await bump(sql, key, 'auth:hour', hourStart);
      if (hourCount > perHour) {
        logEvent('rate_limit_hit', { userId: key, cap: 'hour', count: hourCount, limit: perHour });
        return { ok: false, limited: 'hour', retryAfterSec: 3600 };
      }
    }
    await maybeSweep(sql);
    return { ok: true };
  } catch (e) {
    // FAIL OPEN, logged. See the header: availability of sign-in outranks an unmetered
    // window during a limiter-DB outage, and the event makes the open door audible.
    logEvent('rate_limit_fail_open', { userId: `auth:ip:${ip}`, error: (e as Error).message });
    return { ok: true };
  }
}
