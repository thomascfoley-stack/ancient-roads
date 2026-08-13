import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkAskRateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';
import { logEvent } from '@/lib/observability';
import { teach, type TeacherEvent, type LaneFlags } from '@/lib/teacher/teach';
import { logAskOutcome } from '@/lib/ask-outcome-log';

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (e: TeacherEvent | { stage: 'error'; message: string }) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      };
      const startedAt = Date.now();
      try {
        const { result, meta } = await teach(question, { onEvent: write, lanes });
        logAskOutcome(result.kind, Date.now() - startedAt, meta);
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
