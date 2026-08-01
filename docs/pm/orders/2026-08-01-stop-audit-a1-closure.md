# STOP AUDIT — A1 closure, `ac19935..6ab5779`

> **FILING NOTE (not part of the order).** The order instructs: *"Commit this order, verbatim from the
> `# STOP AUDIT` heading down."* The text as issued carries no `# STOP AUDIT` heading — it opens at
> "A1 closure, `ac19935..6ab5779`". Rather than invent a cut point or paraphrase, it is filed in full
> from its first line, under a heading matching the one the instruction names. Nothing below is
> condensed, reordered, or improved.
>
> **This order was NOT executed by the session that filed it.** See
> `2026-08-01-stop-audit-a1-closure-DECLINED.md` — no such file exists yet, because filing one would
> require pushing a second non-order file and rail 5 forbids it; the refusal is recorded in the
> session transcript and summarised at the end of this note. The reason: 19 of the 21 commits in
> scope carry `Model: claude-opus-5` and were written by that same session, including `03516b6` (the
> commit that claims to close the four blockers) and `d44c65e` (the Stage 2 verdict that defined
> them). The order's opening premise — *"You did not write this work"* — is false for that session.
> A fresh session must run this. The order is filed so that it exists, per bylaw 1.

---

A1 closure, `ac19935..6ab5779`

You are the verifier. You did not write this work and you will not fix it. Fixer ≠ verifier (`docs/BUILD_MODEL.md` §1.4, bylaw 4). If you find yourself editing product code, you have left your seat.

## STEP 0 — before anything else

Commit this order, verbatim from the `# STOP AUDIT` heading down, to:

```
docs/pm/orders/2026-08-01-stop-audit-a1-closure.md
```

Commit message subject: `File the A1 closure STOP audit order`. `Model:` trailer required. Push it. Per bylaw 1, an order that is not in the repo was never issued — and the last time an audit was commissioned, the prompt was never filed and the audit never ran. Do not paraphrase, condense, or "improve" it on the way in. Your first `git show --stat` must show one file added.

## Read first

`docs/pm/MASTER.md` → `AGENTS.md` → `docs/THE_LOOP.md` → `docs/BUILD_MODEL.md`. Then `docs/STATE_OF_TRUTH.md`, `docs/DECISIONS.md`, `WORKLOG.md` (newest first). Then the existing record: `docs/pm/orders/2026-07-31-stop-audit-stage2.md`, `docs/pm/orders/2026-07-31-stop-verdict-stage2.md`, `docs/pm/orders/2026-07-31-weld-finding-and-order.md`, `docs/pm/orders/2026-07-31-search-programme.md`.

Do not characterise any document you have not opened.

## Scope — exactly this, nothing wider

Pinned sha: `6ab57793bfba4ae5881c04074d3afb03b3494258` on `chore/work-order-v2-stage2`. Base: `ac19935122d8293c24b83c95ccc062a13a99ad86`.

`git log --oneline ac19935..6ab5779` is 21 commits:

```
6ab5779  §6: the rollback target id is unverified — BLOCKED
b9ad463  §2: restore the three corpus dirs, and DERIVE the gate's expected set
19798ec  §1: CI builds the app
fed8b32  Fix the audit regression I introduced at c1e359d
68b14ad  T5+T6: the metric paper, and the board
f462114  T4: a provider outage is NOT RUN
bf34b21  T2+T3: DEPLOY_PREFLIGHT rewritten; corpus SPOF corrected
c1e359d  T1: the production build was BROKEN at HEAD
d1576fe  Record the unearned RED
ca53457  B-1 RESULT: the set could not be built
37f3be2  B-1 pre-registration §3a
f5dd867  Settle the two-embedding-models contradiction
0f33fe8  B-2: the B4 translation options paper
42b2dd7  B-1 pre-registration
3e7f93c  chrysostom (16, 17) correction where the reader meets the claim
f10df90  File the search programme order
ccf7f3c  A1 board: four blockers fixed at 03516b6, not yet certified
03516b6  Close the four Stage 2 blockers (Lane A, A-1..A-4)
94da9fc  CLAUDE.md: import AGENTS.md and the programme sheet
d44c65e  File the Stage 2 STOP audit, and the order it answered
d946c14  Issue programme sheet under docs/pm
```

