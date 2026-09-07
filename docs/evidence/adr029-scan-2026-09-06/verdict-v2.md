# ADR-029 scan verdict v2 — staged set, 2026-09-07 (deep-audit H-1 remediation)

- supersedes (does not replace): `verdict.md` (v1, detector 2.0.0) — v1 stays as the audit trail.
- detector version: **2.1.0** (`scripts/lib/front-matter-detector.mjs`, DETECTOR_VERSION)
- input set: `docs/evidence/adr029-scan-2026-09-06/input-slugs.txt` — **133 works**, sha256
  `2521d3463d1a8625c7cf6db5304274cab6813d2f2b78bd0f9ada7eb6a5829cf1` (verified byte-identical to v1
  before scanning).
- store: dev branch only (`ep-tiny-hat`, read-only txn). No production connection.
- method: unchanged from v1 — every section of every staged work through `sweepWorkMatter`;
  **FAIL = ≥1 STRONG finding.** A detection is a claim to be read, never a deletion (ADR-029 rule 2).
- evidence: unit red/green `redproof-v2.log` (15 new H-1 cases red on 2.0.0, 70/70 green on 2.1.0);
  labelled set `labelled-v2.log` (11/11 positives, 3/3 kept negatives clean — BAR MET);
  full output with per-finding JSON detail `scan-v2.log`.

## DIFF SUMMARY vs v1 — 90 PASS / 43 FAIL → **75 PASS / 58 FAIL** (15 flips, all PASS→FAIL; zero FAIL→PASS)

PASS dropped by 15 — the audit's 8 proven misses plus 7 more of the same classes the audit
predicted ("the false-negative rate almost certainly extends further"). Every flip:

