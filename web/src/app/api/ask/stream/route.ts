import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkAskRateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';
import { teach, type TeacherEvent } from '@/lib/teacher/teach';

export const runtime = 'nodejs';
export const maxDuration = 300;

// POST /api/ask/stream { question } → newline-delimited JSON (NDJSON) stream of
// TeacherEvents (retrieving → retrieved → composing → verifying → done). The
// verifier runs server-side inside teach() before any `done` event, so the
// client never receives unverified model output. Authed-only. Pre-stream errors
// use the stable envelope (docs/API_ERRORS.md).
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
    return apiError(rl.limited === 'day' ? 'RATE_LIMIT_DAY' : 'RATE_LIMIT_MINUTE', { retryAfterSec: rl.retryAfterSec });
  }

  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST');
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return apiError('INVALID_REQUEST', { message: 'A question is required.' });
  if (question.length > 500) return apiError('INVALID_REQUEST', { message: 'That question is too long (max 500 characters).' });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (e: TeacherEvent | { stage: 'error'; message: string }) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      };
      try {
        await teach(question, { onEvent: write });
      } catch (e) {
        console.error('teacher stream error:', (e as Error).message);
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
