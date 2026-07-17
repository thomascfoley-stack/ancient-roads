# GO-LIVE STATUS — morning readout (overnight run of 2026-07-16 → 17)

**Branch `golive`, everything DEV-only. Part C NOT executed (hard stop honored).**
This doc is the wake-up readout + the exact Part C sequence. Numbers marked ⏳ are
filled by the overnight finisher; if any is still ⏳ when you read this, the run
died mid-flight — resume `data/overnight-driver.sh`, don't restart.

## Green / red per phase

| Phase | State | Evidence |
|---|---|---|
| 0 — verifier fail-open | ✅ GREEN | seeded drift block returned `{ok:true}` before, `unknown_block_type` violation after; byte-synced; 35 tests |
| 1 — schema (017) | ✅ GREEN | hymn/poetry/art in the CHECK; applied twice (idempotent) on dev |
| 2 — register read path | ✅ GREEN | 018/019 applied; lockstep tests green; licensing recall probe 50/50 |
| A1 — eval gate (pre-ingest) | ✅ GREEN | frozen v3 n=120: verse-ref 95/98 · pericope 87/100 · epistle 88 · topical 70 · proper-noun 80/90 · control clean — identical to baseline |
| A2 — adapters | ✅ GREEN | ccel + gutenberg + helloao + sword-bridge; each proven against a seed-validated anchor (Olney→1Chr 17:16, Keble→Lam 3:22) |
| A3 — 46-work queue | 🟡 see table | hymn/poetry tier: 14 published (5,561 served rows); prose tier ⏳ (in flight overnight) |
| A4 — static JSON + FTS | ⏳ | FTS regen is the driver's last step (work/register columns ride the COPY) |
| A5 — both-surface confirm | 🟡→⏳ | register-wall: **0 breaches** on 5 queries incl. "amazing grace" (hardest case); reader shows Scottish Psalter on Ps 23 attributed, `paraphrase`, 390px+desktop, console clean; EntryCard **0 external host links** (link removed — commit 86ef7f6). ⏳ full-corpus eval re-run after prose lands |
| A6 — deep-audit | ⏳ | fresh agents after the driver completes |
| B1 — 021 REVOKE | ✅ GREEN (dev) | section_anchors/section_embeddings/section_history_anchors → SELECT-only for app_runtime, verified by role_table_grants |
| B2 — forbidden-provenance removal | ⏳ | script proven (coverage-guarded, backup-before-delete); applies automatically once chrysostom/augustine NPNF re-source lands |

## A5 — the two "no regression" checks

1. **Commentary held**: frozen v3 re-run on the FULL corpus → ⏳ (fill: per-category vs baseline 95/98 · 87/100 · 88 · 70 · 80/90)
2. **Register wall held**: hymns/poems in ANY exegetical pool (base/injection/backfill) across 5 probe queries = **0 breaches**; song_verse pool non-empty 5/5; prose never in song_verse. (`web/src/scripts/register-wall-check.mts` — re-run anytime.)

## Quarantine / escalation list (owner decisions or follow-ups)

| Work | State | Why / next step |
|---|---|---|
| origen-commentary | staged, NOT served | standing MUST_NOT_SERVE 'Origen' ruling vs the go-live queue — your editorial call |
| herbert-temple | quarantined | no CCEL ThML (HTML landing page); refetch from Wikisource later — attribute to author, never a host |
| bramley-carols | quarantined | same — no CCEL ThML edition |
| montgomery-sacred-poems | quarantined | CCEL structure unrecognized (no typed/classed divs) |
| rossetti-verses | quarantined | Gutenberg structure unrecognized (1 unit) |
| isbe · eastons · smiths · naves | deferred | zLD/RawLD dictionary decoder not built this run (Catena zCom WAS ingested); follow-up decoder |
| bdb-lexicon | deferred | github structured-data pipeline (not verse-voice prose) — separate follow-up |
| thayers-lexicon | deferred (staged intent) | archive.org OCR tier; archive adapter not built this run |
| josephus-works | skipped | duplicate of the already-staged josephus-whiston (CrossWire) |
| historians (schaff-history, edersheim) | staged, never served | write-contract path; no read path exists (by design) |
| ⏳ any overnight auto-quarantines | see `data/ingest-run-log.jsonl` | pre-authorized: quarantine + log + continue |

## PART C — the deliberate prod cutover (YOUR eyes-open step; needs prod creds)

**Precondition:** every ⏳ above green; A5 both checks pass; A6 findings resolved/logged.

```bash
# 0. From a session WITH prod credentials (this one has none by design):
#    export DATABASE_URL=<prod owner unpooled>   # never committed, never echoed
cd <repo>

# 1. Migrations 016→021 in order (all additive; 018/019 use the concurrent runner):
node db/apply-migration.mjs           db/migrations/016_history_sections.sql
node db/apply-migration.mjs           db/migrations/017_source_type_registers.sql
node db/apply-migration-concurrent.mjs db/migrations/018_register_partial_indexes.sql
node db/apply-migration-concurrent.mjs db/migrations/019_register_columns_fts.sql
# (020 exists only if numbered in this branch — apply in numeric order, skip gaps)
node db/apply-migration.mjs           db/migrations/021_revoke_app_runtime_anchor_writes.sql
# verify: role_table_grants → SELECT-only on the three anchor/embedding tables;
#         sources CHECK includes hymn/poetry/art; tsv expr includes heading.

# 2. Deploy code (Vercel) — verifier fix + routing register path + reader changes.
#    THE irreversible outward step. Rollback = redeploy previous build.

# 3. Idempotent ingest against prod (fills registers + the clean Chrysostom/Augustine):
NEON_BRANCH=... # prod is BLOCKED by the guards — run the ingest with the owner
                # consciously exporting the prod URL AND editing the guard, or
                # (recommended) promote the DEV branch data via Neon instead.
#    Recommended path: Neon branch-promote/copy of the dev data (no re-embed spend).
#    Alternative: re-run data/overnight-driver.sh steps against prod (same gates).

# 4. Landmine 2 on prod (after step 3 provides replacement coverage):
npx tsx src/ingest/b2-remove-forbidden-provenance.ts          # dry run first
npx tsx src/ingest/b2-remove-forbidden-provenance.ts --apply  # backup → delete → ratchet=0

# 5. Verify on prod: spot-check a hymn/poem/K&D/Spurgeon on both surfaces;
#    re-run eval-heldout --v3 against prod (no commentary regression);
#    register-wall-check (0 breaches); role_table_grants (SELECT-only);
#    seeded bad block → verifier fails closed. Record all numbers in WORKLOG.
```

**Rollback paths:** code → redeploy prior Vercel build. Content → the register rows are
additive; reverting the `routing.ts` served-list constants unserves them instantly
(filter + partial index predicate match). Migrations → additive only; 021 is a REVOKE
(re-grantable). B2 → removed rows are backed up to a timestamped JSONL AND re-ingestable
from CCEL. Nothing in Part C hard-deletes prod data.

## Notes for the deep-audit reader

The guards intentionally block prod: every ingest/migration entry point requires
`NEON_BRANCH ∈ {dev,test}` from the same env source as `DATABASE_URL`. Part C therefore
requires a conscious owner action (the Neon promote, or a deliberate guard override in
the session you run with prod creds) — that friction is the design, not an oversight.
