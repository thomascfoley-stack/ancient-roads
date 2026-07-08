import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { listHighlights, listNotes } from '@/lib/annotations';

// All of the signed-in user's highlights + notes, for the "My library" page.
export async function GET() {
  try {
    const user = await requireUser();
    const [highlights, notes] = await Promise.all([
      listHighlights(user.id),
      listNotes(user.id),
    ]);
    return NextResponse.json({ highlights, notes });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
