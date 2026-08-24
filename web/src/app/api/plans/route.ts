import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { parsePlanSpec } from '@/lib/plan/spec';
import { resolveCanonicalGroup } from '@/lib/plan/canonical-groups';
import { createPlan, listPlans, topicTitle } from '@/lib/plan/store';
import { defaultPlanTitle } from '@/lib/plan/title';
import { truncateCodePoints } from '@/lib/text';

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

  const csrfFloor = requireJsonContentType(req);
  if (csrfFloor) return csrfFloor;

  let body: { title?: unknown; spec?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST');
  }

  const parsed = parsePlanSpec(body.spec);
  if (!parsed.ok) return apiError('INVALID_REQUEST', { message: parsed.reason });

  const rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
  let title = rawTitle;
  if (!title) {
    if (parsed.spec.scope.kind === 'topic') {
      // The verified heading, from the DB — never echoed client input. A bad
      // pointer yields null here and createPlan refuses it with the reason.
      const t = await topicTitle(parsed.spec.scope).catch(() => null);
      title = t ? `${t} in ${parsed.spec.weeks} week${parsed.spec.weeks === 1 ? '' : 's'}` : 'Topical plan';
    } else {
      title = defaultPlanTitle(parsed.spec);
    }
  }
  title = truncateCodePoints(title, 200);

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
