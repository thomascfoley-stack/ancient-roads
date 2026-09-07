# ADR-029 scan verdict — PROD-staged set, 2026-09-07 (deep-audit C-3 closure)

- detector version: **2.1.0** (`scripts/lib/front-matter-detector.mjs`, DETECTOR_VERSION) — the
  same detector build as dev verdict-v2 (`docs/evidence/adr029-scan-2026-09-06/verdict-v2.md`).
- input set: `docs/evidence/adr029-scan-2026-09-07-prod/input-slugs.json` — **439 works**, sha256
  `f294807bbae53068112bac388d0c4fcc3300b21139a5b83439933424a6336622`, the exact union of the five prod batch files (built from them, dup-checked):
  `prod440-2026-09-06-batch1.json` sha256 `5972cab40578ce4823ad6511c031561a36af4079311692ad8bb66726f85a13d6`,
  batch2 `ad574536fbac370c182f2be9e0f43db34178587beba5d4842d4cb0dca0ba30df`,
  batch3 `ffed59ffa9c7ad5af3559df0b7b736780b7806c2ec322a344580fbc4eee29ef1`,
  batch4 `a64f7a749f7b220f00d4fc6403af403d9bea6abdf1b35510bb649774eb85c560`,
  batch5 `befde47d5f83d6ee71f5463dec977a80caabfa717d36025fed0e2e5224abb444`.
- store: **production** (`ep-odd-fog`, owner go 2026-09-07, bylaw 7) under the scanner's new guarded prod
  mode — `SCAN_ALLOW_PROD=1` + `--target=ep-odd-fog-atnykudm` + explicit `--slugs`, READ ONLY enforced by
  the database (BEGIN / SET TRANSACTION READ ONLY / verified on / ROLLBACK). Nothing was written.
- method: unchanged from the dev scans — every section of every work through `sweepWorkMatter`;
  **FAIL = ≥1 STRONG finding.** A detection is a claim to be read, never a deletion (ADR-029 rule 2).
- guard evidence: `redproof-prod-mode.log` — six red-proofs: prod URL without the flag still REFUSES
  pre-connection; flag + wrong `--target` stops; flag without `--slugs` stops; the dev guards
  (`NEON_BRANCH=dev`, declared-target) unchanged; malformed JSON slug input stops. Dev labelled bar
  re-run after the change: 11/11 + 3/3 BAR MET (`labelled-dev-after-prod-mode.log`).
- full output with per-finding JSON detail: `scan-prod.log`.

## Summary — 439 prod-staged works: **296 PASS · 143 FAIL · 0 EMPTY**

Strong findings by kind across the prod set: `word-index-title` 127, `apparatus-title` 44, `foreign-work-banner` 29, `publisher-blurb-body` 9, `publisher-catalogue-title` 3.

The 143 FAIL works are HELD — carved out of `prod440-2026-09-06-batch{1..5}.json` into
`docs/evidence/corpus-copy/prod439-held-adr029-2026-09-07.json`; the remaining batches union to
296. **No flip may include a verdict-FAIL work** (ADR-029 rule 3, runbook amendment).

## FAIL — held, non-authorial matter (every work, every strong finding; long runs spanned, full detail in scan-prod.log)

### abelard-misfortunes — FAIL (17 sections, declared author 'Abelard, Peter')
- §16 [foreign-work-banner/tail] 'THE WRITING OF
THIS HIS LETTER' — names 'LETTER', not the declared author 'Abelard, Peter'
- §17 [word-index-title/tail] 'Latin Words and Phrases'

### addison-evidences — FAIL (23 sections, declared author 'Addison, Joseph')
- §23 [word-index-title/tail] 'Latin Words and Phrases'

### alexander-a-canon — FAIL (36 sections, declared author 'Alexander, Archibald')
- §1 [apparatus-title/head] 'PREFACE.'
- §36 [word-index-title/tail] 'Latin Words and Phrases'

### alexander-a-evidences — FAIL (15 sections, declared author 'Alexander, Archibald')
- §15 [word-index-title/tail] 'Latin Words and Phrases'

### alexander-a-outlines — FAIL (31 sections, declared author 'Alexander, Archibald')
- §31 [word-index-title/tail] 'Latin Words and Phrases'

### allestree-oracles — FAIL (10 sections, declared author 'Allestree, Richard')
- §9 [apparatus-title/head] 'The Contents.'
- §10 [word-index-title/head] 'Latin Words and Phrases'

### alphonsus-volonta — FAIL (8 sections, declared author 'Alphonsus de Liguori, Saint')
- §8 [word-index-title/head] 'Latin Words and Phrases'

### anderson-prayer — FAIL (16 sections, declared author 'Anderson, Tony Marshall')
- §1 [apparatus-title/head] 'TABLE OF CONTENTS'

### andrewes-devotions1 — FAIL (56 sections, declared author 'Andrewes, Lancelot')
- §2 [apparatus-title/head] 'INTRODUCTION.'
- §56 [word-index-title/tail] 'Latin Words and Phrases'

### anselm-devotions — FAIL (57 sections, declared author 'Anselm, Saint, Archbishop of Canterbury')
- §57 [word-index-title/tail] 'Latin Words and Phrases'

### anselm-meditations — FAIL (23 sections, declared author 'Anselm, Saint, Archbishop of Canterbury')
- §23 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §6 [foreign-work-banner] 'THE LIFE OF SOUL AND OF'

### aquinas-nature-grace — FAIL (5 sections, declared author 'Thomas Aquinas, Saint')
- §5 [publisher-blurb-body/head] 'new edition of the symbol is required, as was said in the preceding
article. Now'

### arminius-works3 — FAIL (61 sections, declared author 'Arminius, Jacobus')
- §1 [foreign-work-banner/head] 'THE WORKS OF JAMES ARMINIUS VOL' — names 'VOL', not the declared author 'Arminius, Jacobus'
- §61 [foreign-work-banner/tail] 'THE TREATISE OF WILLIAM PERKINS CONCERNING' — names 'CONCERNING', not the declared author 'Arminius, Jacobus'

### augustine-doctrine — FAIL (156 sections, declared author 'Augustine, Saint')
- §43 [apparatus-title/middle] 'Argument'
- §86 [apparatus-title/middle] 'Argument.'
- §124 [apparatus-title/middle] 'Argument.'
- §156 [word-index-title/tail] 'Latin Words and Phrases'

### baker-holy-wisdom — FAIL (104 sections, declared author 'Baker, Augustine')
- §1 [apparatus-title/head] 'PREFACE TO THE PRESENT EDITION.'

