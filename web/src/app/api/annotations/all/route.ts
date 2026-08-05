import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { listBookmarks, listHighlights, listNotes } from '@/lib/annotations';

// All of the signed-in user's highlights, notes and bookmarks, for the "My library" page.
//
// 401 MEANS NOT SIGNED IN, AND NOTHING ELSE. This handler used to wrap its whole body in a
// bare catch returning 401, so a DB outage, an RLS denial, a schema drift or a throw inside
// listBookmarks all reached the client as "Unauthorized". Two things broke downstream:
//
//   1. /library/notes told a signed-in reader "Sign in to see your highlights, notes and
//      bookmarks" and gave them a sign-in button, sending them to re-authenticate over a
//      server fault that had nothing to do with their session. Branching on 401 in the
//      CLIENT could not fix that while the server answered 401 to everything.
//   2. lib/persist-write.ts deliberately does not retry a 401, on the correct reasoning that
//      retrying an auth failure only delays telling the caller something retrying will not
//      fix. A genuine 500 on an annotation read therefore never got its retry.
//
// app/library/page.tsx's own header names this exact defect in this exact route and says it
// is "Not repeating that here". The note was right; the route was never fixed.
export async function GET() {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [highlights, notes, bookmarks] = await Promise.all([
      listHighlights(userId),
      listNotes(userId),
      listBookmarks(userId),
    ]);
    return NextResponse.json({ highlights, notes, bookmarks });
  } catch (err) {
    // Logged, never returned: an exception message here can carry connection details.
    console.error('[annotations/all] read failed', err);
    return NextResponse.json({ error: 'Could not load your library' }, { status: 500 });
  }
}
