import { NextRequest, NextResponse } from 'next/server';
import { requireUser, authFailureResponse } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { countWorkUnits, WHOLE_WORK_BLOCK_CAP } from '@/lib/studies';

// GET /api/studies/work-units?slug=… — the count the whole-body affordance states BEFORE
// running ("This will add 412 clippings to Rahab. Add them?", design §6.3). Counts exactly
// what the bulk write would admit: clean, published reading units — so the number the user
// confirms is the number that lands. `capped` means the true count exceeds the per-op cap
// (WHOLE_WORK_BLOCK_CAP) and the append would be refused 422.

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch (e) { return authFailureResponse(e); }

  const slug = new URL(req.url).searchParams.get('slug')?.trim() ?? '';
  if (!slug || slug.length > 200) {
    return apiError('INVALID_REQUEST', { message: 'slug must be a non-empty string' });
  }

  try {
    const { count, capped } = await countWorkUnits(user.id, slug);
    return NextResponse.json({ count, capped, cap: WHOLE_WORK_BLOCK_CAP });
  } catch (e) {
    console.error('work-units count error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