This is not a re-audit of Stage 2. The 12 inventory items verified at `ac19935` stay verified; do not re-do them. You are auditing (A) whether the four blockers are actually closed, and (B) the 21 commits, which no independent eye has ever seen.

## Rails

1. No production connection. Read or write. None. `ep-odd-fog` is off limits.
2. No data writes anywhere, dev included. Read-only queries against dev are expected and welcome.
3. No merge. No deploy. No `deploy.sh`, no `vercel`, no publish flip, no migrations, no ingest, no `cutover.mjs`. No Neon branch created or deleted; `br-late-recipe-atxl68sh` is protected (`docs/PROTECTED_BRANCHES.json`).
4. No fixes. You report; you do not repair. If a defect is one character and obviously safe, still do not fix it — name it and let the record show the builder closed it. The whole point of this seat is that it is not the other one.
5. One agent, one working tree. Do not push to `chore/work-order-v2-stage2` except the STEP 0 order file and your final verdict file. Both are documentation.
6. `npm run audit` and `cd web && npx next build` are permitted and expected — they write only gitignored build output.
7. `Model:` trailer on every commit.
8. Conclusions no wider than the evidence. NOT RUN is never PASS. PARTIAL is never DONE. If you cannot reach an endpoint or a credential, that leg is NOT RUN and says so — the previous auditor had no dev credentials and correctly recorded the 61,486-row repair as UNVERIFIED rather than upgrading it. Do the same.
9. Verify by re-execution, not by reading. A red-proof you did not watch go red proves nothing (`docs/THE_LOOP.md` rule 4). Where a commit claims a four-state proof, reproduce at least the seeded-red state yourself, or record it as unverified.
10. Report both CI jobs by name — `audit` and `db-invariants` — from `gh run view`, not from memory. `docs/pm/MASTER.md:106` lists "'audit green' while `db-invariants` is red" as a known shape, with one documented instance at `:108-110`.

## Part A — are the four blockers actually closed?

`docs/pm/MASTER.md:52-55` states them; `03516b6` claims to close all four. For each, answer CLOSED / NOT CLOSED / PARTIAL, by re-execution:

* B-1 — the causal sentence. `db-invariants` went red→green because data on `ep-tiny-hat` and `ep-tiny-bonus` was rewritten, not because code changed. Is that now recorded where a reader meets the claim — `docs/STATE_OF_TRUTH.md` §2e and the evidence index — and does the recorded account match the runs? Confirm the rival explanation (the `+56`-line refactor beside the flip) is ruled out by loading both versions of `scripts/lib/unit-ordinal-instrument.mjs` yourself, not by trusting that it was.
* B-2 — `REQUIRED_GATE_PREFIXES` typed, not derived. The stated defect: adding a `G11` leg leaves the check and its test green because the test builds its reported set from the constant it validates. Property to test: adding a new gate leg to `scripts/cutover-regression-gate.mts` that is absent from the expected set makes `web/test/invariants/gate-leg-inventory.test.ts` go RED. Seed it in real product code, watch it, revert it. If it stays green, B-2 is not closed regardless of what the commit says.
* B-3 — the perturbation suite ran the unscoped 024 backfill and healed a seeded NULL, erasing the drift the published leg exists to detect. Property: a perturbation may not write to a source it does not own, and may not repair the defect it measures. Prove it, don't read it.
* B-4 — the weld check lived only in `scripts/repair-unit-ordinal.mjs`, not in the instrument, not in CI, no test. Ordered into the CI instrument as BLOCKING by `docs/pm/orders/2026-07-31-weld-finding-and-order.md` §1 and did not land there. Property: a seeded weld makes the CI instrument RED. Seed one, watch it.

