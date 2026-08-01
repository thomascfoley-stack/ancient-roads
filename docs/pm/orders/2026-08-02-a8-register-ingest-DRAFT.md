OUTCOME: DRAFT - not executable as issued. Assembled overnight 2026-08-02 by an agent-swarm
survey of the tree at `b449947`; every ⚑ OWNER item below needs a written answer, and the
owner's updated ingestion doc must be filed under docs/ and reconciled, before this refiles
without the DRAFT suffix.

# ORDER (DRAFT) — A8: register ingest slice → Deploy B → publish registers

**DRAFT, written 2026-08-02 against the tree at `b449947`. NOT EXECUTABLE AS ISSUED.**
To be reviewed against the owner's updated ingestion doc (not yet in the repo; bylaw 1,
`docs/pm/MASTER.md:12`, means this draft cannot cite it) and refiled without the DRAFT
suffix only after every ⚑ OWNER item below carries a written answer. The entire filed A8
plan today is one row: `docs/pm/MASTER.md:44` "Register ingest slice → Deploy B → publish
registers | Blocked on A7". Everything else in this order is assembled from the tree and
says so, line by line. Where the tree is silent this order says NOT ESTABLISHED and flags
⚑ OWNER rather than inferring.

**Standing state this draft assumes** (verify at execution, do not trust this paragraph):
A7 closed; production carries 6 published commentary works flipped by
`scripts/publish-flip.mjs` with `barnes-notes` staged; the register corpus exists ONLY on
dev (`ep-tiny-hat`) - production has zero register rows and G5 is recorded VACUOUS, "0
lane/song slug rows (register ingest never on prod)" (`docs/STATE_OF_TRUTH.md:116`);
migrations 017-020 (register source_type, partial HNSW/FTS, CHECK widening) are already
applied on prod (`docs/STATE_OF_TRUTH.md:107`).

---

## The mandate and its two known holes

1. **"Deploy B" is defined nowhere.** `git grep` returns exactly one hit, the A8 row
   itself (`docs/pm/MASTER.md:44`). By parallel with Deploy A
   (`docs/DEPLOY_PREFLIGHT.md:1-8`: the seven-step `deploy.sh` pipeline whose only
   irreversible act is the `vercel --prod` promotion at step 7,
   `DEPLOY_PREFLIGHT.md:66-69`), this order treats Deploy B as **a second run of that
   pipeline whose delta is the register static corpus written by the prod ingest, plus any
   admission-set code fix (build item B2)**.
   ⚑ OWNER: confirm or replace this definition of Deploy B - one sentence in the updated
   ingestion doc settles it.
2. **The A8 row carries no ⚑ marker** (`docs/pm/MASTER.md:33` legend, `:44` row) although
   it contains at least three ⚑-class acts (prod ingest connections, Deploy B step 7, the
   publish flip).
   ⚑ OWNER: amend the MASTER.md A8 row to carry ⚑ before this order is issued.

## The authorisation

Bylaw 7: any production connection, read or write, needs the owner's explicit go, every
time (`docs/pm/MASTER.md:21`). A8 is not one occasion. This order enumerates the
occasions; each needs its own go, given in-session, and none extends to the next:

| occasion | act | writes? |
|---|---|---|
| O1 | prod register ingest, staged, per approved batch | yes (sources, embeddings) |
| O2 | post-ingest read-back census + `gate:ingest`-class verification | read-only |
| O3 | Deploy B step 7 promotion | yes (Vercel, not Neon) |
| O4 | rehearsal fork creation (if granted - see rail 1) | owner-level Neon act |
| O5 | the publish flip | yes (sources.status) |
| O6 | §4 verify census after the flip | read-only |

⚑ OWNER: confirm this occasion table, or collapse/expand it, in writing. A single blanket
"go do A8" does not satisfy bylaw 7 as this PM reads it.

## STEP −1 — the seat check, before anything else

Answer each in one line; none disqualifies you, they go in the record:

1. Did you write `scripts/publish-flip.mjs`, `src/ingest/register-writer.ts`, or any of
   the four A8 survey reports this order was assembled from? Say which.
2. Are you the session that executed the commentary flip (the six works in
   `docs/evidence/work-order-v2-stage2/flip-slugs.json`)? Yes or no.
3. Run `git log --format='%h %(trailers:key=Model,valueonly) %s' <A7-closure-sha>..HEAD`
   and say how many of those commits you wrote.

