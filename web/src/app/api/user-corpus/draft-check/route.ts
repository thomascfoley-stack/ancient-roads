import { NextRequest, NextResponse } from 'next/server';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { checkCorpusSearchRateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { DRAFT_MAX_CHARS, draftCheck } from '@/lib/user-corpus/draft-check';
import { corpusPredicate } from '@/lib/user-corpus/tradition-gap';
import { LEGAL_CORPUS_FILTER } from '@/lib/teacher/routing';
import { logEvent } from '@/lib/observability';

// POST /api/user-corpus/draft-check — "have I preached this before?"
// (docs/MY_WORKS_DRAFT_AND_METADATA_DESIGN.md §1). Anchor-only: NO embedding call anywhere on
// this path, so the meter is for the DB reads, not a wallet. The bible index needs Node's fs.
export const runtime = 'nodejs';

const PREDICATE = corpusPredicate(LEGAL_CORPUS_FILTER);

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  const limit = await checkCorpusSearchRateLimit(user.id);
  if (!limit.ok) {
    return apiError(limit.limited === 'day' ? 'RATE_LIMIT_DAY' : 'RATE_LIMIT_MINUTE', {
      retryAfterSec: limit.retryAfterSec,
    });
  }

  const csrfFloor = requireJsonContentType(req);
  if (csrfFloor) return csrfFloor;

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json({ error: 'Paste a draft to check.' }, { status: 400 });
  }
  if (text.length > DRAFT_MAX_CHARS) {
    // Refused, not truncated: a silently-truncated draft reports overlap for half a sermon and
    // presents it as the whole answer.
    return NextResponse.json(
      { error: `That draft is ${Math.round(text.length / 1000)}k characters; the check reads up to ${DRAFT_MAX_CHARS / 1000}k. Try one sermon at a time.` },
      { status: 413 },
    );
  }

  // Matching telemetry (owner directive 2026-08-24), and this route is the one where the rule
  // has teeth: THE SERMON ARRIVES IN THE REQUEST BODY. `text` is in scope on this very line and
  // is never passed to logEvent — only counts, and the number of characters read rather than any
  // of them. `outcome` distinguishes a draft that anchored nothing (`empty`, the paraphrase case,
  // not an error) from one that found voices.
  const t0 = Date.now();
  try {
    const result = await draftCheck(user.id, text, PREDICATE);
    logEvent('match_outcome', {
      kind: 'draft',
      userId: user.id,
      outcome: result.gaps.voices.length > 0 ? 'hit' : 'empty',
      voices: result.gaps.voices.length,
      ranges: result.ranges.length,
      overlaps: result.overlaps.length,
      translation: result.detection.translation ?? 'undetected',
      chars: text.length,
      ms: Date.now() - t0,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    logEvent('match_outcome', {
      kind: 'draft', userId: user.id, outcome: 'error', voices: 0,
      chars: text.length, ms: Date.now() - t0, message,
    });
    console.error('[user-corpus] draft-check failed:', message);
    return apiError('INTERNAL');
  }
}
