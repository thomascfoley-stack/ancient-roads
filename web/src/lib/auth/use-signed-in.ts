'use client';

import { useEffect, useState } from 'react';
import { authClient } from './client';

/**
 * Whether a reader is signed in, for CLIENT render decisions.
 *
 * WHY THIS IS NOT A FETCH. Two places used to infer it from `GET /api/annotations` returning ok —
 * `use-annotation-writes.ts` and `work/[slug]/page.tsx`. Any failure of that one request (a 500, a
 * 429, one dropped connection on a phone — this app's core use context) told a genuinely signed-in
 * reader they were signed OUT, and four surfaces changed under them: the popover's highlight
 * swatches (`selection-popover.tsx:143`), the bookmark button (`verse-display.tsx:199`), and the
 * study panel's highlight row and notes tab (`study-panel.tsx:155`, `:335`). Reading the status
 * code instead would not have worked: `api/annotations/route.ts` wraps auth AND the DB query in ONE
 * try and answers 401 for both, so a database outage arrives at the client as "Unauthorized".
 *
 * WHAT `mounted` IS FOR. The server has no session, so it renders the signed-OUT branch;
 * `useSession` can resolve on the client's FIRST render. Rendering the signed-IN branch there is a
 * server/client mismatch — the React #418 the A7b walk found throwing on every reader page load in
 * production. `sidebar.tsx` has carried this guard since. The cost is one render in which this
 * returns false, which is exactly what the old fetch did too.
 *
 * WHAT THIS DOES NOT FIX, stated so nobody re-derives it: `/api/auth/*` is inside the site-gate
 * matcher (`middleware.ts`) and is not in `gate.ts`'s PUBLIC_PATHS, so an expired gate cookie
 * redirects the SESSION request to `/gate` too, which answers 200 with HTML, and this reads false.
 * That window is self-correcting — the reader's next navigation lands on /gate as well — and no
 * client-side derivation can close it. What this change removes is the far commoner case: one
 * failed data request revoking the feature.
 */
export function useSignedIn(): boolean {
  const { data: session } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !!session?.user;
}
