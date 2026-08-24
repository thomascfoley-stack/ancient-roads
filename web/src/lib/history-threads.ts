// History thread persistence — rides chats/messages with its OWN persona (no migration).
// research.ts owns persona 'ask' with the StoredAnswer contract; history stores a different
// contract (HistoryResponse), so it gets a parallel, deliberately-small pair rather than
// contorting research.ts's types. Same tables, same RLS path (runAsUser).
//
// SPLIT OUT of history-search-db.ts for §4.5 (transcript-not-cache): the static guard forbids
// text-search patterns in any file touching `messages`, and the search module legitimately runs
// FTS over CORPUS sections. Separate files make the invariant checkable: THIS file may never
// contain a tsquery; that one may never touch messages.
import { runAsUser, getDb } from './db';
import { HISTORY_PERSONA } from './thread-personas';
export { HISTORY_PERSONA };
import { truncateCodePoints } from './text';
import type { HistoryResponse } from './history-search-db';

// research.ts owns persona 'ask' with the StoredAnswer contract; history stores a different
// contract (HistoryResponse), so it gets a parallel, deliberately-small pair rather than
// contorting research.ts's types. Same tables, same RLS path (runAsUser).



export async function createHistoryThread(userId: string, query: string, payload: HistoryResponse): Promise<string> {
  const title = query.length > 80 ? `${truncateCodePoints(query, 77)}…` : query;
  // One transaction, one statement — research.ts's I1-L2 on the same tables, with TWO message
  // rows (UNION ALL over the chat CTE). A failed message insert rolls the chat row back with
  // it: no orphan empty history chats (#113), which listing/delete fence out and
  // getHistoryThread reports as null. `NULL::jsonb` keeps `sources` typed across the union.
  const [rows] = await runAsUser(userId, (sql) => [
    sql`WITH c AS (
          INSERT INTO chats (user_id, title, persona) VALUES (${userId}, ${title}, ${HISTORY_PERSONA})
          RETURNING id
        )
        INSERT INTO messages (user_id, chat_id, role, content, sources)
        SELECT ${userId}, c.id, 'user', ${query}, NULL::jsonb FROM c
        UNION ALL
        SELECT ${userId}, c.id, 'assistant', 'history-results', ${JSON.stringify(payload)}::jsonb FROM c
        RETURNING chat_id`,
  ]);
  return (rows as { chat_id: string }[])[0]!.chat_id;
}

/** D19 — WHICH of these historian work slugs still serve?
 *
 *  `history-search-db.ts`'s SCOPE predicate ("a quarantined work must stop serving instantly
 *  even if its vectors still carry served=true. Fail closed.") runs only on NEW searches. A
 *  saved thread stores section excerpts as jsonb and re-renders them forever, so the same
 *  predicate has to run again at READ time — the history twin of research.ts's `servedOf`.
 *
 *  Work-level, not section-level, because quarantine is a work-level disposition: `sources.status`
 *  flips off 'published' for the whole work. Same three clauses as SCOPE, same join.
 *
 *  Returns null on ANY failure — the caller then drops everything. Never render text this
 *  check could not vouch for. */
export async function servedHistoryWorks(slugs: string[]): Promise<Set<string> | null> {
  if (slugs.length === 0) return new Set();
  try {
    const sql = getDb();
    const rows = (await sql.query(
      `SELECT DISTINCT src.slug
         FROM history_embeddings he
         JOIN sections s ON s.id = he.section_id
         JOIN sources src ON src.id = s.source_id
        WHERE src.slug = ANY($1)
          AND he.served AND src.status = 'published' AND src.source_type = 'historian'`,
      [slugs],
    )) as { slug: string }[];
    return new Set(rows.map((r) => r.slug));
  } catch (e) {
    console.error('[history] servability re-check failed, tombstoning thread:', String((e as Error)?.message ?? e));
    return null;
  }
}

/** Apply a servable-slug set to a stored payload. Pure, so the fail-closed posture is
 *  unit-testable without a database (history-thread-servability.test.ts).
 *
 *  `servable === null` means the check could not run — that drops EVERYTHING, it does not pass
 *  everything. Coverage is recomputed from survivors so the counts can never advertise a work
 *  that was just withdrawn. */
export function filterServableHistory(payload: HistoryResponse, servable: Set<string> | null): HistoryResponse {
  const ok = (slug: string): boolean => servable !== null && servable.has(slug);
  const results = payload.results.filter((r) => ok(r.work.slug));
  return {
    ...payload,
    closest: payload.closest && ok(payload.closest.work.slug) ? payload.closest : null,
    results,
    coverage: { works: results.length, sections: results.reduce((n, r) => n + r.sections.length, 0) },
  };
}

export async function getHistoryThread(
  userId: string, threadId: string,
): Promise<{ query: string; payload: HistoryResponse } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) return null;
  const [chatRows, msgRows] = await runAsUser(userId, (sql) => [
    sql`SELECT id FROM chats WHERE id = ${threadId} AND user_id = ${userId} AND persona = ${HISTORY_PERSONA}`,
    sql`SELECT role, content, sources FROM messages
        WHERE user_id = ${userId} AND chat_id = ${threadId} ORDER BY created_at ASC, id ASC LIMIT 4`,
  ]);
  if (!(chatRows as unknown[])[0]) return null;
  const msgs = msgRows as { role: string; content: string; sources: unknown }[];
  const q = msgs.find((m) => m.role === 'user');
  const a = msgs.find((m) => m.role === 'assistant');
  if (!q || !a?.sources) return null;
  // D19: re-check servability before this stored payload renders. A work quarantined since the
  // search was saved must stop appearing here the instant its `sources.status` flips.
  const stored = a.sources as HistoryResponse;
  const slugs = [...new Set(stored.results.map((r) => r.work.slug))];
  const payload = filterServableHistory(stored, await servedHistoryWorks(slugs));
  return { query: q.content, payload };
}
