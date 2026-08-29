import type { Metadata } from 'next';
import { BOOK_BY_BOOK_SLUG } from '@/lib/bible';
import { resolveBookSlug } from '@bible/ref-parse';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ book: string; chapter: string }>;
}): Promise<Metadata> {
  const { book, chapter } = await params;
  const b = BOOK_BY_BOOK_SLUG.get(book) ?? resolveBookSlug(book);
  const title = b ? `${b.name} ${chapter}` : 'Read Scripture';
  return { title };
}

export default function ReadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
