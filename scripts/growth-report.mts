// GROWTH REPORT — signups, campaigns, active users, churn. All of it from OUR OWN database.
//
// This is the whole analytics stack until roughly a thousand users, and it is deliberately a
// script rather than a dashboard: it runs as the OWNER, reads tables `app_runtime` cannot read by
// design (waitlist and every *_outcomes log are INSERT-only), and answers in one place the
// questions the owner actually asked — how many signed up, where they came from, how many people
// are active, and who has gone quiet.
//
// NOTHING HERE TOUCHES POSTHOG. That is the point: every number below survives deleting the
// analytics vendor tomorrow (docs/ANALYTICS.md — pageview history is the disposable half, by
// decision). If PostHog is gone, this report is unaffected.
//
//   DATABASE_URL=<owner-url> npx tsx scripts/growth-report.mts [--days 30]
//
// READ-ONLY. It measures; it never writes. Production still needs the owner's explicit go.

import pg from 'pg';

const url = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
if (!url) {
  console.error('DATABASE_URL (owner role) required');
  process.exit(1);
}

const i = process.argv.indexOf('--days');
const rawDays = i !== -1 ? Number(process.argv[i + 1]) : 30;
const days = Number.isInteger(rawDays) && rawDays > 0 && rawDays <= 3650 ? rawDays : 30;

const c = new pg.Client({ connectionString: url });
await c.connect();

/** Run a query; report a missing table as "not applied yet" rather than crashing the whole report. */
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const r = await c.query(sql, params);
    return r.rows as T[];
  } catch (e) {
    const m = (e as Error).message;
    if (/relation .* does not exist|column .* does not exist/.test(m)) {
      console.log(`   (skipped — ${m.split('\n')[0]})`);
      return [];
    }
    throw e;
  }
}

function table(rows: Record<string, unknown>[], empty = 'none'): void {
  if (rows.length === 0) return void console.log(`   ${empty}`);
  for (const r of rows) {
    console.log('   ' + Object.entries(r).map(([k, v]) => `${k}=${v}`).join('  '));
  }
}

console.log(`\n=== ANCIENT PATHS — growth report (last ${days} days) ===`);

// ── The list ────────────────────────────────────────────────────────────────────────────────────
// DISTINCT ON collapses the append-only signup log to one row per person. The log keeps every
// touch; the LIST is unique people, and dedupe belongs here rather than in a database constraint
// that would have thrown the extra touches away (migration 130).
console.log('\n— WAITLIST —');
table(await q(
  `SELECT count(*) AS submissions, count(DISTINCT email) AS people,
          count(DISTINCT email) FILTER (WHERE created_at > now() - ($1 || ' days')::interval) AS new_in_window
     FROM waitlist`,
  [String(days)],
));

console.log('\n— WHERE THEY CAME FROM (unique people, by campaign) —');
table(await q(
  `SELECT COALESCE(attribution->>'utm_source', '(direct/unknown)') AS source,
          COALESCE(attribution->>'utm_campaign', '-') AS campaign,
          count(*) AS people
     FROM (SELECT DISTINCT ON (email) email, attribution
             FROM waitlist ORDER BY email, created_at) first_touch
    GROUP BY 1, 2 ORDER BY people DESC LIMIT 20`,
));

// ── Activity ────────────────────────────────────────────────────────────────────────────────────
// One row per user per day (migration 130), so these are people, not page loads.
console.log('\n— ACTIVE USERS —');
table(await q(
  `SELECT count(DISTINCT user_id) FILTER (WHERE day = current_date) AS dau,
          count(DISTINCT user_id) FILTER (WHERE day > current_date - 7) AS wau,
          count(DISTINCT user_id) FILTER (WHERE day > current_date - 30) AS mau
     FROM user_active_day`,
));

console.log('\n— DAILY (last 14 days with activity) —');
table(await q(
  `SELECT day::text AS day, count(DISTINCT user_id) AS active
     FROM user_active_day WHERE day > current_date - 14
    GROUP BY day ORDER BY day DESC`,
));

// Churn, defined as the owner defined it — and with the positive leg that keeps it honest: a
// person who was never active has not churned, they simply never arrived.
console.log('\n— CHURN (was active, silent 7+ days) —');
table(await q(
  `WITH last_seen AS (SELECT user_id, max(day) AS seen FROM user_active_day GROUP BY 1)
   SELECT count(*) FILTER (WHERE seen <= current_date - 7) AS churned,
          count(*) FILTER (WHERE seen > current_date - 7)  AS active,
          count(*) AS ever_active
     FROM last_seen`,
));

// ── What people actually do ─────────────────────────────────────────────────────────────────────
console.log('\n— QUESTIONS ASKED —');
table(await q(
  `SELECT verdict, count(*) AS n, round(avg(latency_ms)) AS avg_ms
     FROM ask_outcomes WHERE created_at > now() - ($1 || ' days')::interval
    GROUP BY 1 ORDER BY n DESC`,
  [String(days)],
));

console.log('\n— SEARCHES BY SURFACE —');
table(await q(
  `SELECT surface, count(*) AS n, round(avg(result_count), 1) AS avg_results,
          count(*) FILTER (WHERE result_count = 0) AS zero_result
     FROM search_outcomes WHERE created_at > now() - ($1 || ' days')::interval
    GROUP BY 1 ORDER BY n DESC`,
  [String(days)],
));

// The most useful single list in this report: what people looked for and did NOT find. Every row
// is either a corpus gap or a retrieval bug, and both are worth knowing by name.
console.log('\n— SEARCHES THAT FOUND NOTHING (top 15) —');
table(await q(
  `SELECT query, count(*) AS times
     FROM search_outcomes
    WHERE result_count = 0 AND created_at > now() - ($1 || ' days')::interval
    GROUP BY 1 ORDER BY times DESC, query LIMIT 15`,
  [String(days)],
));

console.log('\n— SUPPRESSED ADDRESSES (never mail these) —');
table(await q(`SELECT reason, count(*) AS n FROM email_suppression GROUP BY 1 ORDER BY n DESC`));

console.log('');
await c.end();
