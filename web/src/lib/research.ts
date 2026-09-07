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
import { THREAD_PERSONA, HISTORY_PERSONA } from './thread-personas';
export { THREAD_PERSONA };
import { truncateCodePoints } from './text';
import { FORBIDDEN_PROVENANCE_DOMAINS } from './forbidden-provenance.mjs';
import type { TeacherResult } from './teacher/teach';

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

// The id check moved to lib/thread-id.ts (a client component needs it without this module);
// re-exported so this module's importers are unchanged.
import { isThreadId } from './thread-id';
export { isThreadId };

/** One transaction, one statement (I1-L2): thread + question row cannot orphan each other.
 *  Written BEFORE teach() runs (design I-2). Returns both ids; qid pairs the answer (I1-M1). */
export async function createThreadWithQuestion(
  userId: string,
  question: string,
): Promise<{ threadId: string; qid: string }> {
  const title = question.length > TITLE_MAX ? `${truncateCodePoints(question, TITLE_MAX - 1)}…` : question;
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

/**
 * Owner-scoped hard delete of one research thread. Returns false for absent OR not-owned —
 * indistinguishable on purpose, exactly as `getThread` is: the caller gets a 404 either way and
 * never a 403 that would confirm somebody else's thread id exists.
 *
 * WHY DELETE IS ADMISSIBLE WHERE POST IS NOT (I-1, and see the amended
 * `research-history-static.test.ts`). I-1 exists because "a client that could write history rows
 * could store text that later re-renders as Ancient Paths output, attributed, in the product's
 * typography". That is a statement about ORIGINATING CONTENT. A delete cannot originate content:
 * it removes rows, it never authors one, so no text can enter the assistant-attributed render path
 * through here. The assistant row is still written in exactly one place, inside /api/ask/stream
 * from the object `teach()` returned, and that is unchanged.
 *
 * WHY HARD, NOT `is_archived = true`. The column exists and `listThreads` already honours it, so a
 * soft delete would be one word — but it would make "delete" a lie: the reader's question text
 * would still be on the account after the product told them it was gone. The QA pass that
 * prompted this filed nine threads as an OUTSTANDING ACTION ITEM on a real account; hiding them
 * does not discharge that.
 *
 * MESSAGES ARE DELETED EXPLICITLY even though `messages.chat_id` is `ON DELETE CASCADE`. A
 * referential action runs as the table owner and bypasses RLS, so relying on it would mean the
 * only thing standing between a thread's turns and deletion is a constraint this module does not
 * own. Both statements carry `user_id`, so the scoping is visible in the code that intends it.
 */
/** The personas a user may remove through the thread-delete path.
 *
 *  D49 (DEEP_SWEEP): this fenced on THREAD_PERSONA alone, so history threads — written by every
 *  /api/history/search as persona 'history' — could never be deleted by anything. The route
 *  answered 204 regardless, so the delete reported success and removed nothing, and the rows
 *  accumulated invisibly (no listing surface reads persona 'history' either).
 *
 *  The route's 204-always is NOT the defect and is deliberately unchanged: it is a documented
 *  anti-enumeration decision ("there is then NO existence oracle at all"). Answering 404 for
 *  "nothing deleted" would hand any caller a does-this-id-exist-and-is-it-mine probe — the same
 *  oracle class this sweep closed on sign-up. The STORE is made truthful instead, so 204 now
 *  means the delete really happened.
 *
 *  Exactly two personas. 'general' chats (POST /api/chats) stay fenced out: they are a different
 *  surface with a different contract, and widening this to "anything the user owns" would make a
 *  research-thread endpoint a general chat deleter. */
const DELETABLE_PERSONAS = [THREAD_PERSONA, HISTORY_PERSONA] as const;

export async function deleteThread(userId: string, threadId: string): Promise<boolean> {
  if (!isThreadId(threadId)) return false;
  const personas = [...DELETABLE_PERSONAS];
  const [, chatRows] = await runAsUser(userId, (sql) => [
    // THE `EXISTS` IS LOAD-BEARING, not defensive noise. `chats` holds more than research threads
    // — the persona fence below is what separates them — and the two statements run as one batch
    // with no branch between them. Without this clause, calling with the id of a NON-research chat
    // the caller owns would empty its messages while the chat row itself survived the persona
    // fence: a thread with no turns, and no error. Same fence, both statements.
    sql`DELETE FROM messages
        WHERE user_id = ${userId} AND chat_id = ${threadId}
          AND EXISTS (SELECT 1 FROM chats c
                      WHERE c.id = ${threadId} AND c.user_id = ${userId}
                        AND c.persona = ANY(${personas}))`,
    sql`DELETE FROM chats
        WHERE id = ${threadId} AND user_id = ${userId} AND persona = ANY(${personas})
        RETURNING id`,
  ]);
  return (chatRows as unknown[]).length > 0;
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
      // X1 (exhaustive pass): the positional fallback exists ONLY for pre-qid legacy rows.
      // A qid that is present but matches nothing attaches NOWHERE — attaching it to
      // whatever turn happens to be last is exactly the misattribution I1-M1 closed.
      const target = parsed.qid
        ? byQid.get(parsed.qid)
        : turns.length > 0 && turns[turns.length - 1]!.answer === null
          ? turns[turns.length - 1]
          : undefined;
      if (target && target.answer === null) target.answer = parsed;
    }
  }
  return { id: chat.id, title: chat.title, turns };
}

