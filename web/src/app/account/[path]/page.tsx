import { redirect } from 'next/navigation';
import { AccountView } from '@neondatabase/auth/react';
import { accountViewPaths } from '@neondatabase/auth/react/ui/server';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(accountViewPaths).map((path) => ({ path }));
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  try {
    await requireUser();
  } catch {
    redirect('/auth/sign-in');
  }

  const { path } = await params;
  return <AccountView path={path} />;
}
