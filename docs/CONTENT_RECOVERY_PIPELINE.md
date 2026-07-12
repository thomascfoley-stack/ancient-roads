# Content Recovery & Growth Pipeline — P0

**Goal: MORE voices, across MORE traditions.** Grow from **9 verified authors** (currently Reformed-heavy) to a corpus that actually spans the church — Catholic, Anglican, Lutheran, Anabaptist, Orthodox-patristic, Baptist, Puritan, revivalist, mystic. Every published word verbatim, attributed, provenance-proven. **We never paraphrase and we never serve what we cannot prove.**

**This is P0. Without content, nothing else in the product matters.**

---

## 0. The bias that produced the current corpus — do not repeat it

The first draft of this plan was **Reformed-only**, and the reason is instructive: it was built around the *easiest adapters*. **CrossWire and CCEL are Protestant/Reformed-leaning collections.** They parse cleanly, so they got prioritised, and **archive.org — where the Catholic, Anabaptist, Anglican-scholarly and mystic voices actually live — was dismissed as an "OCR fallback."**

**Source convenience became theological bias.** That is the failure mode this document exists to prevent.

**Correction: archive.org is a PRIMARY adapter, not a fallback.** It carries a Lapide, Haydock, Menno Simons, Lightfoot, Westcott, Poole, the mystics. It is harder (OCR) — build it properly.

---

## 1. The situation

~401 sources / ~371k entries held. Only **9 authors** verified and served. The other ~392 are **not illegal — unproven.** Three buckets:

