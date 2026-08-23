import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { getMessages, addMessage } from '@/lib/chat';

// 2026-08-17 pre-deploy audit (attack lens) #6: `content` had no length cap and `sources` was
// ARBITRARY CLIENT JSON forwarded straight into a jsonb column — the class prayers/route.ts:62-68
// names (audit A1-8) and closed for itself. Same choice as prayers: REJECT over-cap, never
// silently truncate (slicing serialized JSON would corrupt it anyway).
//
// CONTEXT THAT RAISES THE STAKES (same audit, #5 / I-1, documented at chats/route.ts where the
// persona arrives): if the target chat was created with persona='ask', every user message written
// here is rendered by getThread (lib/research.ts) as a research QUESTION on /ask/[id]. So this
// route's client text can appear inside the research surface. The persona fence is a design
// change and is NOT attempted here; the caps below bound what any such write can carry.

const MESSAGE_MAX_LENGTH = 20_000; // PRAYER_MAX_LENGTH's bound (lib/prayers.ts) — same kind of free text.
// An ask answer's attribution payload is a handful of objects with short excerpts — tens of KB at
// the outside. 100,000 serialized chars is an order of magnitude of headroom while still refusing
// the megabyte-scale jsonb rows an uncapped column invites.
const MESSAGE_SOURCES_MAX_JSON = 100_000;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get('channelId');
    const chatId = searchParams.get('chatId');
    const before = searchParams.get('before') ?? undefined;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    if (!channelId && !chatId) {
      return NextResponse.json({ error: 'channelId or chatId required' }, { status: 400 });
    }

    const messages = await getMessages(user.id, channelId, chatId, limit, before);
    return NextResponse.json(messages);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const csrfFloor = requireJsonContentType(req);
    if (csrfFloor) return csrfFloor;
    const body = (await req.json()) as {
      channelId?: unknown;
      chatId?: unknown;
      content?: unknown;
      sources?: unknown;
    };

    const content = typeof body.content === 'string' ? body.content : '';
    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }
    if (content.length > MESSAGE_MAX_LENGTH) {
      return apiError('INVALID_REQUEST', { message: `content is longer than ${MESSAGE_MAX_LENGTH} characters` });
    }

    const channelId = typeof body.channelId === 'string' && body.channelId ? body.channelId : null;
    const chatId = typeof body.chatId === 'string' && body.chatId ? body.chatId : null;
    if (!channelId && !chatId) {
      return NextResponse.json({ error: 'channelId or chatId required' }, { status: 400 });
    }

    // #6: bound `sources` two ways before it reaches jsonb — SHAPE (the array-of-objects
    // addMessage declares; a bare string/number/array-of-scalars used to be stored verbatim)
    // and SIZE (serialized length, since a jsonb cell has no column-level cap).
    const rawSources = body.sources === undefined || body.sources === null ? [] : body.sources;
    if (
      !Array.isArray(rawSources) ||
      rawSources.some((s) => typeof s !== 'object' || s === null || Array.isArray(s))
    ) {
      return apiError('INVALID_REQUEST', { message: 'sources must be an array of objects' });
    }
    if (JSON.stringify(rawSources).length > MESSAGE_SOURCES_MAX_JSON) {
      return apiError('INVALID_REQUEST', { message: 'sources payload is too large' });
    }
    const sources = rawSources as Record<string, unknown>[];

    const message = await addMessage(user.id, channelId, chatId, 'user', content, sources);
    return NextResponse.json(message, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