Also settle, since MASTER says it is verified-but-not-closed: the repair's execution (61,486 rows on each of two endpoints) rests on the tool's own log. If you have dev credentials, re-measure. If you do not, say NOT RUN and do not soften it.

## Part B — the 21 commits nobody has audited

For each, the property is stated; find whether it holds. Do not accept a commit message as evidence for its own claim.

1. `c1e359d` + `fed8b32` — the build fix. `test/ask-max-duration-literal.test.ts` is the anti-drift guard. Property: reintroducing a non-literal route segment export makes both `next build` and the guard test RED. Seed it, watch both. Then check `fed8b32` — `c1e359d` introduced an audit regression that had to be fixed one commit later; establish what it was and whether anything of that class remains.
2. `19798ec` — CI builds the app. `.github/workflows/audit.yml:55-65`. Property: a commit that does not compile cannot be green. Is the step actually blocking (no `continue-on-error`, `set -o pipefail` present, non-zero propagates)? Is it in the job whose conclusion the merge gate reads? Does the second annotation fire on the class of error it claims to catch? And the question nobody has asked: is `audit` a required check, or is a green check merely advisory? That is not in the repo — read it from the API, and use `GET /repos/{owner}/{repo}/branches/main`, not the branch-protection endpoint, which returns 403 on this plan. The PM has already read that endpoint and got `"protected": false` with no required checks; treat that as a claim to adjudicate, not a fact, and report what you see.
3. `b9ad463` — the derived served-asset set. `scripts/lib/served-assets.mjs`. Property: a served static directory that no hand-maintained list mentions is still accounted for by `scripts/predeploy-gate.ts`. Reproduce the commit's state 3 yourself — add a ``fetch(`/<newdir>/${id}.json`)`` in `web/src` only, touch no list, and confirm the gate names it. Then the harder question: `assertServedAssetsScannable()` refuses when a root-absolute fetch builds its first segment from a variable — **does it actually refuse, and does it under-read silently in any case it does not refuse on?** A completeness check that quietly finds nothing is the defect this file exists to prevent. Note also that the typed `COMMENTARIES_DIR` and the `public/bible/` licence check survive alongside the derived set (`scripts/predeploy-gate.ts:26, 90, 138-154, 169, 210`) — say whether that is a residual instance of the recurring class or a deliberate belt-and-braces.
4. `f462114` — provider outage is NOT RUN. `web/test/helpers/provider-availability.ts`, `web/test/invariants/provider-availability.test.ts`, wired into `web/test/invariants/section-vector-pairing.test.ts`, extending `web/test/helpers/loud-skip.ts`. Property: a provider outage reports NOT RUN; a genuine failure reports RED; neither is ever reported as PASS. Both directions, re-executed. Then the adversarial question: can this be used to launder a real failure as a provider outage? What does it do with a 500, a timeout, a malformed response, an auth error? The builder's own log records that its first version of state 3 stayed green — check whether the case that finally proved the guard is the case that matters in production.
5. `bf34b21` — `docs/DEPLOY_PREFLIGHT.md` (241 lines) and `docs/RECOVERY.md`. This is a documentation tranche, so scale rigour accordingly — but it is the document the owner will hold in his hand during Deploy A, so its claims must be checkable. Property: every factual claim in `DEPLOY_PREFLIGHT.md` is verifiable against the tree, the API, or a committed measurement, and none of it is guessed from reading `deploy.sh`. Spot-verify at least the gate sequence, the "what is uploaded that is not in git" section, and the rollback section.
6. `bf34b21` / `6ab5779` — the rollback target. `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` is recorded as BLOCKED. Confirm the repo now says so everywhere a reader meets the id, and that no document still uses it as an operative instruction.
7. `f5dd867` — the model-conflict correction block at `docs/SERMON_COMPANION.md:63-101`. The architectural finding (ADR-005 at `docs/DECISIONS.md:20` pins `bge-large-en-v1.5` and rejects mixing; ADR-014 at `:47` makes the Qwen reranker non-removable; `web/src/lib/teacher/routing.ts:18` ships Qwen) — verify it. Then verify the block's own supporting claims, which are what a reader will cite. Adjudicate independently; do not take the PM's word or the builder's.
8. `42b2dd7` / `37f3be2` / `ca53457` — B-1. Property: the pre-registration was complete and data-free before any corpus was fetched, and the harness was not widened after seeing the data it failed on. The parser-unchanged claim is checkable from git. The pre-registration-before-data claim is not — the amendment precedes the result commit by about three minutes and rests on the commit message's own attestation. Say plainly which of the two you can establish and which you cannot. Then verify the numbers in `docs/evidence/slice0-k-revalidation/RESULT.md` against the sources they claim, including the positive control.
9. `68b14ad` — `docs/evidence/slice0-k-revalidation/METRIC-PROPOSAL.md` and the board. The paper argues stated-text recall may be the wrong metric. You are not being asked to rule on it. You are being asked: does it state what it can and cannot establish, is its proposed ground truth non-circular, and does it anywhere present an argument as a measurement?
10. `d946c14` / `d44c65e` / `ccf7f3c` / `f10df90` / `3e7f93c` / `94da9fc` / `0f33fe8` — the governance and paper commits. Light pass. The one property that matters: no document in this range claims a status its evidence does not carry.

