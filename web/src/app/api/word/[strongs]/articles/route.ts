import { apiError } from '@/lib/api-error';
import { fetchWordArticles } from '@/lib/word-articles';
import { publicReadThrottle } from '@/lib/public-read-limit';

// GET /api/word/[strongs]/articles — the reference shelf's data door
// (docs/WORD_REFERENCE_PANE_DESIGN.md). Public read route, same posture as /api/work/*:
// throttle first, validate before any query, bounded response (LIMIT in the data layer).
// Only PUBLISHED lexicon works answer — the owner's flip is the switch, never this route.

const KEY = /^([GHgh])(\d{1,4})$/;

export async function GET(req: Request, ctx: { params: Promise<{ strongs: string }> }): Promise<Response> {
  const throttled = await publicReadThrottle(req, 'word-articles');
  if (throttled) return throttled;

  const { strongs } = await ctx.params;
  const m = KEY.exec(strongs ?? '');
  if (!m) {
    return apiError('INVALID_REQUEST', { message: 'Not a Strong’s key (G1–G5624 / H1–H8674).' });
  }
  const key = `${m[1]!.toUpperCase()}${parseInt(m[2]!, 10)}`;

  // Cluster A (DEEP_SWEEP D14/D32/D33): the data layer has no catch of its own, so an
  // unwrapped call escapes to Next's RAW 500 instead of the envelope every /api/* route promises.
  try {
    const articles = await fetchWordArticles(key);
    return Response.json({ articles });
  } catch (e) {
    console.error('GET /api/word/[strongs]/articles:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
