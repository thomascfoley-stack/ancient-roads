import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/session';
import { isTeacherAllowed } from '@/lib/teacher-access';
import { checkAskRateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { logEvent } from '@/lib/observability';
import { teach, type TeacherEvent, type LaneFlags } from '@/lib/teacher/teach';
import { randomUUID } from 'node:crypto';
import { logAskOutcome } from '@/lib/ask-outcome-log';
import { scheduleAskOutcome } from '@/lib/ask-outcomes';
import { createThreadWithQuestion, appendQuestion, appendAnswer, isThreadId, type StoredAnswer } from '@/lib/research';

export const runtime = 'nodejs';
// MUST be a literal: Next 16 statically analyses route segment config and rejects a
// non-literal with "Invalid segment configuration export detected" -- which failed the
// whole production build (2026-08-01). ASK_MAX_DURATION_SEC stays the source of truth;
// test/ask-max-duration-literal.test.ts asserts this literal still equals it, so the two
// cannot drift. Do not re-import the constant here -- it does not build.
export const maxDuration = 300;

// Boundary-validate the caller-supplied lane toggles: each key, if present, must
// be a strict boolean — anything else (string "false", 0, null, ...) is dropped
// rather than coerced, so a malformed value falls back to the safe default
// (lane included) instead of silently doing the opposite of what was asked.
function parseLaneFlags(raw: unknown): LaneFlags {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const flags: LaneFlags = {};
  if (typeof r.songVerse === 'boolean') flags.songVerse = r.songVerse;
  if (typeof r.sermons === 'boolean') flags.sermons = r.sermons;
  if (typeof r.theology === 'boolean') flags.theology = r.theology;
  if (typeof r.historians === 'boolean') flags.historians = r.historians;
  return flags;
}

// POST /api/ask/stream { question, lanes? } → newline-delimited JSON (NDJSON)
// stream of TeacherEvents (retrieving → retrieved → composing → verifying →
// done). `lanes` optionally toggles the Sermons/Theology/Hymns/Historians register
// lanes
// (each defaults to included when omitted or malformed) — it never filters the
// exegetical commentary voices, which are always-on. The verifier runs
// server-side inside teach() before any `done` event, so the client never
// receives unverified model output. Authed-only. Pre-stream errors use the
// stable envelope (docs/API_ERRORS.md).
export async function POST(req: NextRequest) {
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    return apiError('UNAUTHENTICATED');
  }

  // ADR-116 ruling 3 (gated beta): the teacher is OWNER-ONLY until interpretation_bait earns
  // its >=99% bar (currently 100/100 = a ~97% lower bound). Placed BEFORE the rate limiter and
  // before any spend: a refused caller must cost nothing. The site password gate does not
  // cover this — a beta user has the password by definition.
  if (!isTeacherAllowed(user)) return apiError('FORBIDDEN');

  // Per-user rate limit before any spend (same guard as /api/ask; fails open).
  const rl = await checkAskRateLimit(user.id);
  if (!rl.ok) {
    // 'unavailable' is the limiter itself failing, and it now DENIES rather than allows
    // (2026-08-02 deep audit, H2) — an unmetered paid endpoint is the worse outcome. 'global'
    // is the all-users daily ceiling: the same 429 to the caller, a different line in the log.
    const code =
      rl.limited === 'unavailable'
        ? 'UPSTREAM_UNAVAILABLE'
        : rl.limited === 'day' || rl.limited === 'global'
          ? 'RATE_LIMIT_DAY'
          : 'RATE_LIMIT_MINUTE';
    return apiError(code, { retryAfterSec: rl.retryAfterSec });
  }

  const csrfFloor = requireJsonContentType(req);
  if (csrfFloor) return csrfFloor;

  let body: { question?: unknown; lanes?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST');
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return apiError('INVALID_REQUEST', { message: 'A question is required.' });
  if (question.length > 500) return apiError('INVALID_REQUEST', { message: 'That question is too long (max 500 characters).' });
  const lanes = parseLaneFlags(body.lanes);
  // Optional: append to an existing thread. Anything that is not a well-formed uuid is treated
  // as absent (a new thread), never an error — the transcript is an aid, not a gate.
  const requestedThreadId = isThreadId((body as { threadId?: unknown }).threadId)
    ? ((body as { threadId: string }).threadId)
    : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (e: TeacherEvent | { stage: 'error'; message: string } | { stage: 'thread'; threadId: string } | { stage: 'saved'; ok: boolean } | { stage: 'outcome'; askOutcomeId: string }) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      };
      const startedAt = Date.now();

      // ── Research history, S1 (design §4.1) ─────────────────────────────────────────────
      // The QUESTION row is written BEFORE teach() runs (I-2): a question that crashes the
      // pipeline is exactly the one the reader wants back. Every persistence step is
      // fail-open — history must never break an ask — and the failure is REPORTED (the §4.6 saved signal's
      // `saved` signal), never silent. The assistant row is written only here, server-side,
      // from the object teach() returned (I-1).
      let threadId: string | null = null;
      let qid: string | null = null;
      try {
        if (requestedThreadId) {
          qid = await appendQuestion(user.id, requestedThreadId, question); // H2 belt: throws if not owned
          threadId = requestedThreadId;
        } else {
          // One statement, one transaction (I1-L2): the thread and its first question cannot
          // orphan each other.
          const created = await createThreadWithQuestion(user.id, question);
          threadId = created.threadId;
          qid = created.qid;
        }
        write({ stage: 'thread', threadId });
      } catch (e) {
        threadId = null; // the ask proceeds; the turn will report saved:false
        logEvent('error', { where: 'api/ask/stream.thread', message: (e as Error).message });
      }

      try {
        const { result, meta } = await teach(question, { onEvent: write, lanes });
        const latencyMs = Date.now() - startedAt;
        logAskOutcome(result.kind, latencyMs, meta);
        // One durable row per completed ask (migration 116, Phase-D substrate). Off the
        // stream's critical path and fail-open — a logging failure never breaks an ask.
        // Minted here rather than by the database: 116 inserts without RETURNING (its INSERT-only
        // RLS policy makes the row invisible to app_runtime), so a DB-generated id could never
        // reach the client. The client needs it to attribute a clipping back to this ask (125),
        // and that link cannot be reconstructed later.
        const askOutcomeId = randomUUID();
        scheduleAskOutcome({ id: askOutcomeId, userId: user.id, query: question, lanes, result, meta, latencyMs });
        // Its own stage, emitted BEFORE 'saved' so a client that closes early still has it. Opaque
        // and read-only: app_runtime holds no SELECT on ask_outcomes, so holding the id grants
        // nothing beyond naming the ask you just made.
        write({ stage: 'outcome', askOutcomeId });

        let saved = false;
        if (threadId) {
          try {
            const stored: StoredAnswer = {
              v: 1,
              result,
              lanes: lanes as Record<string, boolean>,
              attempts: meta.attempts,
              latencyMs,
              askedAt: new Date(startedAt).toISOString(),
              ...(qid ? { qid } : {}),
            };
            await appendAnswer(user.id, threadId, stored);
            saved = true;
          } catch (e) {
            logEvent('error', { where: 'api/ask/stream.save', message: (e as Error).message });
          }
        }
        write({ stage: 'saved', ok: saved });
      } catch (e) {
        console.error('teacher stream error:', (e as Error).message);
        logEvent('error', { where: 'api/ask/stream', message: (e as Error).message });
        write({ stage: 'error', message: 'The teacher failed to answer. Please try again.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
