import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Word Study' };

export default function WordStudyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
