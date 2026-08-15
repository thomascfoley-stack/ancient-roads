import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { createStudy, listStudies, STUDIES_PAGE_LIMIT, STUDY_TITLE_MAX } from '@/lib/studies';

// Study Docs routes (design §6.2; build task 1.3). Two deliberate route-shape decisions,
// binding for the whole /api/studies/** surface:
//
// - VERBS PER THE BUILD CONTRACT: PATCH/DELETE on the [id] routes, not the older
//   POST-with-kind idiom (plans/annotations/prayers). STUDY_DOCS_BUILD.md task 1.3 names the
//   verbs explicitly and the P2 swarm codes against them; the divergence is recorded here.
//
// - AUTH FAILURE IS DISTINGUISHED FROM SERVER FAILURE. requireUser sits in its own try; DB
//   work in another; body parsing in a third. The /api/chats //api/messages blanket-401
//   bare-catch is a known defect (pre-deploy audit A1-16) and is not copied. Ownership misses
//   are 404, licensing refusals 409, validation 400, real failures 500 — accurate codes, every
//   branch.

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/studies?limit&beforeUpdatedAt&beforeId — the user's studies, recency-ordered,
// cursor-paginated (both cursor params together or neither).
export async function GET(req: NextRequest): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? STUDIES_PAGE_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > STUDIES_PAGE_LIMIT) {
    return apiError('INVALID_REQUEST', { message: `limit must be an integer 1..${STUDIES_PAGE_LIMIT}` });
  }
  const beforeUpdatedAt = url.searchParams.get('beforeUpdatedAt');
  const beforeId = url.searchParams.get('beforeId');
  if ((beforeUpdatedAt === null) !== (beforeId === null)) {
    return apiError('INVALID_REQUEST', { message: 'beforeUpdatedAt and beforeId travel together' });
  }
  if (beforeUpdatedAt !== null && Number.isNaN(Date.parse(beforeUpdatedAt))) {
    return apiError('INVALID_REQUEST', { message: 'beforeUpdatedAt must be a timestamp' });
  }
  if (beforeId !== null && !UUID_RE.test(beforeId)) {
    return apiError('INVALID_REQUEST', { message: 'beforeId must be a UUID' });
  }

  try {
    const studies = await listStudies(user.id, {
      limit,
      before: beforeUpdatedAt !== null && beforeId !== null ? { updatedAt: beforeUpdatedAt, id: beforeId } : undefined,
    });
    return NextResponse.json({ studies });
  } catch (e) {
    console.error('studies list error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

// POST /api/studies { title } — create a study (E3: many studies, not one master doc).
export async function POST(req: NextRequest): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }

  let body: { title?: unknown };
  try { body = await req.json(); } catch { return apiError('INVALID_REQUEST'); }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return apiError('INVALID_REQUEST', { message: 'A study needs a title.' });
  if (title.length > STUDY_TITLE_MAX) {
    return apiError('INVALID_REQUEST', { message: `title is longer than ${STUDY_TITLE_MAX} characters` });
  }

  try {
    const study = await createStudy(user.id, title);
    return NextResponse.json({ study }, { status: 201 });
  } catch (e) {
    console.error('study create error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
