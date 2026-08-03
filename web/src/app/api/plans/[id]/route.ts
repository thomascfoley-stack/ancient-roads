import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { deletePlan, getPlan, setDayCompleted } from '@/lib/plan/store';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/plans/[id] — the full plan with its days.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user: { id: string };
  try {
    user = await requireUser();
  } catch {
    return apiError('UNAUTHENTICATED');
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'plan id must be a UUID' });
  try {
    const found = await getPlan(user.id, id);
    if (!found) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such plan.' } }, { status: 404 });
    return NextResponse.json(found);
  } catch (e) {
    console.error('plan get error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

// POST /api/plans/[id] { kind: 'day', dayIndex, completed } — progress toggle.
// POST-with-kind is this API surface's mutation idiom (no PATCH exists
// anywhere in the repo; see annotations/route.ts).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user: { id: string };
  try {
    user = await requireUser();
  } catch {
    return apiError('UNAUTHENTICATED');
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'plan id must be a UUID' });

  let body: { kind?: unknown; dayIndex?: unknown; completed?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST');
  }
  if (body.kind !== 'day') return apiError('INVALID_REQUEST', { message: 'unknown kind' });
  const dayIndex = Number(body.dayIndex);
  if (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > 728) {
    return apiError('INVALID_REQUEST', { message: 'dayIndex must be a whole number from 1 to 728' });
  }
  try {
    const ok = await setDayCompleted(user.id, id, dayIndex, body.completed !== false);
    if (!ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such plan day.' } }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('plan day toggle error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

// DELETE /api/plans/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user: { id: string };
  try {
    user = await requireUser();
  } catch {
    return apiError('UNAUTHENTICATED');
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'plan id must be a UUID' });
  try {
    const ok = await deletePlan(user.id, id);
    if (!ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such plan.' } }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('plan delete error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
