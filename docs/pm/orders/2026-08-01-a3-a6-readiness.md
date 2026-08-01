> **STATUS UPDATE 2026-08-02.** This order's verdict on A4 was true when written and is now spent:
> the writer and the prod-capable verifier it specifies were built the same night (`977bcef`),
> audited, six defects fixed (`cf7c65d`), and put under test (`fd7a791`). **A4 is READY and waits
> only on the owner.** A6 is unchanged — still the two-clone problem and the Vercel link. Both
> "no safe prod writer" lines below are left in place because this is a dated order, not a board;
> the board is [MASTER.md](../MASTER.md), and it now says READY.

OUTCOME: A3 and A5 can run tonight. **A4 and A6 cannot** — not for want of a decision, but because
A4 has no safe writer and no verifier that will run on production, and neither clone on this machine
can complete `deploy.sh`. Five claims were checked adversarially by independent sessions; four came
back PARTLY_WRONG or REFUTED, including two of mine. What must be built is specified below.

# A3–A6 readiness — what is ready, what must be built, what cannot be ready tonight

**Filed 2026-08-01.** Commissioned to answer one question: can A3 → A4 → A5 → A6 be executed in one
evening? Every claim below was verified against the tree by a session that did not write it, with
instructions to REFUTE rather than confirm. Citations are file:line.

---

## Summary

| gate | verdict | why |
|---|---|---|
| **A3** adjudicate the census | **READY, needs one small tool** | rules already exist and are red-proved; nothing runs them on A2's output |
| **A4** publish flip | **NOT READY** | no safe prod writer; its own §4 verifier refuses prod; `PUBLISH_FLIP.md` has never been run and its work list is empty |
| **A5** prod instrument | **READY AS-IS** | one command, read-only — but see the three meanings of "A5" |
| **A6** Deploy A | **NOT READY** | code and corpus are in different clones; no Vercel project link |

---

## Corrections to what I previously reported

Recording these because I asserted them and they were wrong.

**1. "No prod-write path exists in `scripts/`." PARTLY WRONG.** `db/apply-migration.mjs:24-27`
refuses non-dev **only** when `MIGRATE_ALLOW_PROD !== '1'`, and `:33` runs every statement in the
file. `cutover.mjs:268` already passes `MIGRATE_ALLOW_PROD: '1'` to its children. So the flip is
physically executable tonight via a hand-written `.sql`. **That is the unsafe path and must not be
the plan of record:** boolean env guard, no endpoint-id declaration, no licence gate, no provenance
gate, no owner prompt, no snapshot.

**2. "Every safe credential path mints `app_runtime`." REFUTED.**
`neon-connection.mjs:35` — `mintNeonConnectionString({ branch, role, project, apiKey })` mints
**any** role for **any** branch; `branchForTarget` maps `ep-odd-fog` → `production`. The repo's own
audit says so (`docs/evidence/work-order-v2-tranche0/0.4-second-door-report.md:25`). And
`repair-unit-ordinal.mjs:70-88` **already** mints `neondb_owner` and asserts it at `:117-119`. So a
guarded prod-owner minting pattern exists and should be reused, not invented.

**3. What holds:** `db/migrations/010_revoke_corpus_writes.sql:16` revokes INSERT/UPDATE/DELETE on
`sources` from `app_runtime`, and no later migration re-grants it (the only post-010 GRANT is
`016:39`, `SELECT` on a different table). A4 genuinely needs `neondb_owner`.

---

## READY AS-IS

### A5 — the prod instrument over the published cohort

Nothing to build. Read-only, `NEON_API_KEY` in env only, `ROLLBACK` in `finally`
(`unit-ordinal-instrument.mjs:168`), read-only + role asserted at the server
(`neon-connection.mjs:75-85`).

```bash
NEON_API_KEY=<key> node scripts/unit-ordinal-instrument.mjs --read-only --target=ep-odd-fog --cohort=published --out=docs/evidence/work-order-v2-stage2/2.2-prod-unit-ordinal-published.txt
```

`--cohort` is mandatory (`:56-62`, exit 2). **The command block at
`docs/evidence/work-order-v2-stage2/README.md:60-64` omits it and is stale.**

