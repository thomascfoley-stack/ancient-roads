// Is a third-party provider UNAVAILABLE, as distinct from present-and-wrong?
//
// THE DEFECT THIS CLOSES. `ca53457` was a docs-only commit and `db-invariants` went RED, because
// `section-vector-pairing.test.ts` calls the live DeepInfra embedding API and got
// `429 {"code":"engine_overloaded"}`. Re-running the identical job with no code change passed. So the
// gate could not distinguish "the invariant is broken" from "the provider was busy" — and a red that
// might mean nothing is how a red that means something gets waved through. The repo has already been
// bitten by the mirror image ("audit green" while db-invariants was red); this is the same wound from
// the other side.
//
// THE CALL, and why (the order asked for a bounded retry OR an explicit NOT RUN; this is both, layered,
// and the layering is the point):
//
//   * The SEMANTIC is NOT RUN. A provider outage means the check did not run. It is not a failure —
//     nothing about the invariant was observed — and it must never be a pass. That is exactly what
//     `announceSkip` already expresses for missing secrets and missing artifacts, so this joins that
//     taxonomy as a third `kind` rather than starting a parallel mechanism.
//   * The RETRY is only an optimisation for the transient case. A single 429 is common and usually
//     clears in seconds. Without a retry the pairing check would skip often, and a check that skips
//     often is a check nobody reads — which is the loud-skip ceiling's whole concern. Retry buys
//     coverage; it does not decide the semantic.
//
// Retry alone would have been the wrong answer: after N attempts you still have to choose between red
// and skip, and choosing red re-creates the defect. NOT RUN alone would have been defensible but
// wasteful, trading a real invariant for transient noise.
//
// WHAT THIS MUST NOT DO: swallow a genuine failure. Only availability signals (429, 5xx, and network
// errors that never reached the service) count as unavailable. A 200 with a wrong vector, a 400, or a
// 401 is the provider working and answering — those stay RED.

/** HTTP statuses that mean "the service did not serve this request", not "your request was wrong". */
const UNAVAILABLE_STATUS = /\b(429|500|502|503|504)\b/;

/** Network-level failures: the request never reached the service. */
const UNAVAILABLE_NETWORK = /(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|network|timeout)/i;

/**
 * Does this error mean the provider was unavailable?
 *
 * Deliberately narrow. 400/401/403 are the provider working correctly and rejecting us — a
 * misconfiguration, which must stay red rather than hide as NOT RUN.
 */
export function isProviderUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b(400|401|403|404)\b/.test(msg)) return false;
  return UNAVAILABLE_STATUS.test(msg) || UNAVAILABLE_NETWORK.test(msg);
}

export interface ProviderProbe {
  /** False when the provider is unavailable — feed straight into announceSkip's `present`. */
  readonly present: boolean;
  /** The last error seen, for the annotation. */
  readonly error?: string;
  readonly attempts: number;
}

/**
 * Run `fn` with a bounded retry, and classify the outcome.
 *
 * Resolves `{ present: true }` when `fn` succeeds. Resolves `{ present: false }` when every attempt
 * failed with an availability signal. **Re-throws** anything else — a genuine failure is not this
 * function's business and must reach the assertion.
 */
export async function probeProvider<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 500, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)), jitter = () => 0.5 + Math.random() * 0.5 } = {},
): Promise<ProviderProbe> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      await fn();
      return { present: true, attempts: i };
    } catch (err) {
      if (!isProviderUnavailable(err)) throw err; // genuine failure -> RED, immediately
      last = err;
      // Exponential backoff scaled by jitter in [0.5, 1): a fixed schedule makes every
      // concurrent retrier re-collide on the same tick — the thundering herd a 429 already is.
      if (i < attempts) await sleep(baseDelayMs * 2 ** (i - 1) * jitter());
    }
  }
  return { present: false, error: last instanceof Error ? last.message : String(last), attempts };
}
