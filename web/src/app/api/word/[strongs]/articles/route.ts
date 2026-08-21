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

  const articles = await fetchWordArticles(key);
  return Response.json({ articles });
}
