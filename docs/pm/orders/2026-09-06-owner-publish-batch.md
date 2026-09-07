# Owner publish batch — 2026-09-06 (dev→prod copy + publish flips)

> **⚠ AMENDED 2026-09-06 — two standing preconditions were missed in the first version of
> this runbook. Do NOT run the 440-work flips as originally written.**
>
> **Precondition 1 — the P4.n accuracy hold: DISCHARGED BY OWNER RULING 2026-09-07.**
> The owner ruled "publish the 439" in session, with the P4.n result stated to them
> plainly (two bars on the floor, epistle HIT@1 68→48 unfloored, two correct answers
> destroyed, "should NOT flip on this evidence… if they are ever ruled to flip" — this is
> that ruling). The P4.n doc's caveat stands as a watch item: if post-flip accuracy
> degrades, the reverse commands below are the rollback. The original ruling text, for
> the record: the 440 prod-staged works are NOT a queue awaiting inattention — they were
> held by the measured result at `docs/evidence/p4n-flip-2026-08-19/RESULT-commentary.md`.
> 438 of them are the theology wave. **Mechanical requirements that survive the ruling:**
> (a) the prod-side ADR-029 scan runs FIRST (read-only, one command below) and its FAIL
> works are carved out of the batches — attribution is part of the product promise, not
> paperwork — **discharged 2026-09-07, see Precondition 2 below**; (b) each flip is `--status-only` + `serve-batched`, own snapshot, own reverse.
>
> **Precondition 2 — ADR-029 rule 3: SATISFIED — DEV SET 2026-09-07 (scan done
> 2026-09-07, commit `ce3df1b`); PROD SET 2026-09-07 (scan + carve below).** `docs/DECISIONS.md:317-318`, verbatim: **"No CCEL
> work publishes until it has been checked for a composite-volume boundary."** The detector
> was extended with the two missing addendum-2 shapes + head-and-tail sweep (red-proved,
> sensitivity 11/11, specificity 3/3 on the ADR's labelled set), the durable adapter
> boundary landed (`attributionBoundaryHold` — future CCEL ingests hold at acquire time),
> and the frozen 133-work dev-staged set was scanned:
> `docs/evidence/adr029-scan-2026-09-06/verdict.md` = **90 PASS / 43 FAIL**. **The 43 FAIL
> works are HELD — non-authorial matter** (15 live machine word-indexes, 5 foreign-work
> composites incl. origen §1/§101 confirmed live + schaff-anf06/07/08 bound-in fathers,
> the rest carried-in title/apparatus pages). **No flip may include a verdict-FAIL work.**
> The 439 prod-staged works were NOT scanned under that order (no prod connection) — and the
> deep-audit of 2026-09-07 proved the scan command this runbook originally cited **cannot
> run as written** (scanner dev-only by design). **Closed 2026-09-07 (deep-audit C-3):** the
> scanner's guarded prod mode was built (`SCAN_ALLOW_PROD=1` + `--target` naming the exact prod
> endpoint id + explicit `--slugs`; read-only txn enforced; dev guards untouched — six red-proofs
> in `docs/evidence/adr029-scan-2026-09-07-prod/redproof-prod-mode.log`) and all 439 were scanned
> READ ONLY on prod with detector 2.1.0:
> `docs/evidence/adr029-scan-2026-09-07-prod/verdict-prod.md` = **296 PASS / 143 FAIL**. **The 143
> FAIL works are HELD** — carved out of `prod440-2026-09-06-batch{1..5}.json` into
> `docs/evidence/corpus-copy/prod439-held-adr029-2026-09-07.json`; the batches are now
> **48/64/66/66/52 = 296** (union proof: `carve-union-proof.log` — batches 296 + held 143 = 439,
> disjoint, held == scan FAIL set exactly). The flip sequence below names the carved files; no
> flip may include a verdict-FAIL work. Additionally **`hooker-just`** (dev-staged, outside both
> sets — deep-audit M-3) was scanned on dev the same day: **FAIL** (§1 head banner ruled a strong
> foreign-work banner — a claim to be read per ADR-029 rule 2, not a deletion). It is HELD and
> must not be added to any flip file while that verdict stands.
> Additionally, **`origen-commentary` is held by the ADR-029 ruling itself** (its §1–~129 are 1 & 2
> Clement) — it was wrongly included in the original 440 slug files; it has been REMOVED
> from `prod440-2026-09-06-batch4.json` (batch 4 went to 87 and the union to 439 at that point,
> still named `prod440-*` for file stability — the 2026-09-07 prod-scan carve above then took
> the five batches to 48/64/66/66/52 = 296).
>
> What remains flippable without further ruling: the **verdict-PASS subset of the 58
> dev-staged works** (after the dev→prod copy). **42 PASS / 16 HELD** — re-carved 2026-09-07
> from **verdict-v2** (detector 2.1.0, deep-audit H-1 remediation; was 50/8 under v1 —
> donne-devotions, flavel-life, foxe-martyrs, lardner-n-mosaic, luther-translating,
> schaff-npnf109/110/204 moved PASS→HELD), exact slug files:
> `docs/evidence/corpus-copy/dev58-pass-adr029-2026-09-07.json`
> (flip these) and `dev58-held-adr029-2026-09-07.json` (do NOT flip: bennett-expositor10,
> donne-devotions, flavel-life, foxe-martyrs, lardner-n-mosaic, luther-translating,
> schaff-anf06/07/08, schaff-npnf109/110/111/112/114/204, tolstoy-maupassant — full findings in
> verdict.md and verdict-v2.md). The copy itself (job 1) is unaffected by both preconditions
> and can run as written (copy all 58; the held ones stay staged on prod too, marked by this
> packet).

