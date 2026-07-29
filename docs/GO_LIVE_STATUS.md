# GO-LIVE STATUS — morning readout (runs of 2026-07-16 → 18)

**Branch `reconcile` (from main 0491e6e), everything DEV-only. Part C NOT executed
(hard stop honored).** The whole corpus was re-ingested through the fixed adapters
after the A6 line-by-line audit; the 5 gated reconcile streams then landed
(zero-window 018/019 · register lanes · forbidden-provenance 0/0 · housekeeping ·
honest re-measure). Deep-audit verdict: **GO for merge, with conditions** — the
Phase 6 fixes are done (WORKLOG 2026-07-18); the open owner calls below are yours.

## ⚠ HEADLINE — the lane config IS applied; these are the honest numbers (read first)

**The sermon/theology register-lane config — ship option (c) — is applied on this
branch** (ADR-023): the exegetical pool = verse-commentary + fathers ONLY;
sermons/theology/hymns surface in labeled lanes on all 4 surfaces (shared
`partitionByRegister`) and never count toward the ≥2-voices floor.

The earlier "A5.1 REGRESSED, options (a)/(b)/(c) — none applied, your call"
readout is OBSOLETE, and so is its comparison point: **the 2026-07-14 "70/88"
topical/epistle baseline is a myth** — it was propped up by forbidden-provenance
rows that stream C has since removed and by a circular tp-12 relabel that A6
struck. `docs/SERMON_LANE_DIAGNOSIS.md` found it unreproducible and showed the
regression was **NOT purely the sermon flood** (the whole prose expansion shifted
broad-query ranking).

The honest option-(c) numbers (WORKLOG 2026-07-18; H1/H2 per category):

| category | v3 honest baseline (dev set) | v4 frozen (90de5dc3) | pre-registered bar | v4 verdict |
|---|---|---|---|---|
| verse-ref (n=40) | 95 / 95 | **100 / 100** | H1 ≥85 | clears |
| pericope (n=15) | 87 / 100 | **80 / 100** | H1 ≥70 | clears |
| epistle (n=25) | 68 / 80 | **96 / 100** | H2 ≥85 | clears |
| topical (n=20) | 45 / 75 | **80 / 90** | H2 ≥85 | clears |
| proper-noun (n=10) | 60 / 90 | **60 / 100** | H1 ≥70 | **MISSES (60 < 70)** |
| control (n=10) | clean 10/10 | clean 10/10, 0 hijacks | 0 | clears |
| no-content (all) | — | 0/110 | ≤8% | clears (but see SoS below) |

v4 was minted + frozen (`sha256 90de5dc3…`) with bars pre-registered before any
number existed, run ONCE, no tuning. **It clears every pre-registered bar EXCEPT
proper-noun HIT@1 60% (all 4 misses are HIT@2-pass — ≥2 correct voices in the
top-6; the top-1 slot goes to a related passage).** That miss, and the three
items below it, are open owner calls.

**The caveats that must travel with "clears every bar"** (completed 2026-07-19 —
this section carried the SoS caveat but dropped the other three, which makes the
result read stronger than the evidence supports):

- **CI-STRADDLE:** "clears" means the POINT ESTIMATE clears. Topical 90 and
  pericope 80 are point estimates whose **95% CIs straddle their own bars** — they
  are not measurably above them, only not-below.
- **TASK-EASING:** v4's labels are **KJV-phrase-anchored**, which makes the
  doctrinal strata easier than v3's abstract queries. **The abstract-topical
  failure mode — the one v3 actually exposed — is not exercised by v4 at all.**
- **DISJOINTNESS OVERSTATED:** `HELDOUT_EVAL_DESIGN.md` asserts v4 is disjoint
  from v3 while its own caveats say otherwise, and ADR-024's label anchor-check
  script was never committed — so **v4 label verification is not reproducible
  from this repo.**
- **SoS:** (already noted below) v4 samples no Song of Solomon, so `no-content
  0/110` does not clear the known SoS hole.

## Open owner calls (2026-07-18)

