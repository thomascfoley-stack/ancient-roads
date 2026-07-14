// Next.js boot hook (runs once at server startup). SECURITY (§0): verify the runtime DB
// role is the least-privilege app_runtime (no BYPASSRLS) in production before serving any
// request — so a misconfigured APP_DATABASE_URL fails the deploy instead of silently
// making RLS inert for every private row.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return; // edge runtime has no DB access
  const { assertAppRuntimeRole } = await import('@/lib/db');
  await assertAppRuntimeRole();
}