**What this is:** the paste-ready runbook for the overdue owner batch from the 2026-09-06
ingestion session. Two jobs, in order:

1. **Copy** the 58 works staged on DEV (top-up waves 1–3) to PROD, landing `staged`.
2. **Publish** 338 works total on PROD: the 42 verdict-PASS of the 58 (after the copy; 42 since
   the 2026-09-07 v2 re-carve, see amendment) + the
   296 verdict-PASS of the 439 already staged there (296 since the 2026-09-07 prod scan carve,
   see amendment) — each as a `--status-only` flip followed immediately by a
   `serve-batched` run on the same slug file. **(Job 2 was gated by the preconditions in the
   amendment block: the owner ruling of 2026-09-07 discharged P4.n; ADR-029's prod-side scan
   ran 2026-09-07 and its 143 FAILs are carved — both preconditions are now satisfied.)**

Everything below was verified READ ONLY on 2026-09-06 (dev via `web/.env.local`
`APP_DATABASE_URL` = app_runtime, SELECT-only; prod via `~/.neon_prod_url`, `BEGIN READ ONLY`).
Nothing here was executed for real by the prepping agent — the write tools are owner-TTY-gated.

## The numbers (all reconciled)

- **58 dev-staged** = 17 wave-1 + 39 wave-2 + newman-apologia + foxe-martyrs. Verified: all 58
  are `status='staged'` on dev, all 58 absent from prod, all 58 in `ingest/sources.config.json`,
  none `serve:false`. `corpus-copy.mjs --dry-run` census passes clean (4,838 sections, 26,820
  flat embedding rows).
- **439 prod-staged** = the 441 staged on prod (`SELECT status, count(*)`: 394 published /
  441 staged / 3 quarantined) **minus `hort-james1909` and `origen-commentary`** (see
  exclusions). Verified: all 439 pass the licence and forbidden-provenance predicates READ
  ONLY; all 439 have serveable embedding rows (261,933 flat rows, all `served=false`).
  **Carved 2026-09-07 by the prod ADR-029 scan: 143 verdict-FAIL works moved to
  `docs/evidence/corpus-copy/prod439-held-adr029-2026-09-07.json`; 296 verdict-PASS remain
  in the five batch files** (`verdict-prod.md`, union proof `carve-union-proof.log`).
