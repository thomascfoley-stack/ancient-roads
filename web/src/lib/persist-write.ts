// Retries a single annotation write (POST/DELETE /api/annotations) on a transient failure, so a
// dropped packet on a phone's flaky connection doesn't turn into silent data loss — this app's
// core use context is phones on low signal (CLAUDE.md). See use-annotation-writes.ts for the
// optimistic-rollback + visible-error side of the fix; this module is the pure retry policy,
// deliberately kept free of React so it's trivial to unit-test in isolation.
//
// Retries a network error (fetch threw — offline, DNS, connection reset) or a 5xx/429 response.
// Nothing else: retrying a 400/401/404 just delays telling the caller something that will not fix
// itself on the next attempt. Two retries with a short backoff (~0.4s, ~1.2s) absorb a brief signal
// drop without making the caller wait through a real outage.

const RETRY_DELAYS_MS = [400, 1200];

function shouldRetry(res: Response | null): boolean {
  if (!res) return true; // fetch threw
  return res.status >= 500 || res.status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `request()`, retrying per the policy above. Resolves `true` on a 2xx-`ok` response,
 * `false` once retries are exhausted (or the failure isn't retryable) — never throws, so callers
 * don't need a try/catch to decide what to do next.
 */
export async function persistWrite(request: () => Promise<Response>): Promise<boolean> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let res: Response | null;
    try {
      res = await request();
    } catch {
      res = null;
    }
    if (res?.ok) return true;
    if (attempt === RETRY_DELAYS_MS.length || !shouldRetry(res)) return false;
    await sleep(RETRY_DELAYS_MS[attempt]!);
  }
  return false;
}
