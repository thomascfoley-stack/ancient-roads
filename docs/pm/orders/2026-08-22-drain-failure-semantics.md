# Order — Lane B drain: two failure-semantics defects, filed not fixed

**Filed 2026-08-22.** Found while diagnosing the `blob-round-trip` CI failure, which turned out to
be neither of these. Both are real, both change when a user's document is marked failed, and
neither belongs in a branch about CI counting — hence filed.

## 1. A permanent configuration error is retried as if it were transient

`processOne`'s catch (`web/src/lib/user-corpus/queue.ts`) treats **anything that is not an
`UploadRefused`** as possibly transient: it parks the document back at `queued` and lets the drain
retry until `MAX_ATTEMPTS`, then marks it `failed`.

`EmbeddingUnavailable('DEEPINFRA_API_KEY is not set')` goes down that path. It will never succeed
on retry. **Observed** (an accidental reproduction with a blank key): `status=queued attempts=1
chars=52 parseError="DEEPINFRA_API_KEY is not set"` — the parse had already succeeded, and the
document sat in a state **indistinguishable from "waiting its turn"**.

**Why it matters beyond a test:** a deployment missing that key parks every upload silently. The
queue depth grows, `queueStats` reports healthy-looking `queued` documents, and users see "queued"
rather than an error they could act on or report.

**Shape of the fix (not decided here):** the catch needs a permanent/transient distinction rather
than a single `UploadRefused` special case — `EmbeddingUnavailable` for a *missing key* is
permanent; the same class for a *429 or 5xx* is transient, and the existing `retryable()` helper in
`embed.ts` already draws exactly that line one layer down. **Do not simply mark
`EmbeddingUnavailable` terminal** — that would fail documents on a provider blip, which is the
error this retry loop exists for.

## 2. `drain()` reports work it did not do

`processed++` runs unconditionally after `processOne` returns **any** outcome, so
`{processed: 1, outcomes: {queued: 1}}` is a normal result meaning "attempted once, got nowhere".

Every caller asserting or logging `processed` alone reads a stalled document as progress — which
is exactly how the test that found this read its own failure as success for one line. `outcomes`
carries the truth and is the field worth surfacing.

**Shape of the fix (not decided here):** either rename to `attempted` and add a real `completed`
count, or keep the name and make every caller read `outcomes`. This is an API change with existing
callers (the upload route's `after()` drain, the queue tests) — cheap, but it needs the callers
swept in the same commit or the rename is worse than the ambiguity.

## Not in scope

The `blob-round-trip` CI failure itself. That is environment-specific — the suite passes 4/4
locally against dev with the real credentials — and the next CI run now reports its own cause,
because the assertion carries `outcomes` and `parseError` in its failure message.
