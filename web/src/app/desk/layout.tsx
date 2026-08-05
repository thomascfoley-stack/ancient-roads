// Tab title for the study desk.
//
// Like the reader, /desk is a client component with no metadata, so it rendered the bare app
// name. Static rather than per-pane: a desk's contents live in `?p=` search params, and layouts
// do not receive searchParams. "Study desk" at least distinguishes the tab from the reader and
// the library, which is the whole job here.

import type { ReactNode } from 'react';

export const metadata = { title: 'Study desk' };

export default function DeskLayout({ children }: { children: ReactNode }) {
  return children;
}