| Bucket | What | Fixable? |
|---|---|---|
| **A — Recoverable provenance** | PD text (pre-1930), scraped from a forbidden aggregator, no edition record. | **YES** — re-source from a permitted host, text-match, record provenance. Usually **$0** (keep vectors). |
| **B — Edition trap** | PD author, but the *translation* may be modern. Most of the patristic tail (~70% never checked). | **PER-WORK PROOF** — shingle-match vs a known-PD edition. Match → keep. No match → modern translation → quarantine. |
| **C — Genuinely copyrighted** | Tyndale Study Notes; modern-only translations (Theophylact, Bonaventure, Oecumenius, Origen-on-John, Jerome's prophets, Aquinas-Larcher); Chambers; Tozer. | **NO.** Quarantine permanently. |

**The constraint is labour, not law.** The loop already exists (`resource-textmatch.ts` + `SourceAdapter` + the harness). The job is running it ~392 times.

---

## 2. The loop (built — reuse, don't reinvent)

```
identify work → find PERMITTED source → fetch → shingle-match vs our stored text
  → MATCH  → provenance-repair (keep vectors, $0) → record licence+edition → publish
  → DIFFER → different edition → re-ingest from the PD source (re-embed)
  → NO PD EDITION → quarantine (reversible)
```

Proven: helloao 4 works → 100% repair, $0. Chrysostom-Galatians → 99% vs NPNF → keep. Origen-on-John → 1.6% → correctly dropped.

---

## 3. INGESTION PRIORITY — by TRADITION, not by adapter convenience

**Tier 1 — tradition anchors. Ingest these first; each opens a tradition the corpus currently lacks.**

| Tradition | Work | PD edition (verify translator + year ≤1929) | Source |
|---|---|---|---|
| **Catholic** ★ | **Cornelius a Lapide — *The Great Commentary*** (verse-by-verse, most of NT) | **Mossman 1876–1908** — "the crown jewel, no PD rival" | archive.org |
| **Catholic** ★ | **Haydock's Catholic Bible Commentary** (1811, **whole Bible**) | PD — the Catholic analogue to Matthew Henry | archive.org |
| **Catholic/medieval** | **Catena Aurea** (4 Gospels) | **Newman 1841–45**. ⚠️ ALL other Aquinas commentaries = Larcher, **copyrighted** | archive.org / isidore |
| **Anglican (scholarly)** ★ | **J.B. Lightfoot** — Galatians, Philippians, Colossians (1865–75) | PD — arguably the finest English NT commentary ever written | archive.org |
| **Anglican (scholarly)** ★ | **B.F. Westcott** — John, Hebrews, 1 John | PD — same tier | archive.org |
| **Anglican** | **Ellicott's Commentary for English Readers** (1878, whole Bible) | PD | archive.org |
| **Anglican-Evangelical** | **J.C. Ryle** — *Expository Thoughts on the Gospels* | PD | CCEL / archive.org |
| **Lutheran** | **Luther — Commentary on Galatians** | **Middleton 1575** (!). ⚠️ avoid Fortress/Concordia (copyrighted) | archive.org |
| **Lutheran** | Gerhard — *Sacred Meditations* | **Heisler 1896** | archive.org |
| **Anabaptist** | **Menno Simons — *Complete Works*** | **Funk 1871**. ⚠️ **not** Wenger 1956 | archive.org |
| **Orthodox / Greek Fathers** | **Cyril of Alexandria on John** | **Pusey 1874** | archive.org / CCEL |
| **Orthodox / Greek Fathers** | Gregory the Great — *Morals on Job* | **Oxford 1844** | archive.org |
| **Puritan** ★ | **Matthew Poole — *Annotations*** (whole Bible, verse-level) | 1685/1700 eds, PD | archive.org |
| **Baptist** ★ | **Alexander Maclaren — *Expositions*** (most of Bible) | PD | CCEL |
| **Baptist (sermons)** ★ | **Spurgeon — ~3,560 sermons** | PD | CCEL / spurgeongems / archive.org |
| **Revivalist** | Finney, Moody, Octavius Winslow | PD | CCEL / Grace Gems |
| **Mystic / devotional** *(tag `theology`, NOT verse-commentary)* | à Kempis (**Benham 1874**), Julian of Norwich (**Warrack 1901**), John of the Cross (**Lewis 1864**), Teresa (**Lewis 1904** — ⚠️ *not* Peers), de Sales, Ignatius (**Mullan 1914**), Pascal (**Trotter 1910**) | PD | Gutenberg / archive.org |

**Tier 2 — depth within traditions already opened:** Barnes, Calvin, Wesley, Geneva, RWP, TSK, Scofield, Darby (CrossWire — explicit per-module PD licences); Bengel, Cambridge, Benson, Lange, Keil & Delitzsch; Owen/Watson/Baxter/Bunyan/Flavel (Puritan); Bullinger/Zwingli/Knox; Tyndale/Latimer/Cranmer (Parker Society).

**Tier 3 — historians:** Josephus (**Whiston 1737**), Philo (**Yonge 1854**), Eusebius, Edersheim, Schaff.

**Orthodox — the honest ceiling.** There is **no public-domain English** for post-patristic Orthodox: Philokalia, Palamas, Symeon are all post-1950 copyrighted translations. **Exclude them.** Orthodox coverage *is* the Greek Fathers — Chrysostom (already held; *the* Orthodox commentator), Basil, the Gregorys, Cyril, John of Damascus (NPNF2 v9, Salmond 1899). That is not a shortcut; it is the state of PD English.

---

## 4. Adapters — the leverage (build in this order)

| Adapter | Status | Unlocks |
|---|---|---|
| **archive.org** ★ **PRIMARY** | **not built** | a Lapide, Haydock, Lightfoot, Westcott, Ellicott, Luther-Galatians, Menno Simons, Poole, Cyril, Gregory, the mystics — **the entire tradition-diversity tier** |
| **CrossWire / SWORD (libsword)** | designed | Barnes, Calvin, Wesley, Geneva, RWP, TSK, Scofield, Darby — explicit per-module PD licences |
| **CCEL** | not built | Spurgeon, Maclaren, Ryle, Moule, Puritans, ANF/NPNF, Finney/Moody. **FORK: ADR-008 flags CCEL "commercially restricted" — verify its actual terms before building.** If out, these fall back to archive.org. |
| **Gutenberg** | not built | à Kempis, Julian, Pascal, Josephus, Philo |
| helloao · New Advent | ✅ built | Gill/JFB/Clarke/Henry · patristic core |

---

## 5. Acceptance — per work, non-negotiable

1. **Licence** — PD / CC-BY / CC-BY-SA, recorded in `ingest/sources.config.json`.
2. **Provenance** — permitted source URL + **translator/editor + edition YEAR**. Never a forbidden aggregator. **Verify ≤1929 for any translation. Fail closed on unknown edition.**
3. **Text-match proof** — shingle containment vs the named PD edition; score recorded.
4. **Coverage** — every section embedded (gap = 0).
5. **Tradition tag** — every work carries its tradition (`catholic` / `anglican` / `lutheran` / `anabaptist` / `patristic` / `baptist` / `puritan` / `reformed` / `revivalist` / `mystic`).

Anything short → `staged` or `quarantined`. **Quarantine, never delete.**

---

## 6. Open design question (owner decision, not to be slipped in)

**The ≥2-voices guarantee counts distinct *authors*, not distinct *traditions*.** Two Reformed Baptists is "two voices" — and it isn't diversity. If the product's value is hearing the church across traditions, the selection metric should know that.

Options: (a) leave author-based, ingest broadly and let breadth do the work; (b) add a **tradition-aware diversity cap** to selection (≤N per tradition in the top-K), mirroring the per-passage cap; (c) report tradition-span as a *reported* metric without gating on it.

**Do not implement without an explicit decision.** It changes what "a good answer" means.
