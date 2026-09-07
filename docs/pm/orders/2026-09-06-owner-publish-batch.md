# Owner publish batch — 2026-09-06 (dev→prod copy + publish flips)

> **⚠ AMENDED 2026-09-06 — two standing preconditions were missed in the first version of
> this runbook. Do NOT run the 440-work flips as originally written.**
>
> **Precondition 1 — the P4.n accuracy hold.** The 440 prod-staged works are NOT a queue
> awaiting inattention — they are deliberately HELD. The P4.n flips (2026-08-19) were stopped
> after father (18) and commentary (87) on a measured result
> (`docs/evidence/p4n-flip-2026-08-19/RESULT-commentary.md`): every pre-registered bar held
> but two landed exactly on the floor, epistle HIT@1 fell 68%→48% unfloored, and two correct
> answers were destroyed outright (net 5 worse / 4 better). The verdict, verbatim:
> **"Sermon and theology should NOT flip on this evidence… if they are ever ruled to flip."**
> 438 of the 440 are the theology wave. Flipping them is an **owner ruling per category,
> preceded by an accuracy re-measurement** — not a batch operation. The original 5×88 batch
> plan below is RETAINED ONLY for the works that clear this ruling.
>
> **Precondition 2 — ADR-029 rule 3.** `docs/DECISIONS.md:317-318`, verbatim: **"No CCEL
> work publishes until it has been checked for a composite-volume boundary. This is a
> standing precondition on the lexicon/reference publish batch and on any future CCEL
> ingest."** 876/917 manifest entries are CCEL-provenanced, so this gates essentially the
> whole batch. The detector (`scripts/lib/front-matter-detector.mjs`) needs its two missing
> addendum-2 shapes (publisher catalogue, machine-generated word index) plus a head-and-tail
> sweep, and the scan must cover every work proposed for publish with a red-proved labelled
> set BEFORE any flip. Additionally, **`origen-commentary` is held by a cited ruling** (the
> ADR-029 case itself: its §1–~129 are 1 & 2 Clement, not Origen) — it was wrongly included
> in the original 440 slug files; it has been REMOVED from
> `prod440-2026-09-06-batch4.json` (batch 4 is now 87; the union is 439, still named
> `prod440-*` for file stability).
>
> What remains flippable without further ruling: the **58 dev-staged works from the 2026-09-06
> waves** (after the dev→prod copy), each of which still needs the ADR-029 scan as a
> precondition — they are mostly CCEL works. The copy itself (job 1) is unaffected by both
> preconditions and can run as written.

**What this is:** the paste-ready runbook for the overdue owner batch from the 2026-09-06
ingestion session. Two jobs, in order:

1. **Copy** the 58 works staged on DEV (top-up waves 1–3) to PROD, landing `staged`.
2. **Publish** 498 works total on PROD: those 58 (after the copy) + the 440 already staged
   there — each as a `--status-only` flip followed immediately by a `serve-batched` run on the
   same slug file. **(Job 2 is gated by the two preconditions above: P4.n accuracy ruling +
   ADR-029 scan. See the amendment block.)**

Everything below was verified READ ONLY on 2026-09-06 (dev via `web/.env.local`
`APP_DATABASE_URL` = app_runtime, SELECT-only; prod via `~/.neon_prod_url`, `BEGIN READ ONLY`).
Nothing here was executed for real by the prepping agent — the write tools are owner-TTY-gated.

## The numbers (all reconciled)

- **58 dev-staged** = 17 wave-1 + 39 wave-2 + newman-apologia + foxe-martyrs. Verified: all 58
  are `status='staged'` on dev, all 58 absent from prod, all 58 in `ingest/sources.config.json`,
  none `serve:false`. `corpus-copy.mjs --dry-run` census passes clean (4,838 sections, 26,820
  flat embedding rows).
- **440 prod-staged** = the 441 staged on prod (`SELECT status, count(*)`: 394 published /
  441 staged / 3 quarantined) **minus `hort-james1909`** (see exclusions). Verified: all 440
  pass the licence and forbidden-provenance predicates READ ONLY; all 440 have serveable
  embedding rows (261,933 flat rows, all `served=false`; none rely on `history_embeddings`).
- No delta: 58 + 440 = 498 works to publish; 288,753 embedding rows to serve.

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

- **Status flips: 6 batches** — the 58 as one batch, the 440 as five batches of 88. Precedent:
  2026-08-19 flipped **87 works in a single flip** (log:
  `docs/evidence/work-order-v2-stage2/flip-run-2026-08-19T11-57-28-503Z.log`), so 58/88 per
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
  (the 88-work precedent), but there is no reason to accumulate 498 of them.

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

1. `docs/evidence/corpus-copy/dev58-2026-09-06.json` (58 — only after step 1 succeeds)
2. `docs/evidence/corpus-copy/prod440-2026-09-06-batch1.json` (88)
3. `docs/evidence/corpus-copy/prod440-2026-09-06-batch2.json` (88)
4. `docs/evidence/corpus-copy/prod440-2026-09-06-batch3.json` (88)
5. `docs/evidence/corpus-copy/prod440-2026-09-06-batch4.json` (88)
6. `docs/evidence/corpus-copy/prod440-2026-09-06-batch5.json` (88)

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
  serve 261,933 rows between them (~2.5 h total, ~30 min each). The tool prints its own ETA
  before the gate.

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