## STEP 0 — preconditions. Stop on any failure; do not improvise around one.

```
git rev-parse HEAD                                   # record it; expect main at or after the A7 closure sha
grep -n "A7" docs/pm/MASTER.md                       # A7 row must read CLOSED; if not, STOP - A8 is blocked on A7 (MASTER.md:44)
[ -n "${CUTOVER_DATABASE_URL:-}" ] && echo "CUTOVER_DATABASE_URL: set" || echo "CUTOVER_DATABASE_URL: NOT SET"   # must be NOT SET at session start
[ -n "${DEEPINFRA_API_KEY:-}" ] && echo "DEEPINFRA_API_KEY: set" || echo "DEEPINFRA_API_KEY: NOT SET"
ls -la .env.prod 2>&1                                # must NOT exist; if it does, STOP and report (AGENTS.md forbids it)
ls -la web/.env.local 2>&1                           # report presence; it points at DEV and must never be a prod fallback
node -e "console.log(process.version)"
pnpm install
pnpm gate:ingest -- --help 2>&1 | head -5            # the read-only gate exists (package.json:26, src/ingest/gate-ingest.ts:1-17)
cat docs/evidence/work-order-v2-stage2/flip-slugs.json   # the COMMENTARY payload; confirm it is 6 slugs and understand it is NOT A8's file
```