1. **Proper-noun HIT@1 60 < 70 (v4). → RULED 2026-07-19, see ADR-028.** ACCEPTED
   LIMITATION for the gated beta; **BLOCKING for public launch**; re-measure at
   larger n before public (60/100 on n=10 has a wide CI and may not be a true
   regression). Note `PHASE_A_CLOSE.md`'s proper-noun **80/90** is the v3 set on
   the pre-option-(c) config and is **historical** — v4's 60/100 measures what
   ships. ADR-028 is the only place this status is ruled.

   **1b. Song of Solomon → the beta ruling's CONDITION FAILED verification
   (2026-07-19).** SoS was to be an accepted coverage hole *provided the fallback
   was verified to fire*. It was verified and **it does not fire**: 0/4 SoS queries
   reach the no-content path — `retrieveCommentary` has no relevance floor, so a
   zero-coverage book returns six irrelevant chunks (Barnes/Wesley on the **New
   Testament**, Chrysostom on Matthew/John/Acts, Augustine on **Psalm 45**), scores
   as low as 0.005. End-to-end the user is still safe (`kind:'fallback'`, raw
   sources) — but only because the **verifier** rejected malformed schema and an
   invalid anchor, not because the system noticed it has no SoS sources.
   **Re-ruling needed.** Evidence: `docs/evidence/part4/sos-fallback-verification.txt`.
2. **Copyrighted static corpus — publicly fetchable on prod TODAY (pre-existing).**
   16,360 copyrighted-author entries (Tyndale Study Notes 15,161 · CS Lewis 1,102
   · Screwtape 70 · Douglas Wilson 16 · Tolkien 11) sit in `web/public/commentaries`
   AND the dev DB with EMPTY `sourceUrl` — served as raw JSON on prod right now.
   The ratchets are blind to them because they key on `sourceUrl`.
   `docs/OWNER_ACTIONS.md:159` (bucket (a), "remove from corpus") is still unchecked.
3. **~131 empty-provenance patristic rows in the served pool** carry ACCS-style
   titles — possibly a copyrighted modern translation. Needs a provenance ruling
   (quarantine / re-source / serve).
4. **Song of Solomon: 0 rows in the served exegetical pool for the entire book** —
   below the ≥2-voices floor. v4 contains no SoS queries, so its no-content 0/110
   does NOT clear this hole (a v4.1 should sample it — `HELDOUT_EVAL_DESIGN.md` §v4).
5. **bait-008 (wide-net human review).** One live-bait candidate used "is superior"
   ranking language — caught BEHIND the screen (never reached a user). Editorial
   review item, not a breach.

## Green / red per phase

| Phase | State | Evidence |
|---|---|---|
| 0 — verifier fail-open | ✅ GREEN | dispatch default fails closed; 41 verifier + grounding tests green; both src/ & web/ copies byte-identical |
| 1 — schema (017/020/022) | ✅ GREEN | hymn/poetry/art + 'ingesting' in the CHECKs; embeddings write-policy user-scoped (022) — all applied idempotently on dev |
| 2 — register read path | ✅ GREEN | 018/019 (zero-window rewrite) re-applied on dev 2026-07-18 via the hardened concurrent runner — dev matches the committed migrations; song/verse + FTS lockstep tests green; licensing recall 50/50 |
| A2 — adapters | ✅ GREEN | ccel/gutenberg/helloao/sword-bridge/sword-ld/bdb/archive; text-integrity fixes verified (Trent canons restored, K&D Ps147-150 restored, 0 fused rows) |
| A3 — ingest | ✅ GREEN | 34 works served (all re-ingested via fixed adapters), 5 reference works staged, origen staged; 297,059 register rows; fusion 0 · junk 0 · forbidden 0 · 0 stuck |
| A4 — static JSON + FTS | ✅ GREEN | FTS 191,749 rows (work/register columns); all 6 serving indexes VALID+READY — dev converged 2026-07-18 via the hardened concurrent runner (the stale `_v4` with the quarantined whitefield-works predicate is gone) |
| A5.1 — commentary accuracy | ✅ RE-BASELINED | the old "70/88" comparison was a myth (see HEADLINE); option-(c) honest v3 baseline + frozen v4 clear every pre-registered bar except proper-noun H1 60<70 — owner call |
| A5.2 — register wall | ✅ GREEN | **0 breaches** on the full corpus: vector pools (incl. "amazing grace"), FTS (955 hymn rows, 0 leak), reader (21 labeled, 0 unlabeled); song_verse non-empty 5/5 |
| A5.3 — reader surface | ✅ GREEN | Ps 23 @375px: "Hymns & sacred poetry" labeled section, Hymn/paraphrase/Poetry chips, **0 external host links**, Calvin/Augustine render full+clean, "words of men" line, console clean |
| A6 — deep-audit + line-by-line | ✅ DONE | 83 confirmed findings; 3 criticals + all serving-correctness majors fixed; escalations logged. `docs/GO_LIVE_A6_FINDINGS.md` |
| Sec — security review | ✅ GREEN | 0 high-confidence vulns; snippet sink + Function() eval hardened |
| B1 — 021 REVOKE | ✅ GREEN (dev) | section_anchors/section_embeddings/section_history_anchors SELECT-only for app_runtime (verified role_table_grants) |
| B2 — forbidden-provenance | ✅ GREEN (dev) | ratchet 0 in DB AND static corpus; backup-before-delete proven |
| 022 — embeddings write scope | ✅ GREEN (dev) | app_runtime keeps its embeddings grant for USER content, but RLS is ENFORCED (rls enabled, app_runtime bypassrls=false) and the write policy is `user_id = current_user` — so it CANNOT write platform (user_id IS NULL) rows. Owner ingest bypasses RLS. Verified at enforcement level, not just grants. |
| Idempotency | ✅ GREEN | re-ingest neale-eastern-hymns: 86 rows → 86 rows (deleteWork+rewrite, 0 dupes) |
| Attribution | ✅ GREEN | 10 works across registers: author (+ translator) only, 0 host in author; register/paraphrase labels correct |

