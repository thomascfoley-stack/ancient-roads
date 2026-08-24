import { NextRequest, NextResponse } from 'next/server';
import { requireUser, authFailureResponse } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { getChannels, createChannel } from '@/lib/chat';

// 2026-08-17 pre-deploy audit (attack lens) #6: `name` and `description` had no length cap —
// the class prayers/route.ts:62-68 names (audit A1-8) and closed for itself. Same choice as
// prayers: REJECT over-cap, never silently truncate. `description` was also forwarded untyped
// (any): a non-string now 400s instead of riding into the SQL parameter binding.

const CHANNEL_NAME_MAX = 200; // the bookmark-label bound (annotations/route.ts) — a name, not prose.
const CHANNEL_DESCRIPTION_MAX = 2_000; // a paragraph of purpose, an order short of PRAYER_MAX_LENGTH.

// A1-16 / DEEP_SWEEP D13 — THE THREE-TRY SHAPE. requireUser in its own try (-> 401), the body
// parse in its own (-> 400), DB work in its own (-> 500 INTERNAL, message logged server-side and
// never sent). The old single try returned 401 for all three, so a DB outage, a malformed body and
// an RLS DENIAL were indistinguishable from "signed out" — and an RLS denial is the isolation
// boundary firing, i.e. the one failure that must never be triaged as a session bug. Same pattern
// annotations/route.ts and prayers/route.ts already ship; these were the routes they named as the
// unfixed precedent. Behavioural exit test: test/invariants/a1-16-chat-routes.test.ts.
export async function GET() {
  let user;
  try { user = await requireUser(); } catch (e) { return authFailureResponse(e); }
  try {
    return NextResponse.json(await getChannels(user.id));
  } catch (e) {
    console.error('GET /api/channels:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) { return authFailureResponse(e); }
  // Merge 2026-08-24: main added this CSRF floor while this branch restructured the handler into
  // the A1-16 three-try shape. Both are kept — the floor runs before the body is read, as it did
  // on main, and the auth failure above answers through authFailureResponse, as it does here.
  const csrfFloor = requireJsonContentType(req);
  if (csrfFloor) return csrfFloor;
  let body: { name?: unknown; description?: unknown };
  try { body = (await req.json()) as { name?: unknown; description?: unknown }; } catch { return apiError('INVALID_REQUEST'); }

  const name = typeof body.name === 'string' ? body.name : '';
  if (!name) return apiError('INVALID_REQUEST', { message: 'name is required' });
  if (name.length > CHANNEL_NAME_MAX) {
    return apiError('INVALID_REQUEST', { message: `name is longer than ${CHANNEL_NAME_MAX} characters` });
  }
  if (
    body.description !== undefined &&
    body.description !== null &&
    (typeof body.description !== 'string' || body.description.length > CHANNEL_DESCRIPTION_MAX)
  ) {
    return apiError('INVALID_REQUEST', { message: `description must be a string of at most ${CHANNEL_DESCRIPTION_MAX} characters` });
  }

  try {
    const channel = await createChannel(user.id, name, body.description ?? undefined);
    return NextResponse.json(channel, { status: 201 });
  } catch (e) {
    console.error('POST /api/channels:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
