import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import {
  getChapterAnnotations,
  setHighlight,
  removeHighlight,
  upsertNote,
  removeNote,
} from '@/lib/annotations';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const book = Number(req.nextUrl.searchParams.get('book'));
    const chapter = Number(req.nextUrl.searchParams.get('chapter'));
    if (!book || !chapter) {
      return NextResponse.json({ error: 'book and chapter required' }, { status: 400 });
    }
    const data = await getChapterAnnotations(user.id, book, chapter);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const verseId = Number(body.verseId);
    if (!verseId) return NextResponse.json({ error: 'verseId required' }, { status: 400 });

    if (body.kind === 'highlight') {
      const h = await setHighlight(user.id, verseId, String(body.color ?? 'yellow'));
      return NextResponse.json(h, { status: 201 });
    }
    if (body.kind === 'note') {
      const text = String(body.body ?? '').trim();
      if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });
      const n = await upsertNote(user.id, verseId, text);
      return NextResponse.json(n, { status: 201 });
    }
    return NextResponse.json({ error: 'unknown kind' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const verseId = Number(body.verseId);
    if (!verseId) return NextResponse.json({ error: 'verseId required' }, { status: 400 });
    if (body.kind === 'highlight') await removeHighlight(user.id, verseId);
    else if (body.kind === 'note') await removeNote(user.id, verseId);
    else return NextResponse.json({ error: 'unknown kind' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