/** §4.4 corpus drift — which of these works are still published? Kept for work-level checks.
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

/** The register a chunk was surfaced under → the embeddings.source_type values that register
 *  can serve from (routing.ts's own filters: EXEGETICAL_TYPE_SQL, the lane filters, the
 *  song/verse types). Derived from how the pipeline retrieves, so the servability re-check
 *  queries exactly the rows the ask could have served. */
const REGISTER_SOURCE_TYPES: Record<string, string[]> = {
  commentary: ['commentary', 'father'],
  sermon: ['sermon'],
  theology: ['theology', 'confession'],
  song_verse: ['hymn', 'poetry'],
  historian: ['historian'],
};

/** §4.4, per ROW (live-battery finding P1): which of these (register, sourceId) chunks still
 *  have a served, provenance-clean embeddings row? Same predicate shape as the ask surface
 *  (user_id IS NULL AND served) over (source_type, source_id) pairs so the composite index
 *  is usable. FAILS CLOSED: on any error returns null and the caller tombstones everything —
 *  never renders text the check could not vouch for.
 *
 *  NOT resolveServability: that module's key universe is the STUDIES clipping format
 *  (namespace-prefixed `type:id`, kind==='clipping'), and reusing it here silently returned
 *  an empty servable set — every reopened thread tombstoned wholesale (P1). */
export async function servedOf(chunks: { register: string; sourceId: string }[]): Promise<Set<string> | null> {
  const pairs: [string, string][] = [];
  for (const c of chunks) {
    for (const t of REGISTER_SOURCE_TYPES[c.register] ?? []) pairs.push([t, c.sourceId]);
  }
  if (pairs.length === 0) return new Set();
  try {
    const sql = getDb();
    const types = pairs.map((p) => p[0]);
    const ids = pairs.map((p) => p[1]);
    // THE PROVENANCE BELT, grafted 2026-08-18 (pre-deploy audit, domain lens #6). This predicate
    // was `served` alone while its sibling resolveServability ALSO rejects rows whose sourceUrl
    // matches a forbidden aggregator — so a provenance-dirty-but-served row re-rendered on a
    // reopened /ask/[id] thread where the identical row would tombstone inside a study. Same
    // clause, copied in the sibling's exact form: IS NULL passes (corpus rows record provenance
    // elsewhere and a NULL here is not a violation), NOT EXISTS rejects — the positive spelling,
    // because a NOT-predicate over a NULL-evaluating row fails open (the watchlist's
    // three-valued-logic corollary).
    const rows = (await sql`
      SELECT DISTINCT e.source_id
        FROM embeddings e
        JOIN unnest(${types}::text[], ${ids}::text[]) AS p(t, sid)
          ON e.source_type = p.t AND e.source_id = p.sid
       WHERE e.user_id IS NULL AND e.served
         AND (e.metadata->>'sourceUrl' IS NULL OR NOT EXISTS (
                SELECT 1 FROM unnest(${FORBIDDEN_PROVENANCE_DOMAINS}::text[]) d
                WHERE lower(e.metadata->>'sourceUrl') LIKE '%' || d || '%'))`) as { source_id: string }[];
    return new Set(rows.map((r) => r.source_id));
  } catch (e) {
    console.error('research servedOf failed (rendering tombstones):', (e as Error).message);
    return null;
  }
}
