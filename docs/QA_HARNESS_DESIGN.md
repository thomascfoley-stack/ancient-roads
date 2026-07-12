# QA Harness — Design

**Status:** Design for approval. No code until approved.

**The rule this exists to enforce: nothing ships that isn't verified, and no bug is ever found twice.**

## Why this is NOT the `deep-audit` skill

| | `deep-audit` skill | QA harness |
|---|---|---|
| Finds | **Unknown** defects | **Known** defects recurring |
| Cost | Expensive (4–8 agents) | Cheap (seconds) |
| Cadence | Before deploy / after autonomous runs | **Every commit** |
| Enforced by | An agent choosing to run it | **CI — the build goes red** |

The audit is a flashlight. The harness is a fence. **The loop between them is the whole point: every finding the audit produces becomes a permanent test.** Find once, fix once, never again.

**The gap that makes this urgent:** `web/` currently has **no test runner in CI**. The `LEGAL_CORPUS_FILTER` — the existential licensing invariant — has **zero automated coverage**. A one-character edit to it passes `npm run audit` and ships.

---

## Layer 1 — INVARIANTS (always true; red build if violated)

These are the product's non-negotiables. They are not "tests of features" — they are **assertions that the product is still itself.**

- **Licensing (existential):** *no* read path returns a non-published author or forbidden provenance. Test **every** path independently — teacher retrieval, `/api/search/commentaries`, and the static `web/public/commentaries/*.json`. A new path that skips the filter must fail the build. (Today: only one of three is filtered, and none are tested.)
- **Wallet:** *no* route that spends on embeddings/LLM is unauthenticated or unrate-limited. Enumerate routes from the filesystem; any new money-spending route without both → red. (This would have caught `/api/eval/bait`.)
- **Tenancy:** user A cannot read or write user B's data. Two-account test, executed — not "RLS policy looks right." (Belt AND suspenders: RLS *and* an explicit `user_id` filter.)
- **Faithfulness:** unverified model text can never reach a user; the verifier fails closed on error.
- **Provenance:** every `published` work has licence + permitted source + translator/editor + edition year ≤1929 + a recorded text-match score.
- **Secrets:** none in logs, none in the client bundle, none in prompts.
- **Frozen sets:** every held-out eval file's hash is verified **before** the run; mismatch = fail closed.

## Layer 2 — PIPELINE GATES (numbers; run on change to that pipeline)

Each pipeline owns a gate with a **pre-registered bar**. Changing the pipeline re-runs its gate.

| Pipeline | Gate | Bar |
|---|---|---|
| **Retrieval** | frozen held-out eval, per-category + failure codes | verse-ref/pericope/proper-noun/controls/no-content bars; topical/epistle HIT@2 ≥85% |
| **Faithfulness** | `interpretation_bait` through the **live** `teach()` | ≥99% |
| **Content/licensing** | coverage anti-join = 0; licence gate; provenance gate | fail closed |
| **Ingestion** | per-work shingle text-match vs the named PD edition | ≥ threshold, else quarantine |
| **API surface** | contract tests per route: status, error envelope, `Retry-After`, no internals leaked | exact |

## Layer 3 — REGRESSION SUITE (every bug, forever)

**One test per finding in `REMEDIATION_CHECKLIST.md`, named for the bug.** Seed the suite with today's audit:

- `search-endpoint-applies-legal-filter`
- `static-commentaries-contain-no-forbidden-provenance`
- `bait-route-is-authed-and-rate-limited`
- `get-messages-filters-by-user-id`
- `add-message-rejects-foreign-channel`
- `rate-limiter-does-not-charge-day-quota-on-refused-request`
- `app-runtime-cannot-write-corpus-tables`
- `error-logs-contain-no-upstream-text`
- `library-snippet-is-escaped` (XSS)
- `frozen-eval-hash-matches`

**Rule: no fix merges without its regression test.** This is what makes quality ratchet instead of oscillate.

## Layer 4 — LIVE SMOKE (post-deploy, against production)

A deploy is not done until these pass **against the deployed URL**. Fail → automatic rollback.

- Gate wall live · unauth `/api/ask` → 401 · rate limit → 429 + `Retry-After`
- An answer cites **only** published authors
- Reader + library load; **mobile viewport (390px) usable**
- `/commentaries/<book>/<ch>.json` contains no forbidden provenance

*(`CLAUDE.md` rule: **committed ≠ live**. Layer 4 is what makes that enforceable.)*

---

## Wiring

- `npm run qa` runs Layers 1–3. **CI runs it on every push.** Nothing merges red.
- `npm run qa:smoke -- <url>` runs Layer 4 post-deploy; `deploy.sh` calls it and rolls back on failure.
- **`web/` gets a test runner** — today it has none, which is why the entire route + licensing layer is uncovered.
- Layer 2 gates are expensive (LLM calls) → run on pipeline-touching changes and pre-deploy, not on every commit.

## Definition of Done, amended

CLAUDE.md's DoD gains one clause: **AND its regression test exists.** A fix without a test is not done — it's a fix that will be re-found.
