# Corpus-lane diagnosis — the 15 open findings, measured

**Status: DIAGNOSIS ONLY. Nothing here is fixed, and nothing here should be fixed on the strength
of this document alone** — it is step 1 of the owner's loop (diagnose → suggest treatment →
confirm → independent confirm → deploy → test). Treatment classes below are proposals for step 2.

**Scope.** The 15 corpus & retrieval-lane rows of
[`QA_REMEDIATION_LEDGER.md`](../QA_REMEDIATION_LEDGER.md) §6, plus the `gill-song` tradition
question, plus twelve defects found while measuring that the ledger does not list (§17).

---

## 0. Method and environment — read this before trusting any number below

Every number is **measured**, and each one names the artifact it came from
(`quality-slice` step 0). Where a number is inferred rather than observed, it says so.

**Where the numbers come from.** Three kinds of artifact, and they do not agree with each other —
which is itself one of the findings:

| Artifact | What it is | Environment-independent? |
|---|---|---|
| `ingest/sources.config.json` (914 entries) | the ingest manifest, in git | **Yes** — same bytes on dev and prod |
| `web/src/**` (`routing.ts`, `catalog.ts`, `legal-corpus.ts`, …) | shipped code, in git | **Yes** |
| `web/public/commentaries/**`, `web/public/lexicon/**` | the static corpus, in git | **Yes** |
| Neon **dev** branch `ep-tiny-hat` (`sources`, `sections`, `embeddings`, `commentary_entries`, `section_anchors`) | the database | **NO** |

**The environment caveat is load-bearing and I will not paper over it.** The QA fleet ran against
**production**. Bylaw 7 forbids a production read without the owner's explicit go, so **every DB
number below is dev.** Dev was reset from `production` on 2026-08-10 and has taken corpus copies
since; it currently holds **175 sources (125 published · 48 staged · 2 quarantined)**.

Consequently each finding is tagged with **what it would take to confirm on prod**. Findings whose
evidence is the manifest or the shipped code need no prod read at all — those are the strongest
verdicts here. Findings that rest only on dev row counts are marked **DEV-ONLY** and must not be
treated as closed until the owner runs the stated query at the terminal.

**Read-only discipline.** All SQL ran under `SET default_transaction_read_only = on` as
`app_runtime` against `neondb` on `ep-tiny-hat`. No connection string was printed. No production
endpoint was contacted. No file in the tree was modified except this one.

**Independent-verification note (bylaw 4).** Three measurement agents ran non-overlapping sweeps.
I re-executed their load-bearing claims myself rather than relaying them. **One was wrong**: the
passage-search agent reported `gill-song` as having **0 embeddings**; it has **1,942, all
served**, confirmed three ways (`metadata->>'work'`, `source_id LIKE`, and a sample row). That
error would have inverted the A058 diagnosis. Corrected below and flagged here because a
diagnosis that silently relays a subagent's number is not a measurement.

---

## 1. A064 — Hymns tradition filter fragmented by capitalisation

**VERDICT: REAL, and the ledger's treatment note is correct for this row but wrong as a general
statement about the class (see §17.1).**

**MEASUREMENT.**
- The chips are built by `catalogTraditions()`, `web/src/lib/catalog.ts:102-105`:
  `SELECT COALESCE(s.tradition,'unknown') … GROUP BY 1` — a **verbatim `GROUP BY` on
  `sources.tradition`, no case folding**. The chip filter is exact equality,
  `catalog.ts:71`: `($2::text[] IS NULL OR s.tradition = ANY($2::text[]))`.
- Corpus-wide, `sources.tradition` has **exactly ONE case-collision group**:
  `Anglican` (1 row) vs `anglican` (10 rows) — 11 rows, **9 published**.
  Measured with `GROUP BY lower(tradition) HAVING count(DISTINCT tradition) > 1`.
- Inside the Hymns & Poetry catalog (45 published hymn+poetry sources) the histogram is:
  `unassigned` 30 · `anglican` 5 · `catholic` 2 · `nonconformist` 2 · `Anglican` 1 ·
  `Anglican-Evangelical` 1 · `evangelical` 1 · `moravian` 1 · `puritan` 1 · `reformed` 1.

**CAUSE.** A metadata value, written inconsistently at ingest and never normalised.
`Anglican` is `keble-christian-year`; the five lowercase `anglican` hymn/poetry works are
`herbert-temple`, `neale-eastern-hymns`, `rossetti-verses`, `tennyson-in-memoriam`,
`traherne-poems`.

**`Anglican-Evangelical` is NOT a capitalisation variant.** It is `olney-hymns` (Newton & Cowper),
and it names a real distinction. Folding it into `anglican` is an editorial call, not hygiene —
**do not batch it with the case fix.**

**TREATMENT CLASS: (a) metadata edit.** One `UPDATE sources SET tradition='anglican' WHERE
tradition='Anglican'`. `Anglican-Evangelical` → owner call, filed separately.

**BLAST RADIUS: 1 row** in `sources`. Zero rows in `embeddings`. Zero retrieval effect — the
chips read `sources.tradition`; /ask reads `embeddings.metadata->>'tradition'`, a different
column that already carries `anglican` for both works (see §17.2).

**RISK: very low.** No eval needed, as the ledger says. **But see §17.1** — the same defect class
exists on the /ask floor over different rows, and *that* one does need the eval. Fixing this row
does not fix that one, and reporting "A064 done" must not be read as covering it.

**Prod confirmation:** `SELECT tradition, count(*) FROM sources GROUP BY 1` at the terminal.

---

## 2. A065 — Manton's multi-volume set split by inconsistent title prefix

**VERDICT: REAL. Confirmed on an environment-independent artifact.**

**MEASUREMENT.** `ingest/sources.config.json` holds **9 Manton volumes**, and the titles split:

| Prefix | Volumes | Slugs |
|---|---|---|
| `Complete Works of Thomas Manton, D.D. Vol. …` | **6** | I, II, III, IV, V, VIII |
| `Works of Thomas Manton, D.D. Vol. …` | **3** | VI, VII, XX |

Dev's `sources` table matches the manifest **exactly** on all 9. Because the manifest is in git,
the same titles were written to production by the same ingest — this verdict does **not** depend
on a prod read.

The catalog sorts `ORDER BY s.title, s.slug` (`web/src/lib/catalog.ts:78`), so the `C…` group and
the `W…` group land in different regions of the alphabetical list.

**CAUSE.** A metadata value. The titles are what the CCEL source edition calls each volume; the
ingest recorded them verbatim and nothing normalised the set.

**TREATMENT CLASS: (a) metadata edit** — normalise the 3 odd titles to the 6-title form (or all 9
to a chosen canonical form). No eval.

**BLAST RADIUS: 3 rows** minimum (or 9 if the canonical form differs from both).

**RISK: low, with two caveats worth naming before anyone runs it.**
1. **Source fidelity.** The titles are the editions' own. Normalising trades bibliographic
   fidelity for shelf usability. That is a judgement, and this document does not make it.
2. **DEV-ONLY on visibility.** All 9 Manton volumes are `status='staged'` and
   `source_type='theology'` on dev, so on dev they are in **no catalog at all**
   (`catalog.ts:72` is `status='published'`). The QA session saw them, so **prod must have them
   published**. Confirm before fixing: `SELECT slug,status FROM sources WHERE slug LIKE 'manton-%'`.

**Also measured, not in the ledger:** volumes are numbered I–VIII and XX — 9 of Manton's 22
volumes are ingested, and the set is sorted by a Roman numeral inside a text sort. That happens to
order correctly for I–VIII, and will not once a `IX` arrives.

