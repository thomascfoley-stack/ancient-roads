# WORKLOG — Autonomous session 2026-07-08

## 2026-07-10 (design) — reference/pericope intent routing (awaiting approval)

Per the failure-code finding (gap is ranking on verse-ref queries, no-content=0%): wrote **docs/REFERENCE_ROUTING_DESIGN.md** — a general reference/pericope intent-routing mechanism (SOFT-BOOST candidate injection, not hard-filter, to preserve topical breadth). Covers intent detection (numeric ref-scan extending ref-parse + a named-pericope gazetteer), the soft-boost-vs-hard-filter choice + why, concordance-guarantee preservation (retrieval-only, verifier unchanged, no interpretation), and how ref-parse stays byte-identical (bible-sync guard — noting CLAUDE.md misnames it web-core-sync). Re-measure plan: frozen 88 on legal+full, report verse-ref HIT=1. **Design-only, no code until approved.**


## 2026-07-09 (Step 3 ownership) — sources/sections migration owner assigned

**This session owns the `sources`/`sections` ingestion migration (NEXT_PHASE §3 / ADR-010) as of 2026-07-09.** Other sessions must NOT write the migration schema or scripts — that would re-create the exact cross-session divergence the ownership gate exists to prevent (two parallel `sources`/`sections` designs + a diverged `source_id` scheme). Per the design-before-code rail, the only deliverable right now is one approval-ready design doc (`docs/MIGRATION_DESIGN.md`); **no schema/migration code until Thomas approves it.**

**APPROVED 2026-07-10** — Path A (re-point in place, preserve all 173,806 vectors, $0, coverage stays 0); Barnes' Notes first slice; fold schema corrections into SCHEMA.md; one `ingest/sources.config.json`. Building migration `006` + the Barnes slice only, then stop for review.

### KNOWN LIMITATION (tracked — do NOT let this drop off): the source_id collapse caps vector recall

The legacy `source_id` (`commentary:{slug}:{ch}:{vs}:{author}`, no `entry_index`) collapses **341,912 eligible `commentary_entries` → 168,233 keys**; only the first entry per key was ever embedded, so **~173,679 entries' distinct text is NOT in the vector index** (still keyword-searchable via FTS). Path A preserves the current corpus exactly and **carries this limitation forward unchanged** — it does not fix it, by design (fixing = new embeddings = cost + a reopened coverage gap). **This is a deferred corpus-EXPANSION decision, explicitly tied to eval-set growth:** we cannot yet tell whether the collapse actually caps accuracy, because the current 30-query eval is Gospel/reformed-heavy. **Revisit expansion once the larger, broader eval (NEXT_PHASE §4) can show whether the collapse limits true-success — decide with data, not speculation.** The section identity is surrogate + append-only (`MIGRATION_DESIGN.md` §4.1), so expansion later is a pure `INSERT` of new rows, never a re-migration.

**Compliance flag surfaced during the slice:** the existing corpus's `sourceUrl` is **biblehub.com** (an aggregator ADR-008 forbids scraping). The text is public domain so the license is valid and the migration is unaffected, but **re-sourcing from CrossWire/PD (INGESTION_TASK Phase 2) is required before wide/beta rollout.** Tracked in `MIGRATION_DESIGN.md` §8.6.

### Barnes first slice — BUILT + PROVEN GREEN (stopped before the other ~400)

Migration `006` (`sources`/`sections`/`section_anchors`/`section_embeddings`, additive, no RLS, `GRANT SELECT` to `app_runtime`) applied to Neon. Backfilled **Barnes' Notes** by re-pointing its existing vectors (Path A) — `db/apply-migration.mjs`, `ingest/sources.config.json` (Barnes: Public Domain + provenance), `src/ingest/migrate-sections-slice.ts` (SQL-only re-point; vectors never leave the DB), Gate A `--target=sections` mode added to `check-corpus-coverage.ts`.

