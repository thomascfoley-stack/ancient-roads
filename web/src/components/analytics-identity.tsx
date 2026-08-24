'use client';

import { useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth/client';
import { identifyReader, resetReader } from '@/lib/analytics';

/**
 * Binds PostHog's person to the signed-in reader, so churn ("no visit in 7 days") is answerable.
 *
 * Renders nothing. Mounted inside the GATED branch of app-shell.tsx rather than in the root
 * layout, deliberately: the public marketing pages (`/`, `/about`, `/features`, `/why`, `/gate`)
 * have no session, and mounting there would fire a `useSession` request on every landing-page
 * visit — a request that the site gate answers with a 307 to `/gate` anyway (see use-signed-in.ts
 * for that same trap). Anonymous landing traffic still produces pageviews with campaign
 * properties, which is all campaign attribution needs; identity only matters once there is
 * somebody to identify.
 *
 * THE SIGN-OUT CHECK IS LOAD-BEARING. `useSession` resolves asynchronously, so `data` is
 * undefined on the first render of every page — for a signed-in reader too. The naive form,
 * `userId ? identify() : reset()`, therefore calls `reset()` on essentially every page load,
 * and each `reset()` mints a fresh anonymous distinct id that throws away the campaign
 * attribution captured when the visitor arrived. So a reset fires only on a true
 * identified→anonymous transition, which is what `seen` records.
 */
export function AnalyticsIdentity(): null {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (userId) {
      identifyReader(userId);
      seen.current = userId;
      return;
    }
    if (seen.current !== null) {
      resetReader();
      seen.current = null;
    }
  }, [userId]);

  return null;
}
