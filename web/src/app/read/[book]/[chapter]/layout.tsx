// Tab title for the reader.
//
// The reader page is a client component, so it cannot export `metadata`, and nothing else
// supplied one — every chapter in the Bible rendered `document.title` as the bare app name
// "Ancient Paths". With two or three chapters open, which is the reading pattern this product
// is built around, the tabs were indistinguishable from each other and from every other route.
//
// A layout CAN take params and run on the server, so the title is resolved the same way the
// page resolves the chapter, from the same slug map. `resolveBookSlug` handles the aliases
// (`jhn`, `john`, `1jn`) so the title matches whatever URL the reader actually followed.
//
// Falls through to "Bible" rather than throwing on an unknown slug: notFound() is the page's
// call to make, and a metadata function that throws would replace the reader's own 404 with a
// framework error screen.

import type { ReactNode } from 'react';
import { resolveBookSlug } from '@bible/ref-parse';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ book: string; chapter: string }>;
}) {
  const { book, chapter } = await params;
  // resolveBookSlug returns the Book itself, not a slug, despite the name.
  const found = resolveBookSlug(book);
  if (!found) return { title: 'Bible' };
  // Single-chapter books (Jude, Philemon, 2 John) read wrong as "Jude 1".
  const title = found.chapterCount === 1 ? found.name : `${found.name} ${chapter}`;
  return { title };
}

export default function ReaderLayout({ children }: { children: ReactNode }) {
  return children;
}
