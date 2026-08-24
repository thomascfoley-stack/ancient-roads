import 'server-only';
import { after } from 'next/server';
import { getDb, runAsUser } from '@/lib/db';
import { logEvent } from '@/lib/observability';
import { truncateCodePoints } from '@/lib/text';

// ── search_outcomes — one row per completed search (migration 129; owner directive
// 2026-08-23: "when users run queries searches etc we need to see all of that") ────────────
// ask-outcomes.ts made /ask durable; every OTHER query surface evaporated at the route
// boundary. This module is the durable sink for the five search surfaces. It runs OFF the
// request path (after(), fire-and-forget fallback below) and FAILS OPEN: a logging failure
// must never break a search, so recordSearchOutcome swallows its own errors into one caught
// log line — the ask-outcomes.ts contract, verbatim.
//
// The row stores the user's own INPUT (query + validated filter params) and counts — never
// corpus text, never result snippets. The query text IS stored, same column decision as 116:
// that is a DB column decision, NOT a licence to log it — observability.ts's no-question-text
// contract stands, and nothing here calls logEvent with the query.

/** The five logged surfaces. 'works' and 'commentaries' are the public /search engines
 *  (user_id stays NULL there — see the migration header for why no session is resolved);
 *  'library' is the study editor's panel, 'my_works' is Lane B's private-corpus search,
 *  'history' is the historians lane. */
export type SearchSurface = 'works' | 'commentaries' | 'library' | 'my_works' | 'history';

/** Validated, route-parsed filter values only — never a raw URL or an unparsed body. */
export type SearchParams = Record<string, string | number | boolean | string[]>;

export type SearchOutcomeInput = {
  surface: SearchSurface;
  /** NULL on the public surfaces; the authed surfaces pass the session user. */
  userId: string | null;
  query: string;
  params?: SearchParams;
  /** Rows returned on this page. */
  resultCount: number;
  /** Corpus-wide match count where the surface reports one. */
  total?: number | null;
  latencyMs: number;
};

type SearchOutcomeRow = {
  user_id: string | null;
  surface: SearchSurface;
  query: string;
  params: SearchParams;
  result_count: number;
  total: number | null;
  latency_ms: number;
};

/** Pure row builder — exported for the write-path tests. Never throws on a shaped input. */
export function buildSearchOutcomeRow(input: SearchOutcomeInput): SearchOutcomeRow {
  return {
    user_id: input.userId,
    surface: input.surface,
    // 500 matches the ask cap and the widest route bound (user-corpus MAX_QUERY); the other
    // routes bound tighter (200) before this is reached. Belt and braces, not the validator.
    query: truncateCodePoints(input.query, 500),
    params: input.params ?? {},
    result_count: Math.max(0, Math.round(input.resultCount)),
    total: input.total ?? null,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
  };
}

async function insertSearchOutcome(row: SearchOutcomeRow): Promise<void> {
  const params = JSON.stringify(row.params);
  // No RETURNING (RLS INSERT-only policy — the same row-visibility rule that shaped the
  // waitlist and ask_outcomes writes; see 034 and 116). Plain INSERT, JSONB via explicit cast.
  const statement = (sql: ReturnType<typeof getDb>) =>
    sql`INSERT INTO search_outcomes (user_id, surface, query, params, result_count, total, latency_ms)
        VALUES (${row.user_id}, ${row.surface}, ${row.query}, ${params}::jsonb,
                ${row.result_count}, ${row.total}, ${row.latency_ms})`;
  if (row.user_id !== null) {
    // User-attributed row ⇒ the write goes through runAsUser (db.ts rule), so the GUC is set
    // LOCAL and the policy's user_id branch binds.
    await runAsUser(row.user_id, (sql) => [statement(sql)]);
  } else {
    await statement(getDb());
  }
}

/**
 * Persists one search outcome. NEVER rejects — a logging failure (migration not applied
 * yet, pooler hiccup, permission drift) cannot break a search; it costs one caught error
 * line instead.
 */
export async function recordSearchOutcome(input: SearchOutcomeInput): Promise<void> {
  try {
    await insertSearchOutcome(buildSearchOutcomeRow(input));
  } catch (e) {
    const message = truncateCodePoints(String((e as Error)?.message ?? e), 300);
    console.error('[search_outcomes] persist failed:', message);
    logEvent('error', { where: 'search_outcomes.persist', message });
  }
}

/**
 * Schedules the write after the response completes (the after() pattern shared with
 * ask-outcomes.ts). after() throws outside a request scope, so the fallback is a plain
 * fire-and-forget promise — recordSearchOutcome never rejects, so nothing here can throw.
 */
export function scheduleSearchOutcome(input: SearchOutcomeInput): void {
  try {
    after(() => recordSearchOutcome(input));
  } catch {
    void recordSearchOutcome(input);
  }
}
