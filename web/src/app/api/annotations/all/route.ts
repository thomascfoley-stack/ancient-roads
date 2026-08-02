import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { listBookmarks, listHighlights, listNotes } from '@/lib/annotations';

// All of the signed-in user's highlights, notes and bookmarks, for the "My library" page.
export async function GET() {
  try {
    const user = await requireUser();
    const [highlights, notes, bookmarks] = await Promise.all([
      listHighlights(user.id),
      listNotes(user.id),
      listBookmarks(user.id),
    ]);
    return NextResponse.json({ highlights, notes, bookmarks });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