### bartleman-deity — FAIL (7 sections, declared author 'Bartleman, Frank')
- §1 [apparatus-title/head] 'INTRODUCTION'

### bayly-piety — FAIL (37 sections, declared author 'Bayly, Lewis')
- §1 [apparatus-title/head] 'CONTENTS.'
- §2 [apparatus-title/head] 'The Epistle Dedicatory'

### berkhof-newtestament — FAIL (31 sections, declared author 'Berkhof, Louis')
- §1 [apparatus-title/head] 'Prolegomena'

### berkhof-summary — FAIL (22 sections, declared author 'Berkhof, Louis')
- §17 [foreign-work-banner/tail] 'Work of Redemption' — names 'Redemption', not the declared author 'Berkhof, Louis'

### berkhof-systematictheology — FAIL (75 sections, declared author 'Berkhof, Louis')
- §44 [foreign-work-banner/middle] 'THE WORK OF REDEMPTION' — names 'REDEMPTION', not the declared author 'Berkhof, Louis'
- weak, reported for reading (not held): 1 — e.g. §42 [foreign-work-banner] 'Work of Christ
The'

### bernard-letters — FAIL (77 sections, declared author 'Bernard, of Clairvaux, Saint')
- §77 [word-index-title/tail] 'Latin Words and Phrases'

### bevan-friends — FAIL (60 sections, declared author 'Bevan, Frances')
- §1 [foreign-work-banner/head] 'THE SERMON OF DR. TAULER
IT' — names 'TAULER', not the declared author 'Bevan, Frances'
- §2 [foreign-work-banner/head] 'SERMON OF DR. TAULER

AT' — names 'TAULER', not the declared author 'Bevan, Frances'

### beveridge-w-thoughts — FAIL (64 sections, declared author 'Beveridge, William')
- §64 [word-index-title/tail] 'Latin Words and Phrases'

### beveridge-w-thoughts2 — FAIL (14 sections, declared author 'Beveridge, William')
- §3 [apparatus-title/head] 'The Contents.'
- §14 [word-index-title/tail] 'Latin Words and Phrases'

### boehme-supersensual — FAIL (149 sections, declared author 'Boehme, Jakob')
- §4 [foreign-work-banner/head] 'Behmen's Treatises' — names 'Behmen', not the declared author 'Boehme, Jakob'
- weak, reported for reading (not held): 1 — e.g. §2 [foreign-work-byline] 'BY JACOB BEHMEN'

### boehme-waytochrist — FAIL (27 sections, declared author 'Boehme, Jakob')
- §27 [apparatus-title/tail] 'ARGUMENT'

### bradford-meditations — FAIL (15 sections, declared author 'Bradford, John')
- §1 [apparatus-title/head] 'To the Reader'

### browne-morals — FAIL (5 sections, declared author 'Browne, Sir Thomas')
- §5 [word-index-title/head] 'Latin Words and Phrases'

### browne-religio — FAIL (10 sections, declared author 'Browne, Sir Thomas')
- §1 [apparatus-title/head] 'Title'

### bruce-twelve — FAIL (61 sections, declared author 'Bruce, Alexander Balmain')
- §60 [word-index-title/tail] 'Latin Words and Phrases'
- §61 [word-index-title/tail] 'German Words and Phrases'

### burgon-corruption — FAIL (21 sections, declared author 'Burgon, John William')
- §21 [word-index-title/tail] 'Latin Words and Phrases'

### burgon-mark — FAIL (19 sections, declared author 'Burgon, John William')
- §19 [word-index-title/tail] 'Latin Words and Phrases'

### burgon-revision-revised — FAIL (28 sections, declared author 'Burgon, John William')
- §28 [word-index-title/tail] 'Latin Words and Phrases'

### bushnell-nurture — FAIL (18 sections, declared author 'Bushnell, Horace')
- §18 [word-index-title/tail] 'Latin Words and Phrases'

### bushnell-vicarious — FAIL (23 sections, declared author 'Bushnell, Horace')
- §23 [word-index-title/tail] 'Latin Words and Phrases'

### butler-analogy — FAIL (23 sections, declared author 'Butler, Joseph')
- §23 [word-index-title/tail] 'Latin Words and Phrases'

### calvin-chr-life — FAIL (7 sections, declared author 'Calvin, John')
- §7 [word-index-title/head] 'French Words and Phrases'

### calvin-treatise-relics — FAIL (12 sections, declared author 'Calvin, John')
- §11 [publisher-catalogue-title/head] 'List Of Works Published By Johnstone, Hunter, &amp; Co., Edinburgh.'
- §12 [word-index-title/head] 'Latin Words and Phrases'

### campbell-atonement — FAIL (17 sections, declared author 'Campbell, John McLeod')
- §17 [publisher-catalogue-title/tail] 'LIST OF BOOKS QUOTED'

### catherine-dialog — FAIL (95 sections, declared author 'Catherine of Siena, St.')
- §52 [foreign-work-banner/middle] 'Treatise of Prayer' — names 'Prayer', not the declared author 'Catherine of Siena, St.'
- §95 [foreign-work-banner/tail] 'Letter of Ser Barduccio' — names 'Barduccio', not the declared author 'Catherine of Siena, St.'

### collins-divinesongs — FAIL (18 sections, declared author 'Collins, An')
- §4 [apparatus-title/head] 'The Preface'

### cotton-john-keyes — FAIL (9 sections, declared author 'Cotton, John')
- §9 [word-index-title/head] 'Latin Words and Phrases'

### cross-g-theology — FAIL (17 sections, declared author 'Cross, George,')
- §1 [foreign-work-banner/head] 'SCHLEIERMACHER’S LIFE' — names 'SCHLEIERMACHER', not the declared author 'Cross, George,'
- §14 [foreign-work-banner/tail] 'WORKS OF REFERENCE' — names 'REFERENCE', not the declared author 'Cross, George,'
- §16 [word-index-title/tail] 'Latin Words and Phrases'
- §17 [word-index-title/tail] 'German Words and Phrases'

### daubney-additions — FAIL (48 sections, declared author 'Daubney, William Heaford')
- §45 [publisher-blurb-body/tail] 'Price 3s.

A.D.BOOKMAN. —“A lucid setting forth of the Ancient and Modern Use of'
- §46…§48 [word-index-title] 3 consecutive findings, e.g. 'Latin Words and Phrases' … 'French Words and Phrases'
- weak, reported for reading (not held): 3 — e.g. §16 [foreign-work-banner] 'THE HISTORY OF SUSANNA'

