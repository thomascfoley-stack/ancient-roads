import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { parsePlanSpec } from '@/lib/plan/spec';
import { resolveCanonicalGroup } from '@/lib/plan/canonical-groups';
import { createPlan, listPlans } from '@/lib/plan/store';

export const runtime = 'nodejs';

// GET /api/plans — the caller's plans with progress counts. Bounded (LIMIT
// in the store), indexed on (user_id, updated_at DESC).
export async function GET() {
  let user: { id: string };
  try {
    user = await requireUser();
  } catch {
    return apiError('UNAUTHENTICATED');
  }
  try {
    return NextResponse.json({ plans: await listPlans(user.id) });
  } catch (e) {
    console.error('plans list error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

// POST /api/plans { title?, spec } — expand (arithmetic), coverage-gate,
// persist. No model call and no embedding spend anywhere on this path, so
// the /api/ask rate limiter is not borrowed here; RLS + auth gate it.
export async function POST(req: NextRequest) {
  let user: { id: string };
  try {
    user = await requireUser();
  } catch {
    return apiError('UNAUTHENTICATED');
  }

  let body: { title?: unknown; spec?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST');
  }

  const parsed = parsePlanSpec(body.spec);
  if (!parsed.ok) return apiError('INVALID_REQUEST', { message: parsed.reason });

  const rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
  const title = (rawTitle || defaultTitle(parsed.spec)).slice(0, 200);

  try {
    const result = await createPlan(user.id, title, parsed.spec);
    if ('refused' in result) {
      // An honest refusal is a 200-level outcome, not an error envelope: the
      // request was valid; the corpus cannot support it yet.
      return NextResponse.json({ refused: true, reason: result.reason }, { status: 200 });
    }
    return NextResponse.json({ plan: result.plan }, { status: 201 });
  } catch (e) {
    console.error('plan create error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

function defaultTitle(spec: PlanSpecForTitle): string {
  const what =
    spec.scope.kind === 'book' ? spec.scope.book
    : spec.scope.kind === 'range' ? spec.scope.ref
    : resolveCanonicalGroup(spec.scope.group)?.label ?? spec.scope.group;
  return `${what} in ${spec.weeks} week${spec.weeks === 1 ? '' : 's'}`;
}

type PlanSpecForTitle = {
  scope: { kind: 'book'; book: string } | { kind: 'range'; ref: string } | { kind: 'books'; group: string };
  weeks: number;
};
