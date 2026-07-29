# Acquisition Manifest — Bibles, Commentaries, Sermons

The concrete grab-list: exact sources, formats, licenses, and exclusions. Everything here is **free to download and self-host** (public domain or noted otherwise). Feeds the `sources`/`sections` ingestion (ADR-010). **Content categories (`source_type`): `bible · commentary · sermon · historian`** (plus `theology`/`father` for mystics + church fathers). **Everything here is INGESTED and SELF-HOSTED inside Ancient Paths — we never link out to the source site; we surface the full text in-app** (ADR-013). Verified July 2026.

## Universal rules (apply to every item)

- **Store a per-work provenance + license record** (author, death date, edition/translator + year, PD basis, source URL, retrieved-at, checksum). Fail closed: no confirmed PD/CC license → quarantined.
- **The edition trap:** an author being PD does NOT mean every edition is. Modern *critical translations/editions* are often copyrighted. Always take the **old PD edition** and record which one.
- **CCEL:** the underlying *text* is PD and usable, but **CCEL's own editions/markup are commercially restricted** — extract the text, strip CCEL markup, re-provenance to the original PD edition. Don't ship CCEL's files.
- **SWORD modules:** being on CrossWire ≠ PD. Read each module's `.conf` `DistributionLicense`. Exclude any not marked Public Domain.
- **Never scrape** BibleHub, StudyLight, monergism, sermonaudio, blueletterbible, desiringgod, ligonier (ToS-protected). Use neutral sources: eBible.org, archive.org, Project Gutenberg, Wikisource.

---

## 1. BIBLES  (`source_type='bible'`)

| Version | Source | Format | License |
|---|---|---|---|
| **BSB** (primary) | berean.bible/downloads.htm (`bsb_usfm.zip`, `bsb_usj.zip`) | USFM / USJ | **PD** (2023) |
| **WEB** | ebible.org/web (`eng-web_usfm.zip`) | USFM | **PD** |
| **KJV** | github.com/seven1m/open-bibles (`eng-kjv.osis.xml`); Gutenberg #10 | OSIS | **PD** (US; UK Crown patent — fine for US host) |
| **ASV 1901** | ebible.org/eng-asv | USFM/USX | **PD** |
| **Darby** | open-bibles (`eng-darby.zefania.xml`) | Zefania | **PD** |
| **YLT** (complete) | ebible.org/eng-ylt or scrollmapper — **NOT** open-bibles (NT-only there) | USFM/JSON | **PD** |
| **Geneva 1599** (original) | archive.org / Wikisource — **NOT** the Tolle Lege modern-spelling edition (copyrighted) | scan/txt | **PD** |
| Convenience DB | github.com/scrollmapper/bible_databases (KJV/ASV/YLT/Darby/WEB/Geneva) | JSON/SQL/CSV | PD entries |