### deane-pseudepig — FAIL (11 sections, declared author 'Deane, William John')
- §1 [apparatus-title/head] 'CONTENTS.'
- §11 [word-index-title/head] 'Latin Words and Phrases'

### denney-christ-death — FAIL (14 sections, declared author 'Denney, James')
- §12 [word-index-title/head] 'Latin Words and Phrases'
- §13 [word-index-title/tail] 'German Words and Phrases'
- §14 [word-index-title/tail] 'French Words and Phrases'

### desales-love — FAIL (206 sections, declared author 'Francis of Sales, St.')
- §205 [word-index-title/tail] 'Latin Words and Phrases'
- §206 [word-index-title/tail] 'French Words and Phrases'

### doddridge-regen — FAIL (12 sections, declared author 'Doddridge, Philip')
- §12 [word-index-title/head] 'Latin Words and Phrases'

### drummond-natural-law — FAIL (16 sections, declared author 'Drummond, Henry')
- §1 [publisher-blurb-body/head] '”— CHURCH QUARTERLY REVIEW.

“A most
remarkable volume. It is perfectly delightf'
- §16 [word-index-title/tail] 'Latin Words and Phrases'

### drummond-new-ev — FAIL (8 sections, declared author 'Drummond, Henry')
- §8 [word-index-title/head] 'Latin Words and Phrases'

### edersheim-temple — FAIL (21 sections, declared author 'Edersheim, Alfred')
- §20 [word-index-title/tail] 'Latin Words and Phrases'

### edwards-will — FAIL (37 sections, declared author 'Edwards, Jonathan')
- §37 [word-index-title/tail] 'Latin Words and Phrases'

### edwards-works1 — FAIL (302 sections, declared author 'Edwards, Jonathan')
- §25 [foreign-work-banner/middle] 'LETTERS OF MRS. BURR' — names 'BURR', not the declared author 'Edwards, Jonathan'
- §266 [foreign-work-banner/middle] 'THE
WORK OF REDEMPTION' — names 'REDEMPTION', not the declared author 'Edwards, Jonathan'
- weak, reported for reading (not held): 4 — e.g. §1 [foreign-work-banner] 'THE WORKS OF
JONATHAN EDWARDS

WITH'

### emmerich-passion — FAIL (78 sections, declared author 'Emmerich, Anne Catherine')
- §78 [word-index-title/tail] 'Latin Words and Phrases'

### erasmus-colloquies1 — FAIL (41 sections, declared author 'Erasmus, Desiderius')
- §5 [apparatus-title/head] 'THE PREFACE.'
- §7 [apparatus-title/head] 'The ARGUMENT.'
- weak, reported for reading (not held): 1 — e.g. §11 [foreign-work-banner] 'Life of Soldiers'

### farrar-clouds — FAIL (80 sections, declared author 'Farrar, Frederic William')
- §79 [word-index-title/tail] 'Latin Words and Phrases'
- §80 [word-index-title/tail] 'French Words and Phrases'

### fenelon-existence-god — FAIL (92 sections, declared author 'Fénelon, François de Salignac de la Mothe')
- §76 [foreign-work-banner/middle] 'Works of Art' — names 'Art', not the declared author 'Fénelon, François de Salignac de la Mothe'

### finney-theology — FAIL (54 sections, declared author 'Finney, Charles Grandison')
- §54 [word-index-title/tail] 'Latin Words and Phrases'

### flavel-grace — FAIL (37 sections, declared author 'Flavel, John')
- §1 [apparatus-title/head] 'The Epistle Dedicatory'

### flavel-pneum — FAIL (10 sections, declared author 'Flavel, John')
- §1 [apparatus-title/head] 'The Epistle Dedicatory'
- §2 [apparatus-title/head] 'The Preface'

### fox-g-autobio — FAIL (21 sections, declared author 'Fox, George')
- §18 [foreign-work-banner/tail] 'Work of Organizing' — names 'Organizing', not the declared author 'Fox, George'

### fuller-goodthoughts — FAIL (226 sections, declared author 'Fuller, Thomas')
- §226 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §189 [foreign-work-byline] '. BY HOOK AND BY CROOK'

### gill-doctrinal — FAIL (112 sections, declared author 'Gill, John')
- §112 [word-index-title/tail] 'Latin Words and Phrases'

### gill-practical — FAIL (53 sections, declared author 'Gill, John')
- §53 [word-index-title/tail] 'Latin Words and Phrases'

### harnack-origin-nt — FAIL (22 sections, declared author 'Harnack, Adolf')
- §1 [apparatus-title/head] 'PREFACE'
- §22 [word-index-title/tail] 'Latin Words and Phrases'

### howe-john-howe05 — FAIL (53 sections, declared author 'Howe, John')
- §53 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §21 [foreign-work-byline] 'BY A PLENTIFUL EFFUSION
OF'

### howe-john-howe06 — FAIL (43 sections, declared author 'Howe, John')
- §43 [word-index-title/tail] 'Latin Words and Phrases'

### howe-john-howe07 — FAIL (62 sections, declared author 'Howe, John')
- §62 [word-index-title/tail] 'Latin Words and Phrases'

### howe-john-howe08 — FAIL (56 sections, declared author 'Howe, John')
- §56 [word-index-title/tail] 'Latin Words and Phrases'

### james-varieties — FAIL (18 sections, declared author 'James, William')
- §17 [word-index-title/tail] 'Latin Words and Phrases'
- §18 [word-index-title/tail] 'German Words and Phrases'

### jenyns-evil — FAIL (7 sections, declared author 'Jenyns, Soame')
- §7 [word-index-title/head] 'Latin Words and Phrases'

### john-cross-ascent — FAIL (108 sections, declared author 'John of the Cross, St.')
- §9 [apparatus-title/head] 'Argument.'
- §107 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 2 — e.g. §5 [foreign-work-banner] 'THE LIFE OF ST. JOHN OF THE'

### john-cross-canticle — FAIL (44 sections, declared author 'John of the Cross, St.')
- §3 [apparatus-title/head] 'Argument'
- §44 [word-index-title/tail] 'Latin Words and Phrases'

### john-cross-dark-night — FAIL (46 sections, declared author 'John of the Cross, St.')
- §45 [word-index-title/tail] 'Latin Words and Phrases'

### jowett-b-essays — FAIL (13 sections, declared author 'Jowett, Benjamin')
- §13 [word-index-title/tail] 'Latin Words and Phrases'

### jowett-b-scripture — FAIL (9 sections, declared author 'Jowett, Benjamin')
- §9 [word-index-title/head] 'Latin Words and Phrases'

