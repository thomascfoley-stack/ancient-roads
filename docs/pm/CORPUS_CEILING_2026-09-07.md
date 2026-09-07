# The new ceiling — corpus acquisition target, 2026-09-07

Six research lenses, run in parallel, each cross-checked against the actual 918-entry manifest
(`ingest/sources.config.json`) so nothing below is already declared. This is not a re-statement of
`ACQUISITION_MANIFEST.md` — it goes past it, and corrects two of its claims along the way (Orthodox
§4b re-confirmed accurate; the "9-vs-11 authors" framing was never in scope here).

**Headline number: ~130 genuine new candidates found**, none previously tracked anywhere in this
repo. The manifest's 918 was never the ceiling — it was the plan someone wrote in July, and this is
the first time anyone has checked it against the actual universe of acquirable PD/CC theological
literature.

## Universal rules — these bind every item below

**Carried verbatim in substance from `ACQUISITION_MANIFEST.md` §Universal rules.** They were applied
during this research; they are restated here because a candidate list that travels without its
preconditions gets acted on without them.

- **Store a per-work provenance + license record** — author, death date, edition/translator + year,
  PD basis, source URL, retrieved-at, checksum. **Fail closed:** no confirmed PD/CC license →
  quarantined, never published.
- **The edition trap.** An author being PD does **not** mean every edition is. Modern critical
  translations/editions are routinely copyrighted. Always take the old PD edition and record which
  one. Every row below names its USE edition for this reason.
- **CCEL** — the underlying *text* is PD and usable, but **CCEL's own editions and markup are
  commercially restricted.** Extract the text, strip CCEL markup, re-provenance to the original PD
  edition. Do not ship CCEL's files. *(Note: this rule is in live tension with current practice —
  876 of 918 manifest entries are ccel.org-provenanced. That tension is an open owner call, already
  surfaced in the 2026-09-06 handoff packet; it is not resolved by this document.)*
- **SWORD modules** — being on CrossWire ≠ PD. Read each module's `.conf` `DistributionLicense`.
  Exclude any not marked Public Domain.
- **Never scrape** BibleHub, StudyLight, monergism, sermonaudio, blueletterbible, desiringgod,
  ligonier (ToS-protected). Use neutral sources: eBible.org, archive.org, Project Gutenberg,
  Wikisource. **The enforced gate only catches the first three** (`src/ingest/forbidden-provenance.mjs`)
  — the rest are forbidden by rule with no automated check, so they must be caught by the person
  writing the manifest entry.

### Additional rules this research established — not in the original doc

- **The name-collision trap.** Ten confirmed near-misses were caught during this pass, each of which
  would have produced a false "already covered" or a wrong attribution: Johann Gerhard (Lutheran
  theologian) vs **Paul Gerhardt** (hymnwriter) · Heinrich Bullinger (Reformer) vs **E.W. Bullinger**
  (dispensationalist) · Thomas Hooker (Puritan) vs **Richard Hooker** (Anglican) · Thomas Brooks
  (Puritan) vs **Phillips Brooks** (via `jowett-brooks`) · John Lightfoot (Puritan Hebraist) vs
  **J.B. Lightfoot** (bishop) · Andrew Fuller (Baptist) vs **Thomas Fuller** (Anglican historian) ·
  Thomas Vincent (Puritan) vs **Marvin R. Vincent** (lexicographer) · Catherine of Siena vs **Anne
  Catherine Emmerich** · Nicholas Ridley vs **Frances Ridley Havergal** · Thomas Crosby (Baptist
  historian) vs a different Crosby already in the manifest. **Verify the person, not the surname.**
- **Composite volumes carry non-authorial matter (ADR-029).** Many candidates below are anthology
  or collected-*Works* volumes — Parker Society, Nichol's Series of Standard Divines, ANF/NPNF,
  multi-volume *Works* sets. These are exactly the shape that binds a foreign author's text under
  one attribution. Any such acquisition must be sliced at work boundaries with per-work attribution
  before publish, per ADR-029 rule 2 — **not** screened by detector alone, which was measured at
  40% false-PASS on never-seen works (2026-09-07).
- **An entry without a working adapter is silently skipped.** `adapter-loop.ts` dispatches only
  `ccel` and `gutenberg`. Writing an archive.org-only candidate into `sources.config.json` does not
  stage it — it creates an entry the loop passes over, which reads as success and pollutes the
  never-acquired backlog metric.
