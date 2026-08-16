# Owner terminal runbook — 2026-08-16

Everything outstanding after the 08-15/16 sessions that needs a real terminal. Nothing here
runs itself; each step is owner-executed, per bylaw 7 (any production connection, read or
write, needs the owner's explicit go, every time).

**Prerequisite for every step:** run from `/Users/foley/Projects/ancient-roads-git` on `main`
at `87650f1` or later, with a clean tree.

Steps A–C are one unit: **A and B together are what make the three mystics serve.** Doing A
without B changes a label nobody sees; doing B without A serves Bernard on the wrong lane.
C is required by CLAUDE.md because A+B is a retrieval change.

Step D is independent and closes Kimi's open edge. Step E is a decision, not a command.

---

## Step A — retype Bernard to the sermon register

Declared in the manifest at `d264abc`; both databases still carry `theology`.

**A1. Dev dry-run** (no override needed; `.env.local` points at dev):

```
node scripts/retype-work-register.mjs --slug=bernard-song-sermons --to=sermon
```

Expect: `source_type=theology`, ~1515 flat rows, `0 already 'sermon'`, and
`DRY RUN — would set … on 1 sources row and 1515 flat row(s)`.

**A2. Dev apply:**

```
node scripts/retype-work-register.mjs --slug=bernard-song-sermons --to=sermon --apply
```

**A3. Prod dry-run.** Note the target guard needs BOTH the override and the endpoint id
declared exactly — `CUTOVER_EXPECT_HOST=neon.tech` is refused by design:

```
CUTOVER_ALLOW=1 CUTOVER_EXPECT_HOST=ep-odd-fog-atnykudm CUTOVER_DATABASE_URL="$(cat ~/.neon_prod_url)" node scripts/retype-work-register.mjs --slug=bernard-song-sermons --to=sermon
```

**A4. Prod apply** — read A3's output first; the flat-row count should match what the
2026-08-15 copy verified:

```
CUTOVER_ALLOW=1 CUTOVER_EXPECT_HOST=ep-odd-fog-atnykudm CUTOVER_DATABASE_URL="$(cat ~/.neon_prod_url)" node scripts/retype-work-register.mjs --slug=bernard-song-sermons --to=sermon --apply
```

The snapshot lands in `docs/evidence/corpus-copy/` and the exact reverse command is printed
on success. **Commit the snapshot** — it is the only per-row record of the prior state.

---

## Step B — the serve flip for all three mystics

`serve: true` is declared in the manifest; `served` is still false on every row. The slug
file is committed, so no scratchpad paths (the 00:06 refusal on 2026-08-15 was exactly that
mistake — the tool cannot read the session scratchpad).

**B1. Write the slug file** (once):

```
printf '{"slugs": ["bernard-song-sermons", "julian-revelations", "kempis-imitation-benham"]}\n' > docs/evidence/corpus-copy/mystics-serve-2026-08-16.json
```

**B2. Run the flip.** It is TTY-gated and will ask you to type `publish` — type it yourself;
do not pipe an answer:

```
PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=ep-odd-fog-atnykudm CUTOVER_DATABASE_URL="$(cat ~/.neon_prod_url)" node scripts/publish-flip.mjs --slugs=docs/evidence/corpus-copy/mystics-serve-2026-08-16.json
```

Expect `eligible 3 of 3 are 'staged'` and a served-row count in the low thousands (Bernard
alone is ~1515 flat rows). A pre-COMMIT snapshot path is printed — **commit it**; the reverse
is the same command with `--reverse --snapshot=<that path>`.

If it reports a `serve:false` STOP for any of the three, the tree is not at `d264abc` or
later — check before overriding anything.

---

## Step C — accuracy diagnostic (REQUIRED, not optional)

A+B adds a voice to two lanes, which is a retrieval change. CLAUDE.md: re-run the diagnostic
on every retrieval change and record the number in `WORKLOG.md`.

Run **v3**, the dev set — measured against repeatedly. Do **not** run v4: it is frozen, was
run once, and re-running it to see a number is tuning to the test.

```
cd web && npx tsx --env-file=.env.local src/scripts/eval-heldout.mts --v3
```

Baseline to compare against (CLAUDE.md §2, 2026-07-18): verse-ref 95/95 · pericope 87/100 ·
epistle 68/80 · topical 45/75 · proper-noun 60/90 · controls clean.

**These three works are theology/sermon lane, not the exegetical pool**, so the exegetical
categories should be UNCHANGED. A movement in verse-ref or pericope is a signal something
leaked into the exegetical pool and is worth stopping for, not a result to record and move on.

---

## Step D — close the `ask_outcomes` unknowns (independent of A–C)

Migration 116 shipped to prod claiming RLS from birth and INSERT-only at runtime. Two things
are unverified and they share one symptom — an empty table:

1. nobody has watched a real ask land a row (Kimi's own open edge);
2. the two-account RLS leg **did not run** in the 2026-08-16 audit (`APP_DATABASE_URL`
   absent) — it announced NOT RUN, loudly, which is the harness behaving correctly.

**D1.** Sign in on <https://ancientpaths.app> and ask one question. Let it finish.

**D2.** Count the rows. `app_runtime` has INSERT but deliberately **no SELECT policy**, so
this must use the owner credential:

```
psql "$(cat ~/.neon_prod_url)" -c "SELECT count(*), max(created_at) FROM ask_outcomes;"
```

Reading it this way is a **read**, and still owner-executed under bylaw 7.

**Interpreting the result — this is the part that matters:**

- **count ≥ 1** → persistence works. RLS is still unproven, but the write path is real.
- **count = 0** → do **not** conclude "the feature is broken". Three causes are
  indistinguishable from this one number: the fire-and-forget write failed silently (it is
  deliberately fail-open, so an ask succeeds either way), RLS rejected the INSERT because
  `app.current_user_id` does not bind to Neon's user-id format (MASTER.md C5 records this as
  UNPROVEN), or the ask never reached the persistence call. Distinguishing them needs the
  server logs for that request, not another SELECT.

---

## Step E — the two Imitations (a decision, not a command)

`kempis-imitation` (CCEL) and `kempis-imitation-benham` (Gutenberg) are the same work under
two slugs. Recommendation, on §4's own terms rather than tidiness: the CCEL entry records **no
translator** and its `year` is 1418, the *composition* year, not a translation year — so by
§4's governing rule it is an **unknown edition**, and §4 says fail closed on those. *The
Imitation of Christ* has copyrighted modern translations (§4a's AVOID column names Knox and
Sherley-Price), and nothing in that entry establishes which English text is stored.

It also costs nothing in retrieval to retire: its `source_type` is `devotional`, which appears
in **no** served type list, so that copy is already retrieval-invisible.

**Before deciding, one read** — it may be shelf-visible, which retiring would remove:

```
psql "$(cat ~/.neon_prod_url)" -c "SELECT slug, status, source_type FROM sources WHERE slug LIKE 'kempis%';"
```

---

## What is NOT in this runbook

- **The `db-invariants` CI hang.** Still unresolved. Times out at 30 min with zero output on
  the CI test branch `ep-tiny-bonus-at3izo3y`, which reads as a lock or an invalid
  half-built CONCURRENTLY index from a previous timed-out run, not slowness. The 10→30 minute
  raise did not fix it and was the wrong diagnosis. Needs someone inside that branch.
- **The P4.n backlog** (669 works on `lane-b-uploader`). Filed, not urgent; the 669 needs
  re-deriving against a live prod read before any run, per MASTER.md A9.
