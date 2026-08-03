import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { listDocuments } from '@/lib/user-corpus/documents';
import { queueStats } from '@/lib/user-corpus/queue';

export const runtime = 'nodejs';

/**
 * The status wall (§8: "a wall of status, not a wall of red").
 *
 * Returns every document with its state, plus the two queue numbers §9 requires (depth and
 * oldest-queued age). Deliberately one call: a UI that had to ask separately would render the
 * list and the queue at different instants and show a document as queued next to a depth of zero.
 */
export async function GET(): Promise<NextResponse> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [documents, queue] = await Promise.all([listDocuments(user.id), queueStats(user.id)]);
  return NextResponse.json({ documents, queue });
}
