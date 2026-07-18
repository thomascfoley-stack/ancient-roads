# GO-LIVE STATUS — morning readout (runs of 2026-07-16 → 18)

**Branch `golive`, everything DEV-only. Part C NOT executed (hard stop honored).**
The whole corpus was re-ingested through the fixed adapters after the A6 line-by-
line audit. **One BLOCKER for the owner: the full-corpus /ask retrieval accuracy
regressed on broad queries (A5 check 1 below) — a corpus-balance decision, not a
bug.** Everything else is green.

## ⚠ HEADLINE DECISION — the /ask exegetical pool regressed (read first)

The frozen v3 eval on the FULL re-ingested corpus:

| category | HIT@1 | HIT@2 | vs baseline HIT@2 |
|---|---|---|---|
| verse-ref (n=40) | 95 | 95 | 98 → **95** (held) |
| pericope (n=15) | 93 | 100 | 100 → **100** (held) |
| epistle (n=25) | 40 | 72 | 88 → **72** ↓ |
| topical (n=20) | 10 | 45 | 70 → **45** ↓↓ |
| proper-noun (n=10) | 70 | 80 | 90 → **80** ↓ |
| control (n=10) | clean 10/10, 0 hijacks | | ✓ |

**Precise queries held; broad/thematic queries regressed.** Root cause (diagnosed,
not guessed): the exegetical pool went from ~commentary-only to **297,059 rows,
~40% of them Spurgeon's 118k sermon chunks**, plus Maclaren/Owen/Edwards/fathers.
For a broad query ("loving one another") the pool fills with genuine, correctly-
anchored **sermons ON the theme** that anchor to *related-but-different* passages,
crowding out the single labeled passage. The content is clean — no bad anchors, no
duplicates, no pollution (verified by direct pool inspection). It is a **corpus-
balance tradeoff**, and per the standing rule ("never ship a pipeline below the
accuracy bar; any regression the tree can't self-fix → LOG for the owner") it is
**yours to decide.**

**Critical scoping — this only affects /ask, NOT the reader.** The eval measures the
teacher's ranked retrieval (`legalBasePool`→rerank). The **reader** (per-verse
commentary panel, static JSON) shows ALL published voices for a verse with no
ranking competition — it is *richer*, not worse, with the new works, and is
verified clean (below). So the reader can ship; the /ask pool is the open question.

Options (all reversible; none applied — your call):
- **(a) Ship the expanded pool as-is.** Broader voices; lower passage-precision on
  broad queries. Users get thematically-relevant Spurgeon/Maclaren instead of the
  one "textbook" passage.
- **(b) Reader = all works; /ask pool = commentary-only baseline.** Preserves the
  95/98·87/100·88·70·80/90 accuracy. Mechanically: keep the new work slugs in the
  reader allowlist (`PUBLISHED_WORKS`) but drop them from `LEGAL_CORPUS_FILTER` /
  `SERVED_PROSE_WORKS` (the /ask pool). One-constant change, fully reversible.
- **(c) Rebalance ranking** (per-work pool cap so Spurgeon can't dominate, or a
  sermon down-weight) and re-measure on a fresh held-out v4 — NOT tuned to this
  eval (held-out discipline). The real fix if you want both breadth AND precision.

My recommendation: **(b) for the immediate go-live** (ship the reader's richer
corpus + keep /ask accuracy), then **(c)** as the follow-up to earn the sermons
into /ask. But this is explicitly flagged for you, not decided.

## Green / red per phase

