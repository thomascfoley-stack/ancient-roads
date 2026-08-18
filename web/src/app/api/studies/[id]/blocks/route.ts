import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import {
  insertClippingFromEmbedding,
  insertClippingFromSection,
  insertClippingsForWork,
  insertTextBlock,
  moveBlock,
  softDeleteBlock,
  trimBlock,
  updateTextBlock,
  CLIP_REFERENCE_MAX,
  STUDY_TEXT_MAX,
  type BlockPlacement,
  type ClipFailReason,
} from '@/lib/studies';

// /api/studies/[id]/blocks — the block ops (design §6.2/§6.3; build task 1.3/1.4).
//
// S-1 IS ENFORCED HERE, STRUCTURALLY: any request body carrying `quote` or `attribution` is
// rejected 400 before any branch runs. Those two fields are written only by the server-side
// INSERT…SELECT in lib/studies.ts, which snapshots from the corpus with the licensing gate in
// the same statement — there is no code path on which client-supplied quote text reaches a
// table. A clipping request carries a REFERENCE (sectionId | sourceId | slug), never text.
//
// Error codes are accurate, never blanket (see ../../route.ts): ownership 404, licensing
// refusal 409 NOT_SERVABLE, oversized whole-work 422, midpoint race 409 POSITION_CONFLICT.

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_ID_MAX = 512;
const SLUG_MAX = 200;

