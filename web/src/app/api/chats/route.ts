import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { getChats, createChat } from '@/lib/chat';

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
    const { title, persona } = await req.json();
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title required' }, { status: 400 });
    }
    const chat = await createChat(user.id, title, persona);
    return NextResponse.json(chat, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