- **"Pre-1929" is a shorthand, not the rule.** Two distinct failure modes it misses: (1) US works
  published 1929+ run **95 years from publication** — Vine's *Expository Dictionary* (1940) and the
  LSJ 9th ed. (1940) are copyright until **2036**, not PD now; (2) foreign-published works can have
  copyright **restored under URAA** and run life+70 regardless of publication date — *The Way of a
  Pilgrim* (French trans., UK 1930) is likely protected until ~2039. Verify the term, don't count
  years from the title page.
- **"No PD English exists" is a finding worth recording, not a silence.** Confirmed this pass for:
  Melanchthon's *Loci Communes*, Chemnitz, Bucer's main corpus, **Turretin's *Institutes*** (the
  widely-repeated "PD 1900" claim is false — verified against the archive.org item itself, it is the
  1992 P&amp;R/Dennison edition), Peter Lombard, Duns Scotus, Ockham, Hugh/Richard of St. Victor,
  Bonaventure's *Itinerarium*, and later Orthodox (Philokalia/Palamas/Symeon). Recording these
  prevents the same research being re-run in six months.

## The one finding that matters more than any single work

**Almost everything below is archive.org-only, and the archive.org adapter lane has exactly one
working profile (`thayers-lexicon`).** Every major reference commentary (Pulpit Commentary, Lange,
ICC, Alford, Meyer, Ellicott, Cambridge Bible, Simeon, Parker, Godet, Trench), Cornelius a Lapide,
Haydock's Catholic commentary, and the entire Parker Society English-Reformation series (~55
volumes, which alone would close most of the Anglican hole below) have **zero CrossWire or
Gutenberg alternative**. Building a general archive.org OCR adapter is a bigger single lever than
any acquisition on this list — it's the thing that turns ~80 of these ~130 candidates from
"blocked" to "routine."

## The second finding: volume ≠ breadth, confirmed independently three times

Three separate lenses, working blind to each other, found the same shape:

- **Anglican** — 136 tagged entries, but Jewel's *Apology*, Hooker's actual *Laws of Ecclesiastical
  Polity* (the manifest has only a minor discourse), Ridley, Hooper, Whitgift, and the *Book of
  Homilies* — the entire 1547–1610 founding layer — are **zero**. Everything present is later
  (Restoration divines, 18th-c. apologists, 19th-c. devotional writers).
- **Reformed** — 147 tagged, almost all Calvin. Vermigli, Beza, Zanchi, Witsius, Turretin: **zero**.
- **Puritan/Baptist** — real depth in three towers (Owen 33 entries, Spurgeon ~85, Manton 9), but
  the names that actually define "Puritan" to anyone outside this corpus — Perkins, Sibbes,
  Goodwin, Burroughs, Brooks, Gurnall, Swinnock — are **zero**. Baptist beyond Spurgeon/Bunyan
  (Fuller, Carey, Booth, Keach, the 1689 Confession) is **zero**.

High tag-counts here read as depth but are two or three mega-authors carrying the average.

## Free or near-free wins — do these regardless of anything else

| Item | Cost | Why |
|---|---|---|
| **Publish the 27 already-staged historian works** | Zero new acquisition — already paid for | Register is 96% invisible: only Josephus is published. Edersheim (3), Eusebius, all 8 Schaff HCC volumes, Philo, Socrates/Sozomen/Theodoret are sitting done and unpublished. Ties into the publish-batch runbook already in flight |
| **Strong's Exhaustive Concordance** | Zero OCR — ships structured from `github.com/openscriptures/strongs` | Thayer's and BDB are both already Strong's-numbered and shipped; there is currently no concordance to search *from* that numbering |
| **Douay-Rheims (Challoner revision)** | Same static-JSON Bible pipeline as the 18 already shipping | The one *categorical* gap, not a depth gap: zero non-copyrighted Catholic Bible text exists on the platform right now |
| **D'Aubigné's History of the Reformation (5 vol)** | Gutenberg, no OCR | The single best-known narrative Reformation history, distinct register from Schaff's academic HCC |
| **Julian's Dictionary of Hymnology** + **OpenHymnal dataset** | archive.org text / github structured | Turns the existing scattered hymn corpus into something searchable by scripture-anchor and author |

## Catholic / Orthodox / Medieval

Existing coverage already runs deeper than `ACQUISITION_MANIFEST.md` §4a suggests — Bernard, John
of the Cross, Teresa, Ignatius, Pascal, de Sales, Eckhart, Julian of Norwich, Catherine of Siena,
Abelard, Anselm are all already declared. What's below is genuinely absent.

