# Wave 7 — independent verification verdicts

**Verifier:** a session that wrote none of the swarm work (bylaw 4). Every verdict below was
reached by EXECUTION — running the check, then seeding a defect and watching it go red. A check
not watched failing is not evidence (`docs/THE_LOOP.md` rule 4).

Base: `249e00b`. Verdicts appended as each item is verified.

---

## W-SEC-CSRF — **VERIFIED**

Branch `swarm/W-SEC-CSRF-csrf-floor` @ `f1d36b7`. Claim: shared Content-Type floor across 16
mutating handlers, with the invariant's route list *derived by glob, not hand-typed*.

**Green as shipped:** 28/28 (`test/invariants/csrf-content-type-floor.test.ts`).

**Red-proof C — the derivation is real (re-executed independently, not read from the log).**
Dropped a new unguarded cookie-authenticated JSON route at
`src/app/api/__verify_fixture__/route.ts`. The suite grew **28 -> 29 tests** and the new leg failed:

```
× POST src/app/api/__verify_fixture__/route.ts calls requireJsonContentType BEFORE req.json()
  → parses a JSON body without the CSRF floor: expected -1 to be greater than or equal to 0
  Tests  1 failed | 28 passed (29)
```

A hand-typed list would have stayed at 28 and stayed green. This is the watchlist's most-repeated
class (a hand-maintained expected set); this guard genuinely does not have it.

**Red-proof A — the failure is precise, not blanket.** Removing the guard call from
`src/app/api/prayers/route.ts` failed exactly that route's leg and no other
(`Tests 1 failed | 27 passed (28)`). Fixture removed and route restored; tree clean.

---

## W-VEC429 — **VERIFIED WITH ONE FINDING (LOW)**

Branch `swarm/W-VEC429-provider-429-retry` @ `f352512`. Claim: jitter the bounded provider-429
retry so a transient outage reports NOT RUN rather than RED. The design is sound and the layering
(NOT RUN as the semantic, retry as an optimisation) is the right call.

**FINDING — the classifier violates the contract its own header states.**
`web/test/helpers/provider-availability.ts` says:

> WHAT THIS MUST NOT DO: swallow a genuine failure. ... A 200 with a wrong vector, a 400, or a 401
> is the provider working and answering — those stay RED.

`isProviderUnavailable()` decides by regexing **free-text message bodies** for `429|500|502|503|504`.
Reachability confirmed against the shipped path: `src/lib/teacher/deepinfra.ts:46` throws
``Expected a 1024-dim embedding, got ${vec?.length}`` on a **200 OK with a wrong vector** — exactly
the case the contract says must stay RED. Measured:

```
got=1024 -> RED (correct)     got=500  -> SKIPPED as "provider unavailable"  <-- contract says RED
got=768  -> RED (correct)     got=502  -> SKIPPED as "provider unavailable"  <-- contract says RED
got=512  -> RED (correct)     got=503  -> SKIPPED as "provider unavailable"  <-- contract says RED
got=none -> RED (correct)     got=504  -> SKIPPED as "provider unavailable"  <-- contract says RED
                              got=429  -> SKIPPED as "provider unavailable"  <-- contract says RED
```

Opposite direction, also reachable (`deepinfra.ts:34` interpolates the response body):
a real `429 Too Many Requests: retry after 400 ms` hits the `\b(400|401|403|404)\b` early-return
and is reported as a **genuine failure** — a false RED. (`400ms` without the space does not, because
`\b` requires the boundary. The classification depends on provider whitespace.)

**Not reachable, checked and ruled out:** assertion text cannot reach the classifier. Both call
sites (`section-vector-pairing.test.ts:166` and `:176-188`) wrap `embedQuery(...)` alone, so vitest
timeouts and `expected 500 to be 200`-style messages never enter it. Reported here because the
distinction is the finding's whole severity.

**Class.** This is watchlist instances 17/18 — *an extraction whose match set is wider than the
property, read as the property* — introduced by the tranche that exists to make a flaky gate honest.

**Severity LOW, not blocking:** it needs a 200 response whose vector length is exactly one of five
values, or a provider body with a space before `ms`. **Remedy** (not applied by the verifier): carry
the HTTP status as a structured field on the thrown error and branch on that, instead of regexing a
free-text message.

