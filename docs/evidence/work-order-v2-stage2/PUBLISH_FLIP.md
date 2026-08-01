# PUBLISH FLIP — the plan. **EXECUTED 2026-08-01 20:32:31Z.**

**Top line, one sentence: after this flip a visitor stops seeing an empty library and starts
seeing the works listed, opened and searched — nothing about the text changes, only whether
the product will show it.**

Status: **EXECUTED.** The flip ran against production (`ep-odd-fog-atnykudm`) on 2026-08-01 at
20:32:31Z, owner-executed at a terminal, six works `staged -> published`. Evidence:
`flip-before.log`, `flip-after.log`, `flip-pre-snapshot-2026-08-01T20-32-31-268Z.json`; board row
`docs/pm/MASTER.md` A4; record `docs/pm/orders/2026-08-02-a4-publish-flip.md`.

> This header read "written, never run" for eighteen hours after the flip, in the file the
> owner-level go is called against — while §2 of this same document carried a correction block
> about code landing and its correction not. The 2026-08-02 deep audit found it (M2). What the
> flip did NOT discharge is listed in §3: four preconditions were unticked at execution time and
> two of them are still open — the restore-point id (§5) was never captured, and the mandatory
> human read of a flipped work (§4) cannot run until A6. The publish flip is an owner-level call (AGENTS.md: content quarantine, prod
deletion and deploy timing are not agent decisions), and this file exists so that the call
can be made against a written plan instead of against an agent's improvisation at the
console.

---

## 1. Which works, and why

**This list is an OUTPUT of the census, not an input, and it is deliberately empty here.**

I could not name the works: doing so requires reading `sources` on production, which this
work order forbids. What is known from ADR-042's recorded read and `STATE_OF_TRUTH.md` §2d
is only the shape — **7 sources, all `staged`, 0 `published`, 72,863 sections.**

Fill this table from a census run, and from nothing else:

```bash
PUBLISH_FLIP_DATABASE_URL=<rehearsal fork url> npx tsx scripts/publish-flip-census.mts \
  --target=<fork endpoint id> --cohort=staged \
  | tee docs/evidence/work-order-v2-stage2/flip-census-<fork>-<ts>.log
```

| slug | register | why it should be published | admitted by §1? | forbidden rows becoming reachable (§2) |
|------|----------|----------------------------|-----------------|----------------------------------------|
| `adam-clarke` | commentary | full commentary, 12,693/12,693 sections admitted by the serving filter | yes | 0 (measured: 0 forbidden `source_url` across all works) |
| `calvin-crosswire` | commentary | 5,088 of 5,090 sections admitted (2-row shortfall recorded as residual) | yes | 0 |
| `jfb` | commentary | 15,473/15,473 admitted | yes | 0 |
| `john-gill` | commentary | 28,843/28,843 admitted | yes | 0 |
| `matthew-henry` | commentary | 4,210/4,210 admitted | yes | 0 |
| `wesley-crosswire` | commentary | 5,254/5,254 admitted | yes | 0 |

Filled by A3, 2026-08-01, from the adjudicated census — see
[`docs/evidence/a3-adjudication-2026-08-01/README.md`](../a3-adjudication-2026-08-01/README.md)
for the admission definition, the traceability shas, and why `barnes-notes` (1,300 sections,
**0 admitted**) is NOT in this table: it stays staged, and the census STOP fires only if a flip
includes it.

**A work goes in this table only if the census reports it ADMITTED.** A `published` row that
the serving predicates do not admit is the flip's worst outcome and the census stops on it:
the library would list a work, the reader would link to it, and every retrieval path would
drop it — a visitor clicking through to nothing. The "why" column is a human sentence about
that work, not a restatement of its admission.

## 2. The exact statement, and its exact reverse

Forward — one statement, explicit slugs, no predicate that could widen:

