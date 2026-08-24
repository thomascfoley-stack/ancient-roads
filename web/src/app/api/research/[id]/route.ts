import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { deleteThread } from '@/lib/research';

export const runtime = 'nodejs';

// DELETE /api/research/:id — remove one of the caller's own research threads.
//
// ── THIS ROUTE EXPORTS DELETE AND NOTHING ELSE, AND THAT IS THE WHOLE DESIGN ──────────────────
//
// An `/api/research/[id]` route existed once and was DELETED on purpose (I1-M4, bylaw 3): it had
// zero consumers and returned STORED ANSWERS with no servability data, which is a §4.4 bypass —
// a stored quote whose source has since been unserved would have rendered anyway. Re-adding a
// GET here would reintroduce exactly that. There is no GET. Reading a thread goes through
// `getThread`, which resolves servability per row.
//
// ── WHY A WRITE VERB IS PERMITTED HERE AT ALL (I-1) ───────────────────────────────────────────
//
// `research-history-static.test.ts` I-1 forbade every write verb on this path, hardened against
// evasions after an adversarial inspection. Its stated reason is precise and worth quoting: "a
// client that could write history rows could store text that later re-renders as Ancient Paths
// output, attributed, in the product's typography."
//
// That is a claim about ORIGINATING CONTENT, and it rules out POST/PUT/PATCH exactly as before.
// A delete cannot originate content — it removes rows and never authors one — so no text can
// enter the assistant-attributed render path through this route. The assistant row is still
// written in precisely one place, inside /api/ask/stream from the object `teach()` returned.
// The invariant is amended NARROWLY: DELETE is admitted on this route only, POST/PUT/PATCH stay
// forbidden everywhere under /api/research, and the amended test pins that this route exports no
// GET. See docs/pm/orders/2026-08-17-research-thread-delete.md.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
//
// Every /ask submission persists a thread, and nothing could remove one: no control in the
// sidebar, none on the thread page, and no endpoint. The 2026-08-17 authenticated QA pass filed
// nine QA-generated threads on the owner's real account as an OUTSTANDING ACTION ITEM, having
// tried `DELETE /api/research/{id}` and `DELETE /api/ask/{id}` and got 404 from both.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user: { id: string };
  try {
    user = await requireUser();
  } catch {
    return apiError('UNAUTHENTICATED');
  }
  const { id } = await ctx.params;
  // IDEMPOTENT: 204 whether a row was removed, the id never existed, or it belongs to someone
  // else. Two reasons, and the second is the stronger one.
  //
  // 1. It is what DELETE means. Re-issuing it must not start failing once the thing is gone.
  // 2. There is then NO existence oracle at all. A 404-vs-204 split would answer "does this id
  //    exist and is it mine?" for any id a caller cares to try. `getThread` collapses absent and
  //    not-owned for the same reason; this collapses one case further, and can, because the
  //    caller has nothing to render either way.
  //
  // The return value of `deleteThread` is deliberately unused here. It is not dead weight: the
  // store function is what the tenancy tests assert on, where telling "removed" from "not yours"
  // is the whole point.
  // Cluster A (DEEP_SWEEP D14/D32/D33): the data layer has no catch of its own, so an
  // unwrapped call escapes to Next's RAW 500 instead of the envelope every /api/* route promises.
  try {
    await deleteThread(user.id, id);
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error('DELETE /api/research/[id]:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
