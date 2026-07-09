import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { teach } from '@/lib/teacher/teach';

export const runtime = 'nodejs';
export const maxDuration = 300; // composition + retries can take a while

// POST /api/ask { question } → the teacher pipeline (retrieve → compose → verify).
// Authed-only: the endpoint spends on embeddings + LLM, so it is not public.
export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: 'question is too long (max 500 chars)' }, { status: 400 });
  }

  try {
    const result = await teach(question);
    return NextResponse.json(result);
  } catch (e) {
    console.error('teacher pipeline error:', (e as Error).message);
    return NextResponse.json({ error: 'The teacher failed to answer. Please try again.' }, { status: 500 });
  }
}