### jowett-b-theological — FAIL (8 sections, declared author 'Jowett, Benjamin')
- §8 [word-index-title/head] 'Latin Words and Phrases'

### jowett-epistpeter — FAIL (31 sections, declared author 'Jowett, John Henry')
- §31 [word-index-title/tail] 'Latin Words and Phrases'

### kuyper-holy-spirit — FAIL (134 sections, declared author 'Kuyper, Abraham')
- §70 [foreign-work-banner/middle] 'The Work of Regeneration' — names 'Regeneration', not the declared author 'Kuyper, Abraham'
- weak, reported for reading (not held): 1 — e.g. §2 [foreign-work-byline] '.

By PROF. BENJAMIN B. WARFIELD'

### lardner-n-miracles — FAIL (15 sections, declared author 'Lardner, Nathaniel')
- §1 [apparatus-title/head] 'The Preface.'
- §15 [word-index-title/tail] 'Latin Words and Phrases'

### lightfoot-fathers — FAIL (15 sections, declared author 'Lightfoot, John')
- §10 [foreign-work-banner/head] 'THE EPISTLE OF POLYCARP' — names 'POLYCARP', not the declared author 'Lightfoot, John'
- weak, reported for reading (not held): 8 — e.g. §1 [foreign-work-banner] 'THE FIRST EPISTLE OF CLEMENT TO THE'

### lindsay-early-church — FAIL (11 sections, declared author 'Lindsay, Thomas Martin')
- §10 [word-index-title/head] 'Latin Words and Phrases'
- §11 [word-index-title/head] 'French Words and Phrases'

### luckock-h-studies — FAIL (7 sections, declared author 'Luckock, Herbert Mortimer, 1833-1909')
- §7 [word-index-title/head] 'Latin Words and Phrases'

### macdonald-princessgoblin — FAIL (34 sections, declared author 'MacDonald, George')
- §1 [apparatus-title/head] 'Title'

### maclaren-david — FAIL (18 sections, declared author 'MacLaren, Alexander')
- §17 [publisher-blurb-body/tail] '8vo, cloth, price 7s. 6d. each.

THE PSALMS.

Vol. I.—Psalms I.-XXXVIII.
"  II.—'

### maimonides-guide — FAIL (187 sections, declared author 'Maimonides, Moses')
- §82 [apparatus-title/middle] 'INTRODUCTION'
- §131 [apparatus-title/middle] 'INTRODUCTION'
- §187 [word-index-title/tail] 'Latin Words and Phrases'

### mead-matthew-almost — FAIL (11 sections, declared author 'Mead, Matthew')
- §11 [word-index-title/head] 'Latin Words and Phrases'

### mede-key — FAIL (59 sections, declared author 'Mede, Joseph')
- §59 [word-index-title/tail] 'Latin Words and Phrases'

### moffat-jampetjud — FAIL (7 sections, declared author 'Moffat, James, D.D.')
- §6 [word-index-title/head] 'Latin Words and Phrases'
- §7 [word-index-title/head] 'French Words and Phrases'

### moule-brethren — FAIL (15 sections, declared author 'Moule, Handley Carr Glyn')
- §15 [publisher-blurb-body/tail] 'cloth, 5s.

TO MY YOUNGER BRETHREN ON PASTORAL LIFE AND WORK. 5s.

OUTLINES OF C'

### murray-working — FAIL (31 sections, declared author 'Murray, Andrew')
- §15 [foreign-work-banner/middle] 'Work of
Ministering' — names 'Ministering', not the declared author 'Murray, Andrew'

### neander-a-life — FAIL (358 sections, declared author 'Neander, Augustus Johann')
- §62 [foreign-work-banner/middle] 'Work of Satan' — names 'Satan', not the declared author 'Neander, Augustus Johann'
- §183 [apparatus-title/middle] 'Introduction.'
- §321 [foreign-work-banner/middle] 'DISCOURSES OF CHRIST AFTER RISING' — names 'RISING', not the declared author 'Neander, Augustus Johann'
- §357 [word-index-title/tail] 'Latin Words and Phrases'
- §358 [word-index-title/tail] 'German Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §3 [foreign-work-banner] 'THE HISTORY OF CHRIST IN GENERAL'

### neander-a-light — FAIL (29 sections, declared author 'Neander, Augustus Johann')
- §29 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §13 [foreign-work-banner] 'THE HISTORY OF MISSIONS IN THE'

### newman-tractstimes — FAIL (11 sections, declared author 'Newman, John Henry')
- §11 [publisher-blurb-body/head] 'second edition of my tract, I alluded (p. 23) to the ^r]po(payiaf the less rigid'

### orr-view — FAIL (67 sections, declared author 'Orr, James')
- §66 [word-index-title/tail] 'Latin Words and Phrases'
- §67 [word-index-title/tail] 'German Words and Phrases'

### owen-grotius — FAIL (4 sections, declared author 'Owen, John')
- §2 [apparatus-title/head] 'Title.'
- §4 [word-index-title/head] 'Latin Words and Phrases'

### owen-just — FAIL (41 sections, declared author 'Owen, John')
- §41 [word-index-title/tail] 'Latin Words and Phrases'

### owen-poema — FAIL (3 sections, declared author 'Owen, John')
- §3 [word-index-title/head] 'Latin Words and Phrases'

### owen-trinity — FAIL (8 sections, declared author 'Owen, John')
- §3 [apparatus-title/head] 'The Preface'
- §8 [word-index-title/head] 'Latin Words and Phrases'

### paley-evidence — FAIL (48 sections, declared author 'Paley, William')
- §48 [word-index-title/tail] 'Latin Words and Phrases'

### penn-primitivechristianity — FAIL (20 sections, declared author 'Penn, William')
- §1 [publisher-catalogue-title/head] 'OPINIONS OF THE PRESS.'

### pink-gospels — FAIL (12 sections, declared author 'Pink, Arthur Walkington')
- §1 [apparatus-title/head] 'Title'

### pink-inspiration — FAIL (23 sections, declared author 'Pink, Arthur Walkington')
- §1 [apparatus-title/head] 'Title'

### pressense-early — FAIL (70 sections, declared author 'Pressensé, Edmund Dehault de')
- §69 [word-index-title/tail] 'Latin Words and Phrases'
- §70 [word-index-title/tail] 'German Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §62 [foreign-work-banner] 'THE EPISTLES OF JAMES AND OF'

### prideaux-directions — FAIL (13 sections, declared author 'Prideaux, Humphrey')
- §13 [word-index-title/tail] 'Latin Words and Phrases'

