import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Passages' };

export default function PassagesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