**Two legitimate aborts that are NOT ordering failures**, and must not be reported as one:
the positive control at `:104-107` if `published = 0`, and "no manifest-eligible works in cohort"
at `:155-157`. The second is live: `STATE_OF_TRUTH.md:117` records barnes-notes carrying 1,300
staged biblehub-provenance sections, which `excerpt-sample-policy.mjs:32-58` makes ineligible. If
every flipped work is ineligible, **A5 aborts non-zero on prod even with `published > 0`.**

### "A5" means three different things, and the board conflates them

`MASTER.md`'s A5 row says *"Prod instrument run — G10 stops being permanently skipped."* Those are
not the same task:

- **the instrument over `--cohort=published`** — ready, command above;
- **G10 discharged** — *cannot run tonight*, see below;
- **the G10 leg of the regression gate on prod** — needs a prod **owner** connection and a passing
  write-capability probe (`cutover.mjs:155-158`), so it is not a read-only gate and needs its own
  owner go; and it drags G1–G9 along, including write-then-rollback probes against live user tables.

---

## MUST BUILD

### 1. `scripts/publish-flip-adjudicate.mjs` — A3, offline, no database

Reads A2's report; emits the §1 table for `PUBLISH_FLIP.md:31-33` and
`docs/evidence/work-order-v2-stage2/flip-slugs.json`.

Admission is membership in `SERVED_PROSE_WORKS ∪ SERVED_LANE_WORKS`, **imported** from
`web/src/lib/teacher/routing`.

> **CORRECTED at adjudication (2026-08-01):** A2 proved that definition admits **zero**
> production works — no prod slug is in either list; admission on prod runs entirely through
> `LEGAL_CORPUS_FILTER`'s author legs. A3 was adjudicated on the measured row-admission instead
> (`admitted := ADMITTED rows > 0` per work), which is MASTER.md:37's work-grain intent. The
> departure is recorded in [the A3 record](../../evidence/a3-adjudication-2026-08-01/README.md).

Verdicts come from the already-red-proved `admissionFindings` / `censusVerdict` in
`scripts/lib/publish-flip-census.mjs:25,124` — **never re-typed**, because a census that re-types
the serving predicates measures a population the product does not serve.

Refuse (exit 2) unless `cohort === 'staged'`, the host is the prod endpoint, and every line parses.
**Exit 1 on any published-but-not-admitted work — that is the A3 STOP.**

*Why this is needed:* `publish-flip-census.mts` refuses production outright and deliberately
(`:24-26`, *"PRODUCTION IS REFUSED OUTRIGHT. Not by a declaration the operator can satisfy"*). So
the STOP rules exist, are testable, and currently cannot run where A3 needs them. Without this,
A3 is a human eyeballing a table against rules that are already code — the watchlist's second shape.

### 2. `scripts/publish-flip.mjs` — A4 writer, with `--reverse`

- **Credential:** `CUTOVER_DATABASE_URL` from env only. Never `~/theology-study-app/.env.local`
  (`publish-works.mjs:14`), never argv, never printed; scrub errors through `scrubCredentialText`.
- **Target guard:** `assertCutoverTarget(url, { allow, declared })` (`target-guard.mjs:98`) — prod
  reachable only by an **exact endpoint-id declaration** on top of an explicit allow flag. Not a
  substring match (`publish-works.mjs:17` uses `.includes()`).
- **Role:** assert `SELECT current_user = 'neondb_owner'` at the server, `cutover.mjs:151-152` shape.
- **Owner gate:** on a prod host, an interactive stdin stop requiring the literal word `publish`
  (`cutover.mjs:690-700`), **refusing when stdin is not a TTY** so a piped "yes" cannot satisfy it.
- **Slugs:** read literally from `flip-slugs.json`. No predicate, no argv slugs.
- **Snapshot:** write `slug,status` for **every** row of `sources` to
  `flip-pre-snapshot-<ts>.json` *before* commit.
