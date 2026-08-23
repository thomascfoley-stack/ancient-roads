import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { encodeVerseId } from '@bible/verse-id';
import {
  getChapterAnnotations,
  createHighlight,
  findHighlight,
  removeHighlight,
  removeHighlightById,
  upsertNote,
  removeNote,
  createBookmark,
  removeBookmark,
} from '@/lib/annotations';

// Reader annotations: highlights, notes, bookmarks (POST-with-kind, this surface's mutation
// idiom — see prayers/route.ts).
//
// AUTH FAILURE IS DISTINGUISHED FROM SERVER FAILURE (2026-08-17 pre-deploy audit, attack lens,
// #7). All three handlers used to wrap requireUser AND the DB call in ONE try whose catch
// returned 401 — so an RLS denial or a schema error surfaced to the user as "signed out", which
// is how a real isolation failure hides (library/page.tsx and studies/route.ts both name this
// route as the defect they refuse to copy; pre-deploy audit A1-16). Now: requireUser in its own
// try (→ 401), body parse in its own (→ 400), DB work in its own (→ 500 INTERNAL with the
// message logged server-side, never sent — audit A1-13).
//
// INPUT IS BOUNDED AT THE EDGE (#8). `Number(body.verseId)` accepted 1.5 and 1e999 — both
// truthy, both SQL cast errors that the old blanket catch then dressed up as a 401. And the note
// body was uncapped while the bookmark label four lines below it was capped at 200 with a
// comment explaining why.

export const runtime = 'nodejs';

// Verse ids encode book*1_000_000 + chapter*1_000 + verse (@bible/verse-id) over 66 books, so
// every real id is ≤ this ceiling. Structural validity (chapter within the book) is the
// verifier's job; the edge only refuses what could never be a verse id at all.
const VERSE_ID_MAX = encodeVerseId({ book: 66, chapter: 999, verse: 999 });

// #8: same bound as PRAYER_MAX_LENGTH (lib/prayers.ts: "longer than a note's practical length
// and far short of anything pathological") — a verse note is the same kind of text as a prayer
// entry, so the same number, and the same choice as prayers: REJECT over-cap rather than
// silently truncating a user's words (the label below slices because it is decoration; a note
// is content).
const NOTE_MAX_LENGTH = 20_000;

/** #8: an integer in the encodable range, or null. Never forward `Number(x)` raw to SQL. */
function parseVerseId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= VERSE_ID_MAX ? n : null;
}

type AnnotationBody = {
  kind?: unknown;
  id?: unknown;
  verseId?: unknown;
  color?: unknown;
  textColor?: unknown;
  spanStart?: unknown;
  spanEnd?: unknown;
  translation?: unknown;
  body?: unknown;
  label?: unknown;
};

