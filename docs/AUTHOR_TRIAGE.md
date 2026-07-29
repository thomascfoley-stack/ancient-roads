# Author Triage — the corpus is yours to rule on

**Why this exists (§1, queue #4).** Until 2026-07-12 the reader served
`/commentaries/{slug}/{ch}.json` **raw** — the entire ingested corpus, unfiltered. On John 1:1 that
was **557 entries across ~57 authors**, including condemned/heretical voices and copyrighted moderns,
all wearing a tradition chip, unmarked. The published-author boundary existed
(`isPublishedCommentaryEntry`) but was **called from exactly one place: a test.**

**What I changed (mechanism only):** the reader, the library facet, and the search predicate now all
pass through the **same published-author filter** as the `/ask` DB path. Today that filter admits **9
authors**. **I did not decide who is orthodox or in-corpus — that is your call.** This document is the
list. Rule on it, and I wire the decision in.

**Immediate effect:** the reader is now *safe* (no heretics) but *over-restrictive* — **315 pre-1929,
almost-certainly-PD authors are currently served nowhere** (Matthew Poole, Geneva, Cambridge, Pulpit,
Benson, Bengel, Keil & Delitzsch…). Promoting them is the biggest single content win available and
needs only your yes.

---

## A. PUBLISHED now (the 9 the filter admits)

| Author | Year | Entries | Tradition (manifest) | Note |
|---|---|---|---|---|
| John Gill | 1763 | 28,300 | Reformed Baptist | whole-Bible |
| Barnes' Notes | 1834 | 21,036 | Presbyterian | ⚠ biblehub-sourced — verify edition |
| John Wesley | 1765 | 18,184 | Methodist | ⚠ biblehub/wordpress-sourced |
| Jamieson, Fausset & Brown | 1871 | 16,966 | Presbyterian | whole-Bible |
| Adam Clarke | 1832 | 13,318 | Methodist | whole-Bible |
| John Calvin | 1554 | 6,170 | Reformed | ⚠ **blogspot-sourced — verify it is the PD (CTS/Beveridge) translation, not a modern one** |
| Matthew Henry | 1710 | 4,124 | Nonconformist | whole-Bible |
| Augustine of Hippo | 430 | (books 19, 43 only) | Patristic | book-scoped |
| John Chrysostom | 407 | (books 40, 43, 44 only) | Patristic | book-scoped |

**Provenance flag (your call):** Barnes/Wesley/Calvin are sourced from biblehub/blogspot, not the
crosswire edition the embeddings table uses. All three are pre-1929 PD *authors*, so I restored them to
search (§1b — they were serving zero rows). But **whether the biblehub/blogspot TEXT is the PD edition
or a re-typed modern one is an edition-trap question only you should settle.** If any is a modern
translation, quarantine it.

## B. STRONG PD CANDIDATES TO PROMOTE (pre-1929, high value, currently served nowhere)

These parse cleanly, are almost certainly PD, and would roughly **triple** the served corpus. Recommend
promotion pending your sign-off (and an edition check on each):

| Author | Year | Entries | Tradition |
|---|---|---|---|
| Geneva Study Bible | 1599 | 31,096 | Reformed |
| Matthew Poole | 1685 | 31,080 | Nonconformist |
| Cambridge Bible | 1882 | 26,666 | Anglican |
| Pulpit Commentary | 1890 | 25,796 | Anglican |
| Joseph Benson | 1811 | 15,363 | Methodist |
| Johann Bengel | 1742 | 7,008 | Pietist |
| B.W. Johnson | 1891 | 7,067 | Restoration Movement |
| Keil & Delitzsch | 1878 | 6,471 | Reformed |
| C.I. Scofield | 1917 | 4,280 | Dispensational |
| J.N. Darby | 1857 | 2,378 | Plymouth Brethren |
| Alexander MacLaren | 1904 | 2,176 | Baptist |
| J.P. Lange | 1865 | 2,095 | Reformed |
| *(+ patristic: Bede, Tertullian, Gregory the Dialogist, Cyril of Alexandria, Ambrose, Theodoret, Clement, Cyprian, Ephrem, Irenaeus, Basil — edition-trap applies; their PD translation must be verified per §1's rail)* | | | Patristic |

## C. KEEP OUT — modern / copyright risk (post-1929, currently mislabelled "Patristic")

**These are live in the corpus and were servable until today.** They must stay filtered:

| Author | Year | Entries | Problem |
|---|---|---|---|
| CS Lewis | 1963 | 1,102 | copyrighted (d. 1963) |
| CS Lewis (via the character Screwtape, a devil) | 1963 | 70 | copyrighted **AND a demon's voice presented as commentary** |
| JRR Tolkien | 1973 | 11 | copyrighted |
| Douglas Wilson | 2020 | 16 | copyrighted, living author |
| GK Chesterton | 1908/1936 | 714 | check jurisdiction (d. 1936) |
| Pseudo-Athanasius / -Augustine / -Basil / -Tertullian / -Jerome / -Cyril / -Hippolytus / -Justin | 9999 | ~50 | misattributed; year unknown |

## D. FORBIDDEN today (edition-trap / copyright — `MUST_NOT_SERVE_AUTHORS`)

Theophylact, Bonaventure, Oecumenius, Origen (on John), Tyndale Study/Open Notes, "Jerome's …",
Aquinas-Larcher — quarantined because the only held *translation* is modern-copyrighted, not because the
author is out. If a PD translation surfaces, they become promotable (reversible).

**Derivative labels:** 30+ authors appear as "X (as quoted by Aquinas, AD 1274)" — these are Aquinas's
*Catena Aurea* excerpts, not independent editions. Decide whether to serve the Catena as one attributed
work ("Aquinas, Catena Aurea") or drop the per-father split.

---

## §1c — `tradition` is a junk column, and the verifier depends on it

**Distribution (manifest, 401 sources):**

| tradition | authors | entries |
|---|---|---|
| **Patristic** | **378** | 86,668 |
| Reformed | 4 | 45,832 |
| Methodist | 3 | 46,865 |
| Anglican | 2 | 52,462 |
| Presbyterian | 2 | 38,002 |
| Nonconformist | 2 | 35,204 |
| Reformed Baptist / Pietist / Baptist / Plymouth Brethren / Restoration / Dispensational / Evangelical | 1 each | — |
| (null) | 3 | 3 |

**378 of 401 authors are labelled "Patristic"** — including CS Lewis (1963), Tolkien (1973), Chesterton,
Douglas Wilson (2020), and every Pseudo-\*. The label is the ingest source's folder name, not a
classification. Yet **`verifier/v1.ts` enforces the "≥2 traditions" guarantee by comparing these
strings**, and `ask-client.tsx` tells the user "N voices across M traditions." On the raw corpus that
guarantee is meaningless (two "Patristic" strings that are actually Chrysostom and C.S. Lewis).

*Mitigation already in place:* the served set is now only the 9 published authors, whose labels are
sound (Reformed Baptist / Presbyterian / Methodist / Reformed / Nonconformist / Patristic), so the live
verifier metric is currently trustworthy. **But it will silently rot the moment §B authors are
promoted** unless the schema is fixed first.

**Proposed schema (your approval before I build):**
1. A curated `tradition` **enum** (Patristic · Medieval · Reformation · Puritan/Nonconformist · Anglican
   · Wesleyan/Methodist · Reformed · Baptist · Restoration · Dispensational · Brethren · Lutheran/Pietist
   · Modern), assigned by a **committed author→tradition map**, never inherited from the ingest folder.
2. A derived `era` from `year` (Early Church ≤500 · Medieval ≤1500 · Reformation ≤1700 · Modern) for the
   secondary lens.
3. The verifier compares the **curated** tradition, and a data-quality test asserts every *served* author
   has a non-default curated tradition (a presence-style gate).
4. I will **not** assign the traditions myself — that is triage; hand me the enum + the map and I wire it.

**Do not treat any table above as a decision.** It is the ground truth I read off the data (`node`
over `_manifest.json` + the live DB), assembled for you to rule on.