| Figure | Work | Edition | Source | Note |
|---|---|---|---|---|
| **Cornelius a Lapide** ★ | *The Great Commentary* | Mossman 1876–1908 | archive.org `greatcommentaryo05lapi` | The known crown-jewel gap |
| **Haydock's Catholic Bible Commentary** ★ | Whole-Bible, Douay-Rheims-keyed | 1859 Dunigan &amp; Bro. | archive.org `haydock-catholic-bible-comment-...` | **Arguably bigger than Lapide** — the Catholic Matthew Henry/JFB, currently zero |
| Thomas Aquinas | *Summa Theologica*, complete | Dominican Province trans. 1911/1920–22 | archive.org, OLL | Manifest only has an abridgment |
| F.W. Faber | Devotional corpus (4+ works) | 1850s–60s | archive.org | Major devotional voice, zero presence |
| Alphonsus de Liguori | *The Glories of Mary* (full) | 1888 first complete trans. | archive.org | Manifest has only the short *Uniformity* |
| Louis de Montfort | *True Devotion to Mary* | Burns &amp; Lambert 1863 | archive.org | Verify translator at ingest |
| Angela of Foligno | *Book of Divine Consolation* | Steegmann 1908/09 | archive.org | — |
| Richard Rolle | *The Fire of Love* | Misyn 1435/Comper 1914 | archive.org | Companion to the already-present Julian of Norwich |
| Walter Hilton | *The Scale of Perfection* | Cressy 1659 base | archive.org | — |
| *The Cloud of Unknowing* | anon. 14th c. | ed. Underhill 1912 | archive.org | Underhill's mechanism already proven (4 other titles present) |
| Francis/Bonaventure | *Little Flowers* + *Life of St. Francis* | Temple Classics c.1905–10 | archive.org | — |
| Alban Butler | *Lives of the Saints* | 1866/1883/1894 eds. | archive.org | ⚠️ avoid the 1985 Walsh revision — copyrighted |
| Jacobus de Voragine | *The Golden Legend* | Caxton/Ellis 1900 | archive.org (7 vols) | — |
| John Henry Newman | *Grammar of Assent*, *Idea of a University* | original PD pub. | archive.org/Gutenberg | Extends an existing voice (4 titles already present) |
| Vladimir Solovyov | *The Justification of the Good* | Duddington trans. 1918 | archive.org | First substantial Orthodox systematic-theology voice beyond patristic |

**Confirmed EXCLUDE (checked, not gaps to chase):** *The Way of a Pilgrim* — looks like a
pre-1930 win, isn't; only translation is French 1930, likely under copyright to ~2039 via URAA
foreign-work restoration. Philokalia/Palamas/Symeon — §4b's "no PD English" reconfirmed accurate.
Bonaventure's *Itinerarium*, Peter Lombard's *Sentences*, Duns Scotus, Ockham, Hugh/Richard of St.
Victor — no PD English translation of any of these exists; a genuine desert, not a research gap.

## Reformation — Continental, English, Anglican

| Figure | Work | Edition | Source |
|---|---|---|---|
| Peter Martyr Vermigli | *Common Places* | Marten 1583 | archive.org |
| Theodore Beza | *A Briefe...Summe of the Christian Faith* | Fills 1563 (EEBO-TCP, CC0) | — |
| Jerome Zanchius | *Absolute Predestination* | Toplady 1769 | 19th-c. reprints |
| Herman Witsius | *The Oeconomy of the Covenants* | Crookshank 1771/1822 | archive.org |
| William Ames | *The Marrow of Sacred Divinity* | 1642/43 trans. | archive.org |
| **John Jewel** | *Apology of the Church of England* | Parker Soc./Ayre 1845–50 | archive.org, Gutenberg #17678 |
| **Richard Hooker** | *Of the Laws of Ecclesiastical Polity* — his actual magnum opus | Keble 1836/1888 | archive.org — manifest has only a minor discourse |
| Nicholas Ridley | *Works* | Parker Soc./Christmas 1841 | archive.org |
| John Hooper | *Early/Later Writings* | Parker Soc. 1843 | archive.org |
| Miles Coverdale | *Writings and Translations* | Parker Soc./Pearson 1844–46 | archive.org |
| John Whitgift | *Works* (3 vol) | Parker Soc./Ayre 1851–53 | archive.org |
| **Book of Homilies** | *Certain Sermons or Homilies* — the formulary Article XXXV names directly | Griffiths 1859 | archive.org |
| E.C.S. Gibson | *The Thirty-Nine Articles* — the standard commentary | 1896–97 | archive.org |
| Gilbert Burnet | *Exposition of the 39 Articles* + *History of the Reformation of the C of E* | multiple PD eds. | archive.org |
| James Ussher | *A Body of Divinity* | 1648/1702 | archive.org |
| John Pearson | *An Exposition of the Creed* | 1830 | archive.org |