| work | v1 | v2 | strong findings (why) |
|---|---|---|---|
| schaff-hcc1 | PASS | **FAIL** | 116 — §2045–2159 decorated word-index headings (the audit's 115) + §13 'PREFACE TO THIRD REVISION' (body first line, heading-shadowed) |
| schaff-hcc4 | PASS | **FAIL** | 39 — §1718–1755 word indexes (the audit's 38) + §517 'The Writings of Gregory' (banner doubled in heading and body) |
| donne-devotions | PASS | **FAIL** | §1 — provenance parenthetical '(Taken from the life by Izaak Walton)' names Walton, strong |
| flavel-life | PASS | **FAIL** | §1 — memorial biography 'The Life of the late Rev. Mr. John Flavel'; the declared author cannot be "the late" in his own work |
| lardner-n-mosaic | PASS | **FAIL** | §2 — 'Just Published' ad: trade signal + 'Octavo … plain calf' binding (calf was not a binding token; the price is spelled out) |
| foxe-martyrs | PASS | **FAIL** | 24 — §1–24 'Introduction — Edited by William Byron Forbush (N/24)'; LABEL_RE now consumes the decorated suffix |
| bunyan-badman | PASS | **FAIL** | §1 heading 'Title' (new label) + §2 "Publisher's Note" (new label) |
| schaff-npnf201 | PASS | **FAIL** | 22 — prolegomena banners ('The Writings of Eusebius', 'The Works of Philo', 'The Epistle of Clement'…) doubled in heading and body |
| schaff-npnf110 | PASS | **FAIL** | §3 — 'Homilies of St. John Chrysostom' names Chrysostom (multi-token capture; 2.0.0 took "John" and stopped), rule-line signed |
| schaff-npnf109 | PASS | **FAIL** | §1 'Prolegomena.' (body first line, heading-shadowed) + §12 'The Writings of Chrysostom' |
| schaff-npnf202 | PASS | **FAIL** | 8 — documentary letters/writings (Constantine, Arius, Julius, Constantius) bound as sections under 'Schaff, Philip' — the anf06 v1-FAIL class |
| schaff-npnf203 | PASS | **FAIL** | 7 — same class (Alexander, Arius, Eusebius, Eustathius, Athanasius, Constantine) |
| schaff-npnf204 | PASS | **FAIL** | §1 'Prolegomena.' + §205 'Letter of Constantius' |
| miller-history | PASS | **FAIL** | 22 — 'Preface (1/5)'…'(5/5)', 'Introduction (1/17)'…'(17/17)'; the chunk-marker '(N/M)' is now consumable (L-4 had already noted this work's tail) |
| luther-translating | PASS | **FAIL** | §1 'Preface' — body first line was heading-shadowed; it is Wenceslas Link's prefatory letter, bound in front of Luther's open letter |

Not flipped, and why they now stand:

- **chesterton-aquinas** — an early 2.1.0 draft flipped this on §5 'V. THE REAL LIFE OF ST. THOMAS'
  (heading echoed in the body). That is the Foxe subject-banner doctrine — a biography names its
  SUBJECT — so the heading/body agreement upgrade does not apply to Life/Lives/Memoirs banners.
  §5 is weak, the work stays PASS. Unit-guarded.
- **pascal-provincial** — the same draft fired on §3 'LETTERS OF HIS FRIEND' (extracted 'FRIEND'
  as a name). 'friend' joined NON_PERSON_TOKENS; zero findings, stays PASS. Unit-guarded.
- **schaff-npnf201 §1** ('The Life of Eusebius') individually stays WEAK under the same Life-banner
  doctrine; the work fails on §2 and the 20 other doubled work-type banners.

Fresh kept-class negatives (audit fresh seeds): all silent — subject index (real schaff-hcc1
§1994 'Indexes — Subject Index' fixture, and zero subject-index findings anywhere in the v2 scan),
index-of-chapters, synoptic table, analytical contents (unit-guarded, 70/70). The only
`publisher-blurb-body` finding in the whole set is the proven lardner-n-mosaic §2 ad.

## Summary — 133 works: **75 PASS · 58 FAIL** · 0 EMPTY

Strong findings by kind across the whole set: `apparatus-title` 220 (title pages / contents /
prefaces / decorated 'Preface (N/M)' / editor introductions), `word-index-title` 562 (the
addendum-2 class at full scale: 153 in schaff-hcc1/hcc4 per the audit, plus the same decorated
indexes in hcc2/3/5/6/7/8, schaff-person, edersheim, hort, wuttke, young-j-christ, bacon,
bangs-history4, rutherford — all works that were already FAIL in v1), `foreign-work-banner` 70
(origen/npnf documentary matter, prolegomena), `foreign-work-attribution` 1 (Walton),
`publisher-blurb-body` 1 (lardner — falsifies v1's "no publisher catalogue survives" claim,
as the audit said).

## FAIL — held, non-authorial matter (every work, every strong finding; long runs spanned, full detail in scan-v2.log)

### bacon-lw-history — FAIL (854 sections, declared author 'Bacon, Leonard Woolsey')
- §1…§14 [apparatus-title] 14 consecutive findings, e.g. 'Title Page' … 'Contents (13/13)'
- §851 [word-index-title/tail] 'Indexes — Latin Words and Phrases'

### baird-huguenots — FAIL (1213 sections, declared author 'Baird, Henry M.')
- §1…§42 [apparatus-title] 39 consecutive findings, e.g. 'Title Page' … 'CONTENTS (22/22)'

### bangs-history1 — FAIL (682 sections, declared author 'Bangs, Nathan')
- §1 [apparatus-title/head] 'Title Page'
- §3 [apparatus-title/head] 'PREFACE'
- §13 [apparatus-title/middle] 'INTRODUCTION'
- §64 [apparatus-title/middle] 'CONTENTS'
- weak, reported for reading (not held): 3 — e.g. §8 [foreign-work-banner] 'Lee’s History'

### bangs-history2 — FAIL (791 sections, declared author 'Bangs, Nathan')
- §1 [apparatus-title/head] 'Title Page'
- §2 [apparatus-title/head] 'CONTENTS'
- weak, reported for reading (not held): 1 — e.g. §605 [foreign-work-banner] 'Lee’s History'

### bangs-history3 — FAIL (864 sections, declared author 'Bangs, Nathan')
- §1 [apparatus-title/head] 'Title Page'
- §10 [apparatus-title/head] 'CONTENTS'

### bangs-history4 — FAIL (900 sections, declared author 'Bangs, Nathan')
- §1 [apparatus-title/head] 'Title Page'
- §899 [word-index-title/tail] 'Indexes — Latin Words and Phrases'
- §900 [word-index-title/tail] 'Indexes — French Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §46 [foreign-work-banner] 'Clarke’s Commentary'

### bede-history — FAIL (912 sections, declared author 'Bede, St.')
- §1…§34 [apparatus-title] 34 consecutive findings, e.g. 'Title Page' … 'Introduction (30/30)'

### bennett-expositor10 — FAIL (30 sections, declared author 'Bennett, William H.')
- §30 [word-index-title/tail] 'Latin Words and Phrases'

### bunyan-badman — FAIL (5 sections, declared author 'Bunyan, John') **(v1 PASS → v2 FAIL)**
- §1 [apparatus-title/head] 'Title'
- §2 [apparatus-title/head] 'Publisher's Note'

### dickinson-musicchurch — FAIL (781 sections, declared author 'Dickinson, Edward')
- §1 [apparatus-title/head] 'Title Page'
- §2 [apparatus-title/head] 'Preface (1/3)'
- §3 [apparatus-title/head] 'Preface (2/3)'
- §4 [apparatus-title/head] 'Preface (3/3)'
- §5 [apparatus-title/head] 'Contents'
- weak, reported for reading (not held): 1 — e.g. §753 [foreign-work-byline] '. by Pougin. Paris'

### donne-devotions — FAIL (95 sections, declared author 'Donne, John') **(v1 PASS → v2 FAIL)**
- §1 [foreign-work-attribution/head] '(Taken from the life by Izaak Walton)' — names 'Walton', not the declared author 'Donne, John'

### edersheim-lifetimes — FAIL (4579 sections, declared author 'Alfred Edersheim')
- §1 [apparatus-title/head] 'Title Page'
- §2 [apparatus-title/head] 'PREFACE'
- §29 [apparatus-title/middle] 'PREFACE'
- §383 [foreign-work-banner/middle] 'HISTORY OF HEROD' — names 'HEROD', not the declared author 'Alfred Edersheim'
- §4571…§4578 [word-index-title] 8 consecutive findings, e.g. 'Indexes — Greek Words and Phrases (1/8)' … 'Indexes — Greek Words and Phrases (8/8)'
- weak, reported for reading (not held): 33 — e.g. §384 [foreign-work-banner] 'HISTORY OF HEROD'

### flavel-life — FAIL (1 sections, declared author 'Flavel, John') **(v1 PASS → v2 FAIL)**
- §1 [foreign-work-banner/head] 'The Life of the late Rev. Mr. John Flavel' — names 'Flavel', not the declared author 'Flavel, John'

### foxe-martyrs — FAIL (1334 sections, declared author 'Foxe, John') **(v1 PASS → v2 FAIL)**
- §1…§24 [apparatus-title] 24 consecutive findings, e.g. 'Introduction — Edited by William Byron Forbush (1/24)' … 'Introduction — Edited by William Byron Forbush (24/24)'
- weak, reported for reading (not held): 28 — e.g. §285 [foreign-work-banner] 'The Life of William Gardiner'

### hort-ecclesia — FAIL (437 sections, declared author 'Hort, Fenton John Anthony')
- §1 [apparatus-title/head] 'Title Page'
- §429 [word-index-title/tail] 'Indexes — Greek Words and Phrases (1/7)'
- §430 [word-index-title/tail] 'Indexes — Greek Words and Phrases (2/7)'
- §431 [word-index-title/tail] 'Indexes — Greek Words and Phrases (3/7)'
- §432 [word-index-title/tail] 'Indexes — Greek Words and Phrases (4/7)'
- §433 [word-index-title/tail] 'Indexes — Greek Words and Phrases (5/7)'
- §434 [word-index-title/tail] 'Indexes — Greek Words and Phrases (6/7)'
- §435 [word-index-title/tail] 'Indexes — Greek Words and Phrases (7/7)'

### lardner-n-mosaic — FAIL (2 sections, declared author 'Lardner, Nathaniel') **(v1 PASS → v2 FAIL)**
- §2 [publisher-blurb-body/head] 'Just Published ,⏎Printed for J. Bouquet , at the White-Hart , in Pater-Noster Ro'

### luther-bondage — FAIL (172 sections, declared author 'Luther, Martin')
- §172 [word-index-title/tail] 'Latin Words and Phrases'

### luther-first-prin — FAIL (27 sections, declared author 'Luther, Martin')
- §26 [word-index-title/tail] 'Latin Words and Phrases'
- §27 [word-index-title/tail] 'German Words and Phrases'
- weak, reported for reading (not held): 2 — e.g. §1 [foreign-work-byline] 'By Dr. WACE'

### luther-translating — FAIL (1 sections, declared author 'Luther, Martin') **(v1 PASS → v2 FAIL)**
- §1 [apparatus-title/head] 'Preface'

### manton-manton01 — FAIL (38 sections, declared author 'Manton, Thomas')
- §38 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §1 [foreign-work-byline] 'BY WILLIAM HARRIS, D.D.'

### manton-manton02 — FAIL (47 sections, declared author 'Manton, Thomas')
- §3 [apparatus-title/head] 'The Epistle Dedicatory.'
- §45 [apparatus-title/tail] 'THE EPISTLE DEDICATORY.'
- §47 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §1 [foreign-work-byline] '.⏎BY THE REV'

### manton-manton03 — FAIL (33 sections, declared author 'Manton, Thomas')
- §33 [word-index-title/tail] 'Latin Words and Phrases'

### manton-manton04 — FAIL (10 sections, declared author 'Manton, Thomas')
- §2 [apparatus-title/head] 'The Epistle Dedicatory.'
- §10 [word-index-title/head] 'Latin Words and Phrases'

### manton-manton05 — FAIL (37 sections, declared author 'Manton, Thomas')
- §2 [apparatus-title/head] 'The Epistle Dedicatory.'
- §27 [apparatus-title/tail] 'The Epistle Dedicatory.'
- §30 [apparatus-title/tail] 'The Epistle Dedicatory.'
- §37 [word-index-title/tail] 'Latin Words and Phrases'

### manton-manton06 — FAIL (54 sections, declared author 'Manton, Thomas')
- §54 [word-index-title/tail] 'Latin Words and Phrases'

### manton-manton07 — FAIL (53 sections, declared author 'Manton, Thomas')
- §53 [word-index-title/tail] 'Latin Words and Phrases'

### manton-manton08 — FAIL (57 sections, declared author 'Manton, Thomas')
- §57 [word-index-title/tail] 'Latin Words and Phrases'

### manton-manton20 — FAIL (53 sections, declared author 'Manton, Thomas')
- §53 [word-index-title/tail] 'Latin Words and Phrases'

### miller-history — FAIL (1103 sections, declared author 'Miller, Andrew') **(v1 PASS → v2 FAIL)**
- §1…§22 [apparatus-title] 22 consecutive findings, e.g. 'Preface (1/5)' … 'Introduction (17/17)'
- weak, reported for reading (not held): 1 — e.g. §739 [foreign-work-banner] 'THE HISTORY OF⏎ATHANASIUS'

### origen-commentary — FAIL (1224 sections, declared author 'Origen of Alexandria')
- §1 [foreign-work-banner/head] 'The First⏎Epistle of Clement' — names 'Clement', not the declared author 'Origen of Alexandria'
- §101 [foreign-work-banner/middle] 'The Second Epistle of⏎Clement' — names 'Clement', not the declared author 'Origen of Alexandria'

### robertson-history — FAIL (636 sections, declared author 'Robertson, James Craigie, Canon of Canterbury')
- §1 [apparatus-title/head] 'Title Page'

### rutherford-triumph — FAIL (813 sections, declared author 'Rutherford, Samuel')
- §1 [apparatus-title/head] 'Title Page'
- §813 [word-index-title/tail] 'Indexes — Latin Words and Phrases'

### schaff-anf06 — FAIL (563 sections, declared author 'Schaff, Philip')
- §16 [foreign-work-banner/middle] 'Writings of Julius Africanus' — names 'Africanus', not the declared author 'Schaff, Philip'
- §39 [foreign-work-banner/middle] 'The Epistle of Theonas' — names 'Theonas', not the declared author 'Schaff, Philip'
- §139 [foreign-work-banner/middle] 'Work of God Therein Set' — names 'Set', not the declared author 'Schaff, Philip'

### schaff-anf07 — FAIL (477 sections, declared author 'Schaff, Philip')
- §367 [foreign-work-banner/middle] 'Writings of Asterius Urbanus' — names 'Urbanus', not the declared author 'Schaff, Philip'
- §467 [foreign-work-banner/tail] 'THE SECOND EPISTLE OF CLEMENT' — names 'CLEMENT', not the declared author 'Schaff, Philip'
- §477 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 3 — e.g. §365 [foreign-work-banner] 'Poem of Venantius Honorius Clementianus'

### schaff-anf08 — FAIL (1255 sections, declared author 'Schaff, Philip')
- §543 [foreign-work-banner/middle] 'Epistle of Clement' — names 'Clement', not the declared author 'Schaff, Philip'
- §669 [foreign-work-banner/middle] 'Works of Creation' — names 'Creation', not the declared author 'Schaff, Philip'
- §1037 [foreign-work-banner/middle] 'The Work⏎of Revelation Belongs' — names 'Belongs', not the declared author 'Schaff, Philip'
- weak, reported for reading (not held): 3 — e.g. §142 [apparatus-title] 'Argument for Polytheism.'

### schaff-hcc1 — FAIL (2159 sections, declared author 'Schaff, Philip') **(v1 PASS → v2 FAIL)**
- §13 [apparatus-title/middle] 'PREFACE TO THIRD REVISION'
- §2045…§2159 [word-index-title] 115 consecutive findings, e.g. 'Indexes — Greek Words and Phrases (1/36)' … 'Indexes — French Words and Phrases (17/17)'
- weak, reported for reading (not held): 6 — e.g. §1 [apparatus-title] 'PREFACE TO THE REVISED EDITION'

### schaff-hcc2 — FAIL (2082 sections, declared author 'Schaff, Philip')
- §1…§12 [apparatus-title] 11 consecutive findings, e.g. 'Preface to the Third Edition Revised (1/2)' … 'Preface to the Second Edition (9/9)'
- §1805 [foreign-work-banner/middle] 'The Works of Origen' — names 'Origen', not the declared author 'Schaff, Philip'
- §1887 [foreign-work-banner/middle] 'The Writings of Tertullian' — names 'Tertullian', not the declared author 'Schaff, Philip'
- §1990…§2082 [word-index-title] 93 consecutive findings, e.g. 'Indexes — Greek Words and Phrases (1/33)' … 'Indexes — French Words and Phrases (16/16)'
- weak, reported for reading (not held): 38 — e.g. §22 [foreign-work-byline] '. by⏎Annie Harwood Holmden'

### schaff-hcc3 — FAIL (2325 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Title Page'
- §2 [apparatus-title/head] 'Preface to the Third Revision'
- §3 [apparatus-title/head] 'PREFACE'
- §2112 [foreign-work-banner/middle] 'The Works of Jerome' — names 'Jerome', not the declared author 'Schaff, Philip'
- §2172 [foreign-work-banner/middle] 'The Works of Augustine' — names 'Augustine', not the declared author 'Schaff, Philip'
- §2276…§2325 [word-index-title] 50 consecutive findings, e.g. 'Indexes — Greek Words and Phrases (1/39)' … 'Indexes — French Words and Phrases (6/6)'
- weak, reported for reading (not held): 62 — e.g. §989 [foreign-work-banner] 'Discourses of Basil'

### schaff-hcc4 — FAIL (1755 sections, declared author 'Schaff, Philip') **(v1 PASS → v2 FAIL)**
- §517 [foreign-work-banner/middle] 'The Writings of Gregory' — names 'Gregory', not the declared author 'Schaff, Philip'
- §1718…§1755 [word-index-title] 38 consecutive findings, e.g. 'Indexes — Greek Words and Phrases (1/15)' … 'Indexes — French Words and Phrases (2/2)'
- weak, reported for reading (not held): 20 — e.g. §304 [foreign-work-banner] 'Life of Basilius⏎Macedo'

### schaff-hcc5 — FAIL (1725 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Title Page'
- §1713…§1725 [word-index-title] 13 consecutive findings, e.g. 'Indexes — German Words and Phrases (1/10)' … 'Indexes — French Words and Phrases (3/3)'
- weak, reported for reading (not held): 18 — e.g. §16 [foreign-work-byline] '. by G. H. Pertz'

### schaff-hcc6 — FAIL (1861 sections, declared author 'Schaff, Philip')
- §1…§6 [apparatus-title] 6 consecutive findings, e.g. 'Title Page' … 'Preface (5/5)'
- §1763 [foreign-work-banner/middle] 'Works of Charity' — names 'Charity', not the declared author 'Schaff, Philip'
- §1848…§1861 [word-index-title] 14 consecutive findings, e.g. 'Indexes — German Words and Phrases (1/13)' … 'Indexes — French Words and Phrases'
- weak, reported for reading (not held): 30 — e.g. §30 [foreign-work-byline] '. by U. Chevalier'

### schaff-hcc7 — FAIL (1672 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Title Page'
- §1592…§1672 [word-index-title] 81 consecutive findings, e.g. 'Indexes — Greek Words and Phrases' … 'Indexes — French Words and Phrases (3/3)'
- weak, reported for reading (not held): 11 — e.g. §99 [foreign-work-banner] 'Life of Chris'

### schaff-hcc8 — FAIL (2053 sections, declared author 'Schaff, Philip')
- §1…§16 [apparatus-title] 13 consecutive findings, e.g. 'Title Page' … 'PREFACE TO THE SECOND EDITION.'
- §205 [foreign-work-banner/middle] 'The Works of Zwingli' — names 'Zwingli', not the declared author 'Schaff, Philip'
- §1199 [foreign-work-banner/middle] 'Calvin’s⏎Commentaries' — names 'Calvin', not the declared author 'Schaff, Philip'
- §1938 [foreign-work-banner/middle] 'Beza’s Writings' — names 'Beza', not the declared author 'Schaff, Philip'
- §1972…§2053 [word-index-title] 82 consecutive findings, e.g. 'Indexes — Greek Words and Phrases' … 'Indexes — French Words and Phrases (32/32)'
- weak, reported for reading (not held): 122 — e.g. §48 [foreign-work-byline] '. by J. J. Ulrich'

### schaff-npnf109 — FAIL (14 sections, declared author 'Schaff, Philip') **(v1 PASS → v2 FAIL)**
- §1 [apparatus-title/head] 'Prolegomena.'
- §12 [foreign-work-banner/head] 'The Writings⏎of Chrysostom' — names 'Chrysostom', not the declared author 'Schaff, Philip'

### schaff-npnf110 — FAIL (88 sections, declared author 'Schaff, Philip') **(v1 PASS → v2 FAIL)**
- §3 [foreign-work-banner/head] 'Homilies of St. John⏎Chrysostom' — names 'Chrysostom', not the declared author 'Schaff, Philip'

### schaff-npnf111 — FAIL (91 sections, declared author 'Schaff, Philip')
- §59 [apparatus-title/middle] 'The Argument'
- weak, reported for reading (not held): 1 — e.g. §58 [foreign-work-banner] 'The Homilies of St. John Chrysostom'

### schaff-npnf112 — FAIL (76 sections, declared author 'Schaff, Philip')
- §2 [apparatus-title/head] 'Argument.'
- §47 [foreign-work-banner/middle] 'Homilies⏎of St. John Chrysostom' — names 'Chrysostom', not the declared author 'Schaff, Philip'

### schaff-npnf114 — FAIL (125 sections, declared author 'Schaff, Philip')
- §1 [foreign-work-banner/head] 'Works of St. Chrysostom' — names 'Chrysostom', not the declared author 'Schaff, Philip'
- §89 [apparatus-title/middle] 'Argument.'

### schaff-npnf201 — FAIL (588 sections, declared author 'Schaff, Philip') **(v1 PASS → v2 FAIL)**
- §2…§227 [foreign-work-banner] 20 consecutive findings, e.g. 'The Writings of
Eusebius' … 'The Writings of
Phileas'
- §268 [apparatus-title/middle] 'Prolegomena.'
- §478 [foreign-work-banner/middle] 'Letter of Constantine Augustus' — names 'Augustus', not the declared author 'Schaff, Philip'
- weak, reported for reading (not held): 4 — e.g. §1 [foreign-work-banner] 'The Life of⏎Eusebius'

### schaff-npnf202 — FAIL (495 sections, declared author 'Schaff, Philip') **(v1 PASS → v2 FAIL)**
- §41 [foreign-work-banner/middle] 'Letter of⏎Constantine' — names 'Constantine', not the declared author 'Schaff, Philip'
- §287 [foreign-work-banner/middle] 'Writings of⏎Arius' — names 'Arius', not the declared author 'Schaff, Philip'
- §302 [foreign-work-banner/middle] 'Letter of⏎Constantine' — names 'Constantine', not the declared author 'Schaff, Philip'
- §307 [foreign-work-banner/middle] 'Letter of Constantine' — names 'Constantine', not the declared author 'Schaff, Philip'
- §313 [foreign-work-banner/middle] 'Letter of Julius' — names 'Julius', not the declared author 'Schaff, Philip'
- §325 [foreign-work-banner/middle] 'Letter of Constantius' — names 'Constantius', not the declared author 'Schaff, Philip'
- §326 [foreign-work-banner/middle] 'Letter of⏎Constantius' — names 'Constantius', not the declared author 'Schaff, Philip'
- §329 [foreign-work-banner/middle] 'Letter⏎of Conciliation' — names 'Conciliation', not the declared author 'Schaff, Philip'
- weak, reported for reading (not held): 3 — e.g. §366 [foreign-work-banner] 'Letter of Julian'

### schaff-npnf203 — FAIL (584 sections, declared author 'Schaff, Philip') **(v1 PASS → v2 FAIL)**
- §3 [foreign-work-banner/head] 'The Epistle of Alexander' — names 'Alexander', not the declared author 'Schaff, Philip'
- §4 [foreign-work-banner/head] 'The Letter of Arius' — names 'Arius', not the declared author 'Schaff, Philip'
- §5 [foreign-work-banner/head] 'The Letter of⏎Eusebius' — names 'Eusebius', not the declared author 'Schaff, Philip'
- §7 [foreign-work-banner/head] 'Writings of Eustathius' — names 'Eustathius', not the declared author 'Schaff, Philip'
- §13 [foreign-work-banner/middle] 'Letter of Athanasius' — names 'Athanasius', not the declared author 'Schaff, Philip'
- §15 [foreign-work-banner/middle] 'The Epistle of Constantine' — names 'Constantine', not the declared author 'Schaff, Philip'
- §50 [foreign-work-banner/middle] 'The Letter of Athanasius' — names 'Athanasius', not the declared author 'Schaff, Philip'
- weak, reported for reading (not held): 3 — e.g. §11 [foreign-work-banner] 'Letter of Eusebius'

### schaff-npnf204 — FAIL (238 sections, declared author 'Schaff, Philip') **(v1 PASS → v2 FAIL)**
- §1 [apparatus-title/head] 'Prolegomena.'
- §205 [foreign-work-banner/middle] 'Letter of⏎Constantius' — names 'Constantius', not the declared author 'Schaff, Philip'
- weak, reported for reading (not held): 2 — e.g. §7 [foreign-work-banner] 'Life of St. Athanasius'

### schaff-person — FAIL (512 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Title Page'
- §480…§509 [word-index-title] 30 consecutive findings, e.g. 'Indexes — Greek Words and Phrases (1/2)' … 'Indexes — French Words and Phrases (22/22)'
- weak, reported for reading (not held): 1 — e.g. §432 [foreign-work-banner] 'Discourse of Matters'

### tolstoy-maupassant — FAIL (2 sections, declared author 'Tolstoy, Leo Nikolayevich')
- §1 [foreign-work-banner/head] 'The Works of Guy' — names 'Guy', not the declared author 'Tolstoy, Leo Nikolayevich'
- §2 [word-index-title/head] 'French Words and Phrases'

### vanbraght-mirror — FAIL (7080 sections, declared author 'Braght, Thieleman J. van')
- §1 [apparatus-title/head] 'Title Page'
- §4927 [foreign-work-banner/middle] 'LETTER OF JACOB THE⏎CHANDLER' — names 'CHANDLER', not the declared author 'Braght, Thieleman J. van'
- §5235 [foreign-work-banner/middle] 'LETTER OF JOOST⏎VERKINDERT WRIT' — names 'WRIT', not the declared author 'Braght, Thieleman J. van'
- §5261 [foreign-work-banner/middle] 'LETTER OF JOOST⏎VERKINDERT' — names 'VERKINDERT', not the declared author 'Braght, Thieleman J. van'
- §5412 [foreign-work-banner/middle] 'THE SECOND LETTER OF YDSE GAUKES' — names 'GAUKES', not the declared author 'Braght, Thieleman J. van'
- §5425 [foreign-work-banner/middle] 'THE THIRD LETTER OF YDSE⏎GAUKES' — names 'GAUKES', not the declared author 'Braght, Thieleman J. van'
- §6951 [apparatus-title/middle] 'ADVERTISEMENT'
- weak, reported for reading (not held): 57 — e.g. §53 [apparatus-title] 'Contents — To The Readers in General (1/25)'

### winkworth-tauler — FAIL (731 sections, declared author 'Winkworth, Catherine')
- §1 [apparatus-title/head] 'Title Page'
- §7 [apparatus-title/head] 'Table of Contents (1/7)'
- §8 [apparatus-title/head] 'Table of Contents (2/7)'
- §9 [apparatus-title/head] 'Table of Contents (3/7)'
- §10 [apparatus-title/head] 'Table of Contents (4/7)'
- §11 [apparatus-title/head] 'Table of Contents (5/7)'
- §12 [apparatus-title/head] 'Table of Contents (6/7)'
- §13 [apparatus-title/middle] 'Table of Contents (7/7)'
- §153 [foreign-work-banner/middle] 'Tauler’s Life' — names 'Tauler', not the declared author 'Winkworth, Catherine'
- weak, reported for reading (not held): 202 — e.g. §2 [foreign-work-byline] 'By⏎⏎John Greenleaf Whittier'

### wuttke-ethics1 — FAIL (1135 sections, declared author 'Wuttke, Adolf')
- §1 [apparatus-title/head] 'Title Page'
- §2 [foreign-work-banner/head] 'LETTER OF AUTHORIZATION' — names 'AUTHORIZATION', not the declared author 'Wuttke, Adolf'
- §1129 [word-index-title/tail] 'Indexes — Greek Words and Phrases'
- §1130 [word-index-title/tail] 'Indexes — Latin Words and Phrases (1/3)'
- §1131 [word-index-title/tail] 'Indexes — Latin Words and Phrases (2/3)'
- §1132 [word-index-title/tail] 'Indexes — Latin Words and Phrases (3/3)'

### young-j-christ — FAIL (409 sections, declared author 'Young, John')
- §1…§17 [apparatus-title] 4 consecutive findings, e.g. 'Title Page' … 'INTRODUCTION'
- §400…§407 [word-index-title] 8 consecutive findings, e.g. 'Indexes — Greek Words and Phrases (1/7)' … 'Indexes — Latin Words and Phrases'

## PASS (no strong finding)

- adeney-expositorsonglament — PASS (29 sections)
- bangs-alphabetic — PASS (2 sections)
- barnes-crosswire-nt — PASS (7431 sections); 2 weak finding(s) reported
- bernard-song-sermons — PASS (86 sections)
- boethius-trinity — PASS (2 sections)
- bunyan-grace — PASS (6 sections)
- bunyan-holy-war — PASS (20 sections)
- bunyan-miscellaneous — PASS (4 sections)
- bunyan-pilgrim — PASS (22 sections)
- bushnell-character — PASS (2 sections)
- charnock-cleansing — PASS (1 sections)
- charnock-efficient-regeneration — PASS (2 sections)
- charnock-instr-regen — PASS (1 sections)
- charnock-nat-regen — PASS (1 sections)
- charnock-nec-regen — PASS (1 sections)
- chesterton-aquinas — PASS (8 sections); 1 weak finding(s) reported
- chesterton-historyengland — PASS (399 sections); 1 weak finding(s) reported
- chesterton-rightworld — PASS (1 sections)
- clarke-entire-sanct — PASS (1 sections)
- clarkson-owenfuneral — PASS (1 sections)
- cranmer-doctrine — PASS (1 sections)
- cripplegate-puritan-sermons — PASS (70 sections); 2 weak finding(s) reported
- donne-deaths-duel — PASS (1 sections)
- donne-divine-poems — PASS (41 sections)
- donne-easter — PASS (1 sections)
- donne-spital — PASS (1 sections)
- edwards-charity-fruits — PASS (16 sections)
- edwards-trinity — PASS (1 sections)
- erasmus-against-war — PASS (1 sections)
- herrick-noble-numbers — PASS (270 sections)
- ignatius-autobiography — PASS (10 sections)
- ignatius-exercises — PASS (96 sections)
- jfb — PASS (15473 sections); 2 weak finding(s) reported
- jowett-brooks — PASS (27 sections)
- julian-revelations — PASS (86 sections)
- kempis-imitation-benham — PASS (114 sections)
- kierkegaard-untruth — PASS (1 sections)
- knox-prayer — PASS (2 sections)
- kronstadt-christlife — PASS (2 sections)
- law-clergy — PASS (1 sections)
- law-errors — PASS (2 sections)
- law-grounds — PASS (2 sections)
- luther-christianliberty — PASS (2 sections)
- luther-galatians — PASS (6 sections)
- luther-good-works — PASS (8 sections)
- luther-prefacetoromans — PASS (2 sections)
- luther-sermons — PASS (47 sections)
- luther-smalcald — PASS (6 sections)
- luther-stpeter-stjude — PASS (9 sections)
- luther-tabletalk — PASS (46 sections)
- luther-theses — PASS (2 sections)
- luther-works1 — PASS (8 sections)
- luther-works2 — PASS (8 sections)
- neander-a-expo-phil — PASS (2 sections); 1 weak finding(s) reported
- newman-apologia — PASS (5 sections); 4 weak finding(s) reported
- pascal-memorial — PASS (1 sections)
- pascal-pensees — PASS (15 sections)
- pascal-provincial — PASS (20 sections)
- penn-sermon — PASS (2 sections)
- pink-law — PASS (2 sections)
- pnt-crosswire — PASS (6067 sections); 2 weak finding(s) reported
- poole-tcp — PASS (24104 sections); 3 weak finding(s) reported
- schaff-npnf106 — PASS (198 sections)
- schaff-npnf107 — PASS (143 sections)
- schaff-npnf108 — PASS (7 sections)
- schaff-npnf113 — PASS (6 sections)
- scofield-crosswire — PASS (3207 sections)
- shepard-sabbath — PASS (1 sections)
- spurgeon-catechism — PASS (1 sections)
- thayers-lexicon — PASS (5507 sections); 1 weak finding(s) reported
- thompson-chain-reference — PASS (1650 sections); 4 weak finding(s) reported
- tolstoy-kreutzer — PASS (1 sections)
- tulloch-religion — PASS (1 sections)
- whitefield-works — PASS (59 sections)
- whyte-behmen — PASS (2 sections)

## Reproduce

```sh
export DATABASE_URL="$(cat ~/.neon_dev_owner_url)" NEON_BRANCH=dev
npx tsx scripts/adr029-nonauthorial-scan.mts --target=ep-tiny-hat-atdgpisx --mode=scan
npx tsx scripts/adr029-nonauthorial-scan.mts --target=ep-tiny-hat-atdgpisx --mode=labelled
```
