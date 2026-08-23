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