```sql
BEGIN;
UPDATE sources
   SET status = 'published'
 WHERE slug = ANY($1)          -- the slugs from §1, listed literally
   AND status = 'staged';      -- idempotent: re-running flips nothing already published
-- verify BEFORE committing (see §4), then:
COMMIT;
```

Reverse — same shape, same slugs:

```sql
BEGIN;
UPDATE sources
   SET status = 'staged'
 WHERE slug = ANY($1)
   AND status = 'published';
COMMIT;
```

Three things about that pair, each of which has bitten this repo before:

- **`AND status = 'staged'` is load-bearing.** Without it, a re-run would flip works that
  something else published in between, and the reverse would un-publish works that were
  never part of this flip. The guard makes both directions idempotent and scoped.
- **`WHERE slug = ANY(...)` with literal slugs, never a predicate.** `WHERE status='staged'`
  would publish whatever happens to be staged at the moment it runs, which is not the set
  anyone reviewed.
- **The reverse is exact but NOT a full undo.** It restores `sources.status`. It does not
  restore anything downstream that ran because the works were published — see §5.

> **SUPERSEDED 2026-08-02.** The paragraph below described `scripts/publish-works.mjs` as "the
> right tool to adapt". **That adaptation shipped** at `977bcef` as `scripts/publish-flip.mjs`,
> and this section was never updated to say so — the readiness order listed the correction under
> "document corrections that must land with the code", the code landed and the correction did
> not. Since this file self-describes as the written plan the owner-level go is called against,
> a reader following it would have reached for the dev-only script.
>
> **The tool is `scripts/publish-flip.mjs`.** It takes the credential from the environment only,
> requires `PUBLISH_ALLOW=1` for every target including dev, requires `PUBLISH_EXPECT_HOST` to
> name the endpoint id **exactly** (`ep-odd-fog-atnykudm`, not `ep-odd-fog`), asserts
> `neondb_owner` at the server, snapshots every row before COMMIT, asserts the delta, runs the
> licence and provenance gates in-transaction over the whole published set, and has `--reverse`.
> Twenty-seven of its guarantees run in CI (`test/publish-flip-toolchain.test.ts`).

The original assessment, kept because it is the reasoning the new tool was built from:
`scripts/publish-works.mjs` already does this shape with an inline fail-closed licence and
provenance gate in the same transaction, and is the right tool to adapt. **It is not usable
as-is:** it is hardcoded to dev (`ep-tiny-hat`), it reads its URL from
`~/theology-study-app/.env.local` — a path that does not exist in this checkout — and it
carries its OWN hand-typed copy of the forbidden-domain list and the allowed-licence list
rather than importing `forbiddenProvenanceDomain` / `ALLOWED_LICENSES`. That duplication is
the defect ADR-034 and Tranche 0.1 are both about, and it should be fixed **before** the
script is pointed anywhere new, not after. (`publish-flip.mjs` imports both.)

## 3. Preconditions — every one checked, none assumed

> **AMENDED 2026-08-02.** The three fork-based preconditions below **cannot be met as written**.
> Neon branch creation is forbidden by the standing rails, which the A3 record already logs as an
> accepted departure; the census that filled §1 ran offline from A2's committed artifacts instead.
> They are struck through rather than deleted so the substitution is visible: what replaced each
> one is named, and G10 is the one that is genuinely deferred, not satisfied.

- [ ] **Owner go, naming the endpoint, the script and the occasion** (ADR-042 ruling 2:
      supplying a credential is not a run authorisation).
- [x] ~~Census run on the rehearsal fork, **exit code 0**, log committed.~~ **REPLACED:** A2
      measured production read-only; `scripts/publish-flip-adjudicate.mts` applied the codified
      STOP rules offline to that artifact, exit 0, [record](../a3-adjudication-2026-08-01/README.md).
      A STOP is still a stop.
- [ ] ~~**G10 discharged on that fork**~~ — **STILL OPEN, and now explicitly deferred.** It needs
      a fork, forks are forbidden, and ADR-043 wants it before the flip. This is a knowing
      departure from ADR-043 that the A4 go must accept by name, not a box that got ticked.
