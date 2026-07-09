import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/session';
import { teach, type TeacherEvent } from '@/lib/teacher/teach';

export const runtime = 'nodejs';
export const maxDuration = 300;

// POST /api/ask/stream { question } → newline-delimited JSON (NDJSON) stream of
// TeacherEvents (retrieving → retrieved → composing → verifying → done). The
// verifier runs server-side inside teach() before any `done` event, so the
// client never receives unverified model output. Authed-only.
export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return Response.json({ error: 'question is required' }, { status: 400 });
  if (question.length > 500) return Response.json({ error: 'question is too long (max 500 chars)' }, { status: 400 });

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