### ramsay-bethlehem — FAIL (18 sections, declared author 'Ramsay, William Mitchell')
- §17 [word-index-title/tail] 'Latin Words and Phrases'
- §18 [word-index-title/tail] 'German Words and Phrases'

### ray-persuasive — FAIL (15 sections, declared author 'Ray, John')
- §1 [apparatus-title/head] 'The Preface to the Reader.'
- §15 [word-index-title/tail] 'Latin Words and Phrases'

### richardson-fathers — FAIL (40 sections, declared author 'Richardson, Cyril C.')
- §2 [apparatus-title/head] 'CONTENTS'
- §9 [foreign-work-banner/head] 'The Letters of Ignatius' — names 'Ignatius', not the declared author 'Richardson, Cyril C.'
- §19 [foreign-work-banner/middle] 'The Letter of Polycarp' — names 'Polycarp', not the declared author 'Richardson, Cyril C.'
- §40 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 4 — e.g. §11 [foreign-work-banner] 'The Letter of Ignatius'

### rolt-dionysius — FAIL (27 sections, declared author 'Rolt, Clarence Edwin')
- §26 [word-index-title/tail] 'Latin Words and Phrases'
- §27 [word-index-title/tail] 'French Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §13 [foreign-work-banner] 'Writing of Divinity'

### schaff-romance — FAIL (7 sections, declared author 'Schaff, Philip')
- §7 [word-index-title/head] 'Latin Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §4 [foreign-work-byline] 'By Napoleon Roussel .'

### schmid-theology — FAIL (79 sections, declared author 'Schmid, Heinrich')
- §78 [word-index-title/tail] 'Latin Words and Phrases'
- §79 [word-index-title/tail] 'German Words and Phrases'

### shepard-worksthomas — FAIL (30 sections, declared author 'Shepard, Thomas')
- §1 [apparatus-title/head] 'Title'
- §14 [publisher-blurb-body/middle] '"--Mr. Shepard marries Margaret Boradel.--Sickness and death.--Last will.--Mr. S'
- weak, reported for reading (not held): 3 — e.g. §2 [foreign-work-byline] '.

BY

JOHN A. ALBRO'

### simon-works2 — FAIL (87 sections, declared author 'Simons, Menno')
- §15 [foreign-work-banner/middle] 'LETTER OF CONSOLATION' — names 'CONSOLATION', not the declared author 'Simons, Menno'
- §34 [foreign-work-banner/middle] 'LETTER OF CAUTION ON DISCORD' — names 'DISCORD', not the declared author 'Simons, Menno'

### swete-greekot — FAIL (28 sections, declared author 'Swete, Henry Barclay')
- §27 [word-index-title/tail] 'Latin Words and Phrases'
- §28 [word-index-title/tail] 'German Words and Phrases'
- weak, reported for reading (not held): 2 — e.g. §16 [foreign-work-byline] '. by Non-Christian Hellenists.'

### taylor-holy-dying — FAIL (42 sections, declared author 'Taylor, Jeremy')
- §42 [word-index-title/tail] 'Latin Words and Phrases'

### taylor-jh-union — FAIL (10 sections, declared author 'Taylor, James Hudson')
- §1 [apparatus-title/head] 'Title'
- §4 [apparatus-title/head] 'The Title'

### therese-autobio — FAIL (89 sections, declared author 'Therese, of Lisieux, St.')
- §18 [foreign-work-banner/middle] 'LETTERS OF SOEUR TH' — names 'SOEUR', not the declared author 'Therese, of Lisieux, St.'
- §83 [foreign-work-banner/tail] 'POEMS OF SOEUR TH' — names 'SOEUR', not the declared author 'Therese, of Lisieux, St.'

### thomson-owenlife — FAIL (17 sections, declared author 'Thomson, Andrew')
- §17 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 2 — e.g. §1 [foreign-work-banner] 'Life of Dr Owen'

### tillotson-works04 — FAIL (32 sections, declared author 'Tillotson, John')
- §32 [word-index-title/tail] 'Latin Words and Phrases'

### tillotson-works05 — FAIL (32 sections, declared author 'Tillotson, John')
- §32 [word-index-title/tail] 'Latin Words and Phrases'

### tillotson-works06 — FAIL (28 sections, declared author 'Tillotson, John')
- §28 [word-index-title/tail] 'Latin Words and Phrases'

### tillotson-works07 — FAIL (33 sections, declared author 'Tillotson, John')
- §33 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 2 — e.g. §31 [foreign-work-byline] 'BY NATURE AND BY REVELATION.'

### tillotson-works08 — FAIL (32 sections, declared author 'Tillotson, John')
- §32 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 4 — e.g. §1 [foreign-work-byline] 'BY NATURE AND BY REVELATION.'

### tillotson-works09 — FAIL (36 sections, declared author 'Tillotson, John')
- §36 [word-index-title/tail] 'Latin Words and Phrases'

### tillotson-works10 — FAIL (57 sections, declared author 'Tillotson, John')
- §57 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 2 — e.g. §24 [foreign-work-banner] 'THE
TREATISE OF MR'

### tischendorf-origins — FAIL (5 sections, declared author 'Tischendorf, Constantine von')
- §4 [word-index-title/head] 'Latin Words and Phrases'
- §5 [word-index-title/head] 'French Words and Phrases'

### tolstoy-hadij — FAIL (19 sections, declared author 'Tolstoy, Leo Nikolayevich')
- §19 [word-index-title/tail] 'French Words and Phrases'

### tolstoy-ivan — FAIL (13 sections, declared author 'Tolstoy, Leo Nikolayevich')
- §13 [word-index-title/tail] 'French Words and Phrases'

### tolstoy-karenina — FAIL (242 sections, declared author 'Tolstoy, Leo Nikolayevich')
- §241 [word-index-title/tail] 'German Words and Phrases'
- §242 [word-index-title/tail] 'French Words and Phrases'

### torrey-revival — FAIL (42 sections, declared author 'Torrey, Reuben Archer')
- §40 [foreign-work-banner/tail] 'BELIEVER’S WORKS' — names 'BELIEVER', not the declared author 'Torrey, Reuben Archer'
- §42 [publisher-blurb-body/tail] 'Cloth, net $1.00.

Difficulties and Alleged Errors and Contradictions in the Bib'

### trench-7churches — FAIL (11 sections, declared author 'Trench, Richard Chenevix')
- §10 [word-index-title/head] 'Latin Words and Phrases'
- §11 [word-index-title/head] 'German Words and Phrases'

### tulloch-luther — FAIL (9 sections, declared author 'Tulloch, John')
- §7…§9 [word-index-title] 3 consecutive findings, e.g. 'Latin Words and Phrases' … 'French Words and Phrases'