## Quarantine / deferred / owner-decision list

| Work | State | Why / next step |
|---|---|---|
| origen-commentary | staged, NOT served | **TWO independent reasons.** (1) standing MUST_NOT_SERVE 'Origen' — editorial. NOTE: Catena Aurea (served) carries Origen EXCERPTS attributed "as quoted by Aquinas" — your editorial call whether that's acceptable. (2) **DATA DEFECT (found 2026-07-19, work-order Phase A): ~129 of 1,224 sections are NOT Origen — they are 1 Clement and 2 Clement**, all stamped `metadata.author='Origen of Alexandria'`. ANF vol 9 prints the Epistles of Clement alongside Origen's Commentary on John; the CCEL scrape took both. §1 = "The First Epistle of Clement to the Corinthians"; §100 = 1 Clement ch. 65; §101–129 = 2 Clement ch. 1–20; real Origen starts ~§130. **Reason (2) survives reason (1):** clearing the editorial ruling would still publish Clement under Origen's name. Repair = re-ingest with a volume-boundary profile |
| whitefield-works | quarantined | PG 68976 is only vol 1/6 and mixes letters/sermons/tracts with no clean boundaries — needs a multi-volume segmentation profile |
| bramley-carols | quarantined | all 5 archive.org copies are engraved-music editions (27-31% OCR garbage), titles unrecoverable |
| donne-divine-poems, herrick-noble-numbers | quarantined | whole secular volumes (Grierson, Hesperides) under sacred titles — need section-scoped profiles |
| thayers-lexicon | quarantined | archive.org OCR: 0% Greek-script headwords, 6.2% strict-match — needs a structured TEI/Strong's source, not a better parser |
| isbe · easton · nave · smith · bdb | STAGED (never served) | decoded + ingested as reference. **Serving UX is your design call** — a reference pane vs blending into /ask (do NOT blend into the exegetical pool without deciding) |
| historians (schaff-history, edersheim, josephus-whiston) | staged, never served | write-contract path; no read path (by design) |
| herbert-temple / montgomery / rossetti | ✅ RECOVERED + served | archive.org Cassell 1887 / CCEL title-div fallback / PG title-line splitter |
| Herbert OCR warts | note | 1887 Cassell has scattered OCR errors in headings (NATUKE., COLOSSIANS hi. 3.) — accept or re-source |

## PART C — the deliberate prod cutover (YOUR eyes-open step; needs prod creds)

**Precondition:** `reconcile` merged to main; the open owner calls above ruled on.