export async function GET(req: NextRequest) {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }

  // #8's class on the query side: Number('1.5') and Number('1e999') are truthy and used to ride
  // straight into SQL. Bounds follow the verse-id encoding: 66 books, chapter < 1000.
  const book = Number(req.nextUrl.searchParams.get('book'));
  const chapter = Number(req.nextUrl.searchParams.get('chapter'));
  if (!Number.isInteger(book) || book < 1 || book > 66 || !Number.isInteger(chapter) || chapter < 1 || chapter > 999) {
    return NextResponse.json({ error: 'book and chapter required' }, { status: 400 });
  }

  try {
    const data = await getChapterAnnotations(user.id, book, chapter);
    return NextResponse.json(data);
  } catch (e) {
    // The message, never the payload — server-side only (A1-13).
    console.error('annotations read error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

export async function POST(req: NextRequest) {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }

  const csrfFloor = requireJsonContentType(req);
  if (csrfFloor) return csrfFloor;

  let body: AnnotationBody;
  try { body = (await req.json()) as AnnotationBody; } catch { return apiError('INVALID_REQUEST'); }

  const verseId = parseVerseId(body.verseId);
  if (verseId === null) {
    return apiError('INVALID_REQUEST', { message: 'verseId must be a positive integer verse id' });
  }

  try {
    if (body.kind === 'highlight') {
      // Sub-verse span when spanStart/spanEnd are present; whole verse otherwise (null/null).
      // BOUNDED like their neighbours: verseId got parseVerseId, notes got NOTE_MAX_LENGTH,
      // but the span ints accepted any integer (negatives, int4 overflow -> driver 500) and
      // color/textColor/translation persisted unbounded strings — which also defeated the
      // idempotent-create below, since a one-character color variant is a "different" span.
      // No verse text approaches 2,000 chars; render-side clamps to [0, textLen] regardless.
      const SPAN_MAX = 2000;
      const rawStart = typeof body.spanStart === 'number' && Number.isInteger(body.spanStart) ? body.spanStart : null;
      const rawEnd = typeof body.spanEnd === 'number' && Number.isInteger(body.spanEnd) ? body.spanEnd : null;
      const spanStart = rawStart !== null && rawStart >= 0 && rawStart <= SPAN_MAX ? rawStart : null;
      const spanEnd = rawEnd !== null && rawEnd >= 0 && rawEnd <= SPAN_MAX ? rawEnd : null;
      const hasSpan = spanStart !== null && spanEnd !== null && spanEnd > spanStart;
      const TOKEN_RE = /^[a-z][a-z0-9-]{0,31}$/; // css-keyword-shaped: 'yellow', 'amber-2'
      const color = String(body.color ?? 'yellow').toLowerCase();
      if (!TOKEN_RE.test(color)) {
        return apiError('INVALID_REQUEST', { message: 'color must be a short lowercase token' });
      }
      const textColorRaw = body.textColor != null ? String(body.textColor).toLowerCase() : null;
      if (textColorRaw !== null && !TOKEN_RE.test(textColorRaw)) {
        return apiError('INVALID_REQUEST', { message: 'textColor must be a short lowercase token' });
      }
      const span = {
        verseId,
        color,
        textColor: textColorRaw,
        spanStart: hasSpan ? spanStart : null,
        spanEnd: hasSpan ? spanEnd : null,
        translation: body.translation != null ? String(body.translation).slice(0, 32) : null,
      };
      // Idempotent create: the double-submit path (a retry after a timeout, a double-tap)
      // used to INSERT a twin row — prod carried two identical spans (2026-08 live QA).
      // An identical active span is returned with 200, not duplicated.
      const existing = await findHighlight(user.id, span);
      if (existing) return NextResponse.json(existing, { status: 200 });
      const h = await createHighlight(user.id, span);
      return NextResponse.json(h, { status: 201 });
    }
    if (body.kind === 'note') {
      const text = String(body.body ?? '').trim();
      if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });
      // #8: the cap the bookmark label always had, at the prayer bound. Reject, don't slice.
      if (text.length > NOTE_MAX_LENGTH) {
        return apiError('INVALID_REQUEST', { message: 'That is longer than a note can hold.' });
      }
      const n = await upsertNote(user.id, verseId, text);
      return NextResponse.json(n, { status: 201 });
    }
    if (body.kind === 'bookmark') {
      // A label is optional and capped: it is a user-supplied string reaching a text column, and
      // "no length cap on free text at the edge" is the shape the API-hardening pass closed
      // everywhere else in this route's neighbourhood.
      const raw = body.label != null ? String(body.label).trim() : '';
      const label = raw ? raw.slice(0, 200) : null;
      const b = await createBookmark(user.id, verseId, label);
      return NextResponse.json(b, { status: 201 });
    }
    return NextResponse.json({ error: 'unknown kind' }, { status: 400 });
  } catch (e) {
    console.error('annotations write error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

export async function DELETE(req: NextRequest) {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }

  const csrfFloor = requireJsonContentType(req);
  if (csrfFloor) return csrfFloor;

  let body: AnnotationBody;
  try { body = (await req.json()) as AnnotationBody; } catch { return apiError('INVALID_REQUEST'); }

  try {
    // Highlight delete: by span id (one span) if given, else clear the whole verse.
    if (body.kind === 'highlight' && typeof body.id === 'string' && body.id) {
      await removeHighlightById(user.id, body.id);
      return NextResponse.json({ ok: true });
    }
    const verseId = parseVerseId(body.verseId);
    if (verseId === null) {
      return apiError('INVALID_REQUEST', { message: 'verseId must be a positive integer verse id' });
    }
    if (body.kind === 'highlight') await removeHighlight(user.id, verseId);
    else if (body.kind === 'note') await removeNote(user.id, verseId);
    else if (body.kind === 'bookmark') await removeBookmark(user.id, verseId);
    else return NextResponse.json({ error: 'unknown kind' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('annotations delete error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