- No delta: 42 + 296 = 338 works to publish (embedding-row counts were measured for the full
  58+440 set and are now over-estimates — the 42 is the verdict-v2 re-carve of 2026-09-07 and
  the 296 is the prod-scan carve of 2026-09-07; serve-batched prints its own exact ETA).

## Exclusions — do NOT add these to any slug file

- **`hort-james1909`** — staged on prod but `serve:false` in `ingest/sources.config.json`
  (the only standing serve:false ruling) while also manifest-quarantined: a status
  contradiction that needs an **owner ruling, not a flip** (WORKLOG 2026-09-06, NOT DONE). The
  flip's serve:false gate would STOP any forward flip listing it anyway.
- **`thayers-lexicon`** — **not staged at all**: prod holds the dead-OCR copy as `published`.
  The standing gate (owner ruling 2026-08-21, `scripts/lib/publish-flip-guard.mjs`) refuses any
  flip whose slug file names it until `docs/evidence/thayers-source-verification.md` exists.
  Publish-blocked; leave it exactly as it is.
- The 3 prod-quarantined works (`augustine-confessions`, `calvin-calcom`,
  `chesterton-preexistence`) are out of scope by status; untouched here.
- **The 143 prod verdict-FAIL works** (`docs/evidence/corpus-copy/prod439-held-adr029-2026-09-07.json`)
  — HELD by ADR-029 rule 3 after the 2026-09-07 prod scan (non-authorial matter: word indexes,
  apparatus pages, foreign-work banners, publisher blurbs; every finding in `verdict-prod.md`).
  They stay staged on prod, marked by this packet; no flip may include them.
- **`hooker-just`** — dev-staged, arrived after the frozen 133; scanned on dev 2026-09-07,
  verdict **FAIL** (§1 banner, a claim to be read per ADR-029 rule 2). HELD; it is in no flip
  file and must not be added to one while that verdict stands.

**Owner value calls flagged in the wave-2 digest** (before running the copy): three genuinely
tiny works were staged per the triage plan but flagged for your ruling —
`pascal-memorial` (3.6k chars), `cranmer-doctrine` (4.7k), `donne-spital` (5.9k). If you rule
any out, delete it from `docs/evidence/corpus-copy/dev58-2026-09-06.json` AND drop the staged
dev row before the copy; otherwise they ride with the batch.

## Pre-flight (2 minutes)

- Run from the repo root, on `fix/ux-overnight-sweep`, at a **real terminal** — both write
  tools refuse piped stdin (`STOP: stdin is not a terminal`). Do not run them from an agent,
  a CI job, or a pipe.
- These are **DB tools, not Vercel** — `npx vercel whoami` is NOT needed. Plain `node`, no tsx.
- The credential files the scripts expect must exist (values are read into the environment by
  the commands below; never printed, never pasted into a command line):
  - `~/.neon_prod_url` — prod owner credential (verified 2026-09-06: connects as
    `neondb_owner`, which both writers assert at the server).
  - `~/.neon_dev_owner_url` — dev owner credential (copy source; read-only use).

  ```sh
  ls -la ~/.neon_prod_url ~/.neon_dev_owner_url
  ```

## Batching (and why)

- **Status flips: 6 batches** — the 42 PASS as one batch, the 296 as five batches
  (48/64/66/66/52 — carved 2026-09-07 from the original 88/88/88/87/88 by the prod ADR-029
  scan, see amendment; file names unchanged for stability). Precedent:
  2026-08-19 flipped **87 works in a single flip** (log:
  `docs/evidence/work-order-v2-stage2/flip-run-2026-08-19T11-57-28-503Z.log`), so 42/66 per
  batch is inside proven size, one owner-gate answer per batch, and each batch gets its own
  pre-flip snapshot + run log for reviewability. The loop's ~30-work "digest breaker" is an
  **intake** convention (pause ingestion so publishing catches up), not a flip-size cap — the
  87-work flip already exceeded it.