### tulloch-sin — FAIL (9 sections, declared author 'Tulloch, John')
- §9 [word-index-title/head] 'Latin Words and Phrases'

### tulloch-theism — FAIL (40 sections, declared author 'Tulloch, John')
- §39 [word-index-title/tail] 'Latin Words and Phrases'
- §40 [word-index-title/tail] 'French Words and Phrases'

### ullmann-sinlessness — FAIL (38 sections, declared author 'Ullmann, Carl')
- §38 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §9 [foreign-work-banner] 'Life of Christianity'

### underhill-mysticism — FAIL (22 sections, declared author 'Underhill, Evelyn')
- §21 [word-index-title/tail] 'Latin Words and Phrases'
- §22 [word-index-title/tail] 'French Words and Phrases'

### walker-harmony2 — FAIL (342 sections, declared author 'Walker, William')
- §1 [apparatus-title/head] 'Title Page'

### watson-commandments — FAIL (24 sections, declared author 'Watson, Thomas')
- §24 [word-index-title/tail] 'Latin Words and Phrases'

### wesley-works — FAIL (257 sections, declared author 'Wesley, John')
- §2 [apparatus-title/head] 'The Preface'
- §12 [foreign-work-banner/head] 'Renty’s Life' — names 'Renty', not the declared author 'Wesley, John'
- §142 [apparatus-title/middle] 'The Preface'
- weak, reported for reading (not held): 1 — e.g. §144 [foreign-work-banner] 'The Life of Faith
Exemplified'

### west-ce-analogy — FAIL (18 sections, declared author 'West, Charles Edward')
- §18 [word-index-title/tail] 'Latin Words and Phrases'

### willison-testimony — FAIL (8 sections, declared author 'Willison, John')
- §2 [apparatus-title/head] 'The Preface'
- §8 [word-index-title/head] 'Latin Words and Phrases'

### wuttke-ethics2 — FAIL (38 sections, declared author 'Wuttke, Adolf')
- §38 [word-index-title/tail] 'Latin Words and Phrases'

### young-e-night — FAIL (4 sections, declared author 'Young, Edward')
- §4 [publisher-blurb-body/head] '8vo, Pica Type, Extra Cloth Boards.
EDITED BY REV. G. GILFILLAN.

Now ready, Vol'

## PASS — 296 works

