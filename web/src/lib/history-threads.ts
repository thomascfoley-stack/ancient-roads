// History thread persistence — rides chats/messages with its OWN persona (no migration).
// research.ts owns persona 'ask' with the StoredAnswer contract; history stores a different
// contract (HistoryResponse), so it gets a parallel, deliberately-small pair rather than
// contorting research.ts's types. Same tables, same RLS path (runAsUser).
//
// SPLIT OUT of history-search-db.ts for §4.5 (transcript-not-cache): the static guard forbids
// text-search patterns in any file touching `messages`, and the search module legitimately runs
// FTS over CORPUS sections. Separate files make the invariant checkable: THIS file may never
// contain a tsquery; that one may never touch messages.
import { runAsUser } from './db';
import { truncateCodePoints } from './text';
import type { HistoryResponse } from './history-search-db';

// research.ts owns persona 'ask' with the StoredAnswer contract; history stores a different
// contract (HistoryResponse), so it gets a parallel, deliberately-small pair rather than
// contorting research.ts's types. Same tables, same RLS path (runAsUser).


export const HISTORY_PERSONA = 'history';

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
  return { query: q.content, payload: a.sources as HistoryResponse };
}