Do not use a shell expansion that can print a secret's value; use the `[ -n ... ]` test
form above and nothing else (the A2 order's `${VAR:-NO}` lesson).

Additionally verify, read-only, before building anything:

* Prod schema already admits register types: migrations 017/020 applied
  (`docs/STATE_OF_TRUTH.md:107`). The stale note on olney-hymns
  (`ingest/sources.config.json:870`, "requires additive migration adding 'hymn'") predates
  E1; confirm against the live CHECK during occasion O2, not by editing the config.
* `db/migrations/018_register_partial_indexes.sql:4-6`: partial-index predicates "must
  stay in lockstep" with the routing filters. If A8 changes the served lists, the indexes
  must be rebuilt zero-window, new-name-then-rename (`018:9-17`) - and the existing tool
  `src/ingest/rebuild-register-indexes.ts` is dev-locked (`:13`, naive
  `/ep-tiny-hat/` substring, no override). If the served lists do NOT change, record the
  rebuild NOT RUN, not skipped-silently.

## Read first

`CLAUDE.md` → `AGENTS.md` → `docs/pm/MASTER.md` → `docs/STATE_OF_TRUTH.md` §2b/§2d →
`docs/INGESTION_RUNBOOK.md` → `docs/INGESTION_HARNESS_DESIGN.md` → `docs/DECISIONS.md`
(ADR-029 at `:308-309`, ADR-035 at `:680-690`, ADR-043 at `:890-897`, the
lexicon/josephus ruling at `:465-473`) → `docs/GO_LIVE_EXECUTION.md` C2/C3 (`:50-54`) →
`docs/pm/orders/2026-08-01-a3-a6-readiness.md` (the writer-spec shape, `:111-137`) →
**the owner's updated ingestion doc** ⚑ OWNER: file it under `docs/` so bylaw 1 covers
it; this order defers to it wherever they conflict.

Known-stale claims you will trip over; read them as history, not state:
`INGESTION_RUNBOOK.md:161-163` ("no publish script in this repo" - false since
`scripts/publish-flip.mjs`); the RUNBOOK's "no history read path" (stale - the Book
Reader gates on `status='published'`, and `DECISIONS.md:470-473` publishes josephus "for
the Book Reader"); the MASTER.md A4-A6 rows if not yet updated for tonight's flip; the
standing HOLD on register ingest in ROADMAP/WORKLOG.
⚑ OWNER: lift the register-ingest HOLD in writing, or this order cannot issue.

## RAILS — production. These are absolute.

1. **No Neon branch created, deleted or promoted.** Never branch-promote dev onto prod:
   `docs/GO_LIVE_EXECUTION.md:52` - it "wipes live user data" and "a fresh re-ingest
   (paying the re-embed cost) is the only safe path". The ADR-043 rehearsal fork is the
   single exception and it is an owner-level act (occasion O4), never the builder's.
2. **Owner go per prod occasion** (bylaw 7, `MASTER.md:21`). Finish an occasion, close the
   connection, report. Never re-open on your own authority; unmeasured legs are NOT RUN.
3. **Credential in env only.** `CUTOVER_DATABASE_URL` for writes, `NEON_API_KEY` for
   read-only minting, `DEEPINFRA_API_KEY` for embedding. Never argv, never printed, never
   written to disk, no `.env.prod`, and the new writer must NOT inherit the
   `localEnv()` fallback to `web/.env.local` (`src/ingest/register-writer.ts:46-51`) -
   that file points at dev and a prod path that can silently read a dotfile is exactly
   what `publish-flip.mjs:80` was built to refuse. Scrub every error through
   `scrubCredentialText`.
4. **Publish stays a hard human gate.** Only `scripts/publish-flip.mjs` changes
   `sources.status` on prod: TTY-only stdin, literal word `publish`, piped input refused
   (`publish-flip.mjs:104-123`), server-side `neondb_owner` assertion (`:139-145`,
   migration `010_revoke_corpus_writes.sql:16`), full pre-snapshot, delta assertion,
   in-transaction imported legal gates. Digest approval IS the publish authorization and
   never auto-fires (`INGESTION_HARNESS_DESIGN.md:46-47`, `INGESTION_RUNBOOK.md:159-166`).
   Consequently: **the prod ingest path must be physically incapable of writing
   `status='published'`.** The dev writer stamps published directly when `work.publish`
   is true (`register-writer.ts:267-268`) and `adapter-loop.ts:124` derives that flag
   from the served lists. An unmodified port bypasses every flip gate. Forbidden by
   construction, not by convention - see build item B1.
5. **Slug lists are literal files, never predicates** (`publish-flip.mjs:62-78`). The
   commentary `flip-slugs.json` is never reused for registers.
6. **Quarantine is law.** The four `serve:false` quarantined works never ingest to prod
   and never appear in any flip list (STOP list below).
7. **Bounded, evidenced runs.** Tee stdout/stderr outside the repo first, commit after a
   credential-shaped-text check (the A2 discipline). `Model:` trailer on every commit
   (bylaw 8, `MASTER.md:22`).
8. **Abort conditions** - stop, commit what you have, report, do not push through:
   a target guard refuses; the endpoint reached is not the one declared; any legal gate
   fails; DeepInfra returns errors you do not fully understand (429 `engine_overloaded`
   is a known hazard that once produced an unearned CI red, `MASTER.md:127-132` - a
   retry policy is part of B1, improvisation is not); row counts disagree with the
   pre-write census in any way the delta assertion did not predict; anything at all
   tempts you toward defeating a dev guard "temporarily".

## THE STOP LIST — licence and provenance, adjudicated from `ingest/sources.config.json`

Measured against `src/ingest/allowed-licenses.mjs:20-25` (allowed: Public Domain, CC BY,
CC BY-SA; fail-closed on null) and `src/ingest/forbidden-provenance.mjs:23,35-43`
(biblehub.com, studylight.org, historicalchristian.faith, subdomains included):

* **Licence STOPs: NONE.** All 34 register entries declare "Public Domain". The only
  non-PD licence in the file is `bdb-lexicon` "CC BY" (`:353`), a lexicon, not a register.
* **Forbidden-domain STOPs: NONE.** Register provenance is ccel.org (18), gutenberg.org
  (14), archive.org (1), crosswire.org (1). The sole biblehub entry in the file is the
  commentary `barnes-notes`, already staged-not-flipped.
* **MUST NOT ingest or flip - quarantined, `serve:false`:**
  `whitefield-works` (`:1330-1331`), `bramley-carols` (`:964-965`),
  `donne-divine-poems` (`:1115-1116`), `herrick-noble-numbers` (`:1141-1142`).
  Any A8 list containing these slugs breaches the config's own quarantine: hard STOP.
* **Staged-not-served historians:** `josephus-works`, `edersheim-lifetimes`,
  `schaff-history` (`serve:false`, "no history read-path yet" notes). The Historians
  catalog now exists (`web/src/lib/catalog-defs.ts:49-54`, owner decision 2026-08-01) and
  catalog queries are published-only (`:26-27`), so publishing them means shelf without
  lane retrieval.
  ⚑ OWNER: is shelf-without-retrieval the intent for any historian besides
  josephus-whiston, or do the three stay staged?
* **josephus-whiston:** owner ruling exists - excise §4113-4124 (12 sections), publish
  the remaining ~4,112 to the historian register for the Book Reader; edersheim/schaff
  stay staged (`docs/DECISIONS.md:465-473`).
  ⚑ OWNER: confirm the excision has been executed and verified on the corpus A8 will
  ingest, and name the tool run that proves it.
* **spurgeon-talks-to-farmers:** clean config entry (`:1546-1567`), no quarantine, absent
  from `SERVED_SERMON_WORKS` (`web/src/lib/teacher/routing.ts:69-72`). Publishing its
  sources row would shelve it in the Sermons catalog while the sermon lane never
  retrieves it.
  ⚑ OWNER: serve it (add to the list, index-lockstep consequences per rail on 018) or
  hold it (record why); the omission's intent is NOT ESTABLISHED.
* **Lexicons:** stay staged until the reference-pane UX ships (`DECISIONS.md:465-468`).
  Not registers, but any A8 flip list containing a lexicon slug is a STOP.
* **ADR-029:** no CCEL work publishes without a composite-volume boundary check
  (`DECISIONS.md:308-309`). 18 of 34 registers are CCEL.
  ⚑ OWNER: state where the per-work boundary-check results live; if they exist only in
  dev-session history, they must be filed as evidence before the digest step.

## MUST BUILD before any prod connection

Each item: the property, the red-proof, the cost of not building it. Red-proofs run on a
throwaway local Postgres (the `--local-redproof` precedent, `publish-flip.mjs`), never on
dev, never on prod.

### B1 — the guarded prod register ingest writer

The A4 pattern, applied to ingest. A new `scripts/register-ingest-prod.mjs` (or a guarded
mode of `writeRegisterWork` - builder's choice, bylaw 5), replacing the dev-only guard
stack (`register-writer.ts:55-62` paired-source NEON_BRANCH; `:160-165` inline check plus
the hard `/ep-tiny-hat|localhost|127\.0\.0\.1/` endpoint regex) with the proven
cutover-delegate guard: `assertCutoverTarget`-class exact endpoint declaration + explicit
allow flag (`scripts/lib/target-guard.mjs:98-108`), already prod-proven by
`scripts/register-label-embeddings.mjs:16-35`.

**Property.**
- Credential: `CUTOVER_DATABASE_URL` from env only; no dotfile fallback (rail 3).
- Target: allow flag + exact endpoint id declaration; dev remains free, prod is
  unremarkable-but-named (the `publish-flip-guard.mjs:31-77` philosophy).
- Role: assert `current_user = 'neondb_owner'` at the server (`app_runtime` cannot write
  `sources`, migration 010).
- TTY owner gate before the first write, same shape as `publish-flip.mjs:104-123`.
- **`status='staged'` hard-coded.** No `publish` parameter exists on the prod path. The
  `work.publish` flag and the `SERVED` derivation (`adapter-loop.ts:20-25,124`) are
  dev-only.
- Slugs: literal file, `register-ingest-slugs.json`, schema-checked like
  `publish-flip.mjs:62-78`.
- Idempotent: keeps `ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING`
  (`register-writer.ts:223-226`) and the `'ingesting'` in-flight marker with the final
  stamp only on success (`:181-189`, `:267-268` semantics, minus the published arm).
- Never touches rows of works not in its slug file; pre/post census per work committed as
  evidence.
- DeepInfra: `DEEPINFRA_API_KEY` env-only; bounded retry on 429 with abort-and-report,
  never empty-vector insertion (keep the `register-writer.ts:83-106` throw behavior).

**Red-proof (throwaway Postgres):** prod-shaped host without allow flag → refuse;
declared endpoint mismatch → refuse; stale `NEON_BRANCH=dev` with non-dev URL → refuse
(the A6-audit lesson the current regex encodes); non-owner role → refuse; piped stdin →
refuse; any attempt to reach `status='published'` → impossible (no code path; prove by
grep and by a test that the stamp arm is absent); second run inserts 0 and exits 0; a
slug not in `sources.config.json` → refuse.

**Cost of not:** the only existing prod-write doors are the unsafe `MIGRATE_ALLOW_PROD`
hand-SQL path (ruled out by the readiness order, `2026-08-01-a3-a6-readiness.md`
correction 1) or defeating `register-writer.ts`'s guards in place, which rail 8 forbids.
Without B1, A8 cannot start.

⚑ OWNER (scope, the biggest hole): **which stores does A8 fill on prod?** The register
writer fills the flat `embeddings` store + local static reader JSON. The sermon/historian
adapters fill the separate 006 sections model (`ingest-sermon.ts:205`,
`ingest-historian.ts:149`, both hard-coded `'staged'`, both dev-locked at `:190-193` /
`:113-116`); dev got its register sections via the repoint sweep, and
`repoint-sections-work.ts:92` is also dev-locked. Lanes read flat; the Book Reader and
catalogs read sections. "Lanes only" needs B1 alone; "Book Reader too" (which the
josephus ruling requires) needs a guarded prod path for the sections model as well -
either ported adapters or a guarded prod repoint. Name the scope; it decides whether B1
is one tool or three.

⚑ OWNER (method): fresh re-ingest from sources is the only documented path
(`GO_LIVE_EXECUTION.md:52`); a row-copy from dev preserving vectors is documented
nowhere. Fresh re-ingest re-embeds every chunk via DeepInfra; no register-scale cost
projection exists (the only anchor is ~$0.74+ for ~170k units,
`docs/MIGRATION_DESIGN.md:27`; dev's register flat store was last recorded at 297,059
rows, WORKLOG prose). Accept the cost and the method in writing, or specify the
alternative and its guard.

⚑ OWNER (curation replay): dev's corpus is ingest PLUS curation - ADR-029 suppressions,
non-authorial-matter deletes, quarantine rulings, the unit_ordinal repair
(`STATE_OF_TRUTH.md:183` ff., itself marked UNVERIFIED). The suppression tools are
dev-locked. A fresh prod ingest replays none of it. State what "prod register corpus is
correct" means and how it is asserted without hardcoding dev counts
(`CUTOVER_DESIGN.md` forbids that).

### B2 — the admission-set fix

**Property.** `scripts/publish-flip-census.mts:62` and
`scripts/publish-flip-adjudicate.mts:78` admit by
`SERVED_PROSE_WORKS ∪ SERVED_LANE_WORKS` only. `SERVED_SONG_VERSE_WORKS`
(`web/src/lib/teacher/routing.ts:84-91`, 15 works) is absent, so any hymn/poetry flip
false-STOPs as published-but-not-admitted. Extend the admission set to include the
song/verse list, imported from routing, never re-typed.

**Red-proof:** a fixture census containing a published `olney-hymns` passes admission;
a published work in NO list still STOPs.

**Cost of not:** the A3-analog adjudication (X4) cannot emit a hymn/poetry flip list at
all; A8 silently narrows to sermons/theology without anyone deciding that.

### B3 — the register flip list, by adjudication, not by hand

**Property.** A new `register-flip-slugs.json` emitted by the adjudicator from a fresh
post-ingest prod census (occasion O2), never typed by a human, never the commentary
file. Admission per B2; every quarantined or held slug in the STOP list refused with
exit 1.

**Red-proof:** feed it a census containing `whitefield-works` published → exit 1;
containing `spurgeon-talks-to-farmers` published while unserved → exit 1 flagged for the
owner.

**Cost of not:** the flip's slug file becomes a hand-typed artifact, which is the exact
failure mode `publish-flip.mjs:62-78` exists to prevent one layer down.

### B4 — index rebuild path (conditional)

Only if the served lists change (see STOP list rulings). **Property:** a prod-capable
`rebuild-register-indexes` using the B1 guard stack and the zero-window
new-name-then-rename pattern (`018:9-17`), replacing the dev lock at
`rebuild-register-indexes.ts:13`. **Red-proof:** refuse prod without declaration; on a
local Postgres, serving index exists at every instant during rebuild (assert by
concurrent query). **Cost of not:** a served-list change ships with partial indexes out
of lockstep, the exact starvation failure the 018 header documents.
If lists do not change: record B4 NOT RUN.

### B5 — the section-provenance decision

The flip's `sections.source_url` leg (`publish-flip.mjs:218-235`) is vacuous for
register works: the sermon/historian adapters never populate `source_url`
(`docs/SECTION_PROVENANCE_DESIGN.md:143-151`). Legality then rests entirely on
`sources.provenance` plus ingest-time gates.
⚑ OWNER: accept that narrowing for register works in writing, or require B1's
sections-model path (if in scope) to populate `source_url`, making the flip's leg
load-bearing.

## EXECUTION — in this order, no reordering

**X1 - ingest to staged (occasion O1).** B1 tool, slug batches per the harness pacing
rules: pause above ~2 unreviewed source-works, >30% single-work quarantine escalates as
"source/edition likely wrong" (`INGESTION_HARNESS_DESIGN.md:121-125`). Per work, after
write: `pnpm gate:ingest` (read-only) and the per-work digest with its five card elements
(work+source; licence class + URL + edition + forbidden-domain result; match result;
held-out accuracy delta; recommended action - `INGESTION_HARNESS_DESIGN.md:52-58`).

**X1-HAZARD, named now so nobody discovers it live:** on prod today the flat-store wall
is code-side only - "a work's rows are served iff its slug is in the served list and the
row's metadata carries it"; the status column is the permanent fix "tracked separately"
(`web/src/lib/teacher/routing.ts:39-41`). The deployed Deploy-A code already carries the
served lists. **Therefore a staged flat-store ingest of a served-list work begins serving
in the lanes the moment its rows land, before any flip.** The flip gates catalogs and
the Book Reader (`catalog-defs.ts:26-27`, `web/src/lib/work.ts`), not flat-lane
retrieval.
⚑ OWNER: choose, in writing: (a) accept ingest-equals-lane-go-live and let the flip gate
only shelves/reader, (b) sequence each work's ingest after its digest approval so the
lane moment IS the approval moment, or (c) hold A8 for the status-aware lane gate
routing.ts:41 defers. This order cannot proceed past X1 without the answer.

**X2 - fresh held-out eval.** Auto-generate a fresh vN held-out before any
publish-affecting decision; ship on the fresh set, never the tuned one
(`INGESTION_HARNESS_DESIGN.md:82-86`).

**X3 - Deploy B (occasion O3).** The full `deploy.sh` preflight; the register static
corpus entries written by X1 into `web/public/commentaries/` reach production only here
(the corpus is gitignored and uploaded by `vercel --prod`). Position fixed by
`MASTER.md:44`: BEFORE the flip. Note the inversion against the commentary sequence
(A4 flip → A6 deploy); the rationale is nowhere written.
⚑ OWNER: confirm deploy-before-flip is intended, and note that static verse-pane JSON is
not status-gated server-side - whatever X3 ships is visible on deploy. If any register's
static entries must stay dark until the flip, say which and how.

**X4 - adjudicate the register flip list** (B3, offline, from O2's committed census).
Every ⚑ ruling from the STOP list must be resolved before this step; the adjudicator
enforces the resolvable ones mechanically.

**X5 - rehearsal (occasion O4).** ADR-043: G10-class proof runs on a rehearsal fork
carrying the published rows BEFORE the flip reaches production
(`docs/DECISIONS.md:890-897`). Fork creation is owner-level and rail 1 otherwise forbids
it.
⚑ OWNER: grant the fork, or file the written departure from ADR-043 (the commentary
flip's precedent compensations: local-Postgres red-proof, in-transaction verification,
`--reverse`).

**X6 - the flip (occasion O5).** `publish-flip.mjs` verbatim, new payload:

```
PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=<exact endpoint id> CUTOVER_DATABASE_URL=<owner url, env only> \
  node scripts/publish-flip.mjs --slugs=docs/evidence/a8-register-ingest-<date>/register-flip-slugs.json \
  --evidence=docs/evidence/a8-register-ingest-<date>
```

Missing slugs are a hard STOP (`publish-flip.mjs:158-161`) - that is a feature: it
proves X1 ran on the endpoint X6 is flipping. `--evidence` must point at the A8
directory, not the stage2 default (`:53`). The legal gates check the WHOLE published set
in-transaction, licence and provenance imported, never re-typed (`:205-235`).

**X7 - verify (occasion O6).** `scripts/publish-flip-verify.mjs` before/after diff, plus
a human read of one flipped work in the product. G5 stops being vacuous here: per
ADR-035, no gate hardcodes "non-empty after A8" - ratchet against the new baseline and
print denominators (`docs/DECISIONS.md:686-690`).
⚑ OWNER: set the post-A8 G5 ratchet baseline expectation in the updated ingestion doc.

**X8 - the record.** Update `docs/STATE_OF_TRUTH.md` §2b/§2d (G5 row loses VACUOUS;
census tables gain register rows, old readings kept as history); WORKLOG entry with a
NOT DONE / UNVERIFIED section; fix the stale claims listed under "Read first" in the
same tranche or file follow-ups.

## What you must NOT report as a pass

NOT RUN is never PASS; PARTIAL is never DONE. Specifically:
* Any G5/register-wall run before X1 completes is NOT RUN (vacuous by construction).
* E2 relabeling is NOT re-needed for A8 works - the writer stamps `metadata.work` itself
  (`register-writer.ts:200-226`); do not run `register-label-embeddings.mjs` and report
  it as an A8 step. The 112,815 unlabeled legacy rows (`STATE_OF_TRUTH.md:109`) are a
  separate, pre-existing item.
* B4 skipped because lists did not change: NOT RUN, with the reason.
* Any historian left staged: listed per slug with the owner ruling that holds it.
* A digest card whose Gate B leg did not run is not green (`HARNESS:52-58`).

## Evidence

Everything under `docs/evidence/a8-register-ingest-<date>/`:

* `README.md` - what was authorised, by whom, per occasion, and what was not.
* `register-ingest-slugs.json` and `register-flip-slugs.json` - the literal payloads.
* per-work: ingest log (teed outside the repo first, credential-checked), `gate:ingest`
  output, digest card as delivered, owner approval record.
* `pre-ingest-census.txt` / `post-ingest-census.txt` (O2) - tool output with exact
  commands.
* `flip-pre-snapshot-<ts>.json` - written by the flip itself.
* verify before/after logs (O6) and the diff.
* red-proof transcripts for B1-B4 against the throwaway Postgres.
* `ci-run-<id>-jobs.json` - raw, per CI run reported.

## REPORT

DONE / PARTIAL / NOT DONE / BLOCKED per item, actual output for every measurement:

```
HEAD:        <sha>
CI:          audit=<conclusion>  db-invariants=<conclusion>   (from gh run view, not memory)
OCCASIONS:   O1=<granted/run/exit> O2=... O3=... O4=... O5=... O6=...   (one line each; owner-go timestamp per occasion)
INGEST:      works=<n> attempted, <n> staged, <n> refused (slugs + reasons)
             rows: embeddings=<n> sections=<n if in scope>   per work, from the post-census, not the writer's own log
DIGESTS:     delivered=<n> approved=<n> escalated=<n> (>30% quarantine escalations named)
DEPLOY B:    <run id / promotion evidence, or NOT RUN>
FLIP:        <n> rows staged->published; delta assertion=<held/failed>; legal gates=<held>
G5:          before=VACUOUS after=<denominators printed>
NOT RUN:     <every leg that did not execute, and why>
EVIDENCE:    <paths committed this run>
MODEL:       <model that produced this>
DIRTY:       <git status --porcelain, verbatim>
```

Then three questions, in your own words:

1. What did you change that this order did not ask for?
2. What did you find that is not in this order and that the owner would want to know?
3. Where were you tempted to assert a property rather than prove it?

Then STOP. Connections close with their occasions. Do not proceed past any ⚑ OWNER item
that is still a hole, do not create a Neon branch, do not flip anything the adjudicator
did not emit, and do not report this DRAFT as an issued order.

---

## Appendix — open ⚑ OWNER register (one line each, for tomorrow's review)

1. Deploy B definition: confirm "second deploy.sh run shipping the register static corpus + B2 fix".
2. MASTER.md:44: add the ⚑ marker to the A8 row.
3. Occasion table O1-O6: confirm the per-occasion go structure.
4. Lift the standing register-ingest HOLD (ROADMAP/WORKLOG) in writing.
5. Scope: flat store only, or sections model + Book Reader too (decides B1's size).
6. Method: fresh re-ingest confirmed; accept the unprojected DeepInfra re-embed cost.
7. Curation replay: define "prod register corpus is correct" without dev-count hardcoding.
8. Historians: shelf-without-retrieval intent for josephus-works/edersheim/schaff-history?
9. josephus-whiston: excision executed and evidenced before ingest?
10. spurgeon-talks-to-farmers: serve or hold, and why.
11. CCEL boundary checks (ADR-029): where are the 18 per-work results filed?
12. B5: accept sources-provenance-only legality for register works, or require source_url.
13. X1-HAZARD: choose (a)/(b)/(c) on ingest-equals-lane-go-live.
14. X3: accept that static entries ship visible at Deploy B, pre-flip.
15. X5: grant the rehearsal fork or file the ADR-043 departure.
16. X7: set the post-A8 G5 ratchet baseline.