```bash
# 0. From a session WITH prod credentials (this one has none by design):
#    export DATABASE_URL=<prod owner unpooled>   # never committed, never echoed
#    export MIGRATE_ALLOW_PROD=1   # migration runners now dev-guard by default (A6);
#                                  # this flag is the deliberate prod override.
cd <repo>

# 1. Migrations in dependency order, 016 → 023 — ALL as committed, no hand-typed SQL
#    (unique numbers; the old duplicate-020 was renamed -> 023). Plain runner first:
node db/apply-migration.mjs           db/migrations/016_history_sections.sql
node db/apply-migration.mjs           db/migrations/017_source_type_registers.sql
node db/apply-migration.mjs           db/migrations/020_embeddings_source_type_registers.sql
node db/apply-migration.mjs           db/migrations/021_revoke_app_runtime_anchor_writes.sql
node db/apply-migration.mjs           db/migrations/022_embeddings_write_policy_user_scope.sql
node db/apply-migration.mjs           db/migrations/023_sources_status_ingesting.sql
# 018/019 (partial indexes) are ZERO-WINDOW AS COMMITTED: each index is built as
# CREATE INDEX CONCURRENTLY …_v5 → DROP old → RENAME, and the old app keeps index
# service throughout (old predicates imply the new ones). Apply via the concurrent
# runner (splits on --SPLIT--; CONCURRENTLY can't run inside a txn block):
node db/apply-migration-concurrent.mjs db/migrations/018_register_partial_indexes.sql
node db/apply-migration-concurrent.mjs db/migrations/019_register_columns_fts.sql
# The runner DROPs any INVALID leftover indexes before applying and POST-ASSERTS
# every touched index is VALID+READY. If a CONCURRENTLY build fails mid-way,
# re-run the SAME command — the pre-clean removes the invalid leftover and rebuilds.
# Then verify the 6 serving indexes exist, VALID+READY:
#   idx_embeddings_vector_legal        idx_embeddings_vector_song_verse
#   idx_embeddings_vector_sermon       idx_embeddings_vector_theology
#   idx_embeddings_verseid_registers   idx_commentary_fts_legal
# verify: role_table_grants → SELECT-only on the 3 anchor/embedding tables AND
#         embeddings write-policy WITH CHECK is user-scoped (no user_id IS NULL);
#         sources CHECK includes hymn/poetry/art + 'ingesting'; tsv expr includes heading.

# 2. Deploy code (Vercel) — verifier fix + routing register path + reader changes.
#    THE irreversible outward step. Rollback = redeploy previous build.

# 3. Idempotent ingest against prod (fills registers + the clean Chrysostom/Augustine):
#    THE ONLY corpus-to-DB path: re-run the ingest against PROD Neon — idempotent,
#    ON CONFLICT DO NOTHING, touches NO existing rows, so live highlights/notes/
#    waitlist survive. Owner consciously exports the prod DATABASE_URL + NEON_BRANCH
#    and sets the deliberate guard override (MIGRATE_ALLOW_PROD=1).
NEON_BRANCH=...  # prod; guards require the conscious override above
#    ⛔ DO NOT branch-promote / copy the dev Neon branch onto prod. A branch promote
#    REPLACES the prod database wholesale and WIPES live user data (highlights, notes,
#    waitlist) — that data exists only on prod, never on the dev branch. The re-embed
#    cost of a fresh ingest is the price of not destroying user data. Non-negotiable.
#    (Static reader corpus is a separate path: regenerate clean locally, ship via
#    deploy.sh — see docs/DEPLOYMENT.md. Never via Neon.)

# 4. Landmine 2 on prod (after step 3 provides replacement coverage):
npx tsx src/ingest/b2-remove-forbidden-provenance.ts          # dry run first
npx tsx src/ingest/b2-remove-forbidden-provenance.ts --apply  # backup → delete → ratchet=0

# 5. Verify on prod: spot-check a hymn/poem/K&D/Spurgeon on both surfaces;
#    run eval-heldout --v4 against prod (v4 is the frozen instrument; v3 is a
#    dev set per HELDOUT_EVAL_DESIGN — do NOT gate prod on v3);
#    register-wall-check (now predicate-level, incl. the vector-pool leak count);
#    predeploy forbidden-provenance ratchet (0/0 both stores); live
#    interpretation_bait; role_table_grants (SELECT-only); seeded bad block →
#    verifier fails closed. Record all numbers in WORKLOG.
```

**Read `docs/GO_LIVE_A6_FINDINGS.md` before Part C** — the full line-by-line audit
disposition (3 criticals + majors fixed, escalations logged, owner design calls
flagged: lexicon serving UX, Origen-via-Catena, Herbert OCR).

**Rollback paths:** code → redeploy prior Vercel build. Content → the register rows are
additive; reverting the `routing.ts` served-list constants unserves them instantly
(filter + partial index predicate match). Migrations → additive only; 021 is a REVOKE
(re-grantable). B2 → removed rows are backed up to a timestamped JSONL AND re-ingestable
from CCEL. Nothing in Part C hard-deletes prod data.

## Notes for the deep-audit reader

The guards intentionally block prod: every ingest/migration entry point requires
`NEON_BRANCH ∈ {dev,test}` from the same env source as `DATABASE_URL`. Part C therefore
requires a conscious owner action (a deliberate guard override in the session you run
with prod creds — NOT a Neon branch-promote, which would wipe live user data) — that
friction is the design, not an oversight.