---

# Wave 7 continued — 2026-08-23 (same independent verifier)

## Binding red-proofs — test kept, fix reverted to base, watched go RED, restored green

| item | red without fix | note |
|---|---|---|
| W-DRAIN | **2 failed** | `queue.ts` reverted → drain-failure-semantics red |
| W-DOCRESTATE | **2 failed** | base docs restored → STATE_OF_TRUTH + HELDOUT_EVAL_DESIGN legs red; 16 green on branch. (First attempt reverted a nonexistent script and stayed green — the fix is DOC edits; corrected.) |
| W-L2TOGGLE | **3 failed** | `plans-client.tsx` reverted → optimistic-toggle legs red |
| W-SEC-CURSOR | **1 failed** | sections route + history-results reverted → invariant red |
| W-HISTSCOPE | n/a (live) | Both directions executed against dev (27s real DB): historian/published-only with verbatim excerpts PASS; entity anchored only out-of-scope returns nothing PASS. The F4 true positive, closed and proven in the leak direction |

## State-measurement verifications (the claim re-measured, not read from the log)

- **W-EUSEBIUS** — dev: `schaff-npnf201` staged · father · 588 sections. Matches the item file.
- **W-THAYER** — dev: 484 oversized sections (max 34,598) with **0 lacking the model vector**; tool
  dry-run reproduces the census. NOTE my first check was wrong: the tool re-embeds to D1(b) from the
  leading slice and leaves bodies intact BY DESIGN — "0 oversized remain" was never the claim. The
  0.9994–0.9998 vintage-reproduction leg rests on the tool's own log + VERIFICATION.md (not re-executed;
  would cost one embed call per section).
- **W-RELVOICE** — dev: `idx_embeddings_vector` DROPPED (ledger + pg_indexes agree); fresh EXPLAIN of
  the sweep shape plans `Index Scan using idx_embeddings_served_legal`. Prod apply stays packet B1.
- **W-SEC1** — deps-audit RE-EXECUTED in the branch's installed environment: "no un-ignored
  high/critical advisories across 512 prod packages (8 ignored per SECURITY.md)". `@neondatabase/auth`
  `^0.5.0-beta` confirmed in the branch's package.json.
- **W-REGDURABLE** — tool executed: dry-run is the default, census runs, "0 row(s) to serve" on dev
  (consistent with the dev-flip-moot finding), nothing written.
- **W-DEVROW / W-ANCHORBACKFILL** — MOOT, measured: `user_documents` = 0 rows on BOTH devs; no stuck
  row, no pre-detection population. Prod anchor backfill stays packet B5.

## Evidence-existence verifications (artifact opened, content plausible; not re-executed)

- **W-FILE3DOCS** — all three previously NOT-YET-FILED programme docs exist on the branch
  (WORKORDER_V2.md, PROGRAM_BRIEF.md, 2026-07-31-strategy-two-lanes.md).
- **W-HISTBACKLOG** — foxe-ccel-probe.txt is a real fetch transcript of the ThML endpoint; the
  A5 packet row (no ThML edition at any CCEL id) matches it.
- **W-UX2VERIFY** — 533KB CDP screenshot at 1280px + the MASTER UX-2 row correction.
- **W-ADRV4RERUN** — PRE-REG + RESULT + bait-run.log + pn20-capture.json present; its 17/20 is
  the same number W-PN20 measured independently (two runs, one number, same three misses).
- **W-UX3** — 67 test files / 267 tests green on its branch.

## Deferred to the integrated candidate (deliberately)

Browser legs for UX3 / L2TOGGLE / SLICE4 / SEC-CCEL-edition: a 390px + desktop walk of the
MERGED tree is the meaningful check — per-branch screenshots can't see cross-branch breakage.
Runs after Wave 8 integration, before deploy.

## Verdict summary

Every non-MOOT item: **VERIFIED** (W-VEC429 carries its LOW classifier finding, filed above).
No item failed verification. Two verifier-side errors were made and corrected en route
(DOCRESTATE wrong-file revert; THAYER wrong-property check) — both are recorded here rather
than silently redone, per the repo's correction discipline.
