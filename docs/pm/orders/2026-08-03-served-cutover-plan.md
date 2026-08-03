# ORDER v2 — the `served` cutover, end to end

**Issued** 2026-08-03 · **Lane A** · filed per bylaw 1.
**v2, superseding v1 in place** after a 16-agent audit returned four independent
*plan-materially-flawed* verdicts with 6/6 CRITICAL/HIGH findings confirmed
([verdict](2026-08-03-stop-verdict-served-plan-audit.md)). v1's structure survives; its
instruments, arithmetic, and sequencing did not. Everything below reflects the tree at
`851963d`+: the code defects are FIXED and proven; this order is what remains.

**Outcome this order buys:** publishing a work makes it serve, on production; the 76
published-but-unserved works actually serve, by an explicit reversible step; the corpus catch-up
proceeds in measured batches; and the accuracy consequence is known before users see it.

**What this order does NOT move (named so nobody believes otherwise):** the commentary_entries
FTS surface, the static verse-reader files, and `today.ts` still gate on the frozen slug lists
(`legal-corpus.ts`); the ~125k work-less legacy rows have no per-work off switch (withdrawing
those works leaves /ask serving them); and `web/public/commentaries` ships 36,205
client-filtered blocked entries world-readable. Each is separate, filed work — see "Successor
work" at the end.

---

## State on filing (re-measured, not narrated)

- Branch `feat/served-column-derives-publish`, pushed, at: audit fixes `1ae0323`, renumber
  `68d9792`, /plans migrations filed `851963d`. Backup ref `backup/tree-2026-08-03` holds the
  concurrent session's uncommitted /plans code.
- Migrations `044_embeddings_served_expand.sql` / `045_embeddings_served_contract.sql` proven on
  throwaway pg17 (verifier 7/7 with lane rows; red-proof names its seeded row; Tyndale mutant
  trips 3 checks, Lewis mutant 2; serve-published forward+reverse exact at 0-status/11-served;
  both gates watched fire). Applied to NO real database.
- Production: 124 published works; 76 published-but-unserved (the standing A3-rule divergence,
  now filed on the MASTER board). Dev: ~400 works and rising, ingest live.
- Frozen-record weld: `served-backfill-frozen.mjs` ↔ 044, enforced by
  `test/invariants/served-backfill-frozen-sync.test.ts`.

## The ordering constraint (unchanged from v1, and still enforced by prose + one preflight)

```
apply 044 (expand)  →  deploy web  →  [confirm live]  →  apply 045 (contract)
```

Deploy before 044: every /ask 500s on a missing column (the flip also refuses forward, naming
044). 045 before the new bundle is confirmed live: silent pool starvation, the migration-009
mechanism. 045's header carries the contra-DDL and states that it CLOSES the redeploy window.
**P0.3 below adds the one mechanical guard v1 lacked.**

---

## PHASE 0 — remaining local work (no database)

**P0.1 · Register misfiles + the `fiction` register (R5, now filed).** ~52 novels
(MacDonald 30, Tolstoy 11, Bunyan 5, Dostoevsky 3, + stragglers) are typed `theology`, which
post-044 is a SERVED LANE: one batch flip puts Anna Karenina in the theology voice pool. Add
`source_type='fiction'` to BOTH CHECK constraints (`sources` AND `embeddings` — the 038
two-table trap; note `embeddings`'s constraint also lacks `historian`, which blocks the
historian reclassifications until extended). Registry rules per title, never per author
(*Unspoken Sermons* stays `sermon`; *Gospel in Brief* is the owner's heterodoxy call, decision
table below). Deliverable: `scripts/reclassify-register.mjs` — a TWO-place write
(`sources.source_type` + `embeddings.source_type`; the `source_id` key embeds the register
string but nothing parses it back — verified), dry-run default, red-proof: a seeded
one-table-only write is detected and refused. Also the confirmed misfiles
(`spurgeon-comment`→theology, `hort-james1909`→commentary, `bennett-expositor10`→commentary,
hymn-studies→theology, indexes→drop) and the aggregates (`calvin-calcom` landing page,
`augustine-confessions` dup, 0-section `schaff-history`/`edersheim-lifetimes` → quarantine).