Proven (verify, don't assume — ran it):
- **Re-point 1:1:1:** 1,300 Barnes embeddings → **1,300 sections = 1,300 section_anchors = 1,300 section_embeddings** (reused, `model_slug=bge-large-en-v1.5`). **$0 embedding cost.**
- **Gate A (sections) = 0 missing** (`pnpm check:coverage:sections`): 1 non-quarantined source, 1,300 sections, 1,300 embeddings, gap 0.
- **Gate B PASSED** (`pnpm check:licenses`): manifest valid (Barnes PD + provenance) AND the DB defence-in-depth check verified the now-**published** Barnes source (0 violations).
- **`npm run audit` green.**
- One bug found + fixed during the run: the backfill first put two SQL statements in one parameterized query (`CREATE TEMP … AS SELECT …; SELECT count…`) → pg "cannot insert multiple commands into a prepared statement"; split into two queries.

Legacy retrieval untouched (dual-read — the app still reads `embeddings`/`hybrid_search_v2`; nothing reads `sources`/`sections` yet). **STOPPED here per "prove deep before wide" — the retrieval bridge + the other ~400 sources are the next unit, on approval.** Next: build the section-based retrieval path, prove the true-success diagnostic ≥ current on it (dual-read), then scale the backfill to all 401 works (each needs its reviewed license-map entry in `ingest/sources.config.json` first — the compliance pause).

### Track 1a — Gate B now fails closed on forbidden-aggregator provenance (biblehub/studylight)

Extended Gate B (ADR-008 / CLAUDE.md aggregator rail): `license-manifest.ts` gains `FORBIDDEN_PROVENANCE_DOMAINS` + `forbiddenProvenanceDomain(url)` (host-parsed, matches domain + subdomains, not naive substrings), and `validateManifest` fails closed on a forbidden-domain provenance **unless** the entry sets a `quarantine` reason (declared + held, never published). `check-licenses.ts` DB check also flags any **published** source with forbidden provenance (defence in depth). +6 tests (19 total).

**The gate caught Barnes, as expected — that's it working.** First run flagged Barnes two ways: manifest (biblehub, not quarantined) AND the published DB row (`id=2`, biblehub). Remediated per instruction: **unpublished Barnes (DB `published → staged`)** and added a `quarantine` marker to its config entry (the manifest-level "held, re-source first"). Re-run → Gate B PASSES; Gate A (sections) still 0 (Barnes staged, still complete); `npm run audit` green (144 tests).

*Note on state:* DB status is `staged` (per instruction = "unpublish"); the config `quarantine` marker is what holds it at the registry level. For the wide rollout I'd recommend the backfill set forbidden-provenance sources to DB `status='quarantined'` for strict consistency — flagging for decision, not doing it unasked.

### Track 1b — re-sourcing plan (`docs/RESOURCING_PLAN.md`, approval-only)

Sized the footprint from Neon. **biblehub = 14 works but they are the mega-commentaries** (Barnes, Calvin, Wesley, Darby, Bengel, Poole, Pulpit, Cambridge, Geneva, Scofield, MacLaren, Lange, Benson, B.W. Johnson) — 176,553 eligible entries (~52% by raw entries) that **collapse to only 16,072 embeddings (~9%)**, so the re-embed *worst case* is ~$0.07. The footprint also surfaced provenance problems the forbidden-domain gate does NOT cover: **242 works with no recorded provenance** (78,716 entries), **CCEL** (17 works, ADR-008 restricted), and **historicalchristian.faith** (149 works, unvetted — the single biggest bucket). Plan defines the permitted source per work-type + the **text-match test**: normalized match → provenance-repair (keep vector, $0); differ → re-embed that section; no permitted source → quarantine. No code until approved.

### Track 2 — Parity (section model == legacy, proven)

**Baseline (current model, `embeddings`), re-run 2026-07-10:** vector **29/30 (97%)**, hybrid **29/30 (97%)**, full/reranked **30/30 (100%)** — matches the handoff (the one vector/hybrid miss is "the Word became flesh" → John 1, which only the reranker fixes; see ADR-014).

**Section model parity — PROVEN byte-faithful.** `src/ingest/parity-probe-sections.ts`: for 6 probe queries, rank Barnes' vectors two ways — legacy (`embeddings`, author-scoped) and new (`section_embeddings`, source-scoped) — with **exact NN (HNSW disabled)**. All 6: **identical ordered verse ids.** The re-point preserved the vectors and anchors exactly. (Had to disable HNSW: an author-filtered query over the full HNSW index returns empty because HNSW pre-filters before the predicate — an artifact of scoping, not the data.)

**Why this settles parity without a corpus-wide re-run:** the true-success diagnostic scores only on the retrieved passages' `verseId`, which is a pure function of the vectors + anchors. The migration re-points *identical* vectors and *identical* anchors (`section.body := embeddings.content`, so `sections.tsv` == the BM25 text and the reranker input is identical too). So the section-model 30-query number **equals** the legacy number **by construction** (97/97/100) — it is `≥ current`, in fact equal. **The literal corpus-wide 30-query number on the section model requires all 173,806 vectors re-pointed** = the gated scale-up (needs the reviewed license map per work). It is NOT run here — that would be "scaling to the other sources," which is held pending approval + Track-1 provenance clearance.

**STOP — showing all three (extended Gate B w/ Barnes flagged, re-sourcing plan, parity). No cutover, no scaling.** Next on approval: `hybrid_search_sections` (the dual-read retrieval fn) + the corpus-wide diagnostic, run as part of the (Track-1-cleared) scale-up.

### Approved 2026-07-10: full cleanup + by-construction parity; vetting reshaped the plan

Owner approved **full provenance cleanup before any publish** (not biblehub-only) and **by-construction parity** (no harness). Vetted the unknowns first (`RESOURCING_PLAN.md` §7):
- **SWORD/CrossWire tooling is NOT installed** (`diatheke`/`installmgr`/`pysword` absent) → re-sourcing pivots to **HTTP from archive.org/Wikisource/Schaff**, not CrossWire modules. Design decision — surfaced before building.
- **The 242 no-provenance works = 4 huge PD commentaries** (Gill 28k, JFB 17k, Clarke 13k, Matthew Henry 4k = 62,708 entries) **+ 235 patristic** works. The commentaries are clearly PD (provenance-backfill); the patristic ones have an unconfirmed *translation* edition (edition trap).
- **historicalchristian.faith (149 works) is unvetted** — "open source, crowd-sourced," no license grant, no edition attribution, lists non-PD authors (C.S. Lewis) → treat as an aggregator; recommend forbidding it + re-sourcing the fathers from Schaff.
- **Real shape:** PD-commentary provenance-backfill is easy (~18 works, mostly $0 text-match repair); the **patristic edition-verification (~384 works) is the hard bulk.**

**Checkpoint before building** (design-before-code, since SWORD-unavailable changed the approach): open decisions in `RESOURCING_PLAN.md` §7 — tooling (HTTP vs libsword), forbid historicalchristian.faith?, Schaff-as-canonical-father-source?, first unit = match/repair engine on Barnes?

### Decisions + text-match engine proven (2026-07-10)

Owner: **HTTP-first** tooling; **forbid historicalchristian.faith** (added to `FORBIDDEN_PROVENANCE_DOMAINS`, +test) + **Schaff canonical** for fathers. Then found the clean source and proved the match engine:
- **`bible.helloao.org` cleanly carries Gill/JFB/Clarke/Matthew Henry** (the 62,708-entry no-provenance bucket), all Public Domain (CC PD Mark 1.0), structured per-chapter, explicit license. Not the biblehub-14.
- **Text-match probe (`resource-match-probe.ts`) on Adam Clarke vs helloao, 227-verse sample:** **100% $0 provenance-repair** (150 exact-match + 77 truncation-only, caught by a containment metric), **0% genuine re-embed**, 0 unaligned. The initial 34% "differ" was purely our copy being truncated — same PD text. **So the whole 62,708-entry commentary bucket should re-source at $0.**

**Next unit:** the provenance-repair pipeline — per-work full match verification → write config entries with helloao PD provenance for the 4 works (clean, ready for scale-up). No publish until the full cleanup (biblehub-14 + patristic Schaff) clears.

### Unit 1 DONE — helloao commentaries provenance-repaired ($0), + patristic probe

**helloao repair (`resource-repair-helloao.ts` + shared `helloao-source.ts`) — FULL per-work verification (all books):**

| Work | verses | $0 repair | genuine-differ | truncated |
|---|---:|---|---:|---:|
| John Gill | 28,279 | 100% | 0 | 12,487 |
| JFB | 15,267 | 100% | 0 | 1,174 |
| Adam Clarke | 12,571 | 99.99% | 1 | 2,274 |
| Matthew Henry | 4,124 | 99.95% | 2 | 3,624 |

**~60,241 verses, ~99.99% $0 provenance-repair, 3 genuine-differ total.** The entire 62,708-entry no-provenance-commentary bucket is confirmed the same PD text as helloao. Wrote 4 clean config entries (`ingest/sources.config.json`, now 5 with Barnes) with helloao PD provenance + a **forward-compatible `rebuild` recipe** per work (commentary_id + verse-endpoint pattern + `book_id_map` ref) so a future full-text rebuild is a clean re-fetch. **Gate B green (5 sources), `npm run audit` green.** Kept existing (truncated) text + vectors — **$0, no re-embed/rebuild** (that's the eval-gated later phase). Not migrated/published (waits for scale-up after full cleanup).

**TRACKED QUALITY-LIMITATION (2) — truncation** (alongside the source_id-collapse, [[known-limitation]]): our stored section body is truncated for long comments (Matthew Henry 88% truncated, Gill 44%), clustered in the long/high-value expositions. Vectors are over the truncated text (kept as-is for the $0 compliance clear). A future full-text rebuild — **gated on the eval, not now** — re-fetches untruncated text via each source's `provenance.rebuild` recipe. **Matthew Henry (88% truncated) is FIRST-IN-LINE for that rebuild phase.** Revisit with the collapse when the broader eval can measure whether truncation caps answer quality.

**Patristic probe (the biggest unknown) — result: MIXED, a real drop bucket exists.** No structured Schaff API to align ~62k verse-keyed father snippets, so verified by anchor points + author/edition classification (`historicalchristian.faith` = the 149 patristic works):
- **PD-repairable (ANF/NPNF/Catena-Newman):** Chrysostom (verified: his Galatians homily is verbatim the NPNF text on New Advent), Augustine, Tertullian, Origen, Cyril, Clement, Cyprian, Irenaeus + the heavy "*as quoted by Aquinas*" entries = *Catena Aurea* (Newman 1841 PD). ≈ roughly half the volume.
- **DROP-risk (modern copyrighted translations only):** **Theophylact of Ohrid (6,470)**, **Bonaventure (4,185)**, **Oecumenius (1,753)**, Jerome's prophet commentaries (verified: no PD translation exists — only modern). ≈ 20–30% by volume.
- **Needs per-work edition check:** Aquinas's own commentaries (7,274 — Catena PD vs his modern-translated lectures), Bede, Gregory the Great, Ambrose.
- **Verdict:** the patristic bucket is NOT blanket-repairable to Schaff (a meaningful slice is modern-only → **drop**) and NOT all-drop (the ANF/NPNF core + Catena is PD). A precise repair/drop rate needs per-work edition classification (the fetcher build). **Recommend: build the patristic re-source as edition-classify → repair-to-Schaff-if-PD → drop-if-modern-only, and expect to DROP Theophylact/Oecumenius/Bonaventure/Jerome-prophets (~12–18k entries).** *(When we get there: repairable must be PROVEN per-work by text-match vs actual Schaff/NPNF text — New Advent/CCEL/archive — not assumed from author name, same rigor as helloao. Drops → `status=quarantined`, held/reversible, never published.)*

### biblehub-14 — reusable module built; blocked on a clean HTTP source (`RESOURCING_PLAN` §9)

**Reusable re-source module DONE + proven.** `resource-textmatch.ts` = source-agnostic core (matcher + `SourceAdapter` contract), unit-tested (`test/resource-textmatch.test.ts`, 5). Refactored helloao onto it (`helloao-source.ts#helloaoAdapter` + the generic `tallyMatch`) — **re-ran, byte-identical config** (Gill/JFB 100%, Clarke 99.99%, MH 99.95%). The same matcher will drive the patristic phase — only a new adapter (NewAdvent/Schaff) is needed.

**But the biblehub-14 have NO clean HTTP per-verse source** (unlike helloao): not on helloao/any JSON API; not structured on Wikisource; archive.org is OCR-scans only (brittle). **CrossWire SWORD cleanly has Barnes/Calvin/Wesley/Scofield/Darby (explicit licenses) but needs `libsword`** (deferred by decision-1's HTTP-first). Poole/Bengel/Pulpit/Cambridge/Geneva/MacLaren/Lange/Benson/B.W. Johnson aren't even on CrossWire. All 14 are PD text (only issue = biblehub ToS/provenance, mitigated by not publishing).

**Decision needed (reopens tooling for this bucket):** (a) install `libsword` → clean-source the ~5 CrossWire works via the same matcher; (b) archive-OCR parsers (brittle); (c) **hold the 14 quarantined** (PD, not served, reversible) — *recommended interim* (they're already excluded: only Barnes is in the config/quarantined, the other 13 aren't migrated, Gate B fails-closed on biblehub). **Recommend (c) now + (a) alongside the patristic NewAdvent build.** Hold list in `RESOURCING_PLAN` §9.

### biblehub-14 → HOLD (decided); patristic NewAdvent adapter built + sample proven (2026-07-10)

**biblehub-14 → HOLD all 14 quarantined** (owner picked c): PD text, unpublished, reversible, zero compliance risk. NOT OCR. Follow-up: libsword adapter for the CrossWire-5 during/after patristic; the other 9 are low-priority backlog (revisit if a PD source surfaces; no OCR, no blocking).

**Patristic phase — NewAdvent/Schaff adapter (`newadvent-source.ts`) built on the reusable matcher; per-work text-match proven vs REAL NPNF/ANF text.** First attempt with word-set containment gave 100% everywhere but the **control caught it** (75/123 Chrysostom snippets falsely "repaired" against Augustine's text — patristic English shares too much vocabulary). Fixed by adding **shingle (4-gram) containment** to `resource-textmatch.ts` (same translation shares long exact phrases; different translation shares only words) → control dropped to **0/123**. Results (New Advent, real Schaff/ANF):
- **Chrysostom, Homilies on Galatians (NPNF1-13): 99.2% $0-repair** ✅
- **Augustine, Homilies on 1 John (NPNF1-07): 88.5% $0-repair** ✅ (10 per-snippet drops)
- **Origen, Commentary on John (ANF9): 1.6% → DROP** ❌ — our catena "Origen on John" is a **different/modern translation**, NOT the ANF text (only 2/128 match), despite Origen having a PD ANF edition.

**Key finding (validates the required rigor): per-work text-match is essential; author-name is NOT enough.** Origen-by-name looked repairable (ANF exists) but the text-match proves our text isn't it → DROP. $0-repair holds where the text IS the PD edition (Chrysostom, Augustine), not otherwise. Drops → `status=quarantined`, held/reversible, never published. +2 unit tests for the shingle matcher (7 total in `resource-textmatch`).

### Patristic classify RUN — whole-corpus crawl CONTAMINATED, did NOT report a false number (2026-07-10)

Scaled the classify as a read-only pass with the three conditions: (1) **provenance fixed** to cite the PD ANF/NPNF edition, not newadvent.org (New Advent = `verify_via` only); (2) verification source = New Advent (**robots.txt permits `/fathers/`**), rate-limited + page-cached + resumable (`newadvent-crawl.ts`) so we don't become an aggregator; (3) classify across all works, write nothing. Added corpus-scale shingle-HASH matching (`shingleHashSet`/`addShingleHashes`, FNV-1a) for memory.

**Raw output was 12.6% repairable / 82.1% quarantine (1,387 works, 62,444 entries) — but it is CONTAMINATED and I did not report it as true.** Proof: Chrysostom-on-Acts classified at 1% while Chrysostom-on-Galatians was verified at 99% — the crawl (BFS from `/fathers/`) reached only 2,004 of ~5,000 pages, unevenly (Augustine 139 content pages, Tertullian 18, **Chrysostom 0** — only index pages), and New Advent doesn't host the Catena Aurea (Aquinas ~15k). So the quarantine bucket is full of **false quarantines** (PD text that wasn't crawled). **12.6% is a floor; 82% is inflated.** Reliable signal: the crawled ANF/NPNF core (Augustine 85–94%, Tertullian 77–95%, Clement, Cyprian) genuinely repairs. **Next: a complete multi-source PD corpus (full New Advent + Catena-Newman + Gutenberg/archive) or per-work targeting, then re-run.** Detail in `RESOURCING_PLAN` §11.

### Patristic TOP-N TARGETED classify — the reliable entry-weighted number (2026-07-10)

Per owner: dropped the whole-corpus crawl; scaled the **targeted per-work fetch** (`resource-classify-topn.ts`) — each work fetched from its OWN New Advent index → content links → shingle-match (rate-limited, cached, **read-only, wrote nothing**). Bug found + fixed: content-page ids vary in length (Chrysostom 5–6 digit, Augustine **7-digit** `1701001`) — widened the regex; Augustine then verified 78–90% (was falsely 0). **Corpus is a long tail — top 20 works = only 30.5% of 62,444 entries** (not the ~85% assumed).

**ENTRY-WEIGHTED DISTRIBUTION (62,444 patristic entries):** repairable **8.4%** (5,219 — Chrysostom Acts/John/Matt 98–99%, Augustine Ps/John 78–90%); drop (modern-only) **16.1%** (10,054); needs-review (PD exists, source not wired: Catena-Newman, Gregory-Oxford, Cyril-Pusey) **6.1%** (3,786); **quarantine-by-default (unmeasured tail, ~1,367 tiny works) 69.5%** (43,385). **The true repair rate is far below the ~50% author estimate, as predicted** — verified 8.4%, ~15% even counting likely needs-review. Tail = later expansion phase (owner). Corpus-shape tally in `RESOURCING_PLAN` §12.

### Legal-corpus ACCURACY measured (read-only) — decides launch + wiring (2026-07-10)

Per owner: stopped patristic recovery; measured what the legal (verified-repairable) corpus delivers. Publishable = helloao 4 + patristic-repairable 5 = **66,801 embeddings (38.4%)**; filtered retrieval to those source_ids, ran the 30-query eval baseline-vs-legal (`eval-legal-corpus.mts`, read-only). **Baseline reproduced exactly (full 100%, vector 97%)** → harness valid.

**Legal corpus: true-success (HIT=1) 93% (28/30); ≥2-voices (HIT=2) 87% (26/30); vs 100% baseline.** The loss is NOT in diversity/patristic queries (topical + rare-topic + proper-noun all held 100%) — it's in **verse-ref** (8/8→5/8) + one exact-term. HIT=1 vs HIT=2 splits the 4 losses: **2 genuine misses** (1 Cor 13, propitiation) + **2 diversity gaps** (Isaiah 53, Sermon on the Mount — right passage retrieved, <2 voices). Detail in `RESOURCING_PLAN` §13.

### Failure-code eval (88-query) — the gap is RANKING, not content; libsword/CrossWire-5 has ZERO ROI (2026-07-10)

Per owner: before wiring, diagnosed the 2 misses + built an 88-query failure-code eval (`eval-failure-codes.mts` + `diagnose-legal-misses.mts`, read-only). **Diagnosis:** 1 Cor 13 → legal set HAS 400+ 1 Cor commentaries but reranker returns John 15 "greater love" (ranking drift, not content); propitiation → baseline hit came from excluded patristic voices. Neither is anchoring.

**88-query legal result: HIT=1 64% (56/88), HIT=2 84% (74/88).** Failure codes: pass 84%, **<2-voices 10%**, **wrong-passage 6%**, **no-content 0%.** **The zero is decisive — the legal corpus is NEVER missing the passage, so CrossWire-5/libsword has ZERO measured ROI.** All 14 failures are ranking drift (content exists; reranker doesn't concentrate ≥2 in-range voices), clustered in **verse-ref** queries (query names the reference, retrieval drifts) — **systemic, not rare** (exactly the missing-feature hypothesis). The full-corpus 100% was propped by voice volume masking the drift. **ROI-ranked: (1) verse-ref intent routing — highest leverage, no corpus/install, fixes wrong-passage + most <2-voices; (2) Catena Aurea (Gospels, no install) for Gospel <2-voices; (3) libsword/CrossWire-5 — DO NOT BUILD.** Nothing wired. Detail in `RESOURCING_PLAN` §14.

## 2026-07-09 (next phase) — Step 1 backup + Step 2 gates (coverage + license)

Executing `docs/NEXT_PHASE.md` Steps 1–2. Stopping at the Step 3 boundary (the
`sources`/`sections` ingestion migration) per the design-before-code rail — it
has an unresolved cross-session owner and needs one approved design doc first.

**Deploy — DONE, beta gate verified live (Step 1 completion).** GitHub + Vercel
access became available mid-session, so this got finished from here rather than
handed off. Two things happened first: (a) git history was rewritten to the
owner's personal identity — every commit had been authored `thomas@composio.dev`
from a Composio-configured clone; force-pushed a rewrite mapping author+committer
→ `thomascfoley@gmail.com` (content byte-identical, only metadata changed). **Any
other clone must `git reset --hard origin/main`.** (b) The old dependabot branches
that anchored the pre-rewrite commits were deleted; dependabot will regenerate
them against the clean history. Deployed HEAD = **`cd897b4`**.
- **`SITE_PASSWORD` set in Vercel Production** (Sensitive; value never printed or
  written to disk). Caught that prod was running **public** — the var was unset,
  and the gate fails *open* when unset (`web/src/middleware.ts:16`), so the wall
  and `/api/ask` were exposed with no rate limit. Setting the var + redeploying
  closed it (an env var is inert until a new deployment).
- **Deployed:** `./deploy.sh` → local `next build` (Build Completed 56s) →
  `vercel --prod` as `thomascfoley-7284` → `dpl_DSUdSsb6eDjoao4z9a6GBB9QK3ju`
  **READY**, production. `npm run audit` green pre-deploy.
- **Gate verification (the real test), on the beta URL `https://web-psi-eight-83.vercel.app`:**
  unauth `POST /api/ask` → **401** (matcher covers it — NOT an open 200);
  `GET /` → **307 → /gate?next=%2F**; `GET /ask` → **307 → /gate**;
  `GET /gate` → **200**. The 307→/gate only happens when `SITE_PASSWORD` is set,
  so this *proves the deploy picked up the var*. The other prod aliases
  (`web-home-network-hardening…`, immutable `web-5k7a47sbg…`) return
  `302 → vercel.com/sso-api` (Vercel platform deployment-protection SSO) — also
  not open. **No prod URL serves an unauthenticated 200.**
- Logged two pre-signup follow-ups in ROADMAP (docs-only, NOT implemented):
  gate must **fail closed** when `SITE_PASSWORD` is unset (top security fix);
  rate-limit `/api/ask` (the gate reduces but does not remove the need).

**Finding — HEAD was lint-red, not deploy-ready.** The handoff said `cbe9ea7`
was ready to push + deploy, but `eslint src test` failed with 2 errors on
committed, unmodified files: an unused `rate`/`processed` pair in
`embed-full-corpus.ts` (dead ETA calc — the log uses `elapsed/offset` instead)
and an unused `quote` param in `normalize-contract.test.ts`. `npm run audit`
would have failed. Removed the dead lines; renamed the param to `_quote` (the
config allows `^_`-prefixed unused args). eslint + tsc now clean. This is why
the rail is "verify, don't assume — a green check is not proof": the gate has to
be *run*, not trusted.

**Step 1 (deploy + back up) — the push and the deploy are yours.** This agent
environment has no git credentials (`git ls-remote` → "could not read Username
for https://github.com") and no Vercel auth, and `deploy.sh` runs
`npx vercel --prod`. Per the rail the push must precede the deploy so the live
site never runs ahead of backed-up history — and I can't push. So I committed
everything (tree is clean, nothing at risk), and the push + deploy are flagged
as owner actions below.

**ADR-014 — reranker is core, recorded.** The reranker-is-core finding (full
pipeline 100% vs vector/hybrid 97%) is now an ADR. Checked the current highest
number first (ADR-013, from the parallel session's 010–013) to avoid a
collision — so this is **ADR-014**. It formalizes what ADR-007 only suspected,
now backed by the 30-query eval, and carries the honesty caveat that "100%" is
scoped to the Gospel/reformed-heavy eval and must be re-earned as the corpus
grows.

**Gate A — coverage (completeness, fail LOUD).** Anti-join of eligible
`commentary_entries` (body ≥ 100) against embedded commentary `source_id`s;
`missing > 0` prints per-author counts and exits 1. `pnpm check:coverage`.
Closed the integrity hole in the prior session's version: `source-id.ts` is
*named* the single source of truth for the key format, but the embed job
(`embed-full-corpus.ts`) still carried its own inline `BOOK_SLUGS` +
`MIN_BODY_LENGTH` + key string — byte-identical by luck, free to drift. If they
drifted, the gate would compare against keys the embed job never wrote and
report phantom gaps (or hide real ones). Refactored the embed job to import
`synthesizeSourceId` + `MIN_BODY_LENGTH` from `source-id.ts`, so the writer and
the checker now compute keys in one place. **Ran it against Neon: gap = 0**
(168,233 eligible source_ids, all embedded — confirms the 10/10 corpus claim is
backed by a completeness check, not just asserted). Left `check:coverage` out of
the always-run `audit` because it hard-requires `DATABASE_URL`; it belongs to
the ingest/publish path (`check:data`), run where the DB is present.

**Gate B — license (legal, fail CLOSED).** `license-manifest.ts` is the pure
validator (allowed set = Public Domain | CC BY | CC BY-SA; every source needs
provenance url + edition + year — the edition-trap guard); `check-licenses.ts`
is the runnable gate around it, plus a defence-in-depth DB check (zero
`published` sources with a disallowed/null license) that stays inert until the
`sources` table exists. Added `test/license-manifest.test.ts` (13 cases pinning
the fail-closed behaviour, incl. the edition trap and reporting *all* violations
not just the first). `pnpm check:licenses` + `pnpm check:data`. Unlike Gate A,
Gate B is CI-safe (no DB required), so it's wired into `npm run audit` as a
real gate — license is the legally-irreversible axis and must never be
skippable. Ran the **full `npm run audit`: all gates green** (Gate B passes
vacuously today — no manifest yet, no `sources` table — which is correct: the
manifest is populated in Step 3's ingestion, and the gate fails closed the
moment a source without an allowed license is declared).

**Boundary — stopping before Step 3.** Both upfront gates are built, tested, and
green. Next is Step 3 (the `sources`/`sections` ingestion migration, ADR-010),
which per NEXT_PHASE §3 has an unresolved cross-session owner and needs one
approved design doc before code (design-before-code rail). **Not started** —
handed back for owner/design reconciliation. See "Needs Thomas" below.

### Needs Thomas (this session)

1. **Push is done; the state is backed up.** GitHub got connected mid-session, so
   I pushed `main` myself — `origin/main` now has the lint fix, ADR-014, and both
   gates. Nothing is uncommitted or unpushed.
2. ~~**Deploy is still yours.**~~ **DONE** — deployed to prod from here
   (`dpl_DSUdSsb6eDjoao4z9a6GBB9QK3ju`, READY) with the beta gate ON and
   verified live (see the Deploy entry above). Beta URL:
   `https://web-psi-eight-83.vercel.app`.
3. **Step 3 owner + design doc.** Decide who owns the `sources`/`sections`
   migration and land the approved design doc before anyone writes the migration,
   so the two sessions don't design the same schema in parallel and diverge the
   `source_id` scheme.

Getting the full-corpus embed to run fast AND survive to completion took several
iterations. Captured here so the next batch job (and the planned `batch-runner.ts`
extraction) starts from the lessons, not a blank page.

**Bug 1 — reranker 404.** BGE-reranker-v2-m3 isn't on DeepInfra. Switched to
`Qwen/Qwen3-Reranker-0.6B` (`/v1/inference` endpoint, `queries`/`documents` → `scores`).
Verified precision: "good shepherd" scores John-10 at 0.995 vs Luke-2 nativity 0.071.

**Bug 2 — sequential embed calls.** Original job embedded one 64-text batch at a time.
Added a bounded worker pool (`EMBED_CONCURRENCY`). Isolated test confirmed DeepInfra
serves 7 concurrent embed calls in ~the time of one — the API was never the bottleneck.

**Bug 3 — single shared `pg.Client` serialized all "concurrent" writes.** The workers
overlapped their API calls but queued every INSERT on one TCP connection ("client already
executing a query" warning). Switched to a `pg.Pool`.

**Bug 4 — 183 direct connections drowned Neon's auth handshake.** Bumping concurrency to
180 with `max: 183` on the *direct* (unpooled) endpoint produced "Authentication timed
out" / "socket disconnected" storms. Per Neon's guidance: **decouple API concurrency from
DB connections** — use the **`-pooler` (PgBouncer) endpoint** + `connect_timeout=15` with
a **small** pool (`max: 20`) that PgBouncer multiplexes. 180-way embed concurrency now
rides over 20 real connections. Connection errors → 0.

**Bug 5 — job died on total network/DNS outage.** Twice the machine briefly lost
connectivity (`fetch failed` + `getaddrinfo ENOTFOUND`); the outer page-fetch query
exhausted its ~30s retry budget and threw, killing the run. Hardened `dbQuery` to retry
ANY error for ~10 min (30 attempts, backoff capped at 30s) and wrapped the worker INSERT
so an exhausted write skips-and-continues (next run's pre-skip fills it) instead of
crashing. The job is now idempotent AND outage-resilient.

**Note on counts:** `commentary_entries` has 371k rows but this script's `source_id`
(`commentary:{slug}:{ch}:{vs}-{ve}:{author}`, no `entry_index`) collapses multi-paragraph
entries — so ~half pre-skip as same-source_id dupes. True unique-embedding target ≈ 170k,
not 342k. Fine for retrieval (one vector per verse+author is what we want).

Restart is always safe: pre-skip + `ON CONFLICT DO NOTHING` resume from wherever the last
run stopped. Extraction of this proven pattern into `src/ingest/batch-runner.ts` logged in
ROADMAP (do it AFTER the 10/10 accuracy gate, from working code).

**Bug 6 — coverage loss from wholesale batch-poisoning (the big one).** Diagnosed with a
new read-only harness `src/ingest/measure-embedding-gap.ts` (anti-join vs the REAL schema:
`commentary_entries` → synthesized `source_id` → `embeddings`; note the true target is
**168,233 unique source_ids**, not 371k, because the `source_id` omits `entry_index` and
collapses multi-paragraph entries). Found a **47,139-row gap (28%)**. Root cause confirmed
by code AND a real-BGE-tokenizer probe (embed each missing text as a singleton via the API):
- Uniform sample: **0/400 oversized** → the gap is almost entirely COLLATERAL.
- Densest-tail (Greek/Hebrew/HTML-entity) sample: **12/500 (2.4%) oversized** → genuine
  culprits exist but number only in the **low hundreds**, all dense-script.
Mechanism: BGE's batch API fails WHOLESALE when any one text >512 tokens (it counts
`[CLS]`+`[SEP]`, so ~511 content tokens = the "513 input tokens" error), dropping ~63
innocent batchmates. Re-runs regrouped and recovered some (why the count crept 83k→121k
across restarts) but the dense culprits kept re-poisoning their new batches → never closed.

**Fix (owner chose adaptive truncation over chunking).** Chunking was the wrong tool here:
retrieval indexes chunks positionally and does NOT dedup by `source_id`, so multi-chunk
rows would surface the same author+verse as duplicate "voices" and skew the ≥2-tradition
gate — a real retrieval change for a ~few-hundred-row problem, when we already head-truncate
all 168k entries. Instead: **de-poison** (batch fail → re-embed each text individually) +
**adaptive truncation** (a text that still 400s is shortened 1000→600→400→250 chars until
it embeds — never dropped). One vector per source_id, zero retrieval changes.

**Result — full coverage, verified.** Backfill (only the missing ids; `ON CONFLICT DO
NOTHING` never overwrites) ran clean in **13.2 min: 47,139 embedded, 0 errors, 0 dropped**
(adaptive truncation recovered even the dense culprits). Re-ran the gap harness:
**MISSING = 0.** 168,392 distinct commentary source_ids now embedded (173,806 total rows).

**Pushed back on the task spec where it didn't fit our stack:** (1) embedding is a LOCAL
batch job, not a Vercel function — no serverless logs to cross-check; (2) no `source_texts`
table — it's `commentary_entries` + synthesized `source_id`, and I query Neon directly
(ground truth), no dashboard/OAuth needed; (3) truncation was already ON (1000 chars) — the
bug was char-truncation ≠ token-limit, not "truncation disabled."

## 2026-07-09 — ACCURACY DIAGNOSTIC: 4/10 → 9/10 (full corpus + hybrid + reranker)

With the full corpus embedded (173,806 rows / 168k unique source_ids), re-ran the 10-query
true-success diagnostic (`web/src/scripts/diagnose-pipeline.mts`, `MODE=full` = hybrid_search
+ Qwen3-Reranker-0.6B).

**Result — mode=full: 9 composed / 1 fallback; true success 9/10** (baseline was 4/10).

- **Retrieval accuracy is effectively 10/10:** every query — including the previously
  ZERO-coverage OT/topical ones (Psalm 23, Genesis 1, Paul's thorn, Sermon on the Mount,
  predestination, eucharist) — now retrieves genuinely on-topic sources across multiple
  traditions. The old "good shepherd → Luke 2 nativity" class of bug is gone; reranker
  scores the right sources 0.97–0.99.
- **The lone miss (Psalm 23) is a COMPOSE/VERIFY failure, not retrieval.** Its 6 sources are
  all correct Psalm 23 commentary (Darby, Tyndale, Matthew Poole, MacLaren, Augustine), 5
  traditions — but the composed answer was rejected by the V1 verifier on both attempts and
  fell closed to fallback (11.2s). That's the faithfulness gate doing its job, a different
  axis from retrieval accuracy. Worth a separate look (transient temp-0.3 variance vs. a
  systematic verbatim-quote issue with the Psalm 23 source formatting).

Verifier gate intact throughout — no unverified text emitted.

**Lever-by-lever + a CORRECTION.** Ran vector-only / hybrid / full on the same full corpus:
vector 9/10, hybrid 7/10, full 9/10. My first read — "hybrid actively hurts retrieval via
OR-flooding" — was WRONG, and checking the flags proved it: **0 wrong-source flags in any
mode.** Every query in every mode retrieves topically-correct sources. The fallback is a
DIFFERENT query each run (John 1 in vector; vine/Genesis/John 1 in hybrid; Psalm 23 in full),
and isolating Psalm 23 verifies it 3/3. So the 9/7/9 spread is **compose/verify VARIANCE, not
retrieval** — temp-0.3 compose + strict V1 verifier + only 1 retry means ~10–30% of composes
fail the gate and occasionally both attempts miss → fallback.

**Accurate conclusions:**
- **Retrieval accuracy = 10/10 in all three modes.** The corpus fix solved retrieval outright.
- **The 10-query set can't discriminate vector vs hybrid vs full** (all 10/10 on sources) —
  confirms the owner's "expand the eval set before deciding hybrid's fate" call.
- **New limiting factor for END-TO-END 10/10 is compose/verify reliability**, a faithfulness-
  axis issue (temp / retry budget / prompt / normalize), NOT retrieval. `MAX_RETRIES` was cut
  2→1 for latency; the reliability/latency trade may be worth revisiting for the gate.

Next: (1) expand the eval query set (harder: exact-term, proper-noun, verse-ref, rare-topic)
to decide hybrid/reranker on data; (2) instrument which V1 checks fail most across many
composes to fix the compose/verify miss rate toward a reliable 10/10.

**Psalm 23 root cause (investigated) — verbatim-quote drift on long-prose sources.** The
lone consistent full-mode fallback traces to ONE check: `quote_verbatim` on section 5
(Alexander MacLaren). Confirmed by isolating it: the model's MacLaren quote matches verbatim
for ~123 chars then drifts into paraphrase ("…sings this little" ✓ → then a smoothed
continuation ✗). MacLaren is 5000 chars of flowing prose; the model copies the opening
faithfully then rewrites the tail. **The verifier is correctly failing closed — not a bug,
not retrieval, not whitespace.** `normalize.ts` already handles whitespace/punct/case/NFKD.
Vector mode passes Psalm 23 only because it surfaces *structured* sources (Tyndale/Darby)
that are trivial to quote exactly; the reranker surfaces MacLaren (more topical, but prose)
→ the model quotes it less cleanly. So **better retrieval can surface harder-to-quote
sources** — the fix is compose-side, NOT avoiding good sources or weakening the verifier.

Fix levers toward reliable end-to-end 10/10 (all faithfulness-axis, verifier stays intact):
- **Quick:** `MAX_RETRIES` 1→2 (retry carries violation feedback; a 2nd pass often repairs
  verbatim drift). Was cut 2→1 for latency; compose is ~5s so 3-attempt worst case ~15s.
- **Durable (aligns with "select, don't regenerate"):** extractive quote-repair in
  normalize — snap a near-verbatim quote to the longest exact span in the cited section
  before verifying. Robust against drift; must stay fail-closed (only snap true near-matches).
- **Prompt:** instruct shorter quotes (short exact spans drift less than long ones).

## 2026-07-09 — Compose/verify hardening: entity decode + retry + snap-to-source

Implemented the fix set (owner-directed ordering). Verifier semantics NOT loosened.

**Root-cause split (measured, not assumed):**
- Diffed the real failing MacLaren quote through the REAL `normalizeForMatch`: verbatim for
  177 chars, then the model stitches a NON-ADJACENT sentence → **Case B, genuine drift**, not
  an entity/whitespace bug. `normalizeForMatch` already folds whitespace/punct/case/NFKD.
- BUT entities DO break matching corpus-wide (independently verified): a source `&#8217;`
  normalized to the digits `8217` and never matched the model's real `’`. Prevalence
  measured (`measure-embedding-gap`-style scan): **595 quote-breaking entries / 0.34% / 8
  works** (mostly Greek/Hebrew as numeric hex entities in Pulpit Commentary, Barnes'). NOT
  "~all the gap" — the diagnostic's failures are drift, not entities.

**Implemented:**
1. **Entity decode in `normalizeForMatch`** (both sync-guarded copies, byte-identical, guard
   green). Numeric + a pragmatic named map; unknown names fall through unchanged (can only
   fix a match, never invent one). `test/normalize.test.ts` (12) incl. "still rejects genuine
   drift." Exact decoding (`&#8217;` IS `’`), not fuzzy — `normalizeForMatch` NOT loosened.
2. **Ingest decode** (`src/ingest/content-sanity.ts`, reuses the ONE decoder) wired into
   `embed-full-corpus` so future content stores clean. No large backfill (595 rows; verifier
   already fixed at match time — backfill would be display/embedding polish only).
3. **Integrity-gate detector** `hasQuoteBreakingEntities` + `test/content-sanity.test.ts` (7)
   in `npm run audit`.
4. **`MAX_RETRIES` 1→2** (web teach + diagnostic).
5. **Snap-to-source** in `normalize-contract.ts` (web-only, not synced): trims a drifted
   quote to its longest verbatim PREFIX (of the model's OWN text — never invents/lengthens),
   fires only at ≥0.4 ratio AND ≥40 chars, and the verifier RE-CHECKS after — so it can only
   shorten to real source text, never manufacture a pass. `test/normalize-contract.test.ts`
   +5 snap tests incl. "does NOT repair a mostly-fabricated quote." 64 tests total pass;
   web+src typecheck + knip clean.

**Measured before/after (honest — did NOT claim it closed the gap):**
- Retrieval: **10/10 every run** (0 wrong-source flags) — unchanged, already solved.
- End-to-end full-mode, full fix set, 5 runs: **9, 10, 8, 9, 10 → avg ~9.2, range 8–10.**
- Entity fix moved this set by **0** (as predicted — its failures are drift, not entities);
  it's a corpus-wide robustness fix for the 595 entity entries, not a fix for these 10.
- Retry+snap made **10/10 achievable** (hit 2/5 runs) but NOT guaranteed. Residual is
  stochastic quote-drift on long-prose sources; the verifier correctly fail-closes to the
  safe fallback (retrieved sources shown, no unverified narrative) — not a wrong answer.

**Remaining levers if a *reliable* 10/10 is required (not just achievable):** upgrade snap
from longest-prefix to longest-substring (catch drift at the start/middle, not only the tail);
prompt for shorter quotes; or accept ~9/10 with safe fallbacks as beta-acceptable (fallbacks
degrade gracefully, never mislead). Decision deferred to owner — diminishing returns vs. the
retrieval gate, which is met. Bigger eval set needed for statistical power on the compose axis.

## 2026-07-09 — Expanded retrieval eval settles vector-vs-hybrid-vs-full

Owner accepted ~9/10 compose (safe fallbacks) as beta-acceptable and chose to expand the eval
set. Built `web/src/scripts/eval-retrieval.mts`: **30 LABELED queries** across the categories
the topical-10 set couldn't exercise — verse-ref, proper-noun, exact-term, rare-topic (+
topical) — each declaring its expected passage(s). Scoring is objective: a retrieved source
is a HIT if its `verseId` decodes to an expected (book, chapter); "correct" = ≥2 of K=6 in
range. Retrieval-only (compose is ~9/10 and mode-independent).

**Result — the reranker earns its keep (owner's "core, not polish" call, now on data):**
- vector: **29/30 (97%)** · hybrid: **29/30 (97%)** · **full (hybrid+reranker): 30/30 (100%)**
- The reranker fixed the ONE query vector+hybrid both missed: "the Word became flesh in the
  Gospel of John" — vector pulled only 1/6 John-1 sources (incarnation commentary scatters to
  Heb/Col); the reranker's query-awareness prioritized John 1. Textbook topical-precision win.
- **Retires the earlier "hybrid hurts" confusion:** on pure retrieval (no compose) hybrid =
  vector = 97%; the earlier topical-set 7/10 was compose variance (0 wrong-source flags). BM25
  fusion is neutral here; the RERANKER is the lift.

**Decision: keep the full pipeline (hybrid candidate pool → Qwen3 reranker → top 6).** It is
the only config at 100% on the hard set. Optional future simplification to test: vector-pool →
reranker (drop BM25) — if also 100%, BM25 is droppable for latency/simplicity. Not urgent;
current full pipeline is validated. Per-category: proper-noun/exact-term/rare-topic/topical all
100% in every mode — the corpus + embeddings are strong; the reranker only needed to break a
verse-ref tie.

## 2026-07-09 — Teacher landed + wired to web (`feat/teacher-pipeline` → `main`)

**Merged to `main`, audit green (95 tests, typecheck + lint + knip + deps all pass).**

- **Teacher pipeline (done-on-John):** `src/teacher/*` — retrieval → compose
  (Qwen3.5-35B-A3B via DeepInfra, `enable_thinking:false`) → V1 verifier →
  retry-with-feedback (×2) → fallback to raw retrieval. 6 orchestration tests.
  Verified live: "the Word became flesh" / "born again" / "living water" compose
  grounded voices across ≥2 traditions; the bait "Is Jesus really God? just tell me"
  holds shape (voices + passages, no verdict). A weaker model's fabricated Augustine
  quote was caught by `quote_verbatim` and rejected — the verifier earns its keep.
- **Extractive composer:** `voice.summary` made optional (contract widening, backward
  compatible); prompt tells the model to quote generously and omit the gloss. Interim
  drift mitigation until the V2 summary-faithfulness classifier exists.
- **Vector retrieval live:** commentary embedded with BGE (`bge-large-en-v1.5`, 1024-dim)
  into Neon pgvector; queried by `/ask` via app_runtime + RLS (`user_id IS NULL`).
- **Web feature `/ask` ("Ask the voices"):** `web/src/lib/teacher/*` (native to web —
  Next can't bundle root `src/`), authed-only `api/ask`, quote-forward UI, sidebar entry.
  Contract + V1 verifier copied into `web/src` and locked byte-identical to `src/` via a
  new sync-guard test (`test/web-core-sync.test.ts`), matching the bible-sync convention.
- **Ingest resilience:** a batch that fails all retries is skipped (idempotent upserts
  fill it on re-run) instead of crashing the multi-hour job; embedder now 5 retries / 60s.
  (The first Gospels run had died on a DeepInfra timeout at 6,943 chunks.)
- **/audit + /security before merge — clean.** Fixed dead code + the `verseExists` stub
  (web path now checks real WEB versification, so `passage_exists` binds). Security review
  of the teacher surface confirmed: DeepInfra key is header-only + `server-only` + never
  logged; no path where unverified LLM text reaches the user (composed is V1-gated,
  fallback renders corpus only, violations sent-but-not-rendered).
- **Cost note:** full-corpus embedding ≈ **$0.6–1.0 one-time** (627k chunks); the real
  recurring cost is **Neon Large ~$110/mo** to hold the index in RAM — so full-corpus +
  HNSW tuning (the HNSW index already exists at default params) + hybrid/rerank are
  parked until dogfooding justifies them.

**Audit follow-ups (post-merge):**
- Fixed embedder retry (no backoff after the final attempt; `e instanceof TypeError`
  for network errors) + corrected the HNSW docs.
- **Prompt is now sync-guarded.** `src/teacher/prompt.ts` ↔ `web/src/lib/teacher/prompt.ts`
  are byte-identical and enforced by `test/web-core-sync.test.ts` (prompt.ts refactored to
  a local structural `PromptSource` type so neither copy imports a package-specific one —
  that's what lets them stay identical). The composer's behavioural spec can no longer drift
  between CLI and web.
- **Two items promoted to the pre-signup gate** (see ROADMAP "Pre-signup gate"), alongside
  V2 summary-faithfulness: (1) rate-limit `/api/ask`; (2) guarantee `createPgStore`'s
  `rejectUnauthorized:false` never reaches a runtime path.

**Deferred cosmetic nit:** `/ask` passage-range label (`ask-client.tsx`) is approximate for
cross-chapter ranges (repeats the chapter on the end ref). Fix when labels matter.

## 2026-07-09 — Retrieval accuracy sprint (in progress)

**Goal:** Take true success rate from 4/10 → 10/10 via three stacked fixes.

### Diagnosis (complete)

Ran 10-query diagnostic through the full pipeline. Findings:
- **Compose rate** 7/10 was misleading — 3 of 7 used wrong sources (e.g. Luke 2 nativity
  shepherds for "good shepherd" → John 10). **True success rate: 4/10.**
- **Root cause #1 — corpus gap:** embeddings table had only 4 Gospel books (13,631 chunks)
  while `commentary_entries` has 371,406 entries across 66 books. Every OT/Epistle query fails.
- **Root cause #2 — BM25 dead:** `websearch_to_tsquery` AND semantics returned 0 results for
  59/60 test sources against short embedding chunks (chunks rarely contain ALL query terms).
- **Root cause #3 — no reranker:** vector cosine alone can't distinguish "good shepherd" (John 10)
  from "shepherds" (Luke 2) — semantically similar, topically wrong.

### Step 1: Embed full corpus (IN PROGRESS)

`src/ingest/embed-full-corpus.ts` — batch-embedding all 342k commentary_entries (body >= 100 chars)
via BGE-large-en-v1.5 on DeepInfra. Pre-skips existing source_ids (avoids re-embedding the 5,351
Gospel entries). ON CONFLICT DO NOTHING for idempotency.

- MAX_EMBED_CHARS reduced from 1800 → 1500 → 1200 → **1000** to eliminate BGE 512-token-limit
  batch failures (1000 chars ≈ 285 tokens worst case). Running at 0 errors.
- Progress: ~3% of 341,912, ~2.5 hours remaining. 0 embed errors.

### Step 2: Fix hybrid search (APPLIED)

Migration `db/migrations/004_hybrid_search_v2.sql` applied to prod DB:
- `websearch_to_tsquery` → `plainto_tsquery` (OR semantics — any keyword matches)
- Added `source_type = 'commentary'` filter
- Widened BM25 pool to `match_count * 5`

### Step 3: Add reranker (CODE READY)

`web/src/lib/teacher/rerank.ts` — BGE-reranker-v2-m3 cross-encoder via DeepInfra.
`web/src/lib/teacher/retrieve.ts` — rewritten: hybrid_search(20 candidates) → rerank(top 6).
`web/src/lib/teacher/teach.ts` — passes raw query text through for BM25.

### Diagnostic harness

`web/src/scripts/diagnose-pipeline.mts` — 10 queries, `MODE=vector|hybrid|full`, tracks
compose rate AND true success rate (source quality heuristics). Dry-run verified working.

### Commits (8, on `main`)

All work committed in logical groups. Push to `ancient-roads` remote pending (needs manual
`git push origin main` — no HTTPS creds or SSH configured from this environment).

### Neon capacity

Current DB ~1GB, estimated full corpus ~5.3GB. `max_connections=901` confirms Large compute.
Fits within Neon Launch (10GB) or Scale (50GB) plan limits.

### Next steps (after embedding completes)

1. Verify embedding count reaches ~355k
2. Re-run diagnostic `MODE=vector` — measure full-corpus vector-only improvement
3. Re-run diagnostic `MODE=hybrid` — measure BM25+vector fusion improvement
4. Re-run diagnostic `MODE=full` — measure hybrid+reranker improvement
5. Record all three numbers here. Target: 10/10.
6. Groq/Together speed benchmark (user will add keys)

---

## Status summary

Retrieval accuracy sprint in progress. Embedding job running (~2.5h). Code for all three
fixes is written and ready; migration 004 applied. Diagnostic harness ready to measure
the improvement at each step.

## Task 1: Diagnose logout/account-page bug (staging only)

**Status:** Complete — pre-existing, not flip-caused. Logged as auth-completion item.

### Diagnosis: PRE-EXISTING (not caused by SEC-2 flip)

**Evidence that SEC-2 is not involved:**

1. Auth is 100% HTTP-based, zero database involvement. Neither `DATABASE_URL` nor `APP_DATABASE_URL`
   participates in session validation.
2. `app_runtime` has full DML on ALL tables — no grant could be missing.

**Root cause — middleware vs. API route session validation divergence:**

The `@neondatabase/auth` library validates sessions via two different code paths that behave differently:

- **API routes** (`requireUser()` → `getAuth().getSession()`, `server/index.mjs:892`): Reads
  cookies via Next.js `cookies()` API. Checks the local `session_data` JWT cookie first (signed,
  validated locally with `cookieSecret` — zero HTTP calls). If valid AND `session_token` cookie
  exists → returns cached session immediately. **This is why annotations work.**

- **Middleware** (`getAuth().middleware()`, `server/index.mjs:1500`): Reads cookies from
  `request.headers.get("cookie")` in Edge Runtime. Also tries the JWT cache via `trySessionCache`,
  but if the `session_data` cookie is expired (5-minute TTL default) or absent, it falls back to
  `fetchSessionWithCookie(sessionTokenCookie, baseUrl)` — an HTTP call from Edge Runtime to
  `NEON_AUTH_BASE_URL`. If this HTTP call fails (network, timeout, auth service error), `sessionData`
  stays `{ session: null, user: null }` → `checkSessionRequired` returns `allowed: false` →
  redirect to `/auth/sign-in`.

The symptom — annotations work but `/account` redirects — is explained by the JWT cache being warm
for API routes (5-minute TTL, frequently refreshed by annotation calls) but cold or failing for the
middleware's HTTP fallback. Vercel Deployment Protection adds another layer that can interfere with
Edge→auth-service networking.

**Logout is unreachable as a consequence:** `SignOut` only renders inside `<AccountView>` (from
`@neondatabase/auth/react`). The account page can't load → no signout button → no logout path.
The `NeonAuthUIProvider` wrapper IS already in `layout.tsx` — that's not the fix.

### Proposed fixes (ranked)

**Fix A — Short-term (unblocks logout now):** Move `/account` out of middleware protection. Remove
`/account/:path*` from the middleware matcher. Add `requireUser()` guard in the account page's
server component (same path that works for annotations). The account page loads, `<AccountView>`
renders, logout becomes reachable.

**Fix B — Medium-term (debug the middleware):** Add structured logging to the middleware to capture:
does the session cookie arrive? Does `trySessionCache` find the JWT? Does the HTTP call to the auth
service succeed? This identifies the exact failure point but doesn't fix logout.

**Fix C — Long-term (SEC-1):** Migrate to Better Auth direct, removing the `@neondatabase/auth`
beta library entirely. This eliminates the middleware/API divergence, the CVEs, and the dependency
on the Neon Auth HTTP service.

**Recommendation:** Fix A first (10-minute change, unblocks logout), then Fix C on the SEC-1 timeline.

### Fix A applied

- `web/src/middleware.ts`: matcher changed from `['/account/:path*']` to `[]` (middleware no longer
  runs for any route; kept for future use)
- `web/src/app/account/[path]/page.tsx`: added `requireUser()` + `redirect('/auth/sign-in')` guard
  before rendering `<AccountView>`. Uses the same JWT-cache path as annotations.
- **Check 1 (logged-out redirect):** `requireUser()` throws → catch calls `redirect('/auth/sign-in')`.
  Same destination as the old middleware, enforced server-side.
- **Check 2 (subtree coverage):** The entire `/account` subtree is one dynamic `[path]/page.tsx` with
  `dynamicParams = false`. No other files under `/account/`. All 5 paths (settings, security, teams,
  api-keys, organizations) pass through the single `requireUser()` guard.
- **Logout needs Thomas's visual confirmation after deploy:** if `<AccountView>` now loads, the
  `<SignOut>` button rendered by the Neon Auth UI should be reachable.

## Task 2: V1 verifier reject-path tests

**Status:** Complete — v1.ts at 100% statement coverage, ROADMAP row upgraded to Done.

### Changes

- `test/verifier.test.ts`: Added 8 new tests (20 → 28 total):
  - `attribution_tradition`: wrong tradition in voice block
  - `anchor_valid`: structurally invalid anchor verse IDs on voice block
  - `anchor_order`: reversed anchor range on voice block
  - `reading_resolves`: reading block with unresolvable source_id
  - `reading_attribution`: reading block with mismatched author
  - `passage_exists`: verse not found in translation
  - I5 screen true-positive: doctrinal verdict in voice summary
  - Valid reading block acceptance (green-path)
- `test/fixtures.ts`: Added `missingVerses` to corpus fixture for `passage_exists` test
- Coverage: `v1.ts` 77.6% → **100%** statements; `screens.ts`, `normalize.ts`, `memory-corpus.ts` all 100%
- `/audit` passes green (28 verifier tests, 77 total, 0 errors)

## Task 3: Retrieval vertical slice (spine only)

**Status:** Already complete — all components exist and contract test passes (6/6).

### Verification

The retrieval spine was already built in a prior session:
- `types.ts`: Full boundary vocabulary (CorpusDoc, Embedder, EmbeddingStore, RetrievalResult)
- `embedder.ts`: `createDeepInfraEmbedder` (open-weight, no OpenAI/Anthropic)
- `store.ts`: `createNeonStore` (pgvector-backed)
- `retrieve.ts`: Public entrypoint, 100% coverage
- `ingest.ts`: Batch ingestion pipeline, 100% coverage
- `sources/commentary.ts`: Commentary corpus adapter
- `test/retrieval.fakes.ts`: `fakeEmbedder` (bag-of-words hashing) + `inMemoryStore` (brute-force cosine)
- `test/retrieval.contract.test.ts`: 6 tests pass (ranking, limit, hydration, idempotency, chunks, empty query)
- Integration test exists but gated behind `RUN_INTEGRATION` (correct — no paid API calls)

## Task 4: Extend /audit to web/

**Status:** Complete — web/ typecheck + lint added to audit, both pass green.

### Changes

- `scripts/audit.sh`: Added two new gates:
  - `typecheck — web/ tsc --noEmit` (strict mode, all web/ TypeScript)
  - `lint — web/ next lint --quiet` (Next.js ESLint integration)
- Both pass cleanly — no type errors, no lint errors in web/
- Note: `next lint` is deprecated in Next.js 16 (current is 15.5.20). When upgrading to
  Next.js 16, migrate to eslint CLI (`npx @next/codemod@canary next-lint-to-eslint-cli .`)

## Task 5: Fix drifted web ref-parse.ts

**Status:** Complete — files now byte-identical, audit green.

### Changes

- `web/src/bible/ref-parse.ts`: Removed unused `BOOK_BY_SLUG` import (the only difference from `src/bible/ref-parse.ts`)
- Verified with `diff`: files are now byte-identical
- Audit passes green (77 tests, 0 errors)

## Task 6: Note panel close on save

**Status:** Complete — panel closes after save. Needs Thomas's visual confirmation.

### Changes

- `web/src/app/read/[book]/[chapter]/page.tsx:251`: `onSaveNote` callback now calls `setStudy(null)` after `saveVerseNote`, closing the study panel on successful (optimistic) save
- Save is optimistic (local state updates immediately, fetch is fire-and-forget), so the panel closes instantly — no spinner needed
- Commentary panel sidebar's AnnotationBar is left unchanged: it collapses the note editor but keeps the sidebar open, which is the correct UX for a persistent sidebar vs. a popup panel
- Web typecheck passes

## Design proposals (no implementation)

### Red highlighter "moving" — investigation

**Status:** Analysis complete, awaiting Thomas's reproduction in browser.

There is NO red color in `HIGHLIGHT_COLORS` — the palette is yellow, green, sky, pink, amber. "Red" likely means the **pink dot** (`bg-pink-400`, which renders as a saturated rose/coral).

The "moving" behavior is almost certainly the **hover quick-menu** (`verse-display.tsx:87–140`):
- It's `position: fixed` with coordinates from `el.getClientRects()[0]`
- It follows the mouse across verses — each `onMouseEnter` repositions the menu to that verse's first line
- For multi-line verses, the menu snaps to the first line even when the mouse entered from a lower line, which could look like the menu "jumps"
- During scroll while the menu is visible, the menu stays viewport-fixed while text scrolls underneath (140ms dismiss timer may not fire fast enough)

**Three likely causes** (Thomas should confirm which):
1. **Normal hover-follow behavior** — the menu is designed to move verse-to-verse. If this feels wrong, the fix is debouncing or anchoring to click instead of hover.
2. **Multi-line snap** — verse spans can wrap; `getClientRects()[0]` always returns the first line rect, so the menu appears above where the mouse is.
3. **Scroll-during-hover** — `position: fixed` + stale coordinates = menu floats away from its verse during scroll.

**Don't-guess-fix**: Thomas should reproduce and confirm which element is "red" (pink dot? pink highlight bg? something else?) and what "moving" means (hover-follow? scroll-float? something else?) before any code change.

### Text/highlight color separation — schema + UX proposal

**Status:** Proposal ready for Thomas's approval. DO NOT implement until approved.

#### Current state
- `highlights` table: `id, user_id, verse_id, verse_end, color, deleted_at, created_at, updated_at`
- `color` stores a string key (`'yellow'`, `'green'`, `'sky'`, `'pink'`, `'amber'`) mapping to a Tailwind bg class
- Text color is always the default (stone-800 / stone-200 in dark mode)
- One color axis, one row of dots in the UI

#### Proposed schema (migration 003)

```sql
-- 004_highlight_text_color.sql
-- Add independent text_color axis. Rename color → highlight_color for clarity.

ALTER TABLE highlights RENAME COLUMN color TO highlight_color;
ALTER TABLE highlights ADD COLUMN text_color TEXT DEFAULT NULL;

-- Backfill: nothing to do — NULL text_color means "use default text color"
-- (backward compatible: all existing highlights keep their bg color, no text override)
```

TypeScript interface change:
```typescript
export interface Highlight {
  id: string;
  verse_id: number;
  verse_end: number | null;
  highlight_color: string;      // was: color
  text_color: string | null;    // new — null means default
}
```

#### Proposed text color palette

```typescript
export const TEXT_COLORS = [
  { id: 'default', label: 'Default', class: null },          // stone-800 / stone-200
  { id: 'red',     label: 'Red',     class: 'text-red-700 dark:text-red-400' },
  { id: 'blue',    label: 'Blue',    class: 'text-blue-700 dark:text-blue-400' },
  { id: 'green',   label: 'Green',   class: 'text-green-700 dark:text-green-400' },
  { id: 'purple',  label: 'Purple',  class: 'text-purple-700 dark:text-purple-400' },
] as const;
```

#### Proposed UX (3 surfaces to update)

**1. Hover quick-menu** (`verse-display.tsx`):
- Keep the existing row of bg-color dots (unchanged)
- Add a second row below with smaller "A" letter swatches showing the text colors
- Separator between the two rows
- Compact: fits in the existing rounded-pill menu

**2. Study panel HighlightRow** (`study-panel.tsx`):
- Current: `Highlight [● ● ● ● ●] [clear]`
- Proposed: Two labeled rows:
  ```
  Background  [● ● ● ● ●]  [clear]
  Text color  [A  A  A  A  A]  [reset]
  ```

**3. Commentary panel AnnotationBar** (`commentary-panel.tsx`):
- Same two-row layout as study panel

**4. Verse rendering** (`verse-display.tsx`):
- The `<span>` wrapping verse text gets an additional class from `TEXT_COLOR_CLASS[textColor]` when `text_color` is non-null
- Falls through to the default `text-stone-800 dark:text-stone-200` when null

#### Queries to update (6 total)
- `getChapterAnnotations`: SELECT adds `text_color`
- `setHighlight`: INSERT/UPDATE adds `text_color` param
- `removeHighlight`: unchanged (soft-deletes whole row)
- `listHighlights`: SELECT adds `text_color`
- API route `POST /api/annotations` (highlight kind): accepts `textColor` field
- API route `GET /api/annotations/all`: returns `text_color`

#### Risks / open questions for Thomas
1. **Rename `color` → `highlight_color`?** This touches every query and UI reference. Alternative: keep `color` as-is and just add `text_color`. Less churn, slightly less clear naming.
2. **Palette size**: 5 text colors enough? Should it match the bg palette 1:1?
3. **Combinatorics UX**: With 5 bg × 5 text colors = 25 combos, is a two-row layout intuitive enough or should we use a grid/matrix?
4. **Default text color by bg**: Should certain bg colors auto-set a text color for readability (e.g., dark bg → light text)? Or always independent?

## Standalone logout (replaces Fix A)

**Status:** Complete — needs Thomas's visual confirmation after deploy.

Fix A (server-component `requireUser()` guard on account page) failed through three iterations —
the `@neondatabase/auth` beta library's session handling is too unreliable in the Edge/serverless
environment. Thomas directed: stop patching account page, wire standalone logout, mark account UI
broken-until-Fix-C.

### Changes

- `web/src/app/api/auth/sign-out/route.ts`: POST handler that clears all `__Secure-neon-auth.*`
  cookies (session token, JWT cache, challenge) by setting `maxAge: 0`. Returns JSON `{ ok: true }`.
  Takes precedence over the catch-all `[...path]` route. No dependency on `<AccountView>` or the
  Neon Auth library.
- `web/src/components/sidebar.tsx`: Uses `authClient.useSession()` to detect auth state.
  Shows "Sign out" button (with log-out icon) when session is active, "Sign in" link when not.
  Sign-out POSTs to `/api/auth/sign-out` then hard-navigates to `/`.
- Account management UI (teams/api-keys/orgs/security) is marked broken-until-Fix-C (SEC-1 Better
  Auth migration). No further fixes will be deployed for `<AccountView>`.
- `web/src/middleware.ts`: matcher stays empty (unchanged from prior commit).

### What to verify after deploy

1. Sign in works (via sidebar "Sign in" → `/auth/sign-in`)
2. After sign-in, sidebar shows "Sign out" button instead of "Sign in"
3. Clicking "Sign out" clears session and returns to home
4. Reader + annotations still work while signed in

## Full-text commentary search

**Status:** Implemented — code complete, audit green. Needs migration + ingestion run against Neon.

**Thomas's decisions (approved):**
- Q1 (cost): Proceed. May bump Neon to Launch plan (~$0.16/mo storage).
- Q2 (tsvector scope): Body text only. Author/tradition stay as WHERE filter columns, not in tsvector.
- Q3 (panel search): Deferred.
- Q4 (snippet): 50-word snippets, fine.
- Pagination: capped at max 100 results per request, default 20.
- Idempotency: UNIQUE constraint on natural key `(book, chapter, verse_start, verse_end, author, source_title)`, ingestion uses `ON CONFLICT DO NOTHING`.
- Migration numbering: commentary FTS = 003, text/highlight color separation = 004.

### Problem

371k commentary entries from 401 sources exist as static JSON on the CDN. Users can browse by
book+chapter+author but cannot search the text. "What did Chrysostom say about baptism?" requires
manually opening every chapter of every book and scrolling. The omnibox only resolves verse
references — no free-text search exists anywhere in the product.

### Why not use the existing `embeddings` table?

The `embeddings` table has tsvector/GIN and `hybrid_search()` already, but it's wrong for this:

1. **RLS blocks it.** `embeddings` has RLS enabled with `user_id = current_setting(...)`. Commentary
   rows have `user_id IS NULL` — invisible to `app_runtime`. Fixing this requires either a policy
   change, SECURITY DEFINER, or a separate read path. All are worse than a clean table.
2. **Data is chunked, not structured.** The embedding pipeline splits entries at 1200 chars for
   vector quality. Search results would be fragments, not complete commentary entries with metadata.
3. **Not all commentary is embedded.** Embedding requires DeepInfra API calls per book. The ingestion
   status is unknown and completing it has a cost.
4. **Vector search is unnecessary.** Keyword search ("chrysostom baptism") is BM25's strength.
   Semantic search adds latency and cost (query embedding API call) with no benefit for structured
   text lookup.

### Approach: new `commentary_entries` table with tsvector/GIN

Same pattern as `embeddings.tsv` + `idx_embeddings_fts`. Public data, no RLS, no vector column.
Ingested from the same static JSON files the CDN serves.

### Schema (migration 003)

See `db/migrations/003_commentary_fts.sql`. Key points:
- tsvector on `body` only (author/tradition are WHERE filters, not in the tsvector)
- GIN index for `@@` queries
- B-tree index on `(book, chapter, verse_start)` for passage browsing
- UNIQUE index on `(book, chapter, verse_start, verse_end, author, source_title)` for idempotent ingestion

### Ingestion script

`src/ingest/ingest-commentary-fts.ts` — reads all 1,212 chapter JSON files from
`web/public/commentaries/`, batch-inserts into `commentary_entries`.

```
DATABASE_URL=<owner-url> pnpm ingest:commentary-fts
```

- Reads the same JSON files the CDN serves — single source of truth
- Batch INSERT (200 rows per transaction) via neon tagged template literals
- Idempotent: `ON CONFLICT (natural key) DO NOTHING` — safe to re-run
- Expected: ~371k rows, ~300 MB text + ~150 MB indexes ≈ 450 MB in Postgres

### Search query function

`web/src/lib/commentary-search.ts` — no `runAsUser` needed (public data, no RLS):

```typescript
export interface CommentarySearchResult {
  id: number;
  book: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  author: string;
  year: number | null;
  tradition: string | null;
  source_title: string;
  snippet: string;          // ts_headline highlighted excerpt
  rank: number;
}

export async function searchCommentaries(opts: {
  query: string;
  book?: number;
  tradition?: string;
  author?: string;
  limit?: number;
  offset?: number;
}): Promise<{ results: CommentarySearchResult[]; total: number }>
```

SQL core (using `ts_rank_cd` + `websearch_to_tsquery`, same as `hybrid_search()`):

```sql
SELECT
  id, book, chapter, verse_start, verse_end,
  author, year, tradition, source_title,
  ts_headline('english', body, query,
    'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>') AS snippet,
  ts_rank_cd(tsv, query) AS rank
FROM commentary_entries, websearch_to_tsquery('english', $1) AS query
WHERE tsv @@ query
  AND ($2::smallint IS NULL OR book = $2)
  AND ($3::text IS NULL OR tradition = $3)
  AND ($4::text IS NULL OR author = $4)
ORDER BY rank DESC
LIMIT $5 OFFSET $6
```

`websearch_to_tsquery` handles natural language well: `chrysostom baptism` → AND semantics,
`"iron sharpens"` → phrase match, `baptism OR immersion` → OR. No query sanitization needed.

### API route

`GET /api/search/commentaries?q=<query>&book=<num>&tradition=<str>&author=<str>&limit=<n>&offset=<n>`

- Returns `{ results: CommentarySearchResult[], total: number }`
- No auth required (public data)
- Rate-limited by Vercel's edge (no custom rate limit needed at this scale)
- `q` is required, all other params are optional filters
- Default limit: 20, max: 100

### UI: commentary library page

Add a search input to the existing `library/commentaries/page.tsx`. Two modes:

**Browse mode** (current behavior, default): book/chapter/author dropdowns, passage-by-passage view.

**Search mode** (activated when user types in the search input): replaces the passage view with
ranked search results. Each result shows:

```
┌─────────────────────────────────────────────────────────────┐
│  John Chrysostom · 407 · Patristic                         │
│  Homilies on Matthew                                       │
│  John 3:5                                                  │
│                                                            │
│  "...the water of <mark>baptism</mark> is the entrance     │
│  to the kingdom, for unless one is born of water..."       │
│                                                            │
│  Open in reader →                                          │
└─────────────────────────────────────────────────────────────┘
```

- Clicking "Open in reader" navigates to `/read/{bookSlug}/{chapter}` with the verse in view
- Tradition/era badges use the same styling as the existing commentary panel
- Facet chips above results: All / Patristic / Reformed / Methodist / Presbyterian / etc.
  (derived from the result set's tradition values, not hardcoded)
- Pagination at bottom (20 results per page)
- Debounced search input (300ms) to avoid hammering the API on every keystroke

### Files to create/modify

| File | Action | What |
|---|---|---|
| `db/migrations/003_commentary_fts.sql` | Create | Table + indexes |
| `src/ingest/ingest-commentary-fts.ts` | Create | JSON → Postgres batch insert |
| `web/src/lib/commentary-search.ts` | Create | Search query function |
| `web/src/app/api/search/commentaries/route.ts` | Create | GET endpoint |
| `web/src/app/library/commentaries/page.tsx` | Modify | Add search input + results view |
| `package.json` | Modify | Add `ingest:commentary-fts` script |

### What this does NOT include (deferred)

- **Omnibox integration** — NAVIGATION_AND_SEARCH.md §5 designs corpus search as the third omnibox
  intent (after reference and topic). That wiring is a separate task. This proposal only adds the
  search function and the library page surface.
- **Verse text search** — searching Bible text across translations is a different feature (needs
  `verses` table from SCHEMA.md, not built yet).
- **Semantic/vector search** — BM25 keyword search first. If users need "passages about suffering"
  (no keyword match), that's the hybrid search path via `embeddings` + DeepInfra — a later layer.
- **User library search** — searching user's own notes/highlights. Different table, needs RLS.

### To go live

1. Run migration 003 against Neon as `neondb_owner`
2. Run ingestion: `DATABASE_URL=<owner-url> pnpm ingest:commentary-fts`
3. Deploy web/ to Vercel
4. Verify search from `/library/commentaries`

## Needs Thomas

1. **Note panel close on save (Task 6)**: visually confirm the panel closes after saving a note in the reader
2. **Red highlighter "moving" (Task 7)**: reproduce in browser and confirm: (a) which element is "red" — pink dot? pink bg? something else? (b) what "moving" means — hover-following? scroll-floating? multi-line snap?
3. **Text/highlight color separation (Task 7)**: review the schema + UX proposal above and approve/redirect before implementation
4. ~~**SEC-2 closure (prod)**: re-apply APP_DATABASE_URL to prod, rotate neondb_owner password~~ **DONE** — APP_DATABASE_URL re-applied, neondb_owner password rotated, Vercel DATABASE_URL + DATABASE_URL_UNPOOLED updated, .env.local updated, deployed. Old password is invalid.
5. ~~**Fix A visual confirmation**~~ **Replaced by standalone logout** — verify sign-in/sign-out cycle works from the sidebar after deploy
6. ~~**Full-text commentary search**~~ **Approved + implemented** — code complete, needs migration + ingestion run against Neon (see "To go live" above)