function err(code: string, message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

// The one mapping from engine reason codes to HTTP — every failure is distinguishable.
function reasonResponse(reason: ClipFailReason | 'work_not_found' | 'work_empty' | 'work_too_large', unitCount?: number): Response {
  switch (reason) {
    case 'study_not_found':
      return err('NOT_FOUND', 'No such study.', 404);
    case 'anchor_not_found':
      return err('ANCHOR_NOT_FOUND', 'The block to place this beside no longer exists.', 404);
    case 'source_not_found':
      return err('SOURCE_NOT_FOUND', 'That passage does not exist in the library.', 404);
    case 'work_not_found':
      return err('WORK_NOT_FOUND', 'That work does not exist in the library.', 404);
    case 'not_servable':
      return err('NOT_SERVABLE', 'That passage is not currently servable from the library.', 409);
    case 'work_empty':
      return err('WORK_EMPTY', 'Nothing in that work is currently servable from the library.', 409);
    case 'work_too_large':
      return err('WORK_TOO_LARGE', 'That work has more reading units than one append allows.', 422, {
        unitCount,
      });
    case 'position_conflict':
      return err('POSITION_CONFLICT', 'The document changed while placing the block; try again.', 409);
  }
}

function parsePlacement(body: { afterBlockId?: unknown; beforeBlockId?: unknown }): BlockPlacement | Response {
  if (body.afterBlockId !== undefined && body.beforeBlockId !== undefined) {
    return apiError('INVALID_REQUEST', { message: 'send afterBlockId or beforeBlockId, not both' });
  }
  const place: BlockPlacement = {};
  if (body.afterBlockId !== undefined) {
    if (typeof body.afterBlockId !== 'string' || !UUID_RE.test(body.afterBlockId)) {
      return apiError('INVALID_REQUEST', { message: 'afterBlockId must be a UUID' });
    }
    place.afterBlockId = body.afterBlockId;
  }
  if (body.beforeBlockId !== undefined) {
    if (typeof body.beforeBlockId !== 'string' || !UUID_RE.test(body.beforeBlockId)) {
      return apiError('INVALID_REQUEST', { message: 'beforeBlockId must be a UUID' });
    }
    place.beforeBlockId = body.beforeBlockId;
  }
  return place;
}

// NO GET — DELETED 2026-08-17 (deep-audit domain lens, HIGH), absence pinned by
// web/test/invariants/studies-api-no-get.test.ts. The GET that stood here returned raw blocks
// carrying `quote` verbatim with NO servability re-check — the exact F-W3-2 gap the feed
// route's header records ("GET /api/studies/[id]/blocks returns raw blocks with NO servability
// re-check, and a stored clipping quote read back without one bypasses every live licensing
// predicate"). It had ZERO consumers: every fetch of this path in web/src is POST
// (save-to-study.tsx, study-library-panel.tsx, study-editor.tsx), PATCH (study-editor.tsx) or
// DELETE (save-to-study.tsx, study-editor.tsx); pagination reads go to GET /studies/[id]/feed,
// which runs resolveServability on every page. Deletion over servability plumbing is the
// precedented remedy (bylaw 3) — /api/research/[id]'s GET was removed for the same shape:
// "zero consumers and returned stored answers with no servability data — a §4.4 bypass for any
// future consumer" (research-history-static.test.ts I-1). Do not re-add a GET here; extend the
// feed route instead, so the re-check cannot be forgotten per caller.

// POST /api/studies/[id]/blocks — insert one block (or a capped whole-work append):
//   { kind: 'text', body, afterBlockId? | beforeBlockId? }
//   { kind: 'clipping', sectionId, reference?, afterBlockId? | beforeBlockId? }      (reader/topic)
//   { kind: 'clipping', sourceId, chunkIndex?, reference?, afterBlockId? | ... }     (ask surface)
//   { kind: 'clipping_work', slug }                                                  (whole body, capped)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'study id must be a UUID' });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return apiError('INVALID_REQUEST'); }

  // S-1, before any branch: the server writes quote/attribution; a client that sends either is
  // told so, whatever else the request carries.
  if ('quote' in body || 'attribution' in body) {
    return apiError('INVALID_REQUEST', {
      message: 'quote and attribution are server-written; send a reference (sectionId, sourceId, or slug) instead',
    });
  }

  const kind = body.kind;
  if (kind !== 'text' && kind !== 'clipping' && kind !== 'clipping_work') {
    return apiError('INVALID_REQUEST', { message: "kind must be 'text', 'clipping', or 'clipping_work'" });
  }

  try {
    if (kind === 'text') {
      const text = typeof body.body === 'string' ? body.body : '';
      if (!text.trim()) return apiError('INVALID_REQUEST', { message: 'a text block needs some words' });
      if (text.length > STUDY_TEXT_MAX) {
        return apiError('INVALID_REQUEST', { message: `a text block holds at most ${STUDY_TEXT_MAX} characters` });
      }
      const place = parsePlacement(body);
      if (place instanceof Response) return place;
      const result = await insertTextBlock(user.id, id, text, place);
      if (!result.ok) return reasonResponse(result.reason);
      return NextResponse.json({ block: result.block }, { status: 201 });
    }

    if (kind === 'clipping') {
      if ((body.sectionId === undefined) === (body.sourceId === undefined)) {
        return apiError('INVALID_REQUEST', { message: 'send exactly one of sectionId (reader) or sourceId (ask)' });
      }
      let reference: string | undefined;
      if (body.reference !== undefined) {
        if (typeof body.reference !== 'string' || body.reference.length > CLIP_REFERENCE_MAX) {
          return apiError('INVALID_REQUEST', { message: `reference must be a string of at most ${CLIP_REFERENCE_MAX} characters` });
        }
        reference = body.reference.trim() || undefined;
      }
      const place = parsePlacement(body);
      if (place instanceof Response) return place;

      if (body.sectionId !== undefined) {
        const sectionId = Number(body.sectionId);
        if (!Number.isSafeInteger(sectionId) || sectionId < 1) {
          return apiError('INVALID_REQUEST', { message: 'sectionId must be a positive integer' });
        }
        const result = await insertClippingFromSection(user.id, id, { sectionId, reference }, place);
        if (!result.ok) return reasonResponse(result.reason);
        return NextResponse.json({ block: result.block }, { status: 201 });
      }

      const sourceId = typeof body.sourceId === 'string' ? body.sourceId : '';
      // The register prefix is part of the key's own format (src/ingest/source-id.ts) and is
      // what lets the lookup ride the (source_type, source_id, chunk_index) index.
      if (!sourceId || sourceId.length > SOURCE_ID_MAX || !/^[^:]+:./.test(sourceId)) {
        return apiError('INVALID_REQUEST', { message: 'sourceId must look like "<register>:<key>"' });
      }
      let chunkIndex: number | undefined;
      if (body.chunkIndex !== undefined) {
        const n = Number(body.chunkIndex);
        if (!Number.isSafeInteger(n) || n < 0) {
          return apiError('INVALID_REQUEST', { message: 'chunkIndex must be a non-negative integer' });
        }
        chunkIndex = n;
      }
      const result = await insertClippingFromEmbedding(user.id, id, { sourceId, chunkIndex, reference }, place);
      if (!result.ok) return reasonResponse(result.reason);
      return NextResponse.json({ block: result.block }, { status: 201 });
    }

    // kind === 'clipping_work' — the whole-body append, one block per reading unit, capped.
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    if (!slug || slug.length > SLUG_MAX) {
      return apiError('INVALID_REQUEST', { message: 'slug must be a non-empty string' });
    }
    const result = await insertClippingsForWork(user.id, id, slug);
    if (!result.ok) return reasonResponse(result.reason, result.unitCount);
    return NextResponse.json({ inserted: result.inserted }, { status: 201 });
  } catch (e) {
    console.error('block insert error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

// PATCH /api/studies/[id]/blocks — block ops on existing blocks:
//   { op: 'update_text', blockId, body }                       (revision rides the same transaction)
//   { op: 'move', blockId, afterBlockId? | beforeBlockId? }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'study id must be a UUID' });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return apiError('INVALID_REQUEST'); }

  // S-1 again: no op may smuggle server-written fields.
  if ('quote' in body || 'attribution' in body) {
    return apiError('INVALID_REQUEST', { message: 'quote and attribution are server-written and cannot be edited' });
  }

  const op = body.op;
  if (op !== 'update_text' && op !== 'move' && op !== 'trim') {
    return apiError('INVALID_REQUEST', { message: "op must be 'update_text', 'move', or 'trim'" });
  }
  if (typeof body.blockId !== 'string' || !UUID_RE.test(body.blockId)) {
    return apiError('INVALID_REQUEST', { message: 'blockId must be a UUID' });
  }
  const blockId = body.blockId;

  try {
    if (op === 'update_text') {
      const text = typeof body.body === 'string' ? body.body : '';
      if (!text.trim()) return apiError('INVALID_REQUEST', { message: 'a text block needs some words' });
      if (text.length > STUDY_TEXT_MAX) {
        return apiError('INVALID_REQUEST', { message: `a text block holds at most ${STUDY_TEXT_MAX} characters` });
      }
      const ok = await updateTextBlock(user.id, id, blockId, text);
      if (!ok) return err('NOT_FOUND', 'No such text block.', 404);
      return NextResponse.json({ ok: true });
    }

    if (op === 'trim') {
      // "Trim, not edit" (111): the client sends OFFSETS into the server's own snapshot, or
      // clear:true — never text. The data layer re-validates against length(quote) in-statement.
      if (body.clear === true) {
        const ok = await trimBlock(user.id, id, blockId, null);
        if (!ok) return err('NOT_FOUND', 'No such clipping.', 404);
        return NextResponse.json({ ok: true });
      }
      const start = Number(body.start);
      const end = Number(body.end);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) {
        return apiError('INVALID_REQUEST', { message: 'trim needs integers 0 <= start < end (or clear: true)' });
      }
      const ok = await trimBlock(user.id, id, blockId, { start, end });
      // 0 rows = not owned, not a clipping, purged, or offsets past the quote — the write's
      // own bound refused. 404 keeps ownership indistinguishable; the offsets case is a 400
      // the client can distinguish by retrying with clear.
      if (!ok) return err('NOT_FOUND', 'No such clipping, or the range does not fit its quote.', 404);
      return NextResponse.json({ ok: true });
    }

    const place = parsePlacement(body);
    if (place instanceof Response) return place;
    if (place.afterBlockId === undefined && place.beforeBlockId === undefined) {
      return apiError('INVALID_REQUEST', { message: 'move needs afterBlockId or beforeBlockId' });
    }
    const result = await moveBlock(user.id, id, blockId, place);
    if (!result.ok) {
      if (result.reason === 'study_not_found') return err('NOT_FOUND', 'No such block.', 404);
      return reasonResponse(result.reason);
    }
    return NextResponse.json({ ok: true, position: result.position });
  } catch (e) {
    console.error('block patch error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

// DELETE /api/studies/[id]/blocks?blockId=… — soft-delete one block.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'study id must be a UUID' });

  const blockId = new URL(req.url).searchParams.get('blockId');
  if (blockId === null || !UUID_RE.test(blockId)) {
    return apiError('INVALID_REQUEST', { message: 'blockId must be a UUID' });
  }

  try {
    const ok = await softDeleteBlock(user.id, id, blockId);
    if (!ok) return err('NOT_FOUND', 'No such block.', 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('block delete error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
