# B2 — the coverage floor (and the Song-of-Solomon parser gap it exposed)

**Status: implemented + tested on dev. One verification PENDING: the live frozen-v4
re-measure (needs DeepInfra + a DB). Argued unaffected by construction below; must still
be run before prod per the `quality-slice` discipline.**

## The problem (from `docs/evidence/part4/sos-fallback-verification.txt`, 2026-07-19)

`retrieveCommentary` takes the top-K by score with **no relevance floor**. A book with zero
rows in the served pool (Song of Solomon: 0 exegetical rows) therefore returns K
confident-looking chunks from *other* books — Barnes/Wesley on the New Testament, Chrysostom
on Matthew/John/Acts, Augustine on Psalm 45 — scoring as low as 0.005. The system never
detects "we have no Song of Solomon sources." `kind:'empty'` never fired. The user was safe
only *incidentally*: the verifier rejected the downstream answer for malformed schema / an
invalid anchor, not because anything noticed the coverage gap. A well-formed answer grounded
in those NON-SoS chunks had no obvious reason to be rejected — and would have been served as
an answer about Song of Solomon built out of New Testament commentary.

## Two independent defects, two fixes

Diagnosing this surfaced that the fix is in **two** places, not one.

### B2a — the coverage floor (the gate)

`web/src/lib/teacher/routing.ts` → `hasPassageCoverage(chunks, ranges)`. Pure, chapter-
granularity: given the retrieved chunks and the query's **high-confidence** floor ranges,
returns whether any chunk shares a *chapter* with the asked passage. Wired into
`web/src/lib/teacher/teach.ts` right after the empty-retrieval check: when the query
confidently names a passage (`intent.floor` non-empty) but no retrieved chunk covers it,
return `kind:'empty'` with a passage-named reason instead of composing over off-passage text.

Design choices:
- **Floor, not inject.** Fires only on corroborated references, never on soft-matched
  topical idioms ("good shepherd insurance") — so a topical query can never be wrongly
  declared "no coverage."
- **Chapter granularity, not verse.** A verse-ref we *do* cover, whose nearest chunk is a
  neighbouring verse in the same chapter, still counts as covered. Only a wholly-absent
  book/chapter trips the floor. This is why it cannot regress a currently-passing verse-ref
  query: `floorOnRange` already pulls any on-range chunk into the lead slots, so coverage is
  present whenever the corpus has the passage at all.
- **Placed in `teach()`, downstream of the eval's measurement point.** `eval-heldout.mts`
  measures `retrieveCommentary`, not `teach()`. The gate is a safety layer *on top of*
  retrieval, so it cannot change any frozen-v4 retrieval number. It only converts a
  zero-coverage confident-reference from "compose over the wrong thing → fallback" into an
  honest "empty."

### B2b — the reference-parser gap (why the gate wasn't enough)

The gate keys on `intent.floor`, which only exists if the query *resolves* to a reference.
Measured during B2a: **"Song of Solomon 2" and "Song of Songs 8:7" resolve to nothing.**
`scanReferences`' `SCAN_RE` captures only a **single-word** book token (after an optional
numeric ordinal), so multi-word names with no ordinal are invisible to prose scanning. Book
22 is the only such book: the one-word alias "Canticles 2" resolved fine, but the two
canonical KJV names did not. So the reader who quotes the book by name got no routing — and
the coverage gate had nothing to fire on.

Fix (`src/bible/ref-parse.ts` + `web/src/bible/ref-parse.ts`, byte-identical per the
bible-sync guard): an **additive** second scan for exactly the multi-word aliases, derived
from the alias table (`MULTIWORD_ALIASES` / `MULTIWORD_SCAN_RE`). It never alters a
single-word match — a naive broadening of `SCAN_RE` would let a greedy capture swallow a
preceding word ("in John 3" → a failed "in john 3" span); the targeted pass avoids that.
`parseRef` still validates every span, so precision is unchanged.

**Blast radius, bounded by enumeration:** the only multi-word aliases with no numeric ordinal
are `"song of songs"` and `"song of solomon"` — both book 22. Every other multi-word name
carries an ordinal `SCAN_RE` already handles. So the *only* queries whose parsing changes are
Song-of-Solomon-by-name. **Frozen v4 samples zero Song of Solomon**, so the eval is unaffected
by construction — but the live re-measure remains the honest confirmation and is still owed.

## Proof (what could have failed)

- `test/routing-orchestration.test.ts` — 7 red-first cases for `hasPassageCoverage`
  (SoS-shaped pool → false; on-chapter → true; same-chapter neighbouring verse → true;
  wrong chapter → false; straddling chunk → true; topical/empty → true). Seeded-bug proven:
  reverting to the pre-fix "always covered" behavior turns exactly the no-coverage assertions
  red.
- `test/ref-parse.test.ts` — 6 cases for the multi-word scan (canonical names resolve;
  single-word path unregressed; "in John 3" not swallowed; numbered books intact; topical
  "song" does not false-resolve). Seeded-bug proven: disabling `MULTIWORD_SCAN_RE` turns
  exactly the two SoS cases red.
- `web/test/invariants/coverage-floor.test.ts` — the shipped seam. Real `teach()` + real
  `resolveIntent`, deps mocked: `teach('Song of Solomon 2, I am the rose of Sharon')` over an
  off-passage NT pool → `kind:'empty'`, reason names Song of Songs, **compose never called**;
  an on-passage chunk → not empty.
- `test/bible-sync.test.ts` green (the two ref-parse copies are byte-identical).

## Still owed before prod

Run the frozen v4 held-out (`web/src/scripts/eval-heldout.mts --v4`) on dev and confirm the
per-category numbers are unchanged. Optionally re-run `web/src/scripts/verify-sos-endtoend.mts`
— it should now report `kind:'empty'` firing on the SoS queries where before it reported
`fallback`. A v4.1 that actually samples Song of Solomon (`HELDOUT_EVAL_DESIGN.md` §v4) would
turn this from "unaffected by construction" into "measured."
