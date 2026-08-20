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
import type { HistoryResponse } from './history-search-db';

// research.ts owns persona 'ask' with the StoredAnswer contract; history stores a different
// contract (HistoryResponse), so it gets a parallel, deliberately-small pair rather than
// contorting research.ts's types. Same tables, same RLS path (runAsUser).


export const HISTORY_PERSONA = 'history';

export async function createHistoryThread(userId: string, query: string, payload: HistoryResponse): Promise<string> {
  const title = query.length > 80 ? `${query.slice(0, 77)}…` : query;
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO chats (user_id, title, persona) VALUES (${userId}, ${title}, ${HISTORY_PERSONA}) RETURNING id`,
  ]);
  const threadId = (rows as { id: string }[])[0]!.id;
  await runAsUser(userId, (sql) => [
    sql`INSERT INTO messages (user_id, chat_id, role, content)
        VALUES (${userId}, ${threadId}, 'user', ${query})`,
    sql`INSERT INTO messages (user_id, chat_id, role, content, sources)
        VALUES (${userId}, ${threadId}, 'assistant', 'history-results', ${JSON.stringify(payload)}::jsonb)`,
  ]);
  return threadId;
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
