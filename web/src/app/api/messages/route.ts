import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { getMessages, addMessage } from '@/lib/chat';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get('channelId');
    const chatId = searchParams.get('chatId');
    const before = searchParams.get('before') ?? undefined;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    if (!channelId && !chatId) {
      return NextResponse.json({ error: 'channelId or chatId required' }, { status: 400 });
    }

    const messages = await getMessages(user.id, channelId, chatId, limit, before);
    return NextResponse.json(messages);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { channelId, chatId, content, sources } = await req.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }
    if (!channelId && !chatId) {
      return NextResponse.json({ error: 'channelId or chatId required' }, { status: 400 });
    }

    const message = await addMessage(
      user.id,
      channelId ?? null,
      chatId ?? null,
      'user',
      content,
      sources ?? [],
    );
    return NextResponse.json(message, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
