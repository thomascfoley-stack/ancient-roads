// Reading an error out of an API response, when the API has TWO error shapes.
//
// Routes answer their own validation failures as `{ error: "a string" }`, while the shared
// throttles and `apiError()` answer with the envelope `{ error: { code, message } }` — and both
// shapes come out of the SAME route (a 400 from the handler, a 429 from publicReadThrottle above
// it). A client that reads `body.error` blindly coerces the object and shows the reader
// "[object Object]" exactly when the message mattered most (DEEP_SWEEP D28).
//
// Extracted from my-works.tsx on the third call site, per the inline-until-the-third rule.
export function errorMessage(body: unknown, fallback: string): string {
  const e = (body as { error?: unknown } | null)?.error;
  if (typeof e === 'string' && e.trim()) return e;
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}