**EXCLUDE (copyrighted, commonly mislabeled free):** LEB (Lexham), LITV / MKJV (Green's), LSV (CC BY-SA but commercial-capped), NASB/NIV/ESV/NLT/CSB.

---

## 2. COMMENTARIES  (`source_type='commentary'`)

### 2a. CrossWire PD SWORD modules — verify each `.conf` = Public Domain
Repo: `ftp.crosswire.org/pub/sword/raw/`.

| Work | Module | Coverage |
|---|---|---|
| Calvin's Commentaries | `CalvinCommentaries` | Complete |
| Adam Clarke | `Clarke` | Whole Bible |
| Wesley's Explanatory Notes | `Wesley` | Complete |
| Geneva Bible Notes | `Geneva` | Complete |
| Robertson's Word Pictures | `RWP` | NT |
| Catena Aurea (Aquinas) | `Catena` | Gospels |
| Treasury of Scripture Knowledge | `TSK` (plain — **not** `TSKe`, derivative copyright) | Complete |
| Darby Notes | `DTN` | Complete |
| Scofield 1917 | `Scofield` | Complete |
| Barnes' Notes | `Barnes` | **NT only** on CrossWire (see 2b for whole-Bible) |

**EXCLUDE modules:** `KingComments`, `NETnotesfree`, Lockman (`NASB`/`LBLA`/`NBLA`) — not PD.

### 2b. Whole-Bible commentaries NOT on CrossWire — take PD text from neutral source, re-mark
| Work | Source | License |
|---|---|---|
| **Matthew Henry — Complete** | Project Gutenberg + archive.org scans | **PD** (d.1714) |
| **JFB** (unabridged) | archive.org scans; Wikisource | **PD** |
| **John Gill — Exposition** | sacred-texts.com/bib/cmt/gill; archive.org | **PD** (d.1771) |
| **Barnes' Notes** (whole Bible, +OT) | archive.org; Gutenberg | **PD** |

### 2c. Church Fathers — ANF / NPNF (Schaff, 38 vols)
archive.org neutral scans (`the-complete-ante-nicene-nicene-and-post-nicene-church-fathers`) + Wikisource text. **PD.** (CCEL has a convenient ThML edition — read-only, don't ship the markup.)

---

## 3. SERMONS  (`source_type='sermon'` — sub-category of commentary)

**Edition trap is worst here — record the exact PD edition in provenance.**

| Author | SAFE source (PD) | Format | Est. count | AVOID |
|---|---|---|---|---|
| **Spurgeon** ★ | spurgeongems.org (per-sermon PDF, 63 vols) + archive.org OCR text | PDF / txt | **~3,560** | — |
| **Luther** | Lenker 1905–09: sermons.martinluther.us, lutheranlibrary.org, archive.org (`precioussacredwr##luth`) | PDF / OCR txt | ~200–300 | **"Luther's Works" American Edition** (Fortress/Concordia — copyrighted) |
| **Wesley** | CCEL text (`wesley/sermons.xml`) → strip markup, re-provenance | ThML→txt | ~150 | Abingdon Bicentennial critical ed. |
| **Whitefield** | CCEL / Project Gutenberg | txt | ~50–75 | — |
| **Jonathan Edwards** | Worcester/Hickman 19th-c. eds (Gutenberg/archive.org) | txt | ~100+ | **Yale "Works of J. Edwards" (WJE)** — copyrighted + ToS |
| **Chrysostom + Augustine homilies** | NPNF (Schaff) via archive.org / Wikisource | scan/txt | several hundred | modern ACW/FotC translations |
| **Puritans** (Cripplegate *Puritan Sermons*, Watson, Owen, Adams…) | archive.org (`_djvu.txt` via metadata API) | txt | several hundred | — |

**Total clean PD sermons: comfortably 4,000+** (Spurgeon alone ~3,560).

**Never ingest from:** monergism, sermonaudio, biblehub, studylight, blueletterbible, desiringgod, ligonier (ToS + often wrap copyrighted modern editions).

---

## 4. Tradition & Era Expansion (beyond Reformed — for voice diversity)

**Governing rule — the translation trap:** most figures below are PD in the original but their *only free English is a pre-1930 translation*; modern translations (ICS, Paulist/Classics of Western Spirituality, Penguin, Cistercian, Concordia, Larcher/Aquinas Institute) are **copyrighted**. Ingestion must record **translator + year** and verify ≤ 1929. Fail closed on unknown edition.

### 4a. Catholic / Medieval / Mystic  (`commentary` or `theology`)
| Figure | Tradition · Era | Work | PD source | USE edition / ⚠️ AVOID |
|---|---|---|---|---|
| **Cornelius a Lapide** ★ | Catholic · 1567–1637 | *The Great Commentary* (verse-by-verse, most of NT) | archive.org `greatcommentaryo05lapi`; ecatholic2000.com/lapide | **Mossman 1876–1908** — the crown jewel, no PD rival |
| **Aquinas** | Catholic · 1225–74 | *Catena Aurea* (4 Gospels) | archive.org; isidore.co | **Newman 1841–45.** ⚠️ ALL other Aquinas biblical commentaries in English = Larcher, **copyrighted — exclude** |
| **Bernard of Clairvaux** | Cistercian · 1090–1153 | Sermons on Song of Songs | archive.org `LifeAndWorksOfSaintBernardV4` | **Eales 1895.** ⚠️ avoid Walsh (Cistercian Pubs) |
| **Thomas à Kempis** | Devotio Moderna · d.1471 | *Imitation of Christ* | Gutenberg #1653 | **Benham 1874.** ⚠️ avoid Knox, Sherley-Price |
| **Julian of Norwich** | English mystic · c.1416 | *Revelations of Divine Love* | Gutenberg #52958; Wikisource | **Warrack 1901** (clean text) |
| **Teresa of Ávila** | Carmelite · 1515–82 | *Life, Interior Castle, Way of Perfection* | archive.org; CCEL | **Lewis 1904 / Stanbrook-Zimmerman ~1911.** ⚠️ avoid Peers (1940s) & Kavanaugh/ICS |
| **John of the Cross** | Carmelite · 1542–91 | *Dark Night, Ascent, Living Flame* | archive.org `darknightofsouls00sain` | **Lewis 1864/Zimmerman 1906.** ⚠️ avoid Peers & Kavanaugh/ICS |
| **Francis de Sales** | Catholic · 1567–1622 | *Introduction to the Devout Life* | CCEL (text) | 19th-c. PD (Mackey/1885). ⚠️ avoid Ryan 1950 |
| **Ignatius of Loyola** | Jesuit · 1491–1556 | *Spiritual Exercises* | sacred-texts.com/chr/seil | **Mullan 1914.** ⚠️ avoid Puhl 1951 |
| **Pascal** | Jansenist · 1623–62 | *Pensées* | sacred-texts; Wikisource | **Trotter 1910** |
| Catherine of Siena, Anselm, Wycliffe | Medieval | Dialogue / Proslogion / Sermons | archive.org (PD trans. noted in research) | Thorold 1896 / Deane 1903 / Arnold 1869 |

*Mystics (à Kempis, Julian, Teresa, John of the Cross, de Sales, Ignatius) are **devotional/spiritual voices, not verse-exegetes** — tag `theology`, attribute accordingly, don't treat as per-verse commentary.*

### 4b. Orthodox — the gap (plan around it)
Beyond the patristic corpus (§2c) + **John of Damascus** (NPNF2 v9, Salmond 1899, PD), there is **NO public-domain English** for later Orthodox — Philokalia, Gregory Palamas, Symeon the New Theologian are all post-1950 copyrighted translations. **Exclude them**; don't accidentally ingest a copyrighted edition. Orthodox coverage = patristic only.

### 4c. Wider Protestant (Anglican · Lutheran · Anabaptist · Reformation-1500s · Puritan · Evangelical)
| Figure | Tradition · Era | Work | PD source |
|---|---|---|---|
| **Matthew Poole** ★ | Anglican/Puritan · 1624–79 | *Annotations upon the Holy Bible* (whole Bible, verse-level) | archive.org (1685/1700 eds) |
| **Alexander Maclaren** ★ | Baptist · 1826–1910 | *Expositions of Holy Scripture* (most of Bible) | CCEL `maclaren` |
| **J.C. Ryle** ★ | Anglican-Evangelical · 1816–1900 | *Expository Thoughts on the Gospels* | CCEL `ryle` |
| Handley Moule | Anglican · 1841–1920 | Romans/Ephesians/Phil/Col | CCEL `moule` |
| F.B. Meyer / Andrew Murray | Baptist / Dutch Reformed · d.1929/1917 | expositions + devotional commentary | CCEL |
| **G. Campbell Morgan** | Congregational · 1863–1945 | Analyzed Bible, Living Messages | archive.org — ⚠️ **pre-1930 titles ONLY** |
| **Menno Simons** | Anabaptist · 1496–1561 | *Complete Works* | archive.org — **Funk 1871** (⚠️ not Wenger 1956) |
| Bullinger / Zwingli / Knox | Swiss & Scots Reformed · 1500s | Decades / Latin Works / Works | archive.org (Parker Soc / 1901–29 trans.) |
| Tyndale / Latimer / Cranmer | English Reformation · 1500s | Expositions / Sermons / Works | archive.org Parker Society (1848–52) |
| Owen, Watson, Baxter, Bunyan, Flavel, Brooks, Charnock, Perkins, Burroughs, Goodwin | Puritan · 1600s | expositions + sermons | CCEL / Grace Gems / archive.org |
| Andrewes, Donne, Jeremy Taylor, Hooker | Anglican divines · 1550–1670 | Sermons / Works | archive.org / CCEL |
| Finney, Moody, Octavius Winslow | Revivalist/Evangelical · 1800s | sermons + devotional exposition | CCEL / Grace Gems |
| **Gerhard** | Lutheran · 1582–1637 | *Sacred Meditations* | **Heisler 1896** (⚠️ Melanchthon/Chemnitz English = copyrighted → Latin only) |

### 4d. Hard exclusions — encode in the license filter
- **Oswald Chambers** — EXCLUDE (US copyright renewed 1963; posthumous compilations — death-date is a red herring).
- **A.W. Tozer** — EXCLUDE (copyrighted).
- **G. Campbell Morgan** — pre-1930 titles only.
- **Aquinas biblical commentaries except Catena Aurea** — EXCLUDE (Larcher, copyrighted).
- **Philokalia / Palamas / Symeon (English)** — EXCLUDE (no PD English exists).
- **Any post-1930 translation of a PD author** — EXCLUDE. Record translator+year; verify ≤1929.

## 5. Historians / Historical Background  (`source_type='historian'`)

Rich enough to launch as a full sub-category. Two clusters: **biblical/Jewish background** (the "times, context, culture") and **church history**. Center of gravity is clean, chapter-addressable text (CCEL / Gutenberg / sacred-texts), not OCR.

### Tier 1 — highest value, clean text
| Work | Era/Region | Source | Note |
|---|---|---|---|
| **Josephus** — *Antiquities* + *Wars* | 2nd-Temple Judea | CCEL (Whiston 1737) | **Essential** NT-era primary source |
| **Edersheim** — *Life & Times of Jesus the Messiah*; *Sketches of Jewish Social Life*; *The Temple* | 1st-c. Judea | CCEL (clean) | **Gold** for Gospel-era culture/custom |
| **Eusebius** — *Ecclesiastical History* | Early church → 324 | CCEL NPNF2-01 (McGiffert 1890) | Foundational church history |
| **Conybeare & Howson** — *Life and Epistles of St. Paul* | Pauline Mediterranean | archive.org (OCR) | Classic narrative-geographic Paul |
| **Schaff** — *History of the Christian Church* (8 vols) | Apostolic → Reformation | CCEL (clean) | Best full survey |
| **George Adam Smith** — *Historical Geography of the Holy Land* | Palestine geography | archive.org (OCR) | Standard historical geography |

### Tier 2 — core depth
Schürer, *History of the Jewish People in the Time of Jesus Christ* — **OLD T&T Clark trans. 1885–91 (PD); ⚠️ AVOID the Vermes–Millar–Goodman revision (1973–87, copyrighted)**. Philo, *Works* (Yonge 1854). Socrates Scholasticus + Sozomen + Theodoret (NPNF2-02/03, CCEL clean). Rawlinson, *Seven Great Monarchies* (**Gutenberg, clean** — ANE/OT empire background). Neander; Mosheim (archive OCR).

### Tier 3 — supplements
William Ramsay (*St. Paul the Traveller*, *Cities of St. Paul*, *Letters to the Seven Churches*, etc. — **all major works pre-1929 = PD**; archaeological grounding for Acts/Paul). Milman (*Latin Christianity*, *History of the Jews*). *Records of the Past* + A.H. Sayce (ANE — dated). William Cave.

**Format caveat:** narratives are clean (CCEL/Gutenberg); the geography/archaeology works (Conybeare-Howson, G.A. Smith, old Schürer, Ramsay) are **archive.org OCR scans — budget cleanup**.

**The gap → future licensed tier, NOT PD:** modern ANE text editions (ANET/COS/CAD), the revised Schürer, Dead Sea Scrolls context, modern archaeology/atlases. The advanced-academic edge is an optional licensed-API addition later — never PD ingest. In-product, flag ANE/OT background as "coverage limited to pre-1929 scholarship."

## Recommended acquisition order (legal-safety × completeness × volume)

1. **BSB** (berean.bible) — anchor modern translation, cleanest PD, structured.
2. **WEB + ASV + KJV + Darby** (eBible.org / open-bibles); **full YLT** (eBible/scrollmapper); **Geneva 1599** original.
3. **CrossWire PD commentary modules** (Calvin, Clarke, Wesley, Geneva, RWP, Catena, TSK, DTN, Scofield, Barnes-NT) — verify each `.conf`.
4. **Whole-Bible commentaries** (Matthew Henry Complete, JFB, Gill, Barnes OT+NT) from Gutenberg/archive/sacred-texts.
5. **Sermons — Spurgeon first** (~3,560, biggest clean win), then **Luther (Lenker)**, then Wesley/Whitefield/Edwards, then Puritans.
6. **Church Fathers (ANF/NPNF)** last — heaviest to normalize.

Every item is free; none require a paid license. The only work is honoring the sourcing rules (neutral sources over CCEL markup / aggregators) and recording per-work provenance + the exact PD edition.