**No PD English exists** (confirmed, not a gap to chase): Melanchthon's *Loci Communes*, Martin
Chemnitz, Martin Bucer's main corpus, Francis Turretin's *Institutes* — a widely-repeated claim that
Turretin has a "PD 1900" translation is **false**; verified directly against the archive.org item,
it's the 1992 P&R/Dennison edition. Latin originals only.

**The single highest-leverage acquisition in this whole section:** the Parker Society's ~55-volume
series is one well-defined, fully-PD, systematically checkable source that closes nearly the entire
Anglican/English-Reformation hole in one pass.

## Puritan &amp; Baptist canon

**Verdict on "heavily Baptist/Reformed":** earned by volume and three towering figures (Owen,
Spurgeon, Manton), not by canonical breadth. John Gill — the manifest's own most-Baptist author by
content — is tagged `tradition:'reformed'` in the database, so the corpus's internal "baptist"
bucket (90 entries) is almost entirely Spurgeon plus Bunyan.

**Zero coverage — Puritan:** Perkins, Sibbes, Goodwin, Burroughs, Thomas Hooker (Puritan, not
Richard), Winslow, Thomas Brooks, Gurnall, Swinnock, Isaac Ambrose, William Bridge, Bolton, Preston,
Traill, Trapp, Bates, Vincent (Thomas), Venning, Thomas Adams, Reynolds.

**Present but flagship work missing** — cheaper than a new author: Charnock (has 6 minor entries,
missing *Existence and Attributes of God*, his actual magnum opus); Howe (only vols V–VIII of
*Works* — literally half a set); Boston (has 1 minor work, missing *Human Nature in its Fourfold
State*, his most-read book); Baxter (missing *A Christian Directory*); Clarkson (1 funeral sermon
only, missing full *Works*); Rutherford (missing *Lex, Rex*).

**Zero coverage — Baptist:** Andrew Fuller (*Complete Works*, ed. Belcher 1845, 3 vol — the most
important Baptist systematic theologian missing entirely), William Carey (*An Enquiry...*, 1792 —
single pamphlet, cheap, the founding document of the modern missions movement), Abraham Booth,
Benjamin Keach, Hanserd Knollys, William Kiffin, Robert Hall, John A. Broadus (pairs with Boyce,
already present), Isaac Backus, Thomas Crosby's *History of the English Baptists* (the manifest's
one "Crosby" entry is a different person), and **the 1689 Second London Baptist Confession itself —
currently zero Baptist confession text exists in the `confession` category.**

Most of this sits in Nichol's Series of Standard Divines (19th-c., uniformly PD, on archive.org
already) or single-volume 19th-c. reprints — no edition-year sleuthing, no Monergism/Grace-Gems
dependency, nothing larger than Goodwin's 12 volumes.

## Major reference commentaries

All 8 originally-flagged absences confirmed genuinely absent, plus 14 more found. **None of the 22
have a CrossWire or Gutenberg edition — every one is archive.org-only, i.e. blocked on the adapter
lane.**