- **The served write never rides with the flip at this scale.** Measured 20–36 rows/sec with
  13 GB of index re-insertion per row update; three historical in-transaction serve runs died
  mid-flight (146k, 40k, and even a 414-row probe). 288,753 rows in one transaction would be
  2.2–4 hours holding a lock on `sources`. So: every flip runs `--status-only` (95-row-style
  write, commits in seconds), and the serving is `serve-batched.mjs`, which COMMITS every
  2,000 rows and is **resumable** — an interruption costs nothing, re-run the same command.
- Interleave per batch (flip → serve → next batch) so no work sits published-but-unretrievable
  longer than its own batch's serve run. Published-but-unserved is a known-safe intermediate
  (the 88-work precedent), but there is no reason to accumulate 338 of them.

## Step 1 — copy the 58 dev → prod (one run)

```sh
COPY_ALLOW=1 COPY_EXPECT_HOST=ep-odd-fog-atnykudm \
CORPUS_COPY_SOURCE_URL=$(cat ~/.neon_dev_owner_url) \
CORPUS_COPY_DEST_URL=$(cat ~/.neon_prod_url) \
  node scripts/corpus-copy.mjs --slugs=docs/evidence/corpus-copy/dev58-2026-09-06.json
```

- **The gate asks:** after printing source and destination censuses —
  `About to copy 58 work(s) into ep-odd-fog-... They will land as status='staged' and will NOT
  be published by this tool.` then `Type 'copy' to proceed:` — type `copy`.
- **Success looks like:** per-work `copied <slug>: N section(s), N vector(s), N flat row(s)`
  lines, then
  `✓ copied 58 work(s), all counts match. They are STAGED. Publishing is a separate act (publish-flip.mjs).`
  A count mismatch ends in `✗ N count mismatch(es). The copy is INCOMPLETE — do not publish.` —
  stop there if you see it.
- Re-runnable: every insert is `ON CONFLICT DO NOTHING`, so an interrupted copy resumes by
  re-running the same command. Evidence JSON lands in `docs/evidence/corpus-copy/`.

## Step 2..7 — per batch: flip --status-only, then serve-batched

Run this pair SIX times, with `<FILE>` taking these values in order:

1. `docs/evidence/corpus-copy/dev58-pass-adr029-2026-09-07.json` (**42 — only after step 1
   succeeds. NOT the full dev58 file: the 16 verdict-FAIL works in
   `dev58-held-adr029-2026-09-07.json` must never appear in any flip — deep-audit 2026-09-07
   found this step originally named the full 58, which would have published the held works;
   the H-1 remediation re-carve (verdict-v2, detector 2.1.0) added 8 more to the held set;
   no tool gate would have stopped it**)
2. `docs/evidence/corpus-copy/prod440-2026-09-06-batch1.json` (**48** — carved 2026-09-07, was 88)
3. `docs/evidence/corpus-copy/prod440-2026-09-06-batch2.json` (**64** — carved, was 88)
4. `docs/evidence/corpus-copy/prod440-2026-09-06-batch3.json` (**66** — carved, was 88)
5. `docs/evidence/corpus-copy/prod440-2026-09-06-batch4.json` (**66** — carved, was 87)
6. `docs/evidence/corpus-copy/prod440-2026-09-06-batch5.json` (**52** — carved, was 88)

**Flip:**

```sh
PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=ep-odd-fog-atnykudm \
CUTOVER_DATABASE_URL=$(cat ~/.neon_prod_url) \
  node scripts/publish-flip.mjs --slugs=<FILE> --status-only
```

- **The gate asks:** `Type publish to PUBLISH to ep-odd-fog-atnykudm.c-9.us-east-1.aws.neon.tech:`
  — type `publish`.
- **Success looks like** (from the 87-work precedent run):
  `OK — gate held. 87 status row(s) staged -> published; 101662 embedding row(s) -> served=true.`
  — with `--status-only` the second number is `0`, and the run also prints
  `--status-only  : embeddings.served NOT written. ... until scripts/serve-batched.mjs runs`
  (expected; the next command is that run) and
  `Reverse with: node scripts/publish-flip.mjs --slugs=<FILE> --reverse --snapshot=<path>`.
  **Note the snapshot path** — it is the exact inverse target if you ever reverse this batch.