- allen-j-peace — PASS (8 sections)
- allestree-government — PASS (13 sections)
- alphonsus-uniformity — PASS (7 sections)
- anselm-basic-works — PASS (163 sections)
- arminius-works1 — PASS (111 sections)
- arminius-works2 — PASS (150 sections); 1 weak finding(s) reported
- arndt-true — PASS (174 sections)
- augustine-enchiridion — PASS (33 sections)
- barclay-quakers — PASS (39 sections)
- barnes-ntnotes — PASS (8155 sections); 124 weak finding(s) reported
- bavinck-revelation — PASS (10 sections)
- baxter-causes — PASS (6 sections)
- baxter-pastor — PASS (17 sections)
- baxter-unconverted — PASS (5 sections)
- benedict-rule — PASS (75 sections); 2 weak finding(s) reported
- benson-psalmody — PASS (12 sections)
- bernard-loving-god — PASS (15 sections)
- bernard-st-malachy — PASS (18 sections); 1 weak finding(s) reported
- beth-miracles — PASS (4 sections); 1 weak finding(s) reported
- bevan-matelda — PASS (55 sections)
- blois-mirror — PASS (13 sections)
- blois-oratory — PASS (31 sections)
- blois-spiritual — PASS (129 sections)
- boethius-consolation — PASS (8 sections)
- boethius-tracts — PASS (6 sections)
- boettner-predest — PASS (41 sections)
- bonar-peace — PASS (12 sections)
- bonar-rentveil — PASS (12 sections)
- boston-crook — PASS (3 sections)
- bounds-essentials — PASS (14 sections)
- bounds-necessity — PASS (15 sections)
- bounds-power — PASS (20 sections)
- bounds-prayingmen — PASS (16 sections)
- bounds-purpose — PASS (13 sections)
- bounds-reality — PASS (15 sections)
- bounds-weapon — PASS (12 sections)
- boyce-theology — PASS (42 sections)
- cassian-conferences — PASS (516 sections); 2 weak finding(s) reported
- catherine-g-life — PASS (109 sections)
- charnock-reconcil — PASS (5 sections)
- chesterton-america — PASS (19 sections)
- chesterton-ball-cross — PASS (20 sections)
- chesterton-defendant — PASS (17 sections)
- chesterton-divorce — PASS (10 sections)
- chesterton-eugenics — PASS (17 sections)
- chesterton-everlasting — PASS (14 sections)
- chesterton-heretics — PASS (20 sections)
- chesterton-innocencebrown — PASS (12 sections)
- chesterton-longbow — PASS (8 sections)
- chesterton-magic — PASS (4 sections)
- chesterton-manalive — PASS (10 sections)
- chesterton-napoleon — PASS (15 sections)
- chesterton-orthodoxy — PASS (9 sections)
- chesterton-thingsconsidered — PASS (26 sections)
- chesterton-thursday — PASS (15 sections)
- chesterton-toomuch — PASS (8 sections)
- chesterton-trifles — PASS (39 sections)
- chesterton-victorianage — PASS (4 sections)
- chesterton-whatwrong — PASS (52 sections)
- chesterton-whitehorse — PASS (9 sections)
- chesterton-wisdom — PASS (12 sections)
- coleridge-reflection — PASS (116 sections); 2 weak finding(s) reported
- conybeare-lxxgrammar — PASS (13 sections)
- cowper-guyonpoems — PASS (37 sections)
- dante-divinecomedy — PASS (102 sections)
- decaussade-abandonment — PASS (224 sections)
- defoe-crusoe — PASS (27 sections)
- desales-devout-life — PASS (125 sections)
- dick-j-acts — PASS (29 sections); 2 weak finding(s) reported
- dionysius-works — PASS (18 sections)
- dods-likechrist — PASS (6 sections)
- dostoevsky-brothers — PASS (96 sections)
- dostoevsky-crimepunish — PASS (41 sections)
- dostoevsky-undernotes — PASS (22 sections)
- drummond-ascent — PASS (14 sections); 1 weak finding(s) reported
- drummond-bsi — PASS (7 sections)
- drummond-greatest — PASS (23 sections)
- drummond-ideal — PASS (18 sections)
- drummond-life — PASS (4 sections)
- drummond-monkey — PASS (13 sections)
- drummond-stone-roll — PASS (7 sections)
- edersheim-sketches — PASS (18 sections)
- edwards-affections — PASS (28 sections)
- edwards-treatiseongrace — PASS (3 sections)
- edwards-works2 — PASS (241 sections); 3 weak finding(s) reported
- emmerich-lifemary — PASS (21 sections); 1 weak finding(s) reported
- feltoe-dionysius — PASS (42 sections)
- fenelon-maxims — PASS (5 sections)
- fenelon-progress — PASS (108 sections)
- finney-backslide — PASS (6 sections)
- finney-power — PASS (17 sections)
- finney-revivals — PASS (23 sections)
- finney-toprofessingchristians — PASS (24 sections)
- fisher-e-marrow — PASS (21 sections)
- flavel-fountain — PASS (44 sections)
- flavel-lovely — PASS (8 sections)
- flavel-saintindeed — PASS (24 sections)
- forsyth-prayer — PASS (7 sections)
- forsyth-work — PASS (8 sections)
- fosdick-meaningprayer — PASS (31 sections)
- fuller-david — PASS (3 sections)
- gardner-cell — PASS (17 sections); 4 weak finding(s) reported
- gerson-snares — PASS (6 sections)
- gordon-talkschrist — PASS (8 sections)
- gordon-talksfollowingchrist — PASS (11 sections)
- gordon-talksjesus — PASS (21 sections)
- gordon-talksjohn — PASS (7 sections)
- gordon-talkspower — PASS (8 sections)
- gordon-talkswinners — PASS (14 sections)
- gray-jm-synthetic — PASS (63 sections)
- griffin-sufferings — PASS (23 sections)
- groom-bible — PASS (61 sections)
- guthrie-interest2 — PASS (25 sections)
- guyon-auto — PASS (50 sections)
- guyon-song — PASS (10 sections)
- guyon-spiritual-torrents — PASS (16 sections)
- handel-messiah — PASS (17 sections)
- havergal-keptuse — PASS (33 sections)
- herbert-temple2 — PASS (41 sections)
- hoadly-acceptance — PASS (18 sections)
- hodge-darwinism — PASS (23 sections)
- hoskier-codexb1 — PASS (5 sections)
- iecm-ojibway — PASS (80 sections)
- inge-mysticism — PASS (9 sections)
- inge-outspoken — PASS (12 sections)
- jenyns-internal1776 — PASS (5 sections)
- jenyns-internal1799 — PASS (5 sections)
- jfb — PASS (15473 sections); 2 weak finding(s) reported
- johnson-bw-pnt — PASS (298 sections); 1 weak finding(s) reported
- jowett-calvary — PASS (7 sections)
- jowett-friendonroad — PASS (59 sections)
- jowett-passion — PASS (8 sections); 1 weak finding(s) reported
- jowett-silverlining — PASS (26 sections)
- keble-year — PASS (109 sections)
- kelly-gerhardtsong — PASS (78 sections)
- kierkegaard-selections — PASS (5 sections); 1 weak finding(s) reported
- knox-blast — PASS (5 sections)
- knox-works1 — PASS (24 sections)
- kuyper-near — PASS (110 sections)
- law-apracticaltreat — PASS (16 sections)
- law-collection — PASS (25 sections)
- law-doubt — PASS (5 sections)
- law-humbleearnest — PASS (35 sections)
- law-love2 — PASS (5 sections)
- law-prayer — PASS (5 sections)
- law-serious-call — PASS (25 sections)
- law-waytodivine — PASS (3 sections)
- leightonpullan-earlychristian — PASS (10 sections)
- lewis-he-sswales — PASS (4 sections)
- lightfoot-talmud — PASS (62 sections)
- macdonald-adela1 — PASS (7 sections)
- macdonald-adela2 — PASS (7 sections)
- macdonald-adela3 — PASS (10 sections)
- macdonald-backofnorth — PASS (38 sections)
- macdonald-dayboy — PASS (21 sections)
- macdonald-donal-grant — PASS (86 sections)
- macdonald-doublestory — PASS (14 sections)
- macdonald-elginbrod — PASS (76 sections)
- macdonald-heatherandsnow — PASS (45 sections)
- macdonald-hope — PASS (12 sections)
- macdonald-lady — PASS (36 sections)
- macdonald-lilith — PASS (47 sections)
- macdonald-miracles — PASS (12 sections)
- macdonald-neighbourhood — PASS (34 sections)
- macdonald-phantastes-faerie — PASS (27 sections)
- macdonald-portent — PASS (33 sections)
- macdonald-princess — PASS (15 sections)
- macdonald-princesscurdie — PASS (35 sections)
- macdonald-purposes-shadows — PASS (5 sections)
- macdonald-rfalconer — PASS (73 sections)
- macdonald-salted — PASS (27 sections)
- macdonald-saltedfire — PASS (26 sections)
- macdonald-seaboardparish — PASS (43 sections)
- macdonald-sirgibbie — PASS (64 sections)
- macdonald-strife — PASS (12 sections)
- macdonald-there-back — PASS (67 sections)
- macdonald-thomaswingfold — PASS (98 sections)
- macdonald-vicardaughter — PASS (44 sections)
- manning-henry-grounds — PASS (4 sections)
- mcgarvey-gospels — PASS (201 sections)
- mead-matthew-name — PASS (4 sections)
- meyer-guidance — PASS (9 sections)
- meyer-into-holiest — PASS (36 sections)
- milton-paradiselost — PASS (10 sections)
- molinos-guide — PASS (59 sections)
- moody-anecdotes — PASS (63 sections)
- more-comfort — PASS (69 sections)
- moule-hebrews — PASS (14 sections)
- murray-covenants — PASS (24 sections)
- murray-deeper — PASS (8 sections)
- murray-indwelling — PASS (13 sections)
- murray-lords-table — PASS (31 sections)
- murray-new-life — PASS (53 sections); 1 weak finding(s) reported
- murray-obedience — PASS (9 sections); 2 weak finding(s) reported
- murray-prayer — PASS (32 sections); 1 weak finding(s) reported
- murray-surrender — PASS (9 sections)
- murray-true-vine — PASS (31 sections)
- murray-waiting — PASS (33 sections)
- nave-bible — PASS (25 sections)
- newman-callista — PASS (36 sections)
- newman-gerontius — PASS (7 sections)
- newton-messiah1 — PASS (25 sections)
- newton-messiah2 — PASS (25 sections)
- oman-grace — PASS (26 sections)
- orrce-holylife — PASS (46 sections)
- orrce-lambs — PASS (53 sections)
- otto-ideaholy — PASS (23 sections)
- owen-apostasy — PASS (13 sections)
- owen-churchlove — PASS (5 sections)
- owen-communion — PASS (24 sections)
- owen-conscience — PASS (14 sections)
- owen-deathofdeath — PASS (31 sections)
- owen-discourses — PASS (28 sections)
- owen-display — PASS (14 sections)
- owen-eshcol — PASS (24 sections)
- owen-evangelicalchurches — PASS (26 sections)
- owen-faith — PASS (7 sections)
- owen-glory — PASS (16 sections)
- owen-indwellingsin — PASS (17 sections)
- owen-justice — PASS (18 sections)
- owen-liturgies — PASS (10 sections)
- owen-mort — PASS (14 sections)
- owen-pastorspeople — PASS (8 sections)
- owen-perseverance — PASS (17 sections)
- owen-pneum — PASS (72 sections)
- owen-schism — PASS (20 sections); 1 weak finding(s) reported
- owen-sin-grace — PASS (6 sections)
- owen-spirituallyminded — PASS (21 sections)
- owen-temptation — PASS (9 sections)
- owen-truthinnocence — PASS (7 sections)
- owen-vindicevang — PASS (36 sections)
- owen-worship — PASS (53 sections)
- paley-paleysnatural — PASS (20 sections)
- palgrave-sacredsong — PASS (423 sections)
- pascal-provincial — PASS (20 sections)
- penn-quakers — PASS (8 sections)
- philo-works — PASS (44 sections); 1 weak finding(s) reported
- pink-antichrist — PASS (60 sections)
- pink-godhood — PASS (4 sections)
- pink-just — PASS (10 sections)
- pink-return — PASS (103 sections)
- pink-sovereignty — PASS (17 sections)
- pusey-eirenicon — PASS (5 sections)
- quadrupani-light — PASS (28 sections)
- robertson-at-word — PASS (287 sections); 25 weak finding(s) reported
- robinson-j-words — PASS (15 sections)
- ruysbroeck-adornment — PASS (129 sections)
- ryle-upper-room — PASS (23 sections)
- schleiermach-religion — PASS (8 sections)
- sheldon-ihsteps — PASS (31 sections)
- simon-works1 — PASS (75 sections)
- singh-feet — PASS (16 sections)
- smith-ga-jeremiah — PASS (24 sections)
- smith-geo-carey — PASS (16 sections)
- smith-hw-comfort — PASS (17 sections)
- smith-hw-secret — PASS (22 sections); 1 weak finding(s) reported
- smith-hw-types — PASS (24 sections)
- spurgeon-grace — PASS (20 sections)
- spurgeon-till-he-come — PASS (23 sections)
- steele-love — PASS (23 sections)
- teresa-castle2 — PASS (31 sections); 1 weak finding(s) reported
- teresa-life — PASS (40 sections); 1 weak finding(s) reported
- tischendorf-gospels — PASS (7 sections)
- tolstoy-23-tales — PASS (24 sections)
- tolstoy-family — PASS (9 sections)
- tolstoy-gospel — PASS (15 sections)
- tolstoy-master — PASS (10 sections)
- tolstoy-sergius — PASS (6 sections)
- torrey-pray — PASS (13 sections)
- torrey-ttt — PASS (24 sections)
- torrey-work-holy-spirit — PASS (22 sections)
- traherne-centuries — PASS (6 sections)
- underhill-essentials — PASS (13 sections)
- underhill-life — PASS (10 sections)
- underhill-practical — PASS (10 sections)
- upham-maxims — PASS (45 sections)
- ursinus-gospel — PASS (5 sections)
- vandyke-otherwiseman — PASS (5 sections); 1 weak finding(s) reported
- watson-cordial — PASS (10 sections)
- watts-divsongs — PASS (46 sections)
- wesley-journal — PASS (392 sections); 3 weak finding(s) reported
- wesley-perfection — PASS (7 sections)
- westcott-epistlehebrews — PASS (27 sections)
- white-acts — PASS (58 sections)
- white-controversy — PASS (43 sections); 1 weak finding(s) reported
- white-desire — PASS (87 sections)
- white-prophets — PASS (68 sections)
- white-steps — PASS (14 sections)
- whyte-pray — PASS (24 sections)
- whyte-teresa — PASS (17 sections)
- winkworth-chorales — PASS (206 sections)
- winkworth-life — PASS (121 sections)
- winkworth-lyra — PASS (104 sections)
- winkworth-singers — PASS (62 sections); 1 weak finding(s) reported
- woolman-journal — PASS (16 sections)
- wyss-swiss — PASS (18 sections)