| Work | Author | Edition | Vols |
|---|---|---|---|
| **The Pulpit Commentary** | Spence-Jones &amp; Exell | 1880–1919 | 23, whole Bible |
| **Lange's Commentary on the Holy Scriptures** | Lange, ed. Schaff | Scribner's 1864–80 | 25 + index |
| International Critical Commentary (pre-1929 vols only) | Briggs/Driver/Plummer | 1895–1928 | filter by year |
| Alford's Greek Testament | Henry Alford | 1863–78 | 4 |
| The Expositor's Greek Testament | W.R. Nicoll (ed.) | 1897–1910 | 5 |
| Meyer's Critical &amp; Exegetical Commentary | H.A.W. Meyer | Funk &amp; Wagnalls 1884–88 | 11 |
| Ellicott's Commentary for English Readers | C.J. Ellicott (ed.) | Cassell 1878–84 | 8, OT+NT |
| Cambridge Bible for Schools and Colleges | Perowne (gen. ed.) | 1877–1922, pre-1929 vols | 56 (most labor-intensive item on the list) |
| Simeon's Horae Homileticae | Charles Simeon | 1832–33 | 21, whole Bible sermon-skeletons |
| Joseph Parker's The People's Bible | Joseph Parker | Funk &amp; Wagnalls 1885–95 | 25–27 |
| Strong's Exhaustive Concordance | James Strong | 1890 | — (also listed above as a free win via openscriptures) |
| Trench's Synonyms of the NT | R.C. Trench | 1880s–1906 | — |
| A.T. Robertson's Grammar (Greek NT) | A.T. Robertson | 1914 | distinct from his already-present *Word Pictures* |
| Bengel's Gnomon | J.A. Bengel | Fausset ed. 5 vol | — |
| Godet's Commentaries (John/Luke/Romans/1 Cor) | Frédéric Godet | 1870s–80s | 4 separate works |
| Wordsworth's Greek Testament with Notes | Christopher Wordsworth | 1856–60 | 4 NT + 6 OT |
| J.B. Lightfoot on Galatians/Philippians/Colossians | J.B. Lightfoot | 1865/68/75 | — |
| Westcott's John + Epistles of John | B.F. Westcott | 1881/1892 | complements already-present Hebrews vol |
| Whedon's Commentary (Methodist/Arminian) | D.D. Whedon | 1860s–80s | ~14 |

**Confirmed excluded:** Vine's Expository Dictionary — copyright status genuinely disputed, do not
acquire without a Copyright Office renewal-records check. Wuest's Word Studies — confirmed still in
copyright (renewed 1970s). Poole's *Synopsis Criticorum* — PD but Latin-only, no complete PD English
translation exists.

**Most transformative if built first:** Pulpit Commentary (whole-Bible breadth in one set), then
ICC (the corpus currently has almost no peer-reviewed academic-critical register — it's
overwhelmingly popular/pastoral/homiletic), then Lange, then Meyer (rigorous philological texture
nothing else supplies).

## Historians

**The actual highest-value move costs zero new acquisition**: publish the 27 already-staged
historian works (see Free wins above). Beyond that:

| Work | Author | Edition | Why |
|---|---|---|---|
| **Biblical Researches in Palestine** | Edward Robinson | 1841, 3 vol | Founding work of the entire biblical-geography tradition — Thomson, Conder, G.A. Smith all build on it |
| *The Land and the Book* | William Thomson | 1859/1880 | Classic manners-and-customs companion to Edersheim |
| **D'Aubigné's History of the Reformation** | J.H. Merle D'Aubigné | H. White trans., 1840s–60s | Gutenberg, cheap (also listed as a free win above) |
| Tacitus, *Annals* (esp. XV.44) | Cornelius Tacitus | Church &amp; Brodribb 1876 | Small text, outsized value — the one clean non-Christian corroboration of the Nero persecution |
| Sayce, *Patriarchal Palestine* + *Fresh Light from the Monuments* | A.H. Sayce | 1895/1884 | Ties Genesis patriarchal narrative to ANE monument evidence |
| Layard, *Nineveh and Its Remains* | A.H. Layard | 1849, 2 vol | Founding Assyriology narrative, backs Jonah/Nahum/2 Kings |
| Petrie, *Egypt and Israel* + *Researches in Sinai* | W.M.F. Petrie | 1911/1906 | Egyptology counterpart to Layard |
| Fisher, *History of the Christian Church* | G.P. Fisher | 1887 | Shorter complement to Schaff's 8-vol set |
| Conder, *Tent Work in Palestine* | Claude Conder | 1878 | Primary Palestine Exploration Fund account |
| Kitto, *Daily Bible Illustrations* | John Kitto | 1849–53, 8 vol | Different register: short daily entries |
| Geikie, *The Holy Land and the Bible* | Cunningham Geikie | 1887, 2 vol | Second independent voice in Thomson's genre |
| Stanley, *Lectures on the History of the Jewish Church* | A.P. Stanley | 1863–76, 3 vol | OT narrative history |
| Warren, *Underground Jerusalem* | Charles Warren | 1876 | Complements Edersheim's *The Temple* archaeologically |

