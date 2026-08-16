// Research history — the /ask transcript store (docs/ASK_HISTORY_DESIGN.md, S1/S2).
//
// Threads are `chats` rows (persona 'ask'); turns are `messages` pairs (role 'user' question,
// role 'assistant' answer). Reuse, not new tables: S0.1/S0.2 measured 2026-08-16 — both tables
// exist on prod, app_runtime holds full DML, and each carries an ALL RLS policy. The H1 belt
// (explicit user_id in every WHERE, in addition to RLS) and the H2 belt (INSERT…SELECT…WHERE
// EXISTS ownership check) are copied from lib/chat.ts, which this deliberately mirrors.
//
// THE ONE NON-NEGOTIABLE (design §4.1, I-1): the assistant row is written SERVER-SIDE ONLY,
// from the object teach() returned, after the verifier passed. No API route accepts answer
// text from a client for storage — /api/research exposes GET only, and
// test/invariants/research-history-static.test.ts pins that.
//
// TRANSCRIPT, NOT CACHE (§4.5): nothing here looks up by question text. Threads are keyed by
// id and owner; a re-ask always runs the live pipeline and APPENDS. There is no content index
// and there must never be one.
import { runAsUser, getDb } from './db';
import type { TeacherResult } from './teacher/teach';

export const THREAD_PERSONA = 'ask';
const TITLE_MAX = 80;
const THREAD_LIST_MAX = 50;
/** Turns are messages pairs; 200 messages = 100 turns, far beyond any real thread today.
 *  Bounded because CLAUDE.md forbids unbounded result sets, not because we expect the limit. */
const THREAD_MESSAGES_MAX = 200;

export interface ResearchThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/** The assistant message's content column holds this, JSON-stringified. `v` versions the
 *  shape so a later renderer can migrate rather than guess. */
export interface StoredAnswer {
  v: 1;
  result: TeacherResult;
  lanes: Record<string, boolean>;
  attempts: number;
  latencyMs: number;
  askedAt: string;
  /** The question message this answers — I1-M1: pairing is by id, never by position, so a
   *  second-tab re-ask during a long in-flight ask cannot misattribute answers. Absent on
   *  rows written before 2026-08-16; getThread falls back to positional pairing for those. */
  qid?: string;
}

export interface ResearchTurn {
  question: string;
  askedAt: string;
  answer: StoredAnswer | null; // null = the ask crashed after the question row was written
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isThreadId(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

/** One transaction, one statement (I1-L2): thread + question row cannot orphan each other.
 *  Written BEFORE teach() runs (design I-2). Returns both ids; qid pairs the answer (I1-M1). */
export async function createThreadWithQuestion(
  userId: string,
  question: string,
): Promise<{ threadId: string; qid: string }> {
  const title = question.length > TITLE_MAX ? `${question.slice(0, TITLE_MAX - 1)}…` : question;
  const [rows] = await runAsUser(userId, (sql) => [
    sql`WITH c AS (
          INSERT INTO chats (user_id, title, persona) VALUES (${userId}, ${title}, ${THREAD_PERSONA})
          RETURNING id
        )
        INSERT INTO messages (user_id, chat_id, role, content)
        SELECT ${userId}, c.id, 'user', ${question} FROM c
        RETURNING chat_id, id`,
  ]);
  const row = (rows as { chat_id: string; id: string }[])[0]!;
  return { threadId: row.chat_id, qid: row.id };
}

/** Append a question to an EXISTING thread, before teach() runs (I-2). H2: INSERT…WHERE
 *  EXISTS — a threadId the caller does not own inserts zero rows and throws, never a
 *  cross-tenant write. Bumps updated_at (I1-L4) so a crashed ask still sorts current. */
export async function appendQuestion(userId: string, threadId: string, question: string): Promise<string> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO messages (user_id, chat_id, role, content)
        SELECT ${userId}, ${threadId}, 'user', ${question}
        WHERE EXISTS (SELECT 1 FROM chats WHERE id = ${threadId} AND user_id = ${userId} AND persona = ${THREAD_PERSONA})
        RETURNING id`,
    sql`UPDATE chats SET updated_at = now()
        WHERE id = ${threadId} AND user_id = ${userId} AND persona = ${THREAD_PERSONA}`,
  ]);
  const row = (rows as { id: string }[])[0];
  if (!row) throw new Error('thread not found or not owned by caller');
  return row.id;
}

export async function appendAnswer(userId: string, threadId: string, answer: StoredAnswer): Promise<void> {
  // The source index in `sources` carries the FULL surfaced list — retrieval AND lane chunks,
  // each with its register label (design §4.1; was retrieval-only, inspector 2 deviation D2).
  // Server-derived from the teach() return, like everything stored here.
  const index: { sourceId: string; author: string | null; work: string | null; register: string }[] = [];
  if (answer.result.kind !== 'empty') {
    const r = answer.result;
    for (const c of r.retrieval) {
      index.push({ sourceId: c.sourceId, author: c.metadata.author ?? null, work: c.metadata.work ?? null, register: 'commentary' });
    }
    const laneEntries = [
      ['sermon', r.sermons],
      ['theology', r.theology],
      ['song_verse', r.song_verse],
      ['historian', r.historians],
    ] as const;
    for (const [register, chunks] of laneEntries) {
      for (const c of chunks ?? []) {
        index.push({ sourceId: c.sourceId, author: c.metadata.author ?? null, work: c.metadata.work ?? null, register });
      }
    }
  }
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO messages (user_id, chat_id, role, content, sources)
        SELECT ${userId}, ${threadId}, 'assistant', ${JSON.stringify(answer)}, ${JSON.stringify(index)}::jsonb
        WHERE EXISTS (SELECT 1 FROM chats WHERE id = ${threadId} AND user_id = ${userId} AND persona = ${THREAD_PERSONA})
        RETURNING id`,
    sql`UPDATE chats SET updated_at = now()
        WHERE id = ${threadId} AND user_id = ${userId} AND persona = ${THREAD_PERSONA}`,
  ]);
  if ((rows as unknown[]).length === 0) throw new Error('thread not found or not owned by caller');
}