---

## 3. A055 — a Greek-text scholarly commentary on James filed under Hymns & Poetry

**VERDICT: REAL, and materially worse than reported. This is the most under-rated row in §6.**

**MEASUREMENT.**
- `ingest/sources.config.json` — slug `hort-james1909`, author `Hort, Fenton John Anthony`,
  title *"Epistle of St James: Greek Text with Introduction, Commentary as Far as Chapter IV,
  Verse 7, and Additional Notes"*, **`"source_type": "poetry"`**. In the manifest, so it is
  `poetry` on prod too — **no prod read needed for the miscategorisation itself.**
- Dev `sources`: `status='published'`, `tradition='unassigned'`.
- **Dev `embeddings`: 344 rows, `source_type='poetry'`, `metadata->>'register'='poetry'`, and
  ALL 344 carry `served=true`.**

**The consequence the ledger's "Library miscategorisation" framing misses.** The song/verse
retrieval lane is `SONG_VERSE_CORPUS_FILTER = '(served)'` (`routing.ts:278`) plus
`SONG_VERSE_TYPE_SQL = source_type IN ('hymn','poetry')` (`routing.ts:150`). Those 344 rows
satisfy both. **A Greek textual-criticism commentary is live in the /ask "Hymns & Sacred Poetry"
lane, labelled as sacred poetry.** That is not a shelf-tidiness problem; it is the register wall
being defeated by a manifest typo, on the surface the wall exists to protect.

`catalog-defs.ts:12-23` says the wall is "enforced by construction" because each catalog names an
explicit, disjoint set of `source_type`s. Measured: the construction enforces that a *type* goes
to one surface. **Nothing checks that a work's declared type matches its content**, so a single
wrong string in the manifest walks a prose commentary through every downstream gate.

**Second defect in the same work, found by reading the rows (`quality-slice`: look at the data).**
The CCEL `strip_markup: true` acquisition removed the scripture-reference links and left the
punctuation, so the stored text carries empty reference slots:

> `of God by man, and man by God; also πειρασμός in Ecclus., not only of Abraham ( ; as also ), but more generally; but in ; , on the one hand the context implies affliction…`

**87 of its 344 served rows (25.3%)** match an empty-reference-slot pattern
(`\(\s*;` | `\(\s*\)` | `\s;\s;`). Across the whole served hymn/poetry register the same pattern
matches: `watts-psalmshymns` 7, `reeves-hymnlit` 4, `hewitt-gerhardt` 4, `bett-methhymns` 4,
`prudentius-cathimerinon` 2, **everything else 0**. Hort is the outlier by 12×.

**CAUSE.** (i) a wrong `source_type` in the manifest; (ii) an ingest/decode defect specific to
this work's markup stripping.

**TREATMENT CLASS: (a) for the type + (c) for the text.**
- (a) `source_type: 'poetry'` → `'commentary'` in the manifest and in `sources`. **This changes
  what /ask retrieves in two lanes** (drops 344 rows out of song/verse; makes them eligible for
  the exegetical pool) → **carries the accuracy diagnostic.**
- (c) the empty-reference-slot text is an ingest/re-source job, independent of the type fix.
- A cheaper interim exists and should be considered first: **quarantine or unserve the 344 rows**,
  which stops the register breach immediately with no retrieval-quality claim attached.

**BLAST RADIUS: 1 source row · 344 embedding rows · 5 sections.**

**RISK: medium.** Promoting it to `commentary` puts a 19th-c. Greek critical apparatus, 25% of
whose rows are text-damaged, into the **exegetical** pool that feeds the ≥2-voices floor. That is
a worse outcome than leaving it mis-shelved. **Recommended: unserve first, re-source second,
re-type third** — and never type-promote damaged text into the voice pool.

---

## 4. A053 — OCR artifact in a hymn heading ("Col. 9. 16")

**VERDICT: REAL. Class size is 1, not systemic.**

**MEASUREMENT.** `sections.id = 77905`, slug `watts-hymns`, heading `Hymn 1:2.`. The artifact is
in the **body**, not the heading as the report says. Verbatim first two lines:

```
The deity and humanity of Christ, John 1. 1-3 14.
Col. 9. 16. Eph. 3, 9 10.
```

Watts's printed header is *John i.1,3,14; Col. i.16; Eph. iii.9,10*. Two corruptions:
`Col. i. 16` → `Col. 9. 16`, and `John 1. 1, 3, 14` → `John 1. 1-3 14`. `Eph. 3, 9 10` is correct.
Colossians has 4 chapters (`src/bible/books.ts`).

**Class measured** against the repo's own chapter counts over headings + body-headers of all
**8,529** published hymn/poetry sections: **chapter-overflow references = 1.** Two further regex
candidates were inspected and rejected as false positives (`"Even-Song" … "556."` spanning a line
break; `"HYMN CL."` — Roman 150 — matching as `Col.`). So this is a singleton.

**CAUSE: UNDETERMINED, and this is the one gap in this document I want named rather than
smoothed over.** The corruption is present in `sections.body` as stored. I could not establish
whether it originates in Gutenberg #13341 (the declared source) or in our transform.
`romaniseEpigraph` (`src/ingest/adapter-gutenberg.ts:77-84`) does convert Roman chapter numerals,
but its output feeds `scanReferences` only and never rewrites the stored body — so it is **not**
the culprit on the evidence available. A repo-wide grep found the string nowhere outside the DB.

**The decisive check is one command** and belongs to step 2, not here: fetch PG #13341 and grep
for `Col. 9. 16`. Present upstream → treatment (a), a 1-row correction. Absent upstream → we have
a transform that corrupts references, and the class is **not** 1, and the whole Gutenberg hymn
tranche needs re-checking. **Do not choose a treatment before running that grep.**

**TREATMENT CLASS: (a) if upstream; (c) if ours.** Undetermined by design.

**BLAST RADIUS: 1 section** if (a). Unbounded until the grep is run if (c).

**RISK: low to fix, but the risk of *assuming* (a) is real** — it would close a symptom over an
unmeasured mechanism.

---

## 5. A047 [MAJOR] — Watts's "When I Survey" not cross-linked to Galatians 6:14

**VERDICT: PARTLY REAL. The cross-link EXISTS — on a different edition of the same hymn. The
report is right about what it saw and wrong about the corpus.**

**MEASUREMENT.** The hymn is in the corpus **twice**, and the two copies behave oppositely:

| Row | Edition | Printed ref in body? | `verseId` | Served? |
|---|---|---|---|---|
| `hymn:watts-hymns:331` | Gutenberg #13341, *Hymns and Spiritual Songs* | **YES** — `Crucifixion to the world by the / cross of Christ, Gal. 6. 14.` | **0** (none) | yes |
| `hymn:watts-psalmshymns:689` | CCEL, *Psalms and Hymns of Isaac Watts* | **NO** — ref stripped: `Crucifixion to the world by the cross of Christ.` | **48006014** = Gal 6:14 | yes |

**The linkage exists exactly where the reference is absent, and is missing exactly where the
reference is printed.** Corpus-wide, `hymn:watts-psalmshymns:689` is the **only** hymn/poetry
row anchored to Gal 6:14.

**And the reader surface does show it.** `web/public/commentaries/gal/6.json` (229 entries) has
one Watts entry, at verse 14, `work: "watts-psalmshymns"`. So a reader at Galatians 6:14 **is**
offered a Watts hymn. What is missing is the link **from** the hymnal copy the QA session was
reading — whose printed header cites the verse and is inert text.