## hooker-just — dev-staged, scanned on DEV (M-3 closure)

`hooker-just` is dev-staged and arrived after the frozen 133 — never scanned by any detector version
(deep-audit M-3). Scanned on dev (`ep-tiny-hat`, read-only txn) with the same detector 2.1.0;
input `docs/evidence/adr029-scan-2026-09-07-prod/input-hooker-just-dev.txt` (1 work, sha256
`cdb2962b74947ceab01d4e6a8f4e3c575bfe89300a2c885e471e32c4fa9db001`); full output `scan-hooker-just-dev.log`.

Verdict: **FAIL** (13 sections, declared author 'Hooker, Richard').
- §1 [foreign-work-banner/head] 'Discourse of Justification' — names 'Justification', not the declared author 'Hooker, Richard'

Per ADR-029 rule 2 this detection is a claim to be read: §1's head banner is the work's own discourse
title. It is recorded FAIL because the detector rules it a strong foreign-work banner; it is not in any
flip file (it sits outside both the 58 and the 439), and it must not be added to one while this verdict
stands — adjudicating the banner is an owner/ADR-029 reader call, not this scan's.

## Reproduce

```sh
# prod (439) — owner go, bylaw 7; READ ONLY enforced and checked
SCAN_ALLOW_PROD=1 DATABASE_URL="$(cat ~/.neon_prod_url)" \
npx tsx scripts/adr029-nonauthorial-scan.mts --target=ep-odd-fog-atnykudm --mode=scan \
  --slugs=docs/evidence/adr029-scan-2026-09-07-prod/input-slugs.json

# hooker-just (dev)
NEON_BRANCH=dev DATABASE_URL="$(cat ~/.neon_dev_owner_url)" \
npx tsx scripts/adr029-nonauthorial-scan.mts --target=ep-tiny-hat-atdgpisx --mode=scan \
  --slugs=docs/evidence/adr029-scan-2026-09-07-prod/input-hooker-just-dev.txt
```
