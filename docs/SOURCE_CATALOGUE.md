# Source Catalogue — the populated grab-list (2026-07-16)

Verified, identifier-level acquisition list from a 9-agent discovery sweep. Every entry is **public domain or CC-BY / CC-BY-SA and self-hostable**, from neutral sources only (archive.org, CCEL, Project Gutenberg, Wikisource, CrossWire/SWORD, HelloAO, eBible, GitHub PD repos). **Never** biblehub, studylight, monergism, sermonaudio, blueletterbible, desiringgod, ligonier.

This is the fuel for `INGESTION_LOOP.md`. It supersedes the coarse tallies in `ACQUISITION_MANIFEST.md` §3–5 (which this expands with concrete identifiers, counts, formats, and traps). Companion: `HISTORY_RETRIEVAL_DESIGN.md` (historian tier is staged-not-served).

## Scale (approximate ingestible units)

| Type | Ingestible units | Flagship clean win |
|---|---|---|
| Sermons | **~15,000+** (Spurgeon ~3,560 · Parker's *People's Bible* ~2,000 · Simeon ~2,536 · Puritan ~2,300 · Maclaren ~1,500 · Talmage ~600 · Fathers ~650 · long-tail ~2,000) | Spurgeon via CCEL `sermons01–63` |
| Whole-Bible / multi-book commentaries | **~30 works / hundreds of vols** (Pulpit 23v, Lange 26v, Ellicott 8v, Cambridge ~56 books, Expositor's ~49v now per-volume enumerated) | Keil & Delitzsch complete OT — structured JSON via HelloAO |
| Bible versions (self-host) | **~25 English PD + originals** | scrollmapper / open-bibles / STEP (filter by per-text license) |
| Systematic theology (`theology`) | **~10 works** | Hodge *Systematic Theology* (CCEL clean) |
| Confessions & catechisms (`confession`) | **whole corpus from 2 sources** | Schaff *Creeds of Christendom* 1–3 + *Book of Concord* |
| Reference / lexicon (`lexicon`) | **~25 works, mostly structured** | ISBE · BDB · Thayer · Strong's (SWORD/GitHub) |
| Cross-ref / topical / geo (structured) | **~10 datasets** | TSK + openbible cross-refs + openbible geocoding |
| Jewish / Second-Temple (staged) | **~8 works** | R.H. Charles *Apocrypha & Pseudepigrapha* |
| Deep linguistic (word-study) | **MACULA H+G** (CC BY 4.0) | MACULA Greek + Hebrew (syntax + morph + Strong's) |
| Historians (staged) | **~20 works** | Schaff `hcc1–8`, Josephus, Edersheim (CCEL clean) |
| Hymns (`hymn`) | **~10,000+ texts** (Wesley ~6,000 · gospel/Sankey ~2,000 · Watts/Doddridge/Olney ~1,200 · Victorian ~1,400 · metrical psalters · carols · spirituals) | Metrical psalters (1:1 to Psalms) + Doddridge (verse-keyed) |
| Poetry (`poetry`) | **~5,000+ devotional poems** (Rossetti · Herbert · Milton · Donne · Keble · Dante-in-PD-translation) | Herbert's *The Temple*, Keble's *Christian Year* |
| Art (`art`) | **tens of thousands CC0** + captioned engraving sets | Doré Bible (241 verse-captioned plates), Iconclass CC0 anchor |

**The copyright-tier verdict (Run #2):** the "user buys a license, we serve our stored copy" model **does not exist in this market.** Modern commentaries/lexicons/study-bibles (NICNT, WBC, BDAG, MacArthur, etc.) are locked inside Logos/Accordance/Olive Tree walled apps with **no third-party licensing path at all**; only modern Bible **translations** are licensable, **display-only via API** (never stored), and even then NIV-commercial is largely unavailable and Crossway licenses "to organizations, not solo developers." So the existing "never store copyrighted full text — display-only via licensed API" rule is **the only lawful path the market offers** — see §16.

**On money/accounts:** virtually none of this needs payment or signup — it is all free on archive.org / CCEL / Gutenberg / GitHub. Budget goes to **OCR cleanup labor** (the archive.org scans), not licenses. Do **not** buy Logos/Accordance libraries — copyrighted, not self-hostable.

---

## §1. Copyright traps — encode these in the license gate (the safety core)

The author being long-dead is **not** sufficient — the *edition/translation* carries its own copyright. Block-by-default; these are the recurring traps the sweep surfaced:

- **Banner of Truth reprints** — typeset-copyrighted even when the text is PD (Owen/Goodwin/Sibbes/Manton/Brooks/Flavel/Boston/Rutherford; Whitefield journals). Use the original 19th-c. scan or CCEL text, never the BoT typesetting.
- **Modern critical editions/translations (copyrighted — exclude, use the PD one named):** Yale *Works of Jonathan Edwards* (use Hickman) · Abingdon Wesley (use Sugden/Jackson) · Oxford/Dorman Andrewes (use LACT) · Potter–Simpson Donne (use Alford 1839) · Folger Hooker (use Keble) · **Schürer 1973–87 revision (use OLD 1885–91 only — the single biggest history trap)** · Loeb Josephus/Philo (use Whiston/Yonge) · FOTC / ACW / Popular Patristics for the Fathers (use ANF/NPNF) · Larcher Aquinas (only the Catena is PD) · Walsh Bernard (use Eales) · **New Peake 1962 (use 1919 only)** · Expositor's Bible *Commentary* (EBC, Zondervan/NIV — copyrighted; NOT the PD 1887–96 Expositor's Bible) · Logos K-D repackage (use T&T Clark trans.).
- **20th-c. authors — date-gate or exclude:** Oswald Chambers ❌ (renewed 1963) · A.W. Tozer ❌ · Arthur Pink ⚠️ (only pre-1929 or copyright-verified-unrenewed; never BoT compilations) · Harry Ironside ⚠️ (pre-1929 only) · G. Campbell Morgan ⚠️ (pre-1930 titles only) · A.B. Simpson ⚠️ (original 1888–1917 eds, **never** the 1992–96 NIV-bearing commentary) · Gaebelein ⚠️ (pre-1929 vols only).
- **Latin-only / no PD English (do not accidentally ingest a copyrighted trans.):** Cornelius à Lapide beyond Galatians · the `…uoft`/1874 Catena scans · Bede's biblical commentaries (his *History* is fine) · Ephrem, Ambrose-on-Luke, Jerome's commentaries, most Bonaventure exegesis.
- **Bibles:** ESV/NIV/NASB/NLT/CSB = display-only via licensed API, never ingested · LEB/LITV/MKJV/LSV = exclude · Rahlfs & CCAT LXX = exclude (use Swete/Brenton).
- **scrollmapper trap:** the repo's MIT license covers the *tooling*, not each text — it bundles copyrighted translations (LEB/LITV/MKJV). Filter by the per-text `license` field, never trust the repo blanket.
- **CC-BY-SA share-alike:** OpenGNT & MorphGNT morphology impose share-alike on derivatives — confirm compatible with the output contract before ingesting the morphology. Strong's numbers themselves (openscriptures/strongs) are PD and usually sufficient.
- **CCEL markup** is commercially restricted though the text is PD — extract text, strip ThML, re-provenance to the underlying PD edition (standing rule).
- **archive.org lending scans** (`…chsp` Spurgeon re-scans; identifiers marked `access-restricted-item`) are borrow-only — not ingestible. Use the folkscanomy/Google/`spuruoft` public copies instead.

---

## §2. Sermons (~10,000+ units)

### 2a. Spurgeon (~3,560 sermons + works) — d.1892, all editions pre-1929 PD
- **Full sermon corpus (63 vols, ~3,560):** CCEL `spurgeon/sermons01`–`sermons63` (**clean UTF-8 txt + ThML** — the fastest, cleanest bulk win; strip markup, re-provenance to NPSP/MTP year). Per-sermon granularity/cross-check: spurgeongems.org (per-sermon PDF, one page-scrape for hrefs). OCR fallback: archive.org `SpurgeonNewParkPt01–06`, `SpurgeonMetropolitanPt07–15`, `metropolitantab01–13spurgoog`. **Avoid** `metropolitantabe00NNchsp` (lending-restricted).
- **Works:** Treasury of David (CCEL `treasury1–6`, all 150 Psalms), Commenting and Commentaries, All of Grace, Faith's Checkbook, Lectures to My Students (archive OCR), The Soul Winner, John Ploughman, The Gospel of the Kingdom (Matthew). Morning & Evening = **already ingested, skip**.

### 2b. Puritan & Reformed (~1,800–2,800) — the deepest vein after Spurgeon
- **CCEL clean (ingest first):** Owen (`owen`, ~32 works), Watson (`watson`, ~200 catechism sermons), Flavel (`flavel`, ~90), Baxter (`baxter`), Bunyan (`bunyan`), Edwards (`edwards` — Hickman *Works*, **not** Yale WJE, ~100+ sermons).
- **archive.org 19th-c. Works sets (OCR, budget cleanup):** **Manton** `completeworksoft01–22mant` (~600–1,000 — Psalm 119 set vols 6–9 is the flagship), **Goodwin** 12 vols, **Sibbes** `completeworkso01–07sibb`, **Charnock**, **Brooks** `completeworksoft01–06broo`, **Gurnall** *Christian in Complete Armour* (~260 sections), **Boston**, **Gill** *Sermons & Tracts* (commentary handled elsewhere), **Rutherford** *Letters* (tag devotional), **Cripplegate/Morning Exercises** `puritansermons190006jame` (~130 sermons, ~90 divines).
- **EEBO blackletter (last — poor OCR):** Perkins *Workes*, earliest Burroughs/Mead.

### 2c. Anglican & English divines (~3,050) — d. pre-1901, editions 1547–1908 PD
- **Flagship:** **Charles Simeon, Horae Homileticae** `horaehomileticae01–21sime` (~2,536 sermon outlines across the whole Bible — behaves like a commentary).
- **Big sets:** Lancelot Andrewes *Ninety-Six Sermons* (LACT scans, **not** Oxford), John Donne *Sermons* (Alford 1839, 154 sermons), Jeremy Taylor *Whole Works* (Heber/Eden 15 vols), Richard Hooker (Keble), J.C. Ryle *Expository Thoughts on the Gospels* (CCEL `ryle`, ~700 sections) + *Holiness*/*Practical Religion* (Gutenberg #38162), F.W. Robertson *Brighton Sermons* (Gutenberg #16645), Book of Homilies (Griffiths 1859, 33 homilies), Liddon.
- **The Parker Society block (~54 uniform PD vols, 1841–55):** Tyndale, Cranmer, Latimer, Ridley, Jewel, Becon, Bradford, Coverdale, Hooper, Whitgift, Bullinger's *Decades*, etc. Finding aid: Gough *General Index* `ageneralindextot00unknuoft`. One provenance family — ingest as a batch.

### 2d. Revivalist / Evangelical / Expository (~2,000; ~130–150 works)
- **Flagship:** **Alexander Maclaren, Expositions of Holy Scripture** (CCEL `maclaren`, 14 whole-Bible vols, ~1,500+ passage-anchored expositions — clean, no OCR, ingest first).
- **CCEL clean:** Wesley Standard Sermons (`wesley/sermons`, ~141; **not** Abingdon) + Notes, Whitefield Selected Sermons (`whitefield`, ~59), Finney (`finney`, revivals/theology/sermons), Andrew Murray (`murray`, tag theology), F.B. Meyer (`meyer`), R.A. Torrey (`torrey`), D.L. Moody (`moody`), Horatius Bonar (`bonar`).
- **archive.org OCR (date-gate strictly):** G. Campbell Morgan *Analyzed Bible* `analyzedbible01–10morg` (pre-1930), A.B. Simpson *Christ in the Bible* originals (~24 vols), Meyer Bible-character books, Moody compilations, Octavius Winslow, Andrew Bonar. Whitefield *Works* (Gutenberg #68976; **not** the 1960 Banner journals).
- **Exclude:** Chambers, Tozer; **flag:** Pink, Ironside (pre-1929 only).

### 2e. Church Fathers — homilies/commentary (~650–700 units; completes the partial Chrysostom/Augustine ingest)
- **Crown jewel (CCEL clean, ingest first):** **Chrysostom** `schaff/npnf110–114` (+`npnf109`) — continuous verse-by-verse homilies on **Matthew, John, Acts, Romans, 1–2 Corinthians, Hebrews, all 9 shorter Paulines** (~400+ homilies). **Augustine** `npnf106–108` — whole Psalter (Enarrationes), 124 Tractates on John + 10 on 1 John, Sermon on the Mount (~250+). **Origen** `anf09` — Commentary on John & Matthew.
- **Standalone PD verse-commentary (archive.org OCR, Library of Fathers eds):** Gregory the Great *Morals on Job* (whole book of Job), Cyril of Alexandria on John (Randell/Pusey) & on Luke (Payne Smith 1859), Basil *Hexaemeron* (`npnf208`, Genesis 1).
- Full ANF (10) + NPNF-1 (14) + NPNF-2 (14) = 38 vols on CCEL `schaff/anf01`–`npnf214`. Non-commentary volumes → tag `theology`/`father`. NPNF-2 `npnf201/202/203` (Eusebius, Socrates/Sozomen, Theodoret) → historian tier (§5).
- **Gaps (no PD English — do not ingest a copyrighted ed.):** Jerome's commentaries, Ephrem, Ambrose-on-Luke.

---

## §3. Whole-Bible & multi-book commentaries (~30 works)

### 3a. Structured / clean — ingest first (zero OCR)
- **Keil & Delitzsch, complete OT** ★ — **HelloAO** `keil-delitzsch` (verse-keyed JSON, PD Mark 1.0); STEP `KD` (CC BY 4.0) backup. The best coverage-per-effort win in this batch.
- **New CrossWire PD NT modules** (same SWORD adapter already built; verify each `.conf` = Public Domain): `Abbott`, `Burkitt`, `PNT`, `TFG`, `Family`, `Lightfoot`.
- HelloAO also serves structured Henry / JFB / Clarke / Gill (already have these — structured alt).

### 3b. CCEL clean (re-provenance)
- Vincent *Word Studies in the NT* (`vincent`), The Expositor's Bible (Nicoll/Dods, `dods` + archive for the rest).

### 3c. archive.org OCR — biggest coverage wins (budget cleanup)
- **The Pulpit Commentary** (whole Bible, ~23 vols, `cu31924101104895`) — largest single coverage win · **Lange's Commentary** (whole Bible + Apocrypha, 25 vols, Schaff Eng. ed.) · **Ellicott** (whole Bible, `biblecommentaryf01elliuoft`) · **Cambridge Bible for Schools & Colleges** (most books) · **Benson** (Methodist, whole Bible) · **Whedon** (Arminian) · **Thomas Scott** · **John Trapp** (Puritan) · **Coke** · **Sutcliffe** · **Alford's Greek Testament** (NT) · **Meyer** (NT critical, pre-1929 Eng. trans.) · **Gaebelein** *Annotated Bible* (pre-1929 vols) · **Peake** (1919 only).
- **Exclude:** Constable (living), EBC, New Peake 1962, ICC later vols (per-volume date-gate).

### 3d. Catholic / Medieval / Mystic
- **Cornelius à Lapide, The Great Commentary** ★ — Mossman/Cobb English, `greatcommentaryo01–08lapi`: **all 4 Gospels + Catholic Epistles + 1–2 Corinthians + Galatians** (the rest is Latin-only — do not chase).
- **Aquinas, Catena Aurea** — CrossWire `Catena` (cleanest) or Newman 1841 `catenaaureacomme0Xthom`.
- **Bernard** Sermons on Song of Songs (Eales), **Gregory the Great** Morals on Job (§2e). Mystics (tag `theology`): à Kempis (Gutenberg #1653), Julian (#52958), Teresa (Lewis 1904 / Zimmerman 1912), John of the Cross (Lewis 1891), de Sales, Ignatius (Mullan 1914), Catherine (Thorold 1896), Anselm (Deane 1903), Wycliffe *Select English Works* (Arnold 1869–71).

---

## §4. Bibles & original languages

### 4a. English PD/permissive (self-host) — beyond the already-listed BSB/WEB/KJV/ASV/Darby/YLT/Geneva
Douay-Rheims (Challoner), Webster 1833 (+ RWebster w/ Strong's), Rotherham Emphasized, JPS 1917, Tyndale NT, Wycliffe, Twentieth Century NT, Bible in Basic English, Catholic PD Version, Open English Bible (CC0), Brenton's LXX in English, Weymouth NT, Bishops'/Coverdale (Wikisource scans). **KJV-with-Strong's** via scrollmapper `KJV`/`KJVA` (upgrade over plain KJV).

### 4b. Original languages
- **Hebrew OT:** Westminster Leningrad Codex — openscriptures/morphhb (OSHB, text PD + lemma/morph CC BY 4.0, **has Strong's**); STEP `TAHOT` (CC BY 4.0, full Strong's + morph). Samaritan Pentateuch, MAM.
- **Greek NT:** Byzantine/Robinson-Pierpont RP2018 (byztxt, PD Unlicense, Strong's+morph), Textus Receptus (Scrivener/Stephanus), Nestle 1904 (biblicalhumanities), SBLGNT (CC BY 4.0), OpenGNT (CC BY-SA — share-alike), STEP `TAGNT` (CC BY 4.0, marks TR·Byz·WH·Tregelles·SBLGNT·THGNT per word), Westcott-Hort/Tischendorf/Tregelles (CrossWire `WHNU`/`Tisch`/`Treg`).
- **Greek OT:** Swete LXX (PD). **Exclude** Rahlfs, CCAT.
- **Word-study infra:** openscriptures/strongs (Strong's H+G dictionaries, PD), STEP `TBESH`/`TBESG`/`TFLSJ` lexicons (CC BY 4.0), openbible.info cross-refs (CC BY 4.0).

### 4c. Best bulk repos
1. **STEPBible-Data** (github.com/STEPBible/STEPBible-Data) — TAHOT + TAGNT + lexicons, all CC BY 4.0. Single best original-language source.
2. **open-bibles** (github.com/seven1m/open-bibles) — curated PD set, per-file license column, standardized USFM/OSIS/Zefania.
3. **scrollmapper/bible_databases** — 140 versions, but **filter by per-text `license` field** (bundles copyrighted LEB/LITV/MKJV).
4. **eBible.org** — per-translation copyright.htm + USFM/USX zips.

---

## §5. Historians (staged tier — chunked on their own headings, `HISTORY_RETRIEVAL_DESIGN`)

### 5a. CCEL/Gutenberg clean (publish-eligible tier)
- **Schaff** *History of the Christian Church* ★ — CCEL `schaff/hcc1`–`hcc8` (8 vols, dated §-headings = the chunk anchors; vol boundaries carry the era).
- **Eusebius** `npnf201`, **Socrates+Sozomen** `npnf202` (split by author), **Theodoret** `npnf203`.
- **Josephus** (Whiston 1737) CCEL `josephus/complete` — Antiquities 20 books + Wars 7 books.
- **Edersheim** ×4: `lifetimes`, `sketches`, `temple`, Bible History OT.
- **Rawlinson** *Seven Great Monarchies* (Gutenberg #16161–16167), **Bede** *Eccl. History* (#38326), **Foxe** *Book of Martyrs* (#22400, abridged — record ed.), **Merle d'Aubigné** *Reformation* (#40858/41470/41253/40971/41484), **Ramsay** *St Paul the Traveller* (CCEL `ramsay/paul_roman`, clean).

### 5b. archive.org OCR (staged only; dates spot-checked — a mis-OCR'd year is a wrong anchor)
- **Philo** (Yonge 1854 `worksofphilojuda01–04yonguoft`; **not** Loeb), **Schürer** (**OLD 1885–91 only** `historyofjewishp01–05sch`; **not** the 1973–87 revision), **G.A. Smith** *Historical Geography* (≤1907 printings), **Conybeare & Howson** *Life & Epistles of St Paul*, **Neander**, **Mosheim**.

---

## §6. Ranked ingestion order (clean-first — bank certainty before the OCR tar pit)

1. **Structured JSON / SWORD (zero OCR):** Keil & Delitzsch (HelloAO), the 6 new CrossWire NT modules, Catena Aurea (`Catena`).
2. **CCEL clean text (strip markup, re-provenance):** Spurgeon `sermons01–63` + Treasury · Maclaren Expositions · Chrysostom `npnf110–114` + Augustine `npnf106–108` + Origen `anf09` · the CCEL Puritan set (Owen/Watson/Flavel/Baxter/Bunyan/Edwards) · Wesley/Whitefield/Finney/Murray/Meyer/Torrey/Bonar · Ryle · Vincent · Josephus/Edersheim/Schaff/Ramsay (historians).
3. **Clean Gutenberg:** Whitefield *Works* (#68976), Robertson (#16645), Ryle *Practical Religion* (#38162), Rawlinson/Bede/Foxe/Merle d'Aubigné (historians), mystics.
4. **archive.org OCR — high-value coverage (budget cleanup):** Simeon Horae Homileticae · Pulpit Commentary · Lange · Ellicott · Cambridge · Manton + the Puritan Works sets · Parker Society batch · Andrewes/Donne/Taylor/Hooker · Morgan/Simpson/Meyer-character-books/Winslow · à Lapide · Gregory-on-Job/Cyril · Benson/Whedon/Scott/Trapp/Alford/Meyer/Gaebelein/Peake.
5. **Historian OCR (staged only):** Philo, Schürer (old ed), G.A. Smith, Conybeare-Howson, Neander, Mosheim.
6. **EEBO blackletter (last):** Perkins, earliest Burroughs/Mead.

## §7. Adapters needed (per source shape) — the build behind the queue

| Adapter | Sources | Status |
|---|---|---|
| CrossWire/SWORD | K&D?, 6 new NT modules, Catena, WH/Tisch/Treg | **exists** — extend |
| HelloAO JSON | Keil & Delitzsch, structured Henry/JFB/Clarke/Gill | new (simple REST) |
| CCEL ThML → text | Spurgeon, Maclaren, ANF/NPNF, Puritans, Wesley et al., Schaff, Josephus, Edersheim | **partial** — the biggest reuse |
| Project Gutenberg | Whitefield, Robertson, Ryle, mystics, Rawlinson/Bede/Foxe/Merle | new (clean txt/HTML) |
| archive.org OCR | Simeon, Pulpit, Lange, Manton, Parker Society, à Lapide, historians | **exists (harness OCR guardrails)** — the tar pit |
| GitHub bible repos | open-bibles, scrollmapper (license-filtered), STEP, morphhb, byztxt, strongs | new (bulk parse USFM/OSIS/TSV) |

## §8. Owner decisions (licensing calls are yours — flag, don't decide)

1. **Pink / Ironside / Morgan / Simpson / Gaebelein** — date-gate to pre-1929, or exclude the murky ones? (Pink's unrenewed-copyright status needs a call.)
2. **LSV** — manifest excludes it as "commercial-capped," but CC-BY-SA 4.0 permits commercial use with share-alike. Re-confirm against LSV's own statement or leave excluded.
3. **CC-BY-SA morphology** (OpenGNT/MorphGNT) — share-alike on derivatives; acceptable for the output contract, or stick to PD Strong's only?
4. **Foxe / G.A. Smith / Bede** — confirm the specific PD edition/translator per §1 before ingest.
5. **OCR cleanup budget** — the archive.org tier (Simeon, Pulpit, Lange, Parker Society, à Lapide, historians) is thousands of pages of OCR; this is where labor/spend actually helps.

---

# Run #2 — deeper & wider (2026-07-16)

## §1-add. Additional copyright traps (fold into the license gate)

- **Robertson, *Word Pictures in the NT*** — © renewed 1960; **exclude despite CCEL hosting it.** (CCEL presence ≠ PD.) Also exclude **Vine's** (1940) and **Wuest**.
- **Systematic-theology editions:** Berkhof (1938) ❌ · Bavinck English (Bolt/Vriend 2003–08) ❌ · Turretin English (Giger, P&R 1992) ❌ · à Brakel English (1992) ❌ · Pieper (1950) ❌ · **Warfield Oxford *Works* set (1927–32) — compilation-copyright trap; use his lifetime individual titles instead.**
- **Confession translations:** use Schaff's PD renderings + the **Jacobs 1911 / Henkel 1851** *Book of Concord* — **not** Tappert (1959) or Kolb-Wengert (2000); Trent = Waterworth 1848, not Tanner.
- **Rabbinic (the minefield):** Danby Mishnah (1933) ❌ US-© until 2029 · Soncino Talmud/Midrash (1935–52) ❌ URAA-restored · **Sefaria's William Davidson Talmud is CC-BY-NC — NC bars a commercial product** · all Dead Sea Scrolls translations ❌. Only PD English: Rodkinson Talmud (partial), De Sola & Raphall Mishnah (18 tractates), Etheridge Targums (Pentateuch), Charles's Apocrypha/Pseudepigrapha.
- **Linguistic data:** **ETCBC BHSA is CC-BY-NC (NonCommercial) — exclude; use MACULA Hebrew (CC BY 4.0) instead.** PROIEL (NC), CATSS LXX (restricted), Rahlfs/Göttingen LXX (©) all excluded. **Louw-Nida / UBS semantic-domain fields are embedded in some CC-BY datasets but are themselves © "used with permission" — strip/gate the `@ln`/`@domain`/`@sdbh` columns.**
- **Cross-ref/topical:** Thompson Chain-Reference (© trademarked) · "New" TSK (Jerome Smith, ©) · TSKe expanded (derivative ©) — use the original ~1880 TSK. **Theographic/viz.bible is CC-BY-SA (share-alike — owner call).**
- **Migne/non-English:** Luther Weimarer Ausgabe is **not** blanket PD (finished 2009 — date-gate per volume); Aquinas Institute/aquinas.cc bilingual = commercial; First1KGreek + Perseus = **CC-BY-SA** (share-alike).

## §2f. Sermon long-tail (~4,000–5,500 more units)

- **Joseph Parker, *The People's Bible*** ★ (27–28 vols, whole-Bible expository discourses, ~2,000 units) — archive.org `peoplesbibledisc13park` etc. Behaves like a commentary; chunk per passage. **The single biggest add in Run #2.**
- **T. DeWitt Talmage** (~500–800 sermons) — `500selectedsermo11talmiala`, `everydayreligion00talm`, Gutenberg #14139.
- **Newman, *Parochial & Plain Sermons*** (8 vols, 191) — `parochialplainse07newm` + newmanreader.org clean HTML.
- **Chalmers** *Works* (~250, filter to sermon vols) · **Ralph & Ebenezer Erskine** (~280, 18th-c. OCR) · **Luther/Lenker Church Postil** (~280) · **Keble** *Sermons for the Christian Year* (~200) · **Pusey** Parochial Sermons (~100) · **Phillips Brooks** (~200) · **M'Cheyne** Remains (~100) · **Melvill**, **Guthrie**, **Broadus**, **A.T. Pierson**, **Kingsley**, **Farrar**, **Christmas Evans**. Mostly archive.org OCR (queue behind the CCEL-clean tier); Parker + Talmage are the two priority OCR ingests by scale.

## §3e. Per-volume enumerations of the big OCR commentary sets

- **Pulpit Commentary** — 23-vol book map verified. **Ingest the Cornell 1890 PD family `cu31924101104481…104994` (+105xxx), NOT the lending-restricted 1980 `…hend` reprint.** cu items lack a volume field → recover book from each title page.
- **Lange** — 26 vols. Fastest map = the single bundle item `CommentaryOnTheHolyScripturesCriticalDoctrinalAndHomilectical.Lange` whose internal files are named by book+volume; per-vol scans `…languoft`.
- **Ellicott** — 8 vols, `biblecommentaryf01–08elliuoft` (vol 1 = Gen–Num verified).
- **Cambridge Bible for Schools & Colleges** — ~56 per-book vols; use the `cambridgebiblefo0000<author>` scans (book in the title) + Cambridge Greek Testament companion (~24, messy IDs).
- **Expositor's Bible** (Nicoll, ~49 vols) — **take the clean Gutenberg text, not the archive OCR**, and **exclude the copyrighted Zondervan EBC** it's polluted with. Expositor's Greek Testament = `expositorsgreekt0Nnico` (5 vols).
- *(Four sets — Lange full map, Cambridge ~56, Cambridge Greek, Expositor's ~49 — each finish enumeration in one archive.org `scrape` call; queries recorded with the discovery agent.)*

## §9. Systematic theology (`source_type='theology'`)

CCEL clean (first): **Charles Hodge** *Systematic Theology* 3v (`hodge/theology1-3`), **Calvin** *Institutes* (Beveridge, `calvin/institutes`), **Kuyper** *Work of the Holy Spirit*. Gutenberg: **A.H. Strong** *Systematic Theology* (#44035+). archive.org OCR: **Shedd** *Dogmatic Theology* 3v, **A.A. Hodge** *Outlines*, **Dabney** *Syllabus* (use 1878 scan, not Banner), **John Dick**, **Thornwell** *Collected Writings* 4v, **Kuyper** *Encyclopedia*. Exclude the copyrighted set in §1-add.

## §10. Confessions & catechisms (`source_type='confession'`)

**Two ingests cover the whole corpus:** **Schaff, *Creeds of Christendom* 3 vols** (CCEL `schaff/creeds1-3`, clean txt — vol III holds the full texts of Westminster, Heidelberg, Belgic, Dort, Scots, 39 Articles, Trent canons, etc.) + the PD **Book of Concord** (Jacobs 1911 `bookofconcord0000unse_m6y5` / Henkel 1851) for the whole Lutheran symbol set. Plus 2LBCF 1689 (Wikisource/1855 Spurgeon ed.).

## §11. Reference & lexicon layer (`source_type='lexicon'`)

**Structured flagships (SWORD/GitHub, zero OCR):** ISBE (CrossWire `ISBE`, ~9,800 articles) · BDB (openscriptures/HebrewLexicon XML, CC BY) · Thayer's (TEI-XML/archive) · Strong's H+G (morphgnt/openscriptures, PD/CC0). Plus the CrossWire PD dictionary cluster: `Easton`, `Smith`, `Nave`, `Torrey`, `AbbottSmith`, `Hitchcock`, `MLStrong` (Middle Liddell keyed to Strong's — the PD-safe LSJ path). **OCR tier:** McClintock & Strong Cyclopedia (12v — largest), Hastings, Kitto, Gesenius (Tregelles 1857), Cremer (Urwick 1895), Bullinger *Figures of Speech*, Young's Concordance. Exclude Robertson/Vine's/Wuest/LSJ-1940 (§1-add).

## §12. Cross-reference / topical / geo (structured, verse-keyed)

**Flagships:** **TSK** (~500k cross-refs, CrossWire `TSK`, PD) + **openbible.info cross-references** (~340k, vote-scored, CC BY 4.0 — ingest both, dedupe, use openbible's score for ranking) + **openbible.info Bible Geocoding** (verse-attested places, confidence scores, GeoJSON, CC BY 4.0 — the geo asset for the historian scripture-bridge). Plus **Nave's Topical** (`Nave`, PD), **Torrey** (`Torrey`, PD), **Robertson's Harmony of the Gospels** (Gutenberg #36264 → parallel-passage table). Owner-gated (CC-BY-SA): **Theographic/viz.bible** people/places/events/chronology/genealogy graph. Exclude Thompson Chain + New TSK (§1-add).

## §13. Jewish & Second-Temple (staged tier)

**PD flagships:** **R.H. Charles, *Apocrypha & Pseudepigrapha of the OT*** 2v (1913 — `CharlesRH…Vol11913`/`Vol21913`; Enoch, Jubilees, Testaments, etc.) · **Rodkinson Babylonian Talmud** (1896–1903, the *only* PD English Talmud, partial — sacred-texts.com clean HTML preferred over `NewEditionOfTheBabylonianTalmudComplete` OCR) · **Etheridge Targums** (Pentateuch, 1862 — juchre.org/sacred-texts clean) · **De Sola & Raphall Mishnah** (18 tractates, sacred-texts `/jud/etm/`) · **Jewish Encyclopedia** (Funk & Wagnalls 1901–06, 12v, PD — strong gazetteer seed for the §3/§4 entity anchors). Exclude Danby/Soncino/Sefaria-Davidson-NC/DSS (§1-add).

## §14. Deep linguistic layer (word-study)

**Flagship:** **MACULA Greek + MACULA Hebrew** (Clear Bible/Biblica, **CC BY 4.0** — syntax trees + morphology + lemma + Strong's + Berean glosses, in lowfat XML + flat **TSV**; the commercially-clean substitute for the NC BHSA). Index: **Biblical Humanities Dashboard**. PD lexical depth: **Dodson** (PD), **Abbott-Smith** (PD), **Tischendorf 8th** morphology (PD text). Share-alike (owner call): Perseus LSJ, MorphGNT, OpenGNT. **Exclude:** ETCBC BHSA (NC), PROIEL (NC), CATSS (restricted), UBS/Louw-Nida domains (© — strip from MACULA).

## §15. Non-English / Migne (mostly deferred — language-gated)

The app quotes **attributed English** voices, so these are infrastructure/gap-fill, not near-term voice sources. **Patrologia Latina** is feasible as Latin text (`patrologia-latina_1-221`, OCR'd HTML) for word/provenance backing; **Patrologia Graeca is scan-only — park it** (revisit if the 2026 arXiv PG-OCR corpus gets an open license). Highest-value gap-fill if a translation layer ever exists: **Cornelius à Lapide Latin complete** (`Commentaria-a-lapide`) — fills the whole-Bible gap the English (Gospels+CathEp+1-2Cor+Gal) leaves. First1KGreek/Perseus = clean TEI-XML but CC-BY-SA.

## §16. The copyrighted / licensable tier — the verdict (informs the copyright-flag plan)

**"User buys a license → we serve our stored copy" is not implementable for the modern non-Bible corpus.** Findings:
- **Modern commentaries, lexicons, study-bible notes** (NICNT/NICOT, WBC, BECNT, Pillar, NIGTC, BDAG, HALOT, TDNT, ESV/MacArthur/NIV Study, EBC-revised) live **only inside Logos/Faithlife, Accordance, Olive Tree, Tecarta** walled apps. Those platforms license *from* publishers to sell *inside their own apps*; **there is no third-party developer/redistribution channel.** Publisher-direct rights are already committed to that ecosystem (e.g. the Eerdmans–Logos NIC bundle). **Not obtainable at small scale.**
- **Modern Bible translations** are the *only* licensable modern content, and only **display-only via API, never stored:** API.Bible (ABS) commercial tier ~$10/mo per translation, DRM, ≤100-verse print cap — but **NIV-commercial is not available**; Crossway ESV API licenses **"to organizations, not solo developers,"** ≤500 verses stored; YouVersion Platform is free but **revokes access the moment you add a paid tier or ads.**
- **Devotionals** (Chambers, Keller, Tozer) = bilateral-only, no wholesaler; Keller's terms forbid third-party reposting.

**Implication for the flag-and-unlock plan:** build the **flag + per-account entitlement** UX by all means — but the only thing that can lawfully sit behind it is a **display-only licensed-translation API layer** (rights-holder-hosted, tiny/no cache, DRM, attribution). The high-value modern *commentary/lexicon* content a user might want to "unlock" cannot be stored or served by this app at any price — it's walled. Keep the served corpus PD/permissive; treat modern translations as display-only-API; do **not** store copyrighted full text behind a flag expecting a per-user license to cure it — that license channel doesn't exist. (Not legal advice; confirm any API terms in writing.)

---

# Run #3 — hymns · poetry · art (2026-07-16). Three new flags.

Three additive `source_type`s: **`hymn`**, **`poetry`**, **`art`** (small migration to the CHECK). Hymns/poetry are **text-only** (lyrics/poems — skip tunes/music); art is **image + metadata** (never text). All PD/CC0 unless flagged. These are attributed PD voices → concordance-safe (the Spurgeon-devotional precedent), a different register ("the church singing / imagining the text").

## §17. Hymns (`hymn`) — ~10,000+ texts

**The verse-anchor advantage:** hymns ride the *existing* verse-keyed retrieval — hymnals index by Scripture ref and metrical psalters map 1:1 to Psalms. Highest-anchor sub-tiers first.

- **Metrical psalters (Scripture versified — cleanest anchor):** **Scottish Metrical Psalter 1650** ★ (CCEL `anonymous/scotpsalter`, per-psalm HTML, complete 1–150 — the flagship clean win), Watts *Psalms of David Imitated* (Gutenberg #13166, 138/150), Tate & Brady, Sternhold & Hopkins, Bay Psalm Book. **Guard:** a metrical psalm is a *paraphrase/imitation* (Watts Christianizes Ps 72), tag as hymn-voice — never render as Scripture itself.
- **18th-c. foundation (~8,000, Wesley dominates):** **Wesley** *Poetical Works* (Osborn 13v, ~7,000; *Short Scripture Hymns* vols 9–10 are verse-by-verse), **Watts** *Hymns & Spiritual Songs* (Gutenberg #13341, clean), **Doddridge** *Hymns Founded on Various Texts* ★ (every hymn headed by one verse, canonical order — the natural-anchor gold standard), **Olney Hymns** (Newton & Cowper, CCEL `newton/olneyhymns`, clean), Toplady, Steele, Hart, Cennick.
- **Victorian/Anglican (~1,400):** **Keble** *Christian Year* (Gutenberg #4272, Scripture-epigraph per poem), Lyte *Spirit of the Psalms* (Psalm-indexed), Heber, Neale (originals), Faber, Monsell, C.F. Alexander, S.J. Stone *Lyra Fidelium* (creed-indexed), Ellerton, How, Baring-Gould.
- **Translated ancient/medieval (translator must be PD):** **Neale** (*Hymns of the Eastern Church* CCEL clean, *Mediaeval Hymns*), **Winkworth** (*Lyra Germanica* — German chorales), Caswall, Chandler, Mant. See the "use-this-PD-translation" table per famous hymn.
- **American & gospel (bulk):** **Gospel Hymns 1–6** (`1895gospelhymns1-6briever`, 739 songs, words-only) + **Sacred Songs & Solos** (Sankey, ~1,200, dedupe) + Sunday-school songbooks (Lowry/Doane) — carries **Fanny Crosby** (~8,000, distributed; clear per-text by pre-1929 date, not bulk), Bliss, Hoffman, Whittle. Gospel songs are single-verse expositions → strong anchors.
- **Women (~dedupe):** Havergal (*Ministry of Song*, verse-keyed), Waring, Borthwick & Findlater (*Hymns from the Land of Luther* — the only PD route to von Schlegel's "Be Still My Soul"), Rossetti hymns, Stowe.
- **Carols & spirituals:** Bramley & Stainer *Christmas Carols New and Old* (CCEL `bramley/carols`), Sandys 1833; **Slave Songs of the United States** (1867, DocSouth clean), Fisk *Jubilee Songs*, Dett (1927, now PD), Du Bois *Souls* (Gutenberg #408).

**Structured data / reference:** **OpenHymnal** (github `mzealey/openhymnal`, **fully PD incl. compilation** — the clean structured bulk win, ~1,000 hymns w/ scripture+meter) · **Julian's *Dictionary of Hymnology*** (`dictionaryofhymn01/02lond`, PD — the authorship/scripture-anchor backbone) · **big PD hymnals** (Hymns Ancient & Modern 1875, English Hymnal 1906 — per-hymn PD filter).
**★ Key licensing finding — Hymnary.org is NOT open.** Its verse-anchor index is gold but the *compiled database is © Harry Plantinga* (no CC license). Use its Scripture API to **discover** which PD hymns anchor where, then acquire text from OpenHymnal/archive/Wikisource — do **not** republish its DB. (An email to Plantinga could grant explicit permission — owner call.)
**Traps:** tune ≠ text (ingest lyrics only); compilations reprint each other → **attribute per-hymn, not per-book**, dedupe on first-line/refrain; modern hymnal editions carry compilation © though texts are PD (filter per-hymn); post-1929 gospel/worship (Brumley "I'll Fly Away" 1932, Stamps-Baxter, CCLI/Getty) excluded; translation © for ancient hymns (use Neale/Winkworth/Caswall, never modern); Baring-Gould/Havergal-Trust modern compilations ©.

## §18. Poetry (`poetry`) — ~5,000+ devotional poems

- **17th-c. metaphysical/devotional (the richest vein):** **George Herbert *The Temple*** ★ (~167 poems, Wikisource/CCEL clean — the flagship; note shaped poems need layout-aware ingest), Donne *Divine Poems/Holy Sonnets* (Gutenberg #48688, Grierson), Vaughan *Silex Scintillans* (archive — the sacred Vaughan is NOT in the Gutenberg vol), Crashaw (#38549/#38550), Traherne (#61586), Herrick *Noble Numbers* (#22421, isolate from secular *Hesperides*), Quarles *Emblems*, Christopher Harvey *The Synagogue*.
- **Milton & biblical epic (verse-anchored by subject):** **Milton** *Poetical Works* (Gutenberg #1745 — *Paradise Lost*=Gen 1–3, *Paradise Regained*=Matt/Luke 4, *Samson*=Judges, Nativity Ode), Cowley *Davideis* (1 Sam), Drayton's divine poems (EEBO-TCP A20831 — Noah/Moses/Goliath), Klopstock *Messiah* (Egestorff PD trans), Young *Night Thoughts*, Montgomery *World Before the Flood*.
- **Puritan/colonial & American:** Wheatley *Poems* (#409), Wigglesworth *Day of Doom* (#58716), Bradstreet (Ellis 1867), Whittier, Longfellow (*Divine Tragedy*), Lanier, Jones Very. **EXCLUDE Edward Taylor** (no PD edition — mss unpublished until 1937+, all editions ©). **Emily Dickinson: only the 1890s Todd–Higginson editions are PD** (Gutenberg #12242/#12241) — never Johnson/Franklin numbered texts.
- **Victorian:** **Christina Rossetti** ★ (*Verses* #77809, *Poems* #19188), Hopkins (#22403 — **only the 1918 first ed.**), Tennyson *In Memoriam* (#70950), EBB, Keble *Christian Year* (#4272), Newman *Dream of Gerontius* (#48927), Patmore, Procter, Faber, Ingelow.
- **Dante & medieval via PD translation:** **Dante** — Longfellow (#1001–1004) + Norton prose (#1995–97) + Cary (#1008); *Vita Nuova* (D.G. Rossetti #41085). **AVOID Binyon (1933–43, ©).** Prudentius (Pope 1905, #14959), Bernard of Cluny/Fortunatus/Stabat Mater (Neale/Caswall), Cynewulf/Cædmon/*Dream of the Rood* (Kennedy), *Piers Plowman* (Skeat, but Middle English — UX flag), *Everyman* & mystery cycles.
- **Anthologies (Scripture-indexed bulk wins):** **Schaff *Christ in Song*** (`christinsonghymngrc00scha`, arranged by Christ's life, fully attributed), Erskine *Scripture Songs* (versified per-passage), *The Poets' Bible* (Horder — Bible-order, but no neutral-host copy: owner call), Lyra Sacra, Oxford Book of English Mystical Verse (1917).
**Traps:** the risk is the *editor, not the poet* — every poet is PD, but exclude modern critical apparatus (Hutchinson-Herbert 1941, Gardner-Donne 1952, Stanford-Taylor, Johnson/Franklin-Dickinson, Kavanaugh–Rodriguez-John-of-Cross); filter religious verse out of mixed Poetical Works; `…0000unse`/borrow-only rescans = modern reprints, use the named pre-1929 scans.

## §19. Art (`art`) — image + metadata, tens of thousands CC0

> **⏸ PARKED (2026-07-16) — DO NOT INGEST.** Art waits on an image subsystem (storage/CDN, thumbnails/IIIF, a lightbox, and the reproduction-copyright license gate — none of which exist). This section is the **complete known-known**: the sources, licenses, the Iconclass→verse anchor, and the flagship sets are fully documented here so acquisition never has to be re-researched. When the image subsystem is built, pull art in from this map — no rediscovery needed. (Decision: `docs/CONTENT_GO_LIVE.md` §5.)

**The cleanest license situation in the whole project** — CC0 museum images, no OCR tar pit, structured JSON from day one.
- **★ The anchoring crown jewel — Iconclass (CC0):** the standard iconography classification's biblical branch (`7`=Bible) **already embeds Scripture citations in its code definitions** (e.g. `73D6` Crucifixion → "Matthew 27:45-58; Mark 15:33-45; Luke 23:44-52; John 19:25-38"). Parse those refs through `ref-parse.ts` → an `iconclass_scripture` gazetteer (the art analogue of `pericopes.ts`, ~80–90% pre-built and free). **Wikidata (CC0)** is the artwork spine (`P1257` depicts-Iconclass joins straight to it); **Getty ULAN/TGN** (ODC-By, attribution) normalize artist/place.
- **Flagship verse-captioned engraving sets (each plate → a passage):** **Gustave Doré Bible** (241 plates, 1866, **each captioned with its verse** — gold anchors), **Tissot *Life of Christ*** (~350, Brooklyn Museum "no copyright restrictions"), **Schnorr von Carolsfeld *Bibel in Bildern*** (240 woodcuts), **Blake *Job*** (22, verse in the margins), Dürer *Apocalypse* (15, Revelation), Holbein *Icones* (OT, Latin captions), Rembrandt biblical etchings.
- **Museum CC0 collections (start order):** The Met (CC0, API + GitHub dump, Wikidata-linked tags) → **Rijksmuseum** (CC0 + **Iconclass codes** = best anchor metadata) → Art Institute Chicago (CC0) → Cleveland (CC0, keyless) → NGA/Getty/Yale (coverage gaps) → Wikimedia Commons (long tail, per-file gate).
- **Model:** additive `017_art_*` tables (`artworks`, `artwork_iconclass`) + reuse `section_anchors` for the verse bridge via the Iconclass gazetteer. Store thumbnails/web-size derivatives (IIIF for exact sizes), never full-res masters (~tens of GB total).
**Traps:** **National Gallery London** asserts © on reproductions of PD art — **exclude** (per *Bridgeman v. Corel*, faithful 2-D repros of PD art = PD; prefer institutions that affirmatively apply CC0/PDM); CC-BY-**NC** anywhere = exclude (commercial product); Europeana rights are per-provider (filter `reusability=open`); **VCS (thevcs.org) & textweek** are rights-managed/link-indexes — reference only, never scrape; Getty vocabularies are ODC-By (attribution required, not CC0); auto-classified Iconclass codes are app inference until human-reviewed (stage→publish gate).