- Run log + pre-flip snapshot land in `docs/evidence/work-order-v2-stage2/` (default
  `--evidence` dir), timestamped per run.

**Serve (same slug file, immediately after its flip):**

```sh
PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=ep-odd-fog-atnykudm \
CUTOVER_DATABASE_URL=$(cat ~/.neon_prod_url) \
  node scripts/serve-batched.mjs --slugs=<FILE>
```

- **The gate asks:** after preflight (`all published, licences allowed, provenance clean, none
  vetoed`) and a `to serve N row(s) (~M commits, ~T min at the measured 28 rows/sec)` line —
  `Type serve to SERVE N row(s) on ep-odd-fog-...:` — type `serve`.
- **Success looks like:** per-batch progress lines, then
  `OK — N row(s) served across M work(s).` and
  `Verified: N/N row(s) for these works now carry served=true.`
- **Interruption is safe:** each 2,000-row batch autocommits; on any failure it prints
  `N row(s) were already COMMITTED and are safe. Re-run the same command to resume.` — do
  exactly that.
- Expected sizes: the dev58 batch serves 26,820 rows (~16 min at 28/s); the five prod batches
  were measured at 261,933 rows between them BEFORE the 2026-09-07 carve — the carved 296
  works serve strictly fewer (the 143 held works' rows are out). The tool prints its own exact
  ETA before the gate.

## Reversing a batch

Same env, same slug file, plus the snapshot THAT batch's forward run wrote:

```sh
PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=ep-odd-fog-atnykudm \
CUTOVER_DATABASE_URL=$(cat ~/.neon_prod_url) \
  node scripts/publish-flip.mjs --slugs=<FILE> --reverse --snapshot=docs/evidence/work-order-v2-stage2/<flip-pre-snapshot-....json>
```

`--reverse` inverts exactly what the forward run moved (status and served rows, both read from
the snapshot) and is never blocked by the legality gates — a withdrawal only shrinks the
published set. The gate asks for the same `publish` word, labelled REVERSE.

## Follow-ups (not part of the 15-minute batch)

- **REQUIRED — accuracy re-measurement after the flips** (added on deep-audit 2026-09-07;
  its absence made the P4.n watch item decorative). The owner's "publish the 439" ruling
  stands, but the only thing that says whether the P4.n warning applied to THIS wave is a
  post-flip measurement. After the last batch: run the held-out v4 accuracy diagnostic (the
  pre-open run's tooling — evidence pattern `docs/evidence/evals/pre-open-v4-*.log`) and
  compare against the pre-flip baseline, per category with denominators. If epistle/topical
  move toward their floors the way the commentary flip moved them (two bars landed exactly
  on the floor, epistle HIT@1 68→48), the reverse commands above are the rollback — a
  withdrawal only shrinks the published set and is never gate-blocked.
- **`foxe-martyrs` serves via `history_embeddings`** (historian head, sections plane: 1,334
  `section_embeddings`, 0 flat rows) and has **0 `history_embeddings` rows on dev** — the
  backfill hasn't covered it. After this batch it will be shelf-readable but not
  /ask-retrievable until someone runs, against prod:
  `DATABASE_URL=$(cat ~/.neon_prod_url) node scripts/backfill-history-embeddings.mjs --apply`
  (dry-run census first without `--apply`), then
  `node scripts/serve-batched.mjs --slugs=docs/evidence/corpus-copy/dev58-2026-09-06.json --table=history_embeddings`
  with the usual env. Known-safe intermediate state; flagged here so it isn't lost.
- `hort-james1909` owner ruling (status contradiction) and the `thayers-lexicon` source
  verification remain open items from WORKLOG 2026-09-06 NOT DONE.
- Evidence from this batch (copy JSON, flip logs + snapshots, serve-batched JSONs) is
  committable — sweep it into evidence commits after the run.
