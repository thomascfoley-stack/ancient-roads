import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ strongs: string }>;
}): Promise<Metadata> {
  const { strongs } = await params;
  return { title: `Strong's ${strongs}` };
}

export default function WordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