- **In-transaction:** the `PUBLISH_FLIP.md:45-53` UPDATE with `AND status='staged'` (idempotent);
  assert `rowCount` matches the snapshot's staged count for those slugs; re-read and assert the only
  deltas are the listed slugs; then the licence + provenance gates — **importing** `ALLOWED_LICENSES`
  and `forbiddenProvenanceDomain` rather than re-typing them, which is the one thing
  `publish-works.mjs:11-12` gets wrong. `ROLLBACK` on any mismatch.
- **Prerequisite:** extract `ALLOWED_LICENSES` from `src/ingest/license-manifest.ts:21` into an
  `.mjs`, mirroring `src/ingest/forbidden-provenance.mjs`, because the prod path must run under
  plain `node` (`test/prod-path-no-transpiler.test.ts`).

**Red-proof without production**, against a throwaway local Postgres — the precedent this repo
already set: bad licence → rollback, statuses unchanged; forbidden `sections.source_url` → rollback;
a staged work not in the list stays staged; second run flips 0 and exits 0; `--reverse` restores
exactly the listed slugs; non-owner role → refuse; prod-shaped `.invalid` host with and without the
allow flag, and uppercase → refuse.

### 3. `scripts/publish-flip-verify.mjs` — the §4 before/after, prod-capable, read-only

`publish-flip-census.mts` cannot serve: it refuses prod, **and** its `WHERE status IN ($1,'published')`
(`:77,:92`) means a before/after run with different `--cohort` values compares different populations.

Read-only via `resolveInstrumentConnection({ role: INSTRUMENT_ROLE })` (`app_runtime` keeps SELECT),
`BEGIN; SET TRANSACTION READ ONLY`, `assertReadOnlySession`, `ROLLBACK` in `finally`. **Fixed
population, not cohort-parameterised**, so `diff before.log after.log` means the flip and nothing else.

---

## CANNOT BE READY TONIGHT

1. **G10 discharge.** Needs a target carrying ≥1 published section with non-NULL `unit_ordinal`;
   `cutover-gate-redproof.mjs:31` `assertThrowawayTarget` refuses both prod and dev. The only such
   target is a **Neon fork**, and branch creation is forbidden by the standing rails and is an
   owner-level call (ADR-043). **ADR-043 requires G10 PROVEN *before* the flip reaches production.**
   So A4 either proceeds as a knowing, written departure from ADR-043, or waits.
2. **Rehearsal of the flip on a fork** (`PUBLISH_FLIP.md:26,:90-97`). Same reason. **The first
   execution of the new writer against real data will be production.** The only compensations are
   the local-Postgres red-proof, the in-transaction verification, and `--reverse`.
3. **A Neon restore point** (`PUBLISH_FLIP.md:99`). Rail 1's mechanism is `neonctl branches create`,
   forbidden; PITR is 6 h and `RECOVERY.md:8` says it is not a restore plan. The substitute is the
   pre-flip snapshot plus the exact reverse, which restores `sources.status` **and nothing
   downstream**. The owner must accept that downgrade explicitly before the go.
4. **A6 — the two-clone problem.** See `DEPLOY_PREFLIGHT.md` §9. The corpus lives in a clone 29
   commits behind that still carries the build-breaking route; the current code has no corpus.
   Fast-forwarding the corpus clone fixes it, and no document named this before today.
5. **A6 step 7.** No `.vercel/project.json` in any clone; the CLI authenticates into scopes that do
   not contain the project. Whether `vercel --prod` resolves it non-interactively is **NOT
   ESTABLISHED**. This is an owner/Vercel-account action, not something buildable.

---

## Document corrections that must land with the code

- `docs/evidence/work-order-v2-stage2/README.md:60-64` — the printed instrument command omits
  `--cohort=` and exits 2.
- `PUBLISH_FLIP.md:103-113` — prescribes a post-flip verification with a tool that refuses prod.
- `docs/RECOVERY.md` Rail 6 — says "snapshot per Rail 2"; Rail 2 is Vercel Instant Rollback, which
  *"Destroys | Nothing in Neon"*. The database rail is Rail 1.
- `DEPLOY_PREFLIGHT.md` checklist item 4 — asks the owner to confirm `corpusHash` matches the
  manifest. **The gate prints it and never compares it** (`predeploy-gate.ts:178`;
  `corpus-manifest.mjs:143-168` ratchets counts only).