- [x] ~~`unit-ordinal-instrument --cohort=staged` run on the fork~~ — **DONE on production**,
      read-only, during A2: instrument PASS over the staged cohort.
- [ ] Same instrument re-run with `--cohort=published` afterwards — this is **A5**.
- [ ] `npm run audit` green at the exact sha being flipped.
- [ ] Restore point exists and its id is written down (§5) — captured **before** the flip.
- [ ] Nobody else is working the tree (AGENTS.md: concurrent sessions have shipped each
      other's half-finished work here twice).

## 4. Post-flip verification — a census DIFF, not a fresh look

Diff a before-run against an after-run. A fresh read on its own is worth much less: it shows a
state, and a plausible-looking state is exactly what a partial flip produces.

> **CORRECTED 2026-08-02.** The commands here named `publish-flip-census.mts --cohort=published`,
> which **cannot run**: that script refuses production outright, deliberately and permanently
> (`:52-55`). Worse, it is cohort-parameterised, so a before-run and an after-run with different
> cohorts measure different populations and their diff shows the parameterisation rather than the
> flip. `scripts/publish-flip-verify.mjs` exists for this: read-only, `app_runtime` via
> `NEON_API_KEY` with no `DATABASE_URL` fallback, `SET TRANSACTION READ ONLY` asserted at the
> server, always rolled back, and its population is **fixed** — every row of `sources`, every
> register count, always. That fixity is the whole design: `diff before after` then means the
> flip and nothing else. It also prints `sources.license`, which nothing committed has ever read
> on production.

```bash
NEON_API_KEY=<key> node scripts/publish-flip-verify.mjs --target=ep-odd-fog \
  --out=docs/evidence/work-order-v2-stage2/flip-before.log
#  ...flip...
NEON_API_KEY=<key> node scripts/publish-flip-verify.mjs --target=ep-odd-fog \
  --out=docs/evidence/work-order-v2-stage2/flip-after.log
diff docs/evidence/work-order-v2-stage2/flip-before.log \
     docs/evidence/work-order-v2-stage2/flip-after.log
```

The diff must show, and must show **only**:

| § | expected change |
|---|-----------------|
| §1 | exactly the slugs in §1's table move `staged` → `published`; **no other slug moves**; every one still ADMITTED |
| §2 | forbidden-provenance rows move from `held` to `REACHABLE` **only** for works named in §1's table; the total row count does not increase |
| §3 | voice floor **does not get worse** — verses at 0 and at 1 served author both non-increasing |
| §4 | published works per register increases by exactly the flip's count; no catalog goes to zero |

Also verify by hand, because a census cannot: **open one flipped work in the reader and read
it.** The unit_ordinal instrument checks that the reading order is internally consistent; it
cannot tell you the sequence makes sense to a human. That is the Stage 2 STOP-checklist item
"human read of excerpts — coherent sequence", and it is not satisfied by a green tool.

## 5. Abort paths

| when | what to do | what it restores | what it does NOT restore |
|---|---|---|---|
| Census STOPs before the flip | nothing to undo — do not proceed | n/a | n/a |
| Verification fails inside the open transaction | `ROLLBACK` | everything; no row was ever visible | n/a |
| Verification fails after `COMMIT` | run the §2 reverse for the same slugs | `sources.status` | anything downstream that ran because the works were published |
| The reverse itself fails, or the diff shows slugs nobody listed | **STOP. Escalate to the owner.** Do not improvise a repair | — | — |
| Reader is broken but the DB looks right | this is a deploy/artifact problem, not a flip problem — see `docs/RECOVERY.md` | — | — |

**Two honest limits on "reversible".**

1. The reverse statement restores a status column. It does not restore embeddings, FTS rows,
   caches, or a deploy that shipped while the works were published. Reversibility here means
   *the flip* is reversible, not *the consequences*.
2. A restore point must be captured **before** the flip and its id written into this file at
   run time. There is no id here because nothing has been run. `docs/RECOVERY.md` §Neon
   branch restore is the mechanism; note its window and whether it has ever been exercised
   before relying on it.

## 6. What this document does not do

It does not authorise the flip, choose its timing, or name the works. It does not certify
that the works are legally publishable — that is Gate B (`check-licenses.ts`) and the
manifest, which fail closed independently and are not restated here. And it does not
substitute for reading one of the works, in the reader, with your own eyes.


---

## 6. What the 2026-08-02 deep audit found about this document and this tool

Filed here rather than only in the audit checklist, because this is the file an operator opens.

### M5 — "§4 diff verified" names a DIFFERENT §4

§4 above defines a four-row acceptance table: §1 slugs move and every one is still ADMITTED; §2
forbidden-provenance rows reachable only for named works and the total not increasing; §3 voice
floor non-increasing; §4 published-works-per-register up by exactly the flip count and no catalog
at zero.

`scripts/publish-flip-verify.mjs` emits its OWN §1 / §2 / §3 — per-source rows, published works by
register, and four totals. **A colliding, unrelated numbering.** The before/after logs contain no
admission check, no forbidden-provenance measurement, no voice-floor measurement and no catalog
count. `MASTER.md`'s A4 row said "§4 diff verified", which mapped the tool's numbering onto the
plan's table and made the claim read stronger than it is.

Those are the same two legs that could not fire at adjudication either (M4): **§2 and §3 were
unmeasurable on both sides of the irreversible write.** A5 is where they get measured.

### M6 — `--reverse` is the exact inverse of the SLUG LIST, not of the executed flip

`publish-flip.mjs:93-94` sets the direction from the flag alone and `:186-189` flips every listed
slug currently in `published`. **It never reads the snapshot.** Any listed slug that was already
`published` before the forward flip gets un-published by a reverse — a work the flip never touched.

It was exact for the 2026-08-01 run only because the snapshot shows all seven rows `staged` and
`already` was empty. That is a property of the data on the day, not of the tool, and the tool does
not check it.

### M7 — the rollback gate refuses in exactly the states where rollback is needed

`publish-flip.mjs:206-246` runs the full-corpus licence and provenance gates over
`WHERE status='published'` in **both** directions. So one unrelated illegal published row makes
`--reverse` roll back and exit 1 — the only database rollback this project has refuses to run in
precisely the corpus state where an emergency withdrawal is most likely.

Compounding it: §5's restore point was never captured (it still says "there is no id here because
nothing has been run"), Neon branch creation is forbidden by the standing rails, and the existing
rollback branch was measured `protected: false`. **There is no second rollback path for the
database.**

### M8 — no run log for the writer

Commit `4369d37` added the two verify logs, the pre-COMMIT snapshot and the board row. It did not
add the writer's stdout. `role neondb_owner (asserted at the server)` — the one line proving the
write ran as the owner rather than by hand — exists only as a hand-transcription in a commit
message, and the transcription omits it along with the target/direction header.

What the committed artifacts therefore cannot distinguish: the scripted flip from a manual `psql
UPDATE`; one flip from flip→reverse→re-flip; a flip whose gates were commented out. Neither log
carries a timestamp (deliberately, so the diff shows data only), a code sha, or a digest.

**Fix for next time, and it is one line:** pipe the writer through `tee` into
`docs/evidence/…/flip-run.log` and commit it, the way `deploy.sh` now records what it shipped.

### M9 — the Neon rollback branch is not protected

`neonctl branches get br-late-recipe-atxl68sh` returns `protected: false`, and repo-wide the only
files referencing `refuseProtectedBranchDelete` are the guard, its `.d.mts` and its own test — **no
script calls it.** A guard nothing invokes is a registry. See `docs/RECOVERY.md` §2, which carries
the console steps; it is an infrastructure action on production and belongs to the owner.