**Class measurement**, `watts-hymns` (434 sections):

| Metric | Count |
|---|---|
| Sections | 434 |
| Carrying a scripture-looking ref in body lines 1–2 | **142** |
| Carrying a `verseId` | **49** |
| Ref present **and** anchored | 44 |
| **Printed refs that produce no anchor** | **~69%** |

Position on the page does not explain it (32/92 line-1 refs anchored vs 12/50 line-2 refs) — so
the line-wrap hypothesis I formed and tested is **rejected**; the extractor is unreliable
regardless.

**CAUSE.** Two, compounding:
1. **`epigraphAnchor`** (`src/ingest/adapter-gutenberg.ts:87-93`) takes the first 6 lines, runs
   `romaniseEpigraph`, and keeps **`refs[0].ranges[0]` — the first reference only**.
   `romaniseEpigraph` rewrites only the **Roman** form (`Gal. vi. 14`); Watts's Gutenberg edition
   prints the **arabic-dot** form (`Gal. 6. 14`), which is passed through unchanged. Multi-ref
   headers (`Gen. 17. 7 10. Acts 16. 14 15 33.`) lose everything after the first.
2. **Duplicate editions.** Three overlapping Watts works are published — `watts-hymns` (434
   sections), `watts-psalms` (428), `watts-psalmshymns` (731) — one anchored, two not (§17.8).

**TREATMENT CLASS: (c) ingest — re-run anchoring with an arabic-form-aware, multi-ref extractor.**
Not (a): 511 sections across the register print refs, and hand-editing them is the
hand-maintained-set defect this repo has hit fifteen times.

**BLAST RADIUS.** Across published hymn/poetry: **511 sections** carry a printed ref with no
anchor (`watts-psalms` 352, `watts-hymns` 148, `scottish-psalter-1650` 10,
`montgomery-sacred-poems` 1). Fixing the extractor also changes what the song/verse lane
retrieves on-range.

**RISK: medium — this one changes results and needs the eval.** New anchors change which hymns
surface at which verses. Note also that a chapter-level anchor is what the successes produce
(`Job 19. 25-27.` → `18019001`, i.e. Job 19:**1**), so precision is coarse and the re-run should
measure that, not just count anchors.

**Before any of it:** decide the duplicate-edition question (§17.8). Anchoring three overlapping
Watts editions triples one author's presence in the lane.

---

## 6. A048 [MAJOR] — Passage search omits the Hymns & Sacred Poetry lane

**VERDICT: REAL as an observation, MIS-ATTRIBUTED as a cause. Fixing the filter the finding
implicates would surface exactly zero additional rows.**

**MEASUREMENT — the code path, traced end to end.**
`web/src/app/library/passages/page.tsx:312` → `/api/search/commentaries`
(`route.ts:65`) → `web/src/lib/commentary-search.ts:32-98`.
**The table read is `commentary_entries`** (`commentary-search.ts:59`, `:79`) — not `sections`,
not `embeddings`. Two gates, applied to both the result and the count query:
`LEGAL_COMMENTARY_ENTRIES_PREDICATE` (`legal-corpus.ts:114-118`) and `EXEGETICAL_FTS_EXCLUSION`
(`routing.ts:257`).

`EXEGETICAL_FTS_EXCLUSION` does exclude `'hymn','poetry'` by register and 29 slugs by work. **And
it removes nothing**, because on dev:

| `commentary_entries` | Value |
|---|---|
| Total rows | **371,406** |
| Rows with `register` NOT NULL | **0** |
| Rows with `work` NOT NULL | **0** |
| Rows with `register IN ('hymn','poetry')` | **0** |
| Admitted by LEGAL alone | **64,216** |
| Admitted by LEGAL **+** EXCLUSION | **64,216** |

I re-verified the `register`/`work` NULL result and the row total myself.

**CAUSE. The hymn corpus was never materialised into the table passage search reads.** It lives
in `sources` (45 published works) → `sections` → `embeddings` (**10,972 served rows**), and the
passage-search SQL touches none of those. This is a **materialisation gap on a different table**,
not a filter bug.

**The asymmetry the reporter almost certainly saw.** The *same page* renders hymns on its
**browse** half — `page.tsx:614`, `<RegisterBrowseSection title="Hymns & sacred poetry" …>` —
which reads the static JSON via `fetchCommentary` (`web/src/lib/bible.ts:118-135`), filtered by
`isPublishedCommentaryEntry`, which is work-aware and has no register exclusion. **One page, two
corpora, two boundaries: browse shows hymns, search cannot.**

**TREATMENT CLASS: (c) ingest/materialisation** — populate `commentary_entries.register` and
`.work`, then decide whether the register wall should let a *labelled* hymn lane into passage
search at all. **Not (b).** A predicate edit here is unfalsifiable: it would change no row and
could not be red-proofed.

**BLAST RADIUS: potentially the whole 371,406-row table** (a backfill of two columns), plus a UI
change — `SearchResult` (`page.tsx:30-41`) has **no `register` or `work` field**, so even if hymn
rows were admitted the UI could not lane-label them and they would blend into exegetical results.
That is precisely what the register wall exists to prevent, so **the UI change is a precondition,
not a follow-up.**

**RISK: high, and it needs a design decision before any code.** Two open questions the ledger
does not pose: does passage search get a labelled hymn lane, or stay exegesis-only? And is
`commentary_entries` still the right table, given the corpus has moved to `embeddings`?

**DEV-ONLY caveat, and it is the biggest in this document.** `legal-corpus.ts:66-70` cites a
**production** census of 114,834 admitted entries; dev admits 64,216. **If prod has `register`
and `work` populated where dev does not, A048's cause is different there.** Confirm first:
`SELECT count(*) FILTER (WHERE register IS NOT NULL), count(*) FILTER (WHERE work IS NOT NULL), count(*) FROM commentary_entries`.

---

## 7. A050 — "Ignatius" surfaces Loyola above Ignatius of Antioch

**VERDICT: NOT REPRODUCED ON DEV. Cannot be closed — needs one prod query.**

**MEASUREMENT.** The search box (`components/catalog-search.tsx:81` → `/api/search/works`) and
`/search` both delegate to one engine, `web/src/lib/search-sections.ts:144-167`. Ranking is
lexical only: `ts_rank_cd(sec.tsv, websearch_to_tsquery('english', $1))`, `ORDER BY rank DESC`.
No vector, no rerank, no author boost.

Running that ranking for `'Ignatius'` on dev, top 3:

| # | slug | rank |
|---|---|---|
| 1 | `wace-biodict` — snippet: *"Ignatius, St., bp. of Antioch … the 2nd bp. of Antioch (c. 70–c. 107)"* | **7.40** |
| 2 | `jamieson-jfb` | 0.60 |
| 3 | `wace-biodict` | 0.50 |

**Zero Loyola rows.** #1 outranks #2 by **12.3×**.

**Why Loyola cannot appear on dev:**

```
ignatius-exercises      | Ignatius of Loyola, St | theology | staged
ignatius-autobiography  | Ignatius of Loyola, St | theology | staged
```

Both **staged**, and `search-sections.ts:127` hard-asserts `AND s.status = 'published'`.

**CAUSE — two live hypotheses, and dev cannot separate them.**
1. **The two Loyola works are `published` on prod.** Then it is a genuine ranking/content
   collision and the fix is real.