**P0.2 · Voice-concentration fixes (R1+R2, now filed).** `selectVoices`
(`web/src/lib/teacher/teach.ts:71`) enforces ≥2 TRADITIONS and counts CHUNKS; nothing caps one
author. Fine for 11 author-cohorts; wrong for 45 Calvin volumes. Add a per-author cap in the
composed set (R2), and dedupe aggregates-vs-volumes before any admission (R1, folded into
P0.1's quarantines). `mergeById` keys on source_id and cannot dedupe cross-work duplicates —
the aggregate quarantine is what actually removes them.

**P0.3 · The one mechanical ordering guard.** `deploy.sh`/`predeploy-gate.ts` gains a read-only
preflight: `SELECT` on `information_schema.columns` for `embeddings.served` against the deploy
target; absent → refuse, naming 044. Mirrors the licensing-ratchet shape. (Closes the audit's
"enforced by nothing mechanical"; the 045-side risk is covered by 045's header + step order.)

**P0.4 · Canon-coverage census (R4, now filed).** `scripts/coverage-census.mjs`: per Bible
book/chapter, count of DISTINCT-author served exegetical voices; read-only; runnable against
dev and prod. This is the instrument that measures what admitting a corpus is FOR — v4
structurally cannot (no SoS sampling, per-query HIT@K). Pre-register its bar before Phase 4:
*no book/chapter that had ≥2 distinct-author voices loses one* (floor), plus report the gained
coverage (the point).

**P0.5 · Post-flip reconciliation instrument.** `scripts/served-reconcile.mjs`, read-only:
every `status='published'` work with work-keyed rows has ALL rows served; every
staged/quarantined work has ZERO; work-less cohort reported as its own line, never folded in.
This replaces verify-served-backfill's equality check as the standing instrument AFTER the
first intentional serve flip (the frozen verifier's validity window ends there, by design).
Note: re-ingest of a published work is already refused by `assertReingestable`, so the drift
this detects is repair-script and partial-write classes.

## PHASE 1 — prove and measure on dev

**P1.0 · Preconditions (the audit's "the de-risking phase cannot start" findings):**
(a) `DEEPINFRA_API_KEY` present — ADR-044 records it absent on this machine; obtain from the
owner, 5-query smoke BEFORE budgeting a run. (b) Served census after 1.1 (counts per frozen
leg, all nonzero) before any eval spend. (c) **v3 baseline BEFORE applying 044** — one v3 run
on pre-044 dev isolates the mechanism delta from the corpus delta; without it, a post-044
number that differs from the 2026-07-18 records is unattributable.

**P1.1 · Apply 044 to dev** (`db/apply-migration-concurrent.mjs`, owner URL, ingest idle).
**TIME IT** — the prod session budget is derived from this number, not estimated. Then
`verify-served-backfill.mjs` (7/7) and `--red-proof` ON DEV (THE_LOOP §4: the throwaway run
does not transfer). If the command asks for `MIGRATE_ALLOW_PROD`, stop — the target is wrong.

**P1.2 · v3 baseline post-044.** Same queries as P1.0(c). Delta vs pre-044 = the mechanism
cost, expected ≈0 (the backfill is behaviour-preserving, but expected ≠ measured).

**P1.3 · Serve ONE commentary/father batch on dev** via
`publish-flip.mjs --serve-published --slugs=<committed manifest>`, TTY, dev owner URL. **The
batch manifest is COMMITTED** — Phase 4 flips the same file on prod, so what was measured is
what ships. Time the flip transaction; it sizes prod batches.

**P1.4 · Re-run v3 + the coverage census. Decide per the pre-registered rule:** proceed if no
v3 category drops >2 points below its P1.2 number AND the coverage floor holds; otherwise
STOP and failure-code the misses (quality-slice §3) — fixes are a separate slice, never
in-loop tuning. **v3 only, every iteration. v4 is spent ONCE, at the end** (see Phase 5), on a
v4.1 re-freeze per HELDOUT_EVAL_DESIGN's checklist (SoS/rare-book sampling), minted AFTER the
admitted set is frozen — the 26% v3/v4 label overlap makes even disciplined v3 iteration leak
into v4, and the audit's finding stands: re-freezing is cheap, discovering a pre-tuned gate
post-ship is not.

## PHASE 2 — gates (no database)

`npm run audit` on the branch (requires the /plans typecheck error resolved or that slice
evicted from the tree — owner + concurrent session coordination, decision table). Then the
`deep-audit` skill, 4-8 lenses, **including a static-assets lens** (the 36k-entry exposure is
outside every v1 lens). Browser check at 390px + desktop, real interaction, screenshot.
Bylaw 4 throughout: the fixes' author does not certify them.

## PHASE 3 — production session A (owner at TTY; budget = dev-measured × safety factor, stated in the runbook before starting)

Every step names its file and env explicitly. `<owner-url>` is read from the credential file,
never typed into history.

| # | Step | Gate before moving on |
|---|---|---|
| 1 | `MIGRATE_ALLOW_PROD=1 DATABASE_URL=<owner-url> node db/apply-migration-concurrent.mjs db/migrations/044_embeddings_served_expand.sql` | runner's post-assert: 5 indexes VALID+READY |
| 2 | `VERIFY_SERVED_ALLOW_PROD=1 DATABASE_URL=<owner-url> node scripts/verify-served-backfill.mjs` | 7/7. Equality EXACT (no flips have run on prod) |
| 3 | /ask smoke on the OLD bundle | answers with voices; both index sets live |
| 4 | `./deploy.sh` (P0.3 preflight green; deploy sha recorded in this order) | deployment id + alias |
| 5 | /ask smoke on NEW bundle + owner-run `EXPLAIN` on the base pool | voices; plan shows `idx_embeddings_served_legal` |
| 6 | `MIGRATE_ALLOW_PROD=1 … apply db/migrations/045_embeddings_served_contract.sql` | re-run step 5. **Redeploy window now closed** (045 header has the contra-DDL) |

Rollback: steps 1-3 inert (old indexes untouched, old bundle live). Steps 4-5: redeploy prior
deployment id. Step 6: contra-DDL from 045's header FIRST, then redeploy.

## PHASE 4 — serve the 76, then catch up (repeatable owner sessions; the honest arithmetic)

**P4.0 · Serve the 76** — the order's actual objective, now an explicit step:
`node scripts/publish-flip.mjs --slugs=docs/evidence/corpus-copy/serve-76.json --serve-published`
(TTY, owner go). The snapshot records per-slug served state; the SAME command `--reverse
--snapshot=…` un-serves exactly what it served — proven. Then `served-reconcile.mjs` +
coverage census, recorded in WORKLOG.

**P4.n · Catch-up batches.** Per batch: `corpus-copy-batches.mjs` (the real tool; v1 named a
script that does not exist) → owner-gated copy → owner-gated flip (forward, staged works — the
serve gates run inside it) → reconcile → coverage census → v3 spot-check when the batch adds
commentary/father. Batch size: whatever the P1.3-measured flip transaction keeps under ~10
minutes. Expect **10-20 batches over multiple sessions** for the ~500-650 admissible remainder
(exclusions: 30 copyright-claim, 8 quality-held, 5 no-adapter, quarantines, fiction) — not
"two sessions". Each batch: two TTY confirmations. That is the cost of the gate design, and it
is the design.

## PHASE 5 — the one v4.1 gate run, then record

Freeze the final admitted set → mint v4.1 (new hash, bars pre-registered, SoS sampled) → run
ONCE → ship or file the failure. Then: WORKLOG (all numbers), MASTER board row closed,
STATE_OF_TRUTH re-measured (published = served ± the work-less cohort, stated numerically),
DECISIONS ADR for the serving mechanism (filed at merge), watchlist entry (the
derived-expectation verifier shape).

## Owner decisions

| # | Decision | Blocks |
|---|---|---|
| 1 | Fiction register: confirm `fiction` type + shelf-only (no lane) | P0.1 |
| 2 | Heterodox works in served lanes (`tolstoy-gospel`, Renan class): serve labeled, or hold | P0.1 registry |
| 3 | /plans slice: coordinate merge or eviction (its typecheck is red; `npm run audit` cannot pass on the shared tree until resolved) | Phase 2 |
| 4 | `DEEPINFRA_API_KEY` for the eval | P1.0 |
| 5 | Go for prod session A; go per Phase 4 batch (per occasion, bylaw 7) | 3, 4 |
| 6 | If P1.4 trips the stop rule: separate fix slice, or ship mechanism + admit nothing | P1.4 |

## Successor work (filed, not this order)

FTS/static/today cutover off the frozen lists · static-assets exposure (36k entries; predeploy
strip) · work-less legacy cohort re-keying (gives the 125k rows a work key and an off switch) ·
frozen-list consumer migration (#62: census/adjudicator/cutover-gate) · under-split reader
sections (#58; Phase 4 batches EXCLUDE the 214 until it lands, or accept the reader cost
explicitly per batch).
