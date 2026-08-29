import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AccountSettings } from '@/components/account-settings';
import { currentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Account Settings' };

export const dynamicParams = false;

// PER-REQUEST, never prerendered. `generateStaticParams` below is an ALLOWLIST (with
// `dynamicParams = false` it is what makes /account/anything-else a 404); it is not a claim that
// this page can be built ahead of time. Without this line Next tried to prerender
// /account/settings at build time, and `currentUser()` reached for the database — so
// `next build` died with "SECURITY: APP_DATABASE_URL … is required in production" on any machine
// without production credentials, i.e. `deploy.sh` could not get past its build step at all.
// There is nothing to cache here regardless: the page is auth-gated and renders one user's email.
export const dynamic = 'force-dynamic';

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
