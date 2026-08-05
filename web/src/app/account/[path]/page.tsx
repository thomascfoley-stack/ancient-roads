import { notFound, redirect } from 'next/navigation';
import { AccountSettings } from '@/components/account-settings';
import { currentUser } from '@/lib/session';

export const dynamicParams = false;

// Was `accountViewPaths` from the Neon prefab. Ours is one page (AUTH_CUTOVER_DESIGN §5); the
// deferred surfaces are listed in account-settings.tsx.
const ACCOUNT_PATHS = ['settings'] as const;

export function generateStaticParams() {
  return ACCOUNT_PATHS.map((path) => ({ path }));
}

export default async function AccountPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  if (!(ACCOUNT_PATHS as readonly string[]).includes(path)) notFound();

  // Enforced in the page server component, not in middleware -- "Fix A" in WORKLOG.md: the
  // middleware's Edge-runtime HTTP fallback silently failed and caused an infinite
  // redirect-to-login.
  const user = await currentUser();
  if (!user) redirect('/auth/sign-in');

  return <AccountSettings email={user.email} />;
}