**Judgment calls, not recommendations** (flagged, owner's to decide): Gibbon's *Decline and Fall* —
PD and famous, but mostly a secular political history of the whole empire; only ch. 15–16 and
scattered material is church-relevant, and excerpting cuts against the corpus's no-excerpt
discipline. Missions history (Eugene Stock et al.) — arguably outside the register's stated scope
("biblical/Jewish background + church history").

## Bible translations, lexicons, hymnody

### Translations (separate static-JSON pipeline)

| Translation | Tradition it fills | Edition |
|---|---|---|
| **Douay-Rheims (Challoner)** | Catholic — currently zero representation | Challoner 1749–52 |
| Brenton's Septuagint (the actual translation, not the grammar already present) | Orthodox-adjacent | Brenton 1851 |
| Wycliffe's Bible (Purvey rev.) | Earliest English | Forshall &amp; Madden 1850 ed. — needs transcription, Middle English |
| Bishops' Bible (1568) | Anglican, KJV's direct predecessor | scan only, OCR cost |
| Coverdale Bible (1535) | First complete printed English Bible | Parker Soc. reprint batch is the cleaner base |
| Emphatic Diaglott | Restorationist | Wilson 1864 |
| Julia E. Smith Parker Translation | Independent — first Bible translated entirely by a woman | 1876 |

### Lexicons &amp; reference tools

BDB and Thayer's are already present — not gaps.

| Work | Adds |
|---|---|
| **Strong's Exhaustive Concordance** | The index Thayer's/BDB are keyed to but can't be searched from (free win, see above) |
| Gesenius' Hebrew and Chaldee Lexicon | Tregelles trans. 1857 |
| Robinson's Greek-English Lexicon of the NT | Pre-Thayer standard, distinct philological tradition |
| Cremer's Biblico-Theological Lexicon | Theological rather than philological angle |
| Young's Analytical Concordance | Alternate original-language-rooted concordance |
| "Middle Liddell" (abridged Liddell &amp; Scott 1889) | ⚠️ NOT the full LSJ — the famous 1925–40 LSJ 9th ed. is copyrighted to 2036; CrossWire module `MLStrong` is the PD-safe path |
| McClintock &amp; Strong's Cyclopedia (12 vol) | Largest 19th-c. English Bible/theology encyclopedia |
| Kitto's Cyclopedia of Biblical Literature | Distinct from ISBE/Schaff-Herzog/Hastings/Smith's/Easton's already shipped |
| Girdlestone's Synonyms of the OT | Complements BDB |

### Hymnody, poetry, devotional

Watts, Charles Wesley, Newton/Cowper, Herbert, Rossetti, Keble are **already shipped** — not gaps.

| Work | Adds |
|---|---|
| Hymns Ancient and Modern (1861) | Most influential English hymnal — no PD hymnal of this stature shipped yet |
| Toplady's hymns ("Rock of Ages") | Entirely absent Calvinist-evangelical hymn voice |
| Doddridge's *Hymns Founded on Various Texts* | He's present via 2 sermon works; his hymn collection isn't |
| Bonar's hymn collections | Present via 2 prose works; hymns aren't |
| Havergal's *Ministry of Song* | Present via 1 devotional prose work; hymns aren't |
| Sankey's *Sacred Songs and Solos* | Revivalist gospel-song genre, structurally distinct from anything shipped |
| Fanny Crosby (pre-1929 collections only) | Most prolific American hymn writer, entirely absent |
| The Sacred Harp (1844) | American shape-note folk hymnody — an oral tradition, unlike anything shipped |
| **Julian's Dictionary of Hymnology** + **OpenHymnal** | Free wins, see above — make the whole hymn corpus scripture-searchable |

## What this means for sequencing

1. **The free wins first** — publish the historian backlog, ingest Strong's Concordance
   (zero-OCR), add Douay-Rheims. All three are cheap and each closes a real, named hole.
2. **Expand the manifest itself.** ~130 candidates found here exist nowhere in
   `ingest/sources.config.json` — the "never acquired" delta everyone's been measuring against 918
   has never included them. Until they're declared, no future census will ever surface them as
   missing.
3. **Scope the archive.org adapter as its own tracked build**, not squeezed into a capped
   acquisition wave. It's the dependency for roughly 80 of the ~130 candidates above, including the
   two largest single findings (Parker Society, the reference-commentary tier).
4. **Everything Gutenberg/CrossWire/structured-source** (D'Aubigné, Tacitus, Carey's *Enquiry*,
   several individual Puritan treatises, Strong's, Julian's Dictionary, OpenHymnal) is acquirable
   through the existing pipeline right now, no new engineering required.
