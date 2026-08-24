import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { getChannels, createChannel } from '@/lib/chat';

// 2026-08-17 pre-deploy audit (attack lens) #6: `name` and `description` had no length cap —
// the class prayers/route.ts:62-68 names (audit A1-8) and closed for itself. Same choice as
// prayers: REJECT over-cap, never silently truncate. `description` was also forwarded untyped
// (any): a non-string now 400s instead of riding into the SQL parameter binding.

const CHANNEL_NAME_MAX = 200; // the bookmark-label bound (annotations/route.ts) — a name, not prose.
const CHANNEL_DESCRIPTION_MAX = 2_000; // a paragraph of purpose, an order short of PRAYER_MAX_LENGTH.

export async function GET() {
  try {
    const user = await requireUser();
    const channels = await getChannels(user.id);
    return NextResponse.json(channels);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const csrfFloor = requireJsonContentType(req);
    if (csrfFloor) return csrfFloor;
    const body = (await req.json()) as { name?: unknown; description?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    if (!name) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 });
    }
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
    const channel = await createChannel(user.id, name, body.description ?? undefined);
    return NextResponse.json(channel, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
