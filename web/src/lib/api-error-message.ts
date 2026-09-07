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

// ── THE ERROR VOICE ──────────────────────────────────────────────────────────────────────────────
//
// A status code is not a sentence. Surfaces built on `errorMessage` above were passing a FALLBACK
// that carried the number — `search failed (${res.status})` — so the moment a failure had no body
// to read (a 500 from the platform, a proxy's empty 429) the reader was shown "search failed (500)".
// The dual-shape read was right; what it fell back TO was the machine's voice.
//
// 429 is the sharpest case and the reason this exists as a function rather than one more literal:
// it is the one failure with something genuinely useful to say — wait, then try again — and it was
// the one most likely to arrive with no body, because the throttle sits in front of the handler.

/**
 * What a status means to a reader, for the failures where the status alone is enough to say
 * something true. Anything else returns null and the caller's own surface-specific sentence wins:
 * "the server is broken" has no useful reader-facing detail beyond what the surface already knows.
 */
function statusSentence(status: number): string | null {
  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return 'Your account does not have access to this.';
  if (status === 429) return 'That is more requests than we can take just now. Please wait a moment and try again.';
  if (status === 503) return 'The service is busy just now. Please try again in a moment.';
  return null;
}

/**
 * The reader-facing sentence for a failed response. Reads the body ONCE — callers must not have
 * consumed it — and prefers what the server actually said, because `apiError()`'s envelope copy and
 * the routes' own 400 strings are already written for a person. Falls back to the status's meaning,
 * then to the caller's sentence. Never returns a number.
 */
export async function responseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  return errorMessage(body, '') || statusSentence(res.status) || fallback;
}

