import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
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

// A1-16 / DEEP_SWEEP D13 — THE THREE-TRY SHAPE (see channels/route.ts for the full note):
// requireUser alone -> 401, body parse alone -> 400, DB work alone -> 500. The old single try
// returned 401 for all three, so an RLS denial read as "signed out".
//
// D12 — `limit` rode in as `parseInt(...)` with no validation: `?limit=abc` produced NaN, which
// reached the SQL LIMIT and threw, and the blanket catch above then answered 401 "Unauthorized"
// to what is plainly a caller error. Bounded here at the edge, the house rule.
//
// D30 — a POST carrying BOTH channelId and chatId violated the `msg_belongs_to_one` CHECK, and
// that too surfaced as 401. The pair is mutually exclusive by schema; say so at the edge.

const MESSAGES_LIMIT_DEFAULT = 50;
const MESSAGES_LIMIT_MAX = 200; // never return an unbounded set (CLAUDE.md data rule)

/** D12: an integer in [1, MESSAGES_LIMIT_MAX], or null for "the caller sent something invalid".
 *  Absent is not invalid — it takes the default. Never forward `parseInt(x)` raw to SQL. */
function parseLimit(raw: string | null): number | null {
  if (raw === null) return MESSAGES_LIMIT_DEFAULT;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MESSAGES_LIMIT_MAX ? n : null;
}

export async function GET(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId');
  const chatId = searchParams.get('chatId');
  const before = searchParams.get('before') ?? undefined;
  const limit = parseLimit(searchParams.get('limit'));

  if (!channelId && !chatId) {
    return apiError('INVALID_REQUEST', { message: 'channelId or chatId is required' });
  }
  if (channelId && chatId) {
    return apiError('INVALID_REQUEST', { message: 'pass channelId or chatId, not both' });
  }
  if (limit === null) {
    return apiError('INVALID_REQUEST', { message: `limit must be a whole number between 1 and ${MESSAGES_LIMIT_MAX}` });
  }

  try {
    return NextResponse.json(await getMessages(user.id, channelId, chatId, limit, before));
  } catch (e) {
    console.error('GET /api/messages:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  let body: { channelId?: unknown; chatId?: unknown; content?: unknown; sources?: unknown };
  try {
    body = (await req.json()) as { channelId?: unknown; chatId?: unknown; content?: unknown; sources?: unknown };
  } catch { return apiError('INVALID_REQUEST'); }

  const content = typeof body.content === 'string' ? body.content : '';
  if (!content) return apiError('INVALID_REQUEST', { message: 'content is required' });
  if (content.length > MESSAGE_MAX_LENGTH) {
    return apiError('INVALID_REQUEST', { message: `content is longer than ${MESSAGE_MAX_LENGTH} characters` });
  }

  const channelId = typeof body.channelId === 'string' && body.channelId ? body.channelId : null;
  const chatId = typeof body.chatId === 'string' && body.chatId ? body.chatId : null;
  if (!channelId && !chatId) {
    return apiError('INVALID_REQUEST', { message: 'channelId or chatId is required' });
  }
  // D30: the `msg_belongs_to_one` CHECK makes these mutually exclusive. Refusing here turns a
  // constraint violation dressed as 401 into a plain, accurate 400.
  if (channelId && chatId) {
    return apiError('INVALID_REQUEST', { message: 'pass channelId or chatId, not both' });
  }

  // #6: bound `sources` two ways before it reaches jsonb — SHAPE (the array-of-objects
  // addMessage declares; a bare string/number/array-of-scalars used to be stored verbatim)
  // and SIZE (serialized length, since a jsonb cell has no column-level cap).
  const rawSources = body.sources === undefined || body.sources === null ? [] : body.sources;
  if (
    !Array.isArray(rawSources) ||
    rawSources.some((x) => typeof x !== 'object' || x === null || Array.isArray(x))
  ) {
    return apiError('INVALID_REQUEST', { message: 'sources must be an array of objects' });
  }
  if (JSON.stringify(rawSources).length > MESSAGE_SOURCES_MAX_JSON) {
    return apiError('INVALID_REQUEST', { message: 'sources payload is too large' });
  }
  const sources = rawSources as Record<string, unknown>[];

  try {
    const message = await addMessage(user.id, channelId, chatId, 'user', content, sources);
    return NextResponse.json(message, { status: 201 });
  } catch (e) {
    console.error('POST /api/messages:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