| Phase | State | Evidence |
|---|---|---|
| 0 — verifier fail-open | ✅ GREEN | dispatch default fails closed; 41 verifier + grounding tests green; both src/ & web/ copies byte-identical |
| 1 — schema (017/020/022) | ✅ GREEN | hymn/poetry/art + 'ingesting' in the CHECKs; embeddings write-policy user-scoped (022) — all applied idempotently on dev |
| 2 — register read path | ✅ GREEN | 018/019 applied; song/verse + FTS lockstep tests green; licensing recall 50/50 |
| A2 — adapters | ✅ GREEN | ccel/gutenberg/helloao/sword-bridge/sword-ld/bdb/archive; text-integrity fixes verified (Trent canons restored, K&D Ps147-150 restored, 0 fused rows) |
| A3 — ingest | ✅ GREEN | 34 works served (all re-ingested via fixed adapters), 5 reference works staged, origen staged; 297,059 register rows; fusion 0 · junk 0 · forbidden 0 · 0 stuck |
| A4 — static JSON + FTS | ✅ GREEN | FTS 191,749 rows (work/register columns); all 6 indexes valid |
| A5.1 — commentary accuracy | 🔴 **REGRESSED** | see the HEADLINE DECISION above — broad-query HIT@2 down; owner call |
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
| origen-commentary | staged, NOT served | standing MUST_NOT_SERVE 'Origen'. NOTE: Catena Aurea (served) carries Origen EXCERPTS attributed "as quoted by Aquinas" — your editorial call whether that's acceptable |
| whitefield-works | quarantined | PG 68976 is only vol 1/6 and mixes letters/sermons/tracts with no clean boundaries — needs a multi-volume segmentation profile |
| bramley-carols | quarantined | all 5 archive.org copies are engraved-music editions (27-31% OCR garbage), titles unrecoverable |
| donne-divine-poems, herrick-noble-numbers | quarantined | whole secular volumes (Grierson, Hesperides) under sacred titles — need section-scoped profiles |
| thayers-lexicon | quarantined | archive.org OCR: 0% Greek-script headwords, 6.2% strict-match — needs a structured TEI/Strong's source, not a better parser |
| isbe · easton · nave · smith · bdb | STAGED (never served) | decoded + ingested as reference. **Serving UX is your design call** — a reference pane vs blending into /ask (do NOT blend into the exegetical pool without deciding) |
| historians (schaff-history, edersheim, josephus-whiston) | staged, never served | write-contract path; no read path (by design) |
| herbert-temple / montgomery / rossetti | ✅ RECOVERED + served | archive.org Cassell 1887 / CCEL title-div fallback / PG title-line splitter |
| Herbert OCR warts | note | 1887 Cassell has scattered OCR errors in headings (NATUKE., COLOSSIANS hi. 3.) — accept or re-source |

## PART C — the deliberate prod cutover (YOUR eyes-open step; needs prod creds)

**Precondition:** every ⏳ above green; A5 both checks pass; A6 findings resolved/logged.

```bash
# 0. From a session WITH prod credentials (this one has none by design):
#    export DATABASE_URL=<prod owner unpooled>   # never committed, never echoed
#    export MIGRATE_ALLOW_PROD=1   # migration runners now dev-guard by default (A6);
#                                  # this flag is the deliberate prod override.
cd <repo>

# 1. Migrations in dependency order (all additive). NOTE the two 020s (duplicate
#    number — both idempotent; apply BOTH, order below):
node db/apply-migration.mjs           db/migrations/016_history_sections.sql
node db/apply-migration.mjs           db/migrations/017_source_type_registers.sql
node db/apply-migration.mjs           db/migrations/020_embeddings_source_type_registers.sql
node db/apply-migration.mjs           db/migrations/020_sources_status_ingesting.sql
node db/apply-migration.mjs           db/migrations/021_revoke_app_runtime_anchor_writes.sql
node db/apply-migration.mjs           db/migrations/022_embeddings_write_policy_user_scope.sql
# 018/019 build partial indexes. ⚠ On prod DO NOT use the dev drop-then-create
# (rebuild-register-indexes.ts / the committed 018/019) — that DROPs the live
# serving index first and opens the ef=40 starvation window (how migration 009
# died). Instead build the replacement under a NEW name FIRST, then drop the old:
#   CREATE INDEX CONCURRENTLY idx_embeddings_vector_legal_v2 ON … WHERE <predicate>;
#   DROP INDEX CONCURRENTLY idx_embeddings_vector_legal;   -- only after v2 is VALID
#   ALTER INDEX idx_embeddings_vector_legal_v2 RENAME TO idx_embeddings_vector_legal;
# (repeat for the song_verse HNSW twin + the FTS legal index). Zero-window.
# verify: role_table_grants → SELECT-only on the 3 anchor/embedding tables AND
#         embeddings write-policy WITH CHECK is user-scoped (no user_id IS NULL);
#         sources CHECK includes hymn/poetry/art + 'ingesting'; tsv expr includes heading.

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
requires a conscious owner action (the Neon promote, or a deliberate guard override in
the session you run with prod creds) — that friction is the design, not an oversight.