## Part C — the standing question

`docs/pm/MASTER.md:99-136` tracks a recurring defect class in three shapes: a hand-maintained expected set nothing enforces; a verdict computed separately from the report of that verdict; a correction filed where the reader will not meet the wrong version.

`b9ad463`'s commit body, §2.2, calls itself "THE NINTH INSTANCE" and closes it by derivation rather than by adding another list. (Its subject line is `§2: restore the three corpus dirs, and DERIVE the gate's expected set` — read the body, not the subject.)

Sweep the 21 commits for a tenth. Specifically: did any commit in this range introduce a new typed set, a new predicate mirrored rather than imported (rail 7 of the overnight order), or a correction filed somewhere a reader will not reach? Name each with `path:line`, or state that you found none and what you searched.

## Part D — claims already in dispute, to adjudicate independently

These have been asserted by others. They are claims, not facts. Reach your own verdict on each and cite it; do not inherit anyone's answer.

* Whether `docs/pm/MASTER.md` is currently accurate about CI, about `DEPLOY_PREFLIGHT.md`'s length, about the instance count, and about the working-branch sha it pins at `:6`.
* Whether `docs/STATE_OF_TRUTH.md:284` and `docs/SERMON_SEARCH_DESIGN.md:3` can both be true, given `AGENTS.md:24` tells agents to prefer the former.
* Whether the correction block at `docs/SERMON_COMPANION.md:63-101` contains any claim that is itself false.
* Whether `docs/pm/orders/` contains anything that could be read as a post-fix certification of the four blockers. (If your reading is that it does, say so — it would change the answer to this whole order.)

## The verdict

File it at:

```
docs/pm/orders/2026-08-01-stop-verdict-a1-closure.md
```

Line 1 is an `OUTCOME:` banner in the style of the existing verdicts in that directory. Then, per item: VERIFIED / NOT VERIFIED / PARTIAL / NOT RUN, each with `path:line` or re-executed output. Then a coverage section: what you did not touch, what you could not reach, and what credential or authorisation would have been needed.

Close with one sentence, unhedged: is A1 closed, and may PR #48 merge? You are not authorising the merge — that is the owner's — but he needs your answer to be a sentence, not a paragraph.

## The receipt

```
HEAD:        <sha>
CI:          audit=<conclusion>  db-invariants=<conclusion>   (from `gh run view`, not memory)
RED-PROOFS:  <file> → seeded <what> → <exit> → reverted → <exit>
EVIDENCE:    <paths committed this run>
MODEL:       <model that produced this>
DIRTY:       <git status --porcelain, verbatim>
```

## Then answer three questions, in your own words

1. What did you change that I did not ask for?
2. What did you find that is not in this order and that the owner would want to know?
3. Where were you tempted to assert a property rather than prove it?

Then STOP. Do not merge, do not fix, do not start the next thing.
