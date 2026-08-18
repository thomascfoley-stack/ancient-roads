import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { getChats, createChat } from '@/lib/chat';

// 2026-08-17 pre-deploy audit (attack lens) #6: `title` and `persona` had no length cap — the
// class prayers/route.ts:62-68 names ("an uncapped text column is a cheap way to fill a
// database", audit A1-8) and closed for itself. Same choice as prayers: REJECT over-cap, never
// silently truncate.
//
// KNOWN, DELIBERATELY UNFIXED (same audit, #5 / I-1): `persona` is CLIENT-SUPPLIED, and
// persona='ask' is THREAD_PERSONA (lib/research.ts:20) — the research-thread fence. A caller who
// creates a chat with persona='ask' and then writes user messages through POST /api/messages gets
// them rendered by getThread as research QUESTIONS on /ask/[id], i.e. fabricated "I asked X"
// history in a surface that otherwise only ever shows text the ask pipeline wrote. Fencing the
// persona set is a design change on a live API (which personas are legitimate is a product call),
// so this edge only bounds the value's type and length; the bypass stays filed under audit #5.

const CHAT_TITLE_MAX = 300; // STUDY_TITLE_MAX's bound (lib/studies.ts) — the sibling title cap.
const PERSONA_MAX = 64; // a persona is a short discriminator ('general', 'ask'), not prose.

export async function GET() {
  try {
    const user = await requireUser();
    const chats = await getChats(user.id);
    return NextResponse.json(chats);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { title?: unknown; persona?: unknown };
    const title = typeof body.title === 'string' ? body.title : '';
    if (!title) {
      return NextResponse.json({ error: 'Title required' }, { status: 400 });
    }
    if (title.length > CHAT_TITLE_MAX) {
      return apiError('INVALID_REQUEST', { message: `title is longer than ${CHAT_TITLE_MAX} characters` });
    }
    // #6: persona was forwarded untyped (any). Absent stays absent (lib/chat defaults it to
    // 'general'); present must be a bounded string — see the header for the #5 bypass this
    // bound deliberately does NOT close.
    if (body.persona !== undefined && (typeof body.persona !== 'string' || body.persona.length > PERSONA_MAX)) {
      return apiError('INVALID_REQUEST', { message: 'persona must be a short string' });
    }
    const chat = await createChat(user.id, title, body.persona);
    return NextResponse.json(chat, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