2. **The reporter saw something else** — e.g. `nutter-hymnwriters` (which mentions Loyola) or the
   18 published sections that mention Loyola incidentally inside Schaff/Maclaren/Hodge.

**TREATMENT CLASS: UNDETERMINED — (b) ranking if hypothesis 1, else no action.**

**The one query that decides it, at the terminal:**
`SELECT slug, status FROM sources WHERE slug IN ('ignatius-exercises','ignatius-autobiography');`

**BLAST RADIUS: 2 source rows** if the fix is a status change; a ranking change if not.

**RISK: the real risk here is closing it as "not reproduced" on dev evidence.** Note the
adjacent, separately-true fact: Ignatius of **Antioch** is present only as *secondary* material
(biographical dictionary entries, catena excerpts). See A057.

---

## 8. A036 — θεός (G2316) gloss shows "figuratively" instead of a meaning

**VERDICT: REAL. Cause is upstream, not ours. Contained to a handful of entries — one of which is
arguably the single most-looked-up word in the lexicon.**

**MEASUREMENT.** `web/public/lexicon/greek.json`, entry `G2316`, verbatim:

```
"def":        "figuratively, a magistrate; by Hebraism, very"
"derivation": "of uncertain affinity; a deity, especially (with G3588 (ὁ)) the supreme Divinity;"
"kjv":        "X exceeding, God, god(-ly, -ward)"
```

The primary sense — *"a deity, especially … the supreme Divinity"* — is in **`derivation`**, and
the figurative tail is in **`def`**.

**CAUSE — measured, not inferred. Our pipeline does not split anything.**
`src/ingest/ingest-strongs.ts:47-56` is a straight field copy:
`def: (raw.strongs_def ?? '').trim()`, `derivation: (raw.derivation ?? '').trim()`. There is no
splitting code in the repo. **The mis-assignment is in the upstream openscriptures Strong's data**
and our ingest reproduces it faithfully.

**Class size, both dictionaries (5,523 Greek + 8,674 Hebrew = 14,197 entries):**

| Probe | Greek | Hebrew |
|---|---|---|
| `def` opens with a continuation marker (`figuratively`, `by Hebraism`, `specially`, …) | 14 | 14 |
| `def` opens literally with `"figuratively"` | 4 | 7 |
| **Strict class** (`derivation` has ≥2 clauses **and** `def` opens as a continuation) | **1** (`G2316`) | **2** (`H982`, `H6049`) |

**The user impact is smaller than it reads.** `word-panel.tsx:117-119` renders `derivation` as a
"Derivation" row directly under "Definition", so the correct sense **is** on screen — mislabelled
and de-emphasised (14px grey vs 18px), not absent.

**TREATMENT CLASS: (a) data — a small curated override, OR a display-layer rule.** Three options,
cheapest first:
1. **Override table** for the 3 strict-class entries. Smallest, most honest, no eval.
2. **Display rule**: when `def` opens with a continuation marker, render `derivation + def` as one
   Definition. General, but it changes 28 entries' rendering and needs each one eyeballed.
3. **Re-source** from a better-segmented Strong's. Largest; nothing measured justifies it.

**BLAST RADIUS: 3 entries** (option 1) or **28** (option 2), of 14,197.

**RISK: low.** Lexicon data is served by no retrieval lane — `routing.ts:231` records `lexicon` as
"served by nothing; no lane exists". **No eval.** But per the non-negotiables, a curated gloss is
an authority-grounded input: take it from a published Strong's edition, not from memory.

---

## 9. A052 — "Amazing Grace" has no scripture heading in this edition

**VERDICT: REAL, and it is the whole edition, not this hymn. The manifest asserts the opposite.**

**MEASUREMENT.** `sections.id = 77214`, `olney-hymns`, heading
`41. Amazing grace! (how sweet the sound)`. Body opens `Hymn 41 / John Newton / 8,6,8,6 /
Amazing Grace! / Amazing grace! (how sweet the sound) …` — a descriptive title, **no scripture
header**. Newton's 1779 printed header (*"Faith's review and expectation. 1 Chron. xvii. 16, 17."*)
is absent from the ingested text.

Across **all 416** `olney-hymns` sections: **0 headings and 0 bodies** carry a scripture-looking
reference (strict book-abbrev + numeral regex, arabic and Roman). A looser regex produced 17
"hits", all false positives (`Je**ri**cho`, `**rev**ea**l**`, `**Jo**shua`).

**The manifest claims otherwise.** `ingest/sources.config.json` records for `olney-hymns`:
`"edition": "Olney Hymns 1779 (CCEL) — Book I is Scripture-indexed"`. **Measured: it is not** —
0 of 416. That is a provenance record contradicted by the data it describes, and it is the shape
this repo's watchlist names: a documented fact cited forward without re-reading the current state.

**CAUSE.** The CCEL edition ingested does not carry the scripture headers, or they were dropped in
acquisition. Which of the two is **undetermined** and is the same one-command check as A053:
compare against the CCEL source.

**TREATMENT CLASS: (c) re-source, or (d) out of reach — undetermined until that check.** If CCEL
carries the headers, our acquisition dropped them → (c). If it does not, a different PD edition of
Olney Hymns 1779 is needed → (c) with a source hunt, and (d) if none is reachable.

**BLAST RADIUS: 416 sections**, one work — every Olney hymn, not just Amazing Grace.

**RISK: low to investigate.** Separately and regardless: **correct the manifest's
"Scripture-indexed" claim**, which is false today and will mislead the next reader.

---

## 10. A056 / A057 / A067 — "It Is Well" absent · no Ignatius primary text · Historians holds one work

**VERDICT: ALL THREE REAL. All three are the same underlying fact — the manifest is far ahead of
the database — and none is "out of reach".**

### A067 — Historians catalog holds exactly one work

`SELECT slug,title,status FROM sources WHERE source_type='historian'` → **1 row**,
`josephus-whiston`, published.

The manifest holds **41** `source_type: historian` entries, **all licensed Public Domain**: the
8-volume Schaff *History of the Christian Church*, 7 Renan volumes, Edersheim, Bede, Gibbon, Knox,
4 Bangs volumes, Martyrs Mirror, and more. Intersecting all 41 against `sources` returns
**exactly 1**.

**So the shelf is 1 because 40 were never ingested — NOT because they are staged.** This corrects
`routing.ts:120-122`, which states "the other manifest historians are serve:false or uningested".
Manifest entries carry **no `serve` key at all**; the measured truth is **uningested**.

Context: the DB holds 175 sources against 914 manifest entries — **~739 manifest works are
uningested**, and the historians are a near-total instance of that gap.

### A057 — no primary-source Ignatius of Antioch

**`schaff-anf01`** — *"ANF01. The Apostolic Fathers with Justin Martyr and Irenaeus"*, the volume
carrying Ignatius's seven letters — **is in the manifest, licensed Public Domain, and absent from
the database in every state.** Not published, not staged, not quarantined. Of 26 manifest `father`
entries only 8 are ingested; **no ANF volume (01–05) is ingested at all.**

Searching published bodies for `to the Magnesians` / `to the Trallians` / `to the Smyrnaeans` /
`Epistle to Polycarp` returns **6 sections**, all bibliographic citation or discussion, none the
letter text.

**A nuance worth its own line:** `commentary_entries` holds **246 entries attributed to "Ignatius
of Antioch" across 28 books** (catena-style excerpts). But he is not on the published-author
allowlist, so **0 of the 246 are reachable in passage search.** Present in the table, invisible on
every surface.

### A056 — "It Is Well with My Soul" absent

