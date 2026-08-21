# Finding — `POSITION_RETRIES` has zero margin: N lockstep racers need N tries, the code allows 3

**Filed 2026-08-21.** Found while verifying a CI failure on `0e5780a`; diagnosis and the
five-call-site scope confirmed independently by a second session before filing (bylaw 4).
**Not fixed here** — the fix is a design change across five call sites and wants design-before-code.

## What fails

`web/test/invariants/studies-order.test.ts:106` — *"two blocks at the SAME computed midpoint
resolve deterministically — no silent reorder"* — failed on CI run 32495997701 with:

```
AssertionError: a midpoint race must resolve by retry, not failure (position_conflict)
```

## Why, and it is arithmetic rather than timing

`web/src/lib/studies.ts:56` — `const POSITION_RETRIES = 3`, consumed as
`for (let attempt = 0; attempt < POSITION_RETRIES; attempt++)` (`:396`). That is **three total
tries**, not three retries after a first attempt. The test races **four** concurrent inserts
(`Promise.all` over `c1..c4`) against one anchor.

Worst case, all four reading the same state each round:

| round | racers | outcome |
|---|---|---|
| attempt 0 | 4 | all compute the same midpoint; unique index admits 1; **3 get 23505** |
| attempt 1 | 3 | re-read, all compute the same new midpoint; 1 wins; **2 fail** |
| attempt 2 | 2 | re-read, same midpoint; 1 wins; **1 fails** |
| — | 1 | has spent attempts 0/1/2 → `POSITION_RETRIES` exhausted → `position_conflict` |

**N racers colliding in lockstep need N tries. The test supplies 4 and the code allows 3.** The
margin is exactly zero, and it has been since the constant was written. It passes only when the
interleaving is kind enough that some racers read *different* anchor states and pick different
midpoints.

## Why it surfaced now

The 2026-08-21 per-run ephemeral CI branch (`208aef8`) runs the suite against a **cold** Neon
branch, where reads stay stale longer and lockstep interleaving is likelier. **The change rolls the
die more often; it did not load it.** Evidence: the same test passed on the warm shared branch
(`adf6c58`) and on an ephemeral branch (`2919b0d`), and failed on another ephemeral branch
(`0e5780a`) whose own diff is client-only and cannot touch a DB-side ordering invariant.

## The class

**A test asserting a stronger property than the implementation guarantees, green while timing was
kind.** The test's own comment says the colliding inserts *"must land — via bounded 23505 retry —
never fail a well-formed insert"*. The bound does not deliver that for four racers. This is the
watchlist's unearned-green family, with a zero-margin retry bound as the mechanism.

## The fix, and why the obvious one is not it

**Rejected — raise the constant.** `POSITION_RETRIES = 4` makes this test pass and moves the cliff
to five racers. Under lockstep, N racers need N tries and N is unbounded (any number of concurrent
clients), so **no fixed constant is correct for all N**. Raising it buys a greener test, not a
guarantee.

**Recommended — deterministic semantics, in a shared helper.** The repo has already solved this
shape once: `web/test/user-corpus/queue-never-drops.test.ts:94-105` records the queue drain
replacing a timing race with `SKIP LOCKED`, after it went red-red-green. Apply the same reasoning
here — resolve ordering by a mechanism that cannot collide, rather than by retrying until it
happens not to.

**Scope note, and the reason this is not a one-line patch:** `POSITION_RETRIES` is consumed by
**five** loops — `studies.ts:396, 455, 532, 612, 709` (insert, move, clip and neighbours). The fix
belongs in one shared helper, not patched per site, or the next site added inherits the same cliff.

**Whatever ships, derive the two numbers from each other.** The racer count in the test and the
bound in the code are both hand-typed today; that is what let them disagree silently.

## Status

- **Not a regression in `0e5780a`** — its diff is client-only. Not a reason to hold that candidate.
- **A real latent defect in `study_blocks` ordering** under concurrent insert, reachable in
  production by any user with two clients racing the same anchor.
- Unfixed. Owner call on which fix, then design-before-code per CLAUDE.md.
