import { NextRequest, NextResponse } from 'next/server';
import { searchCommentaries } from '@/lib/commentary-search';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ error: 'q is required' }, { status: 400 });
  }

  const book = sp.has('book') ? Number(sp.get('book')) : undefined;
  const tradition = sp.get('tradition') ?? undefined;
  const author = sp.get('author') ?? undefined;
  const limit = sp.has('limit') ? Number(sp.get('limit')) : undefined;
  const offset = sp.has('offset') ? Number(sp.get('offset')) : undefined;

  const data = await searchCommentaries({ query: q, book, tradition, author, limit, offset });
  return NextResponse.json(data);
}