| Probe (all sections, all statuses) | Result |
|---|---|
| body `ILIKE '%Spafford%'` | **0** |
| body `ILIKE '%it is well with my soul%'` | 1 — `jowett-brooks`, **staged**, prose quoting the refrain |
| body `ILIKE '%peace like a river%'` | 24 — all Isaiah 66:12 allusions, unrelated |

**Licensing is not the blocker** — Spafford 1873 is PD. The blocker is that **no general American
gospel hymnal is in the manifest**. All 32 manifest `hymn` entries are Olney, Scottish Psalter,
Watts ×3, nine Brownlie Greek/Eastern volumes, the German-translation set
(Winkworth/Borthwick/Bevan), Neale, Prudentius, Chatfield, five hymnological *studies*, and four
national collections. All 32 are ingested and published, so the 0 hits above are a **complete
measurement over the hymn shelf, not a sample.**

**TREATMENT CLASS: (c) ingest — all three.** None is (d).
- A067 → ingest from the 40 manifest historians. **Prove deep before wide: one volume first.**
- A057 → ingest `schaff-anf01`. Already in the manifest, already PD-licensed.
- A056 → **acquisition decision first** (which PD gospel hymnal), then ingest. This one is (c)
  *pending a source decision*, and is the only one of the three that needs a new manifest entry.

**BLAST RADIUS: large and additive.** New works, new sections, new embeddings. Additive ingestion
does not rewrite existing rows, which makes it the safest large change on this list — but every
new served work changes what /ask retrieves.

**RISK: medium.** Licensing fails closed: per-work text-match to a PD reference before decode, per
`INGESTION_RUNBOOK.md`. Each new served work needs the accuracy diagnostic. **Do not batch 40
historians into one run** — the `overnight-run` and `quality-slice` disciplines both say one
correct vertical slice first.

---

## 11. A058 — Song of Songs commentary thin in Passage search

**VERDICT: REAL and UNDERSTATED. Not thin — EMPTY, uniquely among all 66 books. And the content
exists; it is on the other table.**

**MEASUREMENT.** In `commentary_entries` (what passage search reads), under the shipped
predicates:

| Book | # | Admitted entries | Distinct authors |
|---|---|---|---|
| **Song of Songs** | **22** | **0** | **0** |
| Ruth | 8 | 194 | 4 |
| Ecclesiastes | 21 | 463 | 3 |
| Romans | 45 | 1,271 | 4 |
| John | 43 | 2,407 | 6 |
| Psalms | 19 | 5,011 | 4 |

**Book 22 is the only book of 66 with zero admitted entries** (verified by
`generate_series(1,66)` anti-join).