export async function listThreads(userId: string, limit = 20): Promise<ResearchThread[]> {
  const capped = Math.min(Math.max(1, limit), THREAD_LIST_MAX);
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, title, created_at, updated_at FROM chats
        WHERE user_id = ${userId} AND persona = ${THREAD_PERSONA} AND is_archived = false
        ORDER BY updated_at DESC LIMIT ${capped}`,
  ]);
  return rows as ResearchThread[];
}

export interface LoadedThread {
  id: string;
  title: string;
  turns: ResearchTurn[];
}

/** Owner-scoped read. Returns null for absent OR not-owned — indistinguishable on purpose
 *  (a 404, never a 403 that confirms the id exists). */
export async function getThread(userId: string, threadId: string): Promise<LoadedThread | null> {
  if (!isThreadId(threadId)) return null;
  const [chatRows, msgRows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, title FROM chats
        WHERE id = ${threadId} AND user_id = ${userId} AND persona = ${THREAD_PERSONA}`,
    // DESC then reverse (I1-M2): when a thread exceeds the bound, what falls off is the
    // OLDEST — the newest turn must always survive a reload.
    sql`SELECT id, role, content, created_at FROM messages
        WHERE user_id = ${userId} AND chat_id = ${threadId}
        ORDER BY created_at DESC, id DESC LIMIT ${THREAD_MESSAGES_MAX}`,
  ]);
  const chat = (chatRows as { id: string; title: string }[])[0];
  if (!chat) return null;

  const msgs = (msgRows as { id: string; role: string; content: string; created_at: string }[]).reverse();
  const turns: ResearchTurn[] = [];
  const byQid = new Map<string, ResearchTurn>();
  for (const m of msgs) {
    if (m.role === 'user') {
      const turn: ResearchTurn = { question: m.content, askedAt: m.created_at, answer: null };
      turns.push(turn);
      byQid.set(m.id, turn);
    } else if (m.role === 'assistant') {
      let parsed: StoredAnswer | undefined;
      try {
        const p = JSON.parse(m.content) as StoredAnswer;
        if (p && p.v === 1) parsed = p;
      } catch {
        // An unparsable stored answer renders as an unanswered question rather than crashing
        // the thread. Never fatal here.
      }
      if (!parsed) continue;
      // I1-M1: pair by question-message id when the answer carries one — positional pairing
      // misattributes when asks interleave (second tab during a 60-100s in-flight ask).
      // Positional is the fallback for pre-qid rows only.
      const target =
        (parsed.qid && byQid.get(parsed.qid)) ||
        (turns.length > 0 && turns[turns.length - 1]!.answer === null ? turns[turns.length - 1] : undefined);
      if (target && target.answer === null) target.answer = parsed;
    }
  }
  return { id: chat.id, title: chat.title, turns };
}

/** §4.4 corpus drift — which of these works are still published? A stored turn re-checks its
 *  sources at render; a withdrawn work keeps its attribution and loses its quote (tombstone).
 *  Corpus metadata, not user data: no user scoping, plain read. */
export async function publishedOf(slugs: string[]): Promise<Set<string>> {
  const distinct = [...new Set(slugs.filter(Boolean))];
  if (distinct.length === 0) return new Set();
  const sql = getDb();
  const rows = (await sql`SELECT slug FROM sources WHERE slug = ANY(${distinct}) AND status = 'published'`) as {
    slug: string;
  }[];
  return new Set(rows.map((r) => r.slug));
}
