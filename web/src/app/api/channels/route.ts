import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { getChannels, createChannel } from '@/lib/chat';

export async function GET() {
  try {
    const user = await requireUser();
    const channels = await getChannels(user.id);
    return NextResponse.json(channels);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { name, description } = await req.json();
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name required' }, { status: 400 });
    }
    const channel = await createChannel(user.id, name, description);
    return NextResponse.json(channel, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