**Why zero — I re-measured this myself.** Book 22 holds **1,745 raw rows** across 52 author
strings. Only **206** match a published-author string (Wesley 108 · Barnes' Notes 90 · Calvin 8),
and **all 206 carry forbidden provenance**, killed by the `NOT_FORBIDDEN_PROVENANCE` leg. (1,404
of the 1,745 book-22 rows are forbidden-provenance overall.) Gill, Henry, Clarke and JFB have
**zero rows in book 22** — never ingested for this book, not filtered out.

**The correction that matters — and it inverts the diagnosis.** A measurement agent reported
`gill-song` as having **0 embeddings**. **That is wrong.** Verified three ways:

```
gill-song: 1,942 embeddings · 1,942 served=true · 123 sections
sample: source_id 'commentary:gill-song:16.1', verseId 22001015  (Song 1:15)
```

**So `gill-song` is fully live for /ask** — served, vector-retrievable, verse-anchored into book 22
— **and completely invisible to passage search**, because it has **0 rows in `commentary_entries`**
(that table's `work` column is 100% NULL, §6).

The browse pane on the same page shows **238** static entries for Song of Songs
(`gill-song` 123 · Wesley 89 · `spurgeon-sermons` 17 · `flavel-works` 3 · `olney-hymns` 2 ·
`owen-works` 2 · `schaff-creeds` 1 · `donne-divine-poems` 1).

**CAUSE. Not a content gap — a surface gap.** Same root as A048: `commentary_entries` was never
materialised from the register/work-slug corpus. The 2026-08-12 owner ruling ("Song of Solomon,
fix it") **did** land: it fixed the reader and /ask. It never reached passage search, and nothing
noticed because no check compares the two surfaces' book coverage.

**TREATMENT CLASS: (c) materialisation** — same job as A048; these are **one slice, not two**.

**BLAST RADIUS: 123 sections / 1,942 embeddings** for `gill-song` specifically; the general fix is
A048's table-wide backfill.

**RISK: low for the Song specifically, high for the general fix** (see A048). A cheap,
well-scoped first slice: materialise `gill-song` alone into `commentary_entries` and re-measure
book 22 — a real vertical slice that proves the mechanism before the 371,406-row backfill.

---

## 12. B031 — Historical Background lane returns irrelevant Josephus excerpts

**VERDICT: REAL. The mechanism is stronger than "incidental token 'John'" — this is the lane's
designed behaviour, not an edge case. And two source comments state the opposite of what runs.**

**MEASUREMENT — the path.** `teach.ts:187` → `retrieveHistorianLane` (`retrieve.ts:141-142`) →
`retrieveRegisterLane` (`retrieve.ts:104-132`) with
`HISTORIAN_CORPUS_FILTER = '(served AND source_type = ''historian'')'` (`routing.ts:245`).
`LANE_LIMIT = 3` (`routing.ts:386`). **Pure vector**: a single cosine ANN
(`ORDER BY embedding <=> $1::vector`) over `idx_embeddings_served_historian`. No lexical leg, no
RRF, no rerank.

**Is there a relevance floor? No. None, anywhere.** `retrieve.ts:121-131` in full:

```ts
const onRange = ranges.length > 0 ? hydrate(...laneOnRangeSql...) : [];
if (onRange.length >= limit) return onRange.slice(0, limit);
const fill = hydrate(...lanePoolSql...);
const seen = new Set(onRange.map((c) => c.sourceId));
return [...onRange, ...fill.filter((c) => !seen.has(c.sourceId))].slice(0, limit);
```

`score` is computed only to be reported, never to gate. Downstream, `teach.ts:200` is
`if (historians.length > 0)` — length only. **The sermon and theology lanes are identical**
(`retrieve.ts:134-137`, same `retrieveRegisterLane`, only the corpus filter differs), so all three
are floorless. The **exegetical** path is different: it reranks with a cross-encoder
(`retrieve.ts:180`) and gates on `hasPassageCoverage` (`teach.ts:207`), returning
*"Our corpus has no commentary on X yet."* The lanes have no analogue of either.

**Why it fires, measured** (I re-verified these):

| `embeddings WHERE source_type='historian'` | Count |
|---|---|
| Rows | **6,492** |
| `served = true` | **6,492 (100%)** |
| `verseId > 0` (a real anchor) | **493 (7.6%)** |
| **`verseId = 0` (unanchored)** | **5,999 (92.4%)** |
| **In the John 10 band (43010001–43010042)** | **0** |
| Anywhere in the book of John | 10 |
| Served rows containing the token `John` | **182** |

For a John 10:11 question the on-range leg returns **0** rows, `0 >= 3` is false, and execution
falls straight through to `lanePoolSql` — **an unconstrained global top-3 nearest-neighbour scan
over all 6,492 Josephus chunks, with no verse constraint, no floor, and no rerank.** The 182
`John`-bearing chunks (Gischala, the Baptist, Hyrcanus) are exactly the pool that wins that scan.
**The reported failure is what the code is written to do.**

**Two source comments are false and would stop the next reader diagnosing this:**
- `retrieve.ts:138-140`: *"Serves nothing until the owner-gated `served` flip lands on historian
  rows — every row the filter could match is served=false until then, so this returns [] by
  construction."*
- `teach.ts:185-186`: *"until the owner serve-flip lands on historian rows it returns [] and no
  `historians` payload is attached."*

**Both false: all 6,492 historian rows are `served=true`.** The flip landed; the lane is live.

**CAUSE.** (i) no relevance floor on any register lane; (ii) 92.4% of the historian corpus is
unanchored, so the on-range leg almost never fires; (iii) the corpus is one work, so the top-3
is always Josephus no matter the question.

**TREATMENT CLASS: (b) retrieval config — a relevance floor on the register lanes.** The
smallest general mechanism: a minimum score below which a lane returns `[]` and renders nothing,
rather than always shipping its top-3. Note this is the **same floorless-fallback shape** as the
song/verse lane (§17.5), so **fix it once for all three lanes**, not once for historians.

**BLAST RADIUS: all four register lanes** (sermon, theology, historian, song/verse) on every /ask.
Code-only — zero data rows touched.

**RISK: high — this is the single riskiest item on the list and must not be batched.** A floor is
a threshold, and a threshold picked by eye is tuning to the demo. It must be **pre-registered**
against a held-out set before the number exists (`quality-slice` step 5), because the failure mode
is symmetric: too low and the noise stays, too high and lanes go silent where they were useful.
**Carries the accuracy diagnostic and `interpretation_bait` through the live loop** — lanes are
quoted, attributed content, so changing what they surface touches the guarantee surface.

**Also fix, and it costs nothing:** the two false comments.

---

## 13. `gill-song` — `unassigned` tradition lets one author satisfy both G1 floors

**VERDICT: REAL, and worse than stated. It is not only the tradition — the SAME MAN carries TWO
DIFFERENT AUTHOR STRINGS in the served pool.**

**MEASUREMENT — the artifact the floor actually reads.** `selectVoices` (`teach.ts:111-116`) and
the reported `traditions` count (`teach.ts:214-229`) read
**`embeddings.metadata->>'tradition'`**, not `sources.tradition`. Measured on served rows:

| `metadata->>'work'` | `metadata->>'author'` | `metadata->>'tradition'` | served rows |
|---|---|---|---|
| `john-gill` | **`John Gill`** | **`Reformed Baptist`** | **28,843** |
| `gill-song` | **`Gill, John`** | **`unassigned`** | **1,942** |

**So on a Song of Solomon question, one man can supply two voices, two author names, and two
traditions.** `selectVoices` computes `new Set(...tradition)` by **exact string equality**, so
`Reformed Baptist` ≠ `unassigned` → the ≥2-traditions condition is satisfied by John Gill alone.
The differing **author string** is the sharper half: it also defeats the per-author diversity cap
(`routing.ts:544`), and it means the rendered attribution shows a reader two distinct names.

**Confirmed as stated:** `gill-song` is the only slug among the 40 named in `routing.ts` whose
manifest tradition is `unassigned`.

**But `unassigned` is not rare in the served pool** — it is **62,470 served rows**, the second
largest tradition bucket, spread across Calvin (13,146 rows over 16 `calvin-calcom*` works),
`jamieson-jfb` (9,878), Schaff (5,271), `gill-song` (1,942), `spurgeon-comment` (71).

**CAUSE.** Two independent metadata defects on the same row set: an unset `tradition`, and an
inconsistent `author` name format (`Surname, Given` vs `Given Surname`) between two ingests of
one author.

**TREATMENT CLASS: (b) — this is a metadata edit that CHANGES RESULTS, so it is not (a).**
Setting `gill-song`'s tradition to `reformed`/`Reformed Baptist` and its author to `John Gill`
makes `selectVoices` collapse the two into one voice — which is the point, and it means some
Song of Solomon answers will lose a voice and may fall below the ≥2 floor. **That is a retrieval
change and carries the accuracy diagnostic.**

**BLAST RADIUS: 1,942 embedding rows + 1 source row** for `gill-song` alone. The general fix
(author-string normalisation across the served pool) is larger and should be scoped separately —
see §17.3 and §17.4 for two more instances already in the data.

**RISK: medium.** The correct fix may not be "set the tradition". A cleaner general mechanism is
to make the floor count **distinct authors after normalisation**, rather than trusting two free-text
metadata fields to be consistent — which is the hand-maintained-set defect this repo has hit
fifteen times. **That is a design decision and belongs in step 2, not here.**

**Owner call embedded here:** what tradition does Gill's *Exposition of the Song* carry? Gill is a
Particular (Reformed) Baptist; `john-gill` already says `Reformed Baptist` in the embeddings and
`reformed` in `sources`. Those two disagree (§17.2), so "match the other one" is not a
well-defined instruction until that is settled.

---

## 14–16. Rows carried without a separate section

- **A051** (source count 9 vs dropdown 10) is already **Done** (`3d72cd0`) — relabel only.
  Reproduced here: the 9 is `web/public/commentaries/_manifest.json` (28 raw sources) filtered by
  `isPublishedAuthor` (`bible.ts:161`); exactly 9 survive. See §17.12 for a defect in that filter.
- **B003** (lopsided corpus can read like a verdict) is a design think, correctly not a defect.
- **A054** (hymnal ToC scripture filter) is filed as a feature, and this diagnosis agrees — but
  note it is **blocked by A047**: a scripture filter over an unanchored hymnal has nothing to
  filter on.

---

## 17. Found while measuring — NOT in the ledger

Ordered by severity. Every one is measured.

### 17.1 The A064 defect class is ALSO live on the /ask ≥2-traditions floor — and *that* copy changes results

The ledger files A064 as "pure metadata, contained, **no eval needed**". True for the library chip.
**Not true for the class.** `embeddings.metadata->>'tradition'` on **served** rows has three
case-collision groups:

| Collision | Forms | Served rows |
|---|---|---|
| methodist | `Methodist` / `methodist` | **26,633** |
| patristic | `Patristic` / `patristic` | **13,971** |
| nonconformist | `Nonconformist` / `nonconformist` | **6,367** |

**46,971 served rows.** `selectVoices` (`teach.ts:112`) counts distinct traditions by exact string
equality, so **`Patristic` and `patristic` count as two traditions**. Concretely: **Augustine of
Hippo is served under `patristic` (3,723 rows, `augustine-homilies`) AND `Patristic` (1,336 rows,
author-level)** — one man, two traditions, both live. Chrysostom likewise (8,840 / 72).

**This is the gill-song defect in a second costume, at 24× the row count.** Normalising the case
can only *reduce* distinct-tradition counts, which can only *increase* how often the swap at
`teach.ts:114-116` fires → **it changes composed output → it carries the accuracy diagnostic.**

### 17.2 There are THREE independent copies of `tradition`, and they disagree

`sources.tradition` (library chips) · `embeddings.metadata->>'tradition'` (the /ask floor) ·
`commentary_entries.tradition` (passage search). No derivation between them. Measured disagreement
on **6 works / 51,697 served rows**:

| work | embeddings | sources | rows |
|---|---|---|---|
| `john-gill` | `Reformed Baptist` | `reformed` | 28,843 |
| `adam-clarke` | `Methodist` | `methodist` | 12,693 |
| `wesley-crosswire` | `Methodist` | `methodist` | 5,254 |
| `matthew-henry` | `Nonconformist` | `nonconformist` | 4,210 |
| `olney-hymns` | `anglican` | `Anglican-Evangelical` | 416 |
| `keble-christian-year` | `anglican` | `Anglican` | 281 |

Note the inversion on the last two: the **embeddings** copy is already normalised and the
**sources** copy is the fragmented one. So A064 and §17.1 are **different rows needing opposite
edits**, and "fix the capitalisation" as a single instruction would be ambiguous.

### 17.3 A latent duplicate-author defect is pre-loaded behind a serve flip (Barnes)

| author | work | tradition | served | rows |
|---|---|---|---|---|
| `Albert Barnes` | `barnes-crosswire-nt` | **`presbyterian`** | **false** | 17,490 |
| `Albert Barnes` | *(none)* | **`Presbyterian`** | **true** | 6,850 |

Same author string, **two traditions differing only in case**, one served and one not. **The
moment `barnes-crosswire-nt` is flipped served, Albert Barnes alone satisfies the ≥2-traditions
floor** — gill-song's defect, armed and waiting. Fix the vocabulary *before* the next flip, not
after.

### 17.4 `jamieson-jfb` is served, and a routing comment says it deliberely is not

`routing.ts:88-90` states jamieson-jfb is kept out of `SERVED_PROSE_WORKS` because serving it
would "double-count JFB against 'Jamieson, Fausset & Brown' … a two-voices-one-text inflation."

Measured:

| author | work | tradition | served | rows |
|---|---|---|---|---|
| `Jamieson, Fausset & Brown` | `jfb` | `Presbyterian` | **false** | 15,473 |
| `Jamieson, Robert` | `jamieson-jfb` | **`unassigned`** | **true** | **9,878** |

The double-count is avoided — but by the **serve flip**, not by the list the comment credits, and
the served copy is the one carrying a **different author string and `unassigned`**. Same shape as
gill-song, on a work 5× larger.

### 17.5 The song/verse lane is floorless too, and its curated core is largely unanchored

Same structure as B031. Measured on served hymn/poetry embeddings:

| Metric | Value |
|---|---|
| Served rows | **10,972** |
| With `verseId > 0` | **2,950 (26.9%)** |
| **Unanchored** | **8,022 (73.1%)** |

Per work in the curated 17-slug list: `milton-poetical-works` 0/903 · `dante-divine-comedy` 0/620
· `traherne-poems` 0/412 · `hopkins-poems` 0/167 · `tennyson-in-memoriam` 0/148 ·
`herbert-temple` 2/246 · `rossetti-verses` 1/241 · `watts-hymns` 57/434. So the on-range leg
rarely fires and the same floorless global top-k fallback runs. **Fix the lane floor once for all
four lanes** (B031).

*(Methodological note: `section_anchors` and `embeddings.metadata->>'verseId'` disagree —
`watts-psalms` is 0/428 in the first and 401/428 in the second. The lane reads the second. An
earlier draft of this diagnosis reported the first and would have been measuring an artifact the
code never touches. `quality-slice` step 0, in this document.)*

### 17.6 30 works / 5,749 rows serve in the song/verse lane that `routing.ts` does not name

`SERVED_SONG_VERSE_WORKS` lists 17 slugs. Measured served hymn/poetry: **45 works / 10,972 rows** —
**30 works / 5,749 rows (52% of the lane) are served but unnamed**, including `watts-psalmshymns`
(913), `longfellow-s-bookhymns` (599), `hewitt-gerhardt` (411), `nutter-hymnwriters` (407),
`reeves-hymnlit` (383), `hort-james1909` (344).

The list is a **live gate on tables where the matching data is NULL** (§6) and a **non-gate on the
table where the data actually is** — while its own comment says "Do not prune."

### 17.7 ~20% of the song/verse lane is not sacred verse at all

Eight served works in the hymn/poetry register are **books about hymns**, not hymnals:

| work | what it is | served rows |
|---|---|---|
| `hewitt-gerhardt` | monograph on Gerhardt's influence | 411 |
| `nutter-hymnwriters` | biographical dictionary | 407 |
| `reeves-hymnlit` | literary criticism | 383 |
| `hort-james1909` | Greek commentary on James (§3) | 344 |
| `winkworth-hyndwink` | **index** of translations | 341 |
| `manning-wesleyhymns` | five academic papers | 201 |
| `bett-methhymns` | literary study | 96 |
| `brownlie-hyndbrow` | **index** of translations | 47 |

**2,230 of 10,972 served rows (20.3%).** Two of them are *indexes* — lists of first lines — which
as retrieved "sacred poetry" quotes are pure noise. This is A055's class, and it is 8 works wide,
not 1.

### 17.8 Watts is in the corpus three times

`watts-hymns` (434 sections / 434 served) · `watts-psalms` (428 / 428) · `watts-psalmshymns`
(731 / 913) — **1,593 sections, 1,775 served embeddings**, overlapping content, one anchored and
two not (§5). Same double-counting shape as john-gill/gill-song, on the hymn side. Settle this
before re-anchoring anything (A047).

### 17.9 `EXEGETICAL_FTS_EXCLUSION` currently excludes zero rows — a wall that cannot fail

Both legs are no-ops on `commentary_entries`: `register` is **100% NULL** (371,406/371,406) and
`work` is **100% NULL**. LEGAL-alone and LEGAL+EXCLUSION both admit **64,216**. Per
`THE_LOOP.md` §6 a check that cannot fail proves nothing — and this is the register wall on the
passage-search surface. **DEV-ONLY**: if prod has those columns populated the wall is real there.
Same query as §6.

### 17.10 `commentary_entries` holds copyrighted and MUST_NOT_SERVE material, gated only by not being named

Among its 415 author strings: **Tyndale Study Notes 15,161** · **Origen of Alexandria 2,672**
(standing MUST_NOT_SERVE) · **CS Lewis 1,172** · **GK Chesterton 714** · Douglas Wilson 16 ·
JRR Tolkien 11. `routing.ts` records that this cohort is excluded from *vector* retrieval because
`served` defaults false — **but `commentary_entries` has no `served` column** (schema verified),
and its `work` column is entirely NULL, so the work-slug leg admits nothing. They are excluded by
**not appearing on an 8-name author allowlist** — "unnamed", which `routing.ts:288-294` itself
argues is strictly weaker than "unreachable". Not currently leaking; worth an explicit ruling
before that table is backfilled for A048/A058, since the backfill is what would change it.

### 17.11 `web/public/commentaries/_manifest.json` is badly stale

Lists **28** sources; the shipped JSON actually contains **1,003** distinct `sourceTitle` values
across 162,376 entries. It also claims `Hymns and Spiritual Songs` = **391** entries while **53**
ship. `generatedAt: 2026-08-01T22:16:33.890Z`. It is what the passage-search header counts (A051).

### 17.12 `isPublishedAuthor` is author-only where its sibling is work-aware

`legal-corpus.ts:152-157` checks the author allowlist and **never consults the work slug**, unlike
`isPublishedCommentaryEntry` (`:134-149`). It therefore drops 19 manifest sources including every
register work — Herbert, Watts, Wheatley, Newton & Cowper, Keble, Montgomery, Neale, Rossetti —
**plus Keil & Delitzsch and Catena Aurea, which are served prose works.** So the "9 sources"
header understates the library on the same page whose browse pane renders those very works.

---

## 18. Verdict summary

| ID | Verdict | Cause | Class | Blast radius | Eval? |
|---|---|---|---|---|---|
| A064 | REAL | metadata value | **a** | 1 source row | no |
| A065 | REAL | metadata value | **a** | 3 (or 9) source rows | no |
| A055 | REAL (worse) | wrong `source_type` + ingest text damage | **a+c** | 1 source · 344 emb · 5 sections | **YES** |
| A053 | REAL (singleton) | **undetermined** — upstream or ours | **a or c** | 1 section, or unbounded | no |
| A047 | **PARTLY** — link exists on a duplicate edition | anchor extractor + duplicate editions | **c** | 511 sections | **YES** |
| A048 | REAL but **mis-attributed** | materialisation gap, not a filter | **c** (+UI) | up to 371,406 rows | **YES** |
| A050 | **NOT REPRODUCED** on dev | undetermined — needs prod | **b or none** | 2 source rows | maybe |
| A036 | REAL | **upstream** data, faithfully copied | **a** | 3 of 14,197 entries | no |
| A052 | REAL (whole edition) | source edition or acquisition | **c/d** | 416 sections | no |
| A056 | REAL | no PD gospel hymnal in the manifest | **c** | new work | **YES** |
| A057 | REAL | `schaff-anf01` uningested | **c** | new work | **YES** |
| A067 | REAL | 40 of 41 historians uningested | **c** | new works | **YES** |
| A058 | REAL, **understated** (0, not thin) | surface gap; content is live on /ask | **c** | 123 sections / 1,942 emb | **YES** |
| B031 | REAL | **no relevance floor on any lane** | **b** | all 4 lanes, every /ask | **YES** |
| gill-song | REAL (worse — author string too) | metadata, two fields | **b** | 1,942 emb + 1 source | **YES** |

---

## 19. Recommended order of work

Grouped by treatment class, cheapest and safest first. **Nothing below is authorised by this
document** — it is the input to step 2.

### Batch 0 — free, do first, no gate (documentation truth)
Costs nothing, prevents the next session mis-diagnosing:
1. Correct the two false comments at `retrieve.ts:138-140` and `teach.ts:185-186` (the historian
   lane is live, not `[]`).
2. Correct `routing.ts:120-122` ("serve:false or uningested" → **uningested**; the manifest has no
   `serve` key).
3. Correct the `olney-hymns` manifest claim "Book I is Scripture-indexed" (measured: 0 of 416).
4. Correct `routing.ts:88-90` on jamieson-jfb (§17.4).

### Batch 1 — class (a), pure metadata, NO eval
5. **A064** — `Anglican` → `anglican` (1 row). `Anglican-Evangelical` → owner call, held back.
6. **A065** — normalise 3 Manton titles. **Confirm they are published on prod first.**
7. **A036** — curated override for `G2316` (+ `H982`, `H6049`), from a published Strong's edition.

### Batch 2 — investigation, no code (cheap, decides two treatments)
8. **A053** — fetch PG #13341, grep `Col. 9. 16`. Upstream → (a). Ours → the class is not 1.
9. **A052** — compare the CCEL Olney text against the 1779 headers. Decides (c) vs (d).
10. **A050** — one prod query on the two Loyola slugs' status. Decides everything about this row.
11. **A048/A058 prod check** — is `commentary_entries.register`/`.work` populated on prod?

### Batch 3 — class (b), retrieval config, **each carries the accuracy diagnostic**
Do these **one at a time**, never batched, each with its own frozen-set re-run:
12. **§17.1 + §17.2 + gill-song + §17.3 + §17.4 — the tradition/author vocabulary, as ONE slice.**
    They are one defect (free-text identity fields trusted by an equality check) with five
    instances. Fixing gill-song alone leaves 46,971 rows of the same bug live. **Design first:**
    normalise the data, or make the floor count normalised distinct authors? That is a design
    decision under `quality-slice` step 8.
13. **B031 + §17.5 — the register-lane relevance floor, for all four lanes.** Highest risk on the
    list. **Pre-register the bar before the number exists.** Carries the accuracy diagnostic **and**
    `interpretation_bait` through the live loop.

### Batch 4 — class (c), ingest/re-source, additive
14. **A055** — unserve the 344 Hort rows **first** (stops the register breach at once), then
    re-source, then re-type. Never type-promote damaged text into the voice pool.
15. **§17.7** — owner ruling on the 8 books-about-hymns (2,230 rows, 20% of the lane). Probably a
    new `source_type`, not a deletion.
16. **A057** — ingest `schaff-anf01`. Already manifested, already PD. One work.
17. **A067** — historians, **one volume first**, then widen.
18. **A056** — acquisition decision (which PD gospel hymnal), then ingest.
19. **A047 + §17.8** — settle the triple-Watts question, then fix the anchor extractor
    (arabic-form-aware, multi-reference), then re-anchor and re-measure.
20. **A058 vertical slice** — materialise `gill-song` alone into `commentary_entries`, re-measure
    book 22. Proves the mechanism before A048's table-wide backfill.
21. **A048** — the full materialisation, **after** its design decision and **with** the
    `SearchResult` register/work fields, which are a precondition not a follow-up.

### Not scheduled — needs an owner ruling before it can be ordered
- **§17.10** — the `commentary_entries` copyrighted/MUST_NOT_SERVE cohort. Ruling needed
  **before** the A048 backfill, because the backfill is what would change its reachability.
- **§17.6** — is the 17-slug `SERVED_SONG_VERSE_WORKS` list still meaningful, given 52% of the
  lane is served without it?

---

## 20. Which items need the accuracy diagnostic re-run

**Explicitly YES** — these change what the pipeline retrieves or ranks:

| Item | Why |
|---|---|
| **A055** | drops 344 rows from the song/verse lane; may add them to the exegetical pool |
| **A047** | new verse anchors change on-range hymn retrieval |
| **A048** | changes the passage-search result set corpus-wide |
| **A058** | same table, same surface |
| **A056 / A057 / A067** | every newly served work changes /ask retrieval |
| **B031 + §17.5** | a lane floor changes what four lanes return on every ask — **also `interpretation_bait` through the live loop** |
| **gill-song + §17.1 + §17.2 + §17.3 + §17.4** | changes which voices `selectVoices` picks and how the ≥2-traditions floor counts |
| **§17.7** | changes song/verse lane membership |

**Explicitly NO** — data hygiene with no retrieval path:

| Item | Why |
|---|---|
| **A064** | `sources.tradition` feeds library chips only; /ask reads a different column |
| **A065** | title strings feed catalog sort order only |
| **A036** | `lexicon` is served by no lane (`routing.ts:231`) |
| **Batch 0** | comments and provenance prose |

**UNDETERMINED until Batch 2 runs:** A053, A052, A050.

---

## 21. What this diagnosis does NOT establish

Named explicitly, because an unstated limit reads as a covered one:

1. **No production read was taken.** Every DB number is dev. Findings resting on the manifest or
   shipped code (A065, A055's type, A036, A057, A067, A056, B031's code path, A048's code path)
   are environment-independent. **Everything else needs the stated prod query before it is closed.**
2. **No page was loaded in a browser.** A047's UI half — whether the hymnal reader offers a link
   the QA session could have followed — is unverified. Per CLAUDE.md's Definition of Done, no UI
   claim here is complete.
3. **The /ask pipeline was not executed end to end.** B031's conclusion is derived from the SQL the
   code builds plus the measured `verseId` distribution. That is sufficient to prove the on-range
   leg returns 0 rows and the floorless pool takes over; it is **not** an observed bad answer.
4. **A053's origin is undetermined** and I declined to guess it. One command settles it.
5. **No eval was run.** No number here is an accuracy number.
