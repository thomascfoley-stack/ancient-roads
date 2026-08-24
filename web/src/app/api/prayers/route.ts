import { NextRequest, NextResponse } from 'next/server';
import { requireUser, authFailureResponse } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { encodeVerseId } from '@bible/verse-id';
import { createPrayer, deletePrayer, listPrayers, updatePrayer, PRAYER_MAX_LENGTH } from '@/lib/prayers';

// The prayer journal — block `PR1a`.
//
// POST-with-kind is this API surface's mutation idiom (no PATCH exists anywhere in the repo; see
// annotations/route.ts and plans/[id]/route.ts), so edit and delete arrive as kinds rather than
// verbs. Deliberately consistent rather than more RESTful in isolation.
//
// AUTH FAILURE IS DISTINGUISHED FROM SERVER FAILURE. `requireUser` is called in its own try, not
// wrapped around the DB work — pre-deploy audit A1-16 found four routes whose single try turned an
// RLS refusal into a 401, making a real isolation failure indistinguishable from "signed out". This
// route does not repeat that.
//
// C9: nothing here embeds, indexes, or logs prayer text. The body is written and read back; it
// never reaches an event, an analytics call, or an error payload.

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// D31: the same ceiling annotations/route.ts uses — book*1e6 + chapter*1e3 + verse over 66 books.
const PRAYER_VERSE_ID_MAX = encodeVerseId({ book: 66, chapter: 999, verse: 999 });

export async function GET(): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch (e) { return authFailureResponse(e); }
  try {
    return NextResponse.json({ prayers: await listPrayers(user.id) });
  } catch (e) {
    // The message, never the prayer. Audit A1-13 found parse errors carrying server paths to the
    // client; a prayer route must be stricter, not looser.
    console.error('prayer list error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch (e) { return authFailureResponse(e); }
  let body: { kind?: unknown; id?: unknown; body?: unknown; verseId?: unknown };
  try { body = await req.json(); } catch { return apiError('INVALID_REQUEST'); }

  const kind = body.kind === undefined ? 'create' : body.kind;
  if (kind !== 'create' && kind !== 'update' && kind !== 'delete') {
    return apiError('INVALID_REQUEST', { message: 'unknown kind' });
  }

  if (kind === 'delete') {
    if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) {
      return apiError('INVALID_REQUEST', { message: 'id must be a UUID' });
    }
    try {
      const ok = await deletePrayer(user.id, body.id);
      if (!ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such prayer.' } }, { status: 404 });
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error('prayer delete error:', (e as Error).message);
      return apiError('INTERNAL');
    }
  }

  // CAPPED AT THE EDGE. Audit A1-8: no authenticated write route in this app capped its body
  // except the bookmark label. An uncapped text column is a cheap way to fill a database.
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text) return apiError('INVALID_REQUEST', { message: 'A prayer needs some words.' });
  if (text.length > PRAYER_MAX_LENGTH) {
    return apiError('INVALID_REQUEST', { message: 'That is longer than a prayer entry can hold.' });
  }

  try {
    if (kind === 'update') {
      if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) {
        return apiError('INVALID_REQUEST', { message: 'id must be a UUID' });
      }
      const ok = await updatePrayer(user.id, body.id, text);
      if (!ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such prayer.' } }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    // `verseId` is OPTIONAL by ruling — a prayer stands alone. Absent, null, or a positive integer.
    const verseId =
      body.verseId === undefined || body.verseId === null ? null
      // D31: `> 0` alone let verseId: 3000000000 through to an int4 column, dying as Postgres
      // 22003 inside createPrayer — a 500 for what is plainly a 400. The annotations route bounds
      // this at VERSE_ID_MAX for exactly that reason; same bound, same reason.
      : Number.isInteger(Number(body.verseId)) && Number(body.verseId) > 0 && Number(body.verseId) <= PRAYER_VERSE_ID_MAX ? Number(body.verseId)
      : NaN;
    if (Number.isNaN(verseId)) return apiError('INVALID_REQUEST', { message: 'verseId must be a positive integer' });

    return NextResponse.json({ prayer: await createPrayer(user.id, text, verseId) }, { status: 201 });
  } catch (e) {
    console.error('prayer write error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
