# ADR-029 scan verdict — staged set, 2026-09-06 (Track A, KIMI_ORDER_corpus-coverage §2)

- detector version: **2.0.0** (`scripts/lib/front-matter-detector.mjs`, DETECTOR_VERSION)
- input set: `docs/evidence/adr029-scan-2026-09-06/input-slugs.txt` — **133 works**, sha256 `2521d3463d1a8625c7cf6db5304274cab6813d2f2b78bd0f9ada7eb6a5829cf1`
- precondition: `SELECT slug FROM sources WHERE status='ingesting'` returned 0 rows before freezing (no run writing).
- store: dev branch only (`ep-tiny-hat`, read-only txn). No production connection.
- method: every section of every staged work through `sweepWorkMatter` (head AND tail, position-tagged;
  author-free shapes + author-aware foreign-work banner/byline). **FAIL = ≥1 STRONG finding.**
  Weak findings are reported for reading but do not fail a work (owner decision #4 on gating
  strength is open — report-only here). A detection is a claim to be read, never a deletion;
  no ordinal surgery was performed or is proposed (ADR-029 rule 2).

**Live-positive proof** (a zero-finding scan must mean something): the addendum-2 suppression is
applied on dev, so the documented positives are gone from the store — except **origen-commentary**,
which is live in this set and the scan DID flag it (§1 "The First Epistle of Clement", §101 "The
Second Epistle of Clement", both strong, dash-rule signed). The labelled set (redproof.log) covers
the suppressed classes from the suppression backups, 11/11 works detected, 3/3 kept negatives clean.

## Summary — 133 works: **90 PASS · 43 FAIL** · 0 EMPTY

Strong findings by kind across the whole set: `apparatus-title` 43 (title pages / contents /
prefaces carried in as sections), `word-index-title` 15 (live "Latin/German Words and Phrases"
indexes — the exact addendum-2 class, un-suppressed in these staged works), `foreign-work-banner` 5
(origen ×2 — 1 & 2 Clement; schaff-anf06 ×2 — Julius Africanus, Theonas; schaff-anf08 ×1 — Clement).
Zero `publisher-*` strong findings: no publisher catalogue/price-list survives in the staged set.

## FAIL — held, non-authorial matter (every work, every strong finding)

### bacon-lw-history — FAIL (854 sections, declared author 'Bacon, Leonard Woolsey')
- §1 [apparatus-title/head] 'Title Page'

### baird-huguenots — FAIL (1213 sections, declared author 'Baird, Henry M.')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 1 — e.g. §25 [foreign-work-banner] "Luther's Treatises"

### bangs-history1 — FAIL (682 sections, declared author 'Bangs, Nathan')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 3 — e.g. §3 [foreign-work-banner] 'Wesley’s Works'

### bangs-history2 — FAIL (791 sections, declared author 'Bangs, Nathan')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 1 — e.g. §605 [foreign-work-banner] 'Lee’s History'

### bangs-history3 — FAIL (864 sections, declared author 'Bangs, Nathan')
- §1 [apparatus-title/head] 'Title Page'

### bangs-history4 — FAIL (900 sections, declared author 'Bangs, Nathan')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 1 — e.g. §46 [foreign-work-banner] 'Clarke’s Commentary'

### bede-history — FAIL (912 sections, declared author 'Bede, St.')
- §1 [apparatus-title/head] 'Title Page'

### bennett-expositor10 — FAIL (30 sections, declared author 'Bennett, William H.')
- §30 [word-index-title/tail] 'Latin Words and Phrases'

### dickinson-musicchurch — FAIL (781 sections, declared author 'Dickinson, Edward')
- §1 [apparatus-title/head] 'Title Page'
- §5 [apparatus-title/head] 'Contents'
- weak, reported for reading (not held): 1 — e.g. §753 [foreign-work-byline] '. by Pougin. Paris'

### edersheim-lifetimes — FAIL (4579 sections, declared author 'Alfred Edersheim')
- §1 [apparatus-title/head] 'Title Page'

### hort-ecclesia — FAIL (437 sections, declared author 'Hort, Fenton John Anthony')
- §1 [apparatus-title/head] 'Title Page'

### luther-bondage — FAIL (172 sections, declared author 'Luther, Martin')
- §172 [word-index-title/tail] 'Latin Words and Phrases'

### luther-first-prin — FAIL (27 sections, declared author 'Luther, Martin')
- §26 [word-index-title/tail] 'Latin Words and Phrases'
- §27 [word-index-title/tail] 'German Words and Phrases'
- weak, reported for reading (not held): 2 — e.g. §1 [foreign-work-byline] 'By Dr. WACE'

### manton-manton01 — FAIL (38 sections, declared author 'Manton, Thomas')
- §38 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §1 [foreign-work-byline] 'BY WILLIAM HARRIS, D.D.'

### manton-manton02 — FAIL (47 sections, declared author 'Manton, Thomas')
- §3 [apparatus-title/head] 'The Epistle Dedicatory.'
- §47 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §1 [foreign-work-byline] '.\nBY THE REV'

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

### origen-commentary — FAIL (1224 sections, declared author 'Origen of Alexandria')
- §1 [foreign-work-banner/head] 'The First\nEpistle of Clement' — names 'Clement', not the declared author 'Origen of Alexandria'
- §101 [foreign-work-banner/middle] 'The Second Epistle of\nClement' — names 'Clement', not the declared author 'Origen of Alexandria'

### robertson-history — FAIL (636 sections, declared author 'Robertson, James Craigie, Canon of Canterbury')
- §1 [apparatus-title/head] 'Title Page'

### rutherford-triumph — FAIL (813 sections, declared author 'Rutherford, Samuel')
- §1 [apparatus-title/head] 'Title Page'

### schaff-anf06 — FAIL (563 sections, declared author 'Schaff, Philip')
- §16 [foreign-work-banner/middle] 'Writings of Julius' — names 'Julius', not the declared author 'Schaff, Philip'
- §39 [foreign-work-banner/middle] 'The Epistle of Theonas' — names 'Theonas', not the declared author 'Schaff, Philip'

### schaff-anf07 — FAIL (477 sections, declared author 'Schaff, Philip')
- §477 [word-index-title/tail] 'Latin Words and Phrases'
- weak, reported for reading (not held): 5 — e.g. §365 [foreign-work-banner] 'Poem of Venantius'

### schaff-anf08 — FAIL (1255 sections, declared author 'Schaff, Philip')
- §543 [foreign-work-banner/middle] 'Epistle of Clement' — names 'Clement', not the declared author 'Schaff, Philip'
- weak, reported for reading (not held): 5 — e.g. §142 [apparatus-title] 'Argument for Polytheism.'

### schaff-hcc2 — FAIL (2082 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Preface to the Third Edition Revised (1/2)'
- §2 [apparatus-title/head] 'Preface to the Third Edition Revised (2/2)'
- §4 [apparatus-title/head] 'Preface to the Second Edition (1/9)'
- §5 [apparatus-title/head] 'Preface to the Second Edition (2/9)'
- §6 [apparatus-title/head] 'Preface to the Second Edition (3/9)'
- §7 [apparatus-title/head] 'Preface to the Second Edition (4/9)'
- §8 [apparatus-title/head] 'Preface to the Second Edition (5/9)'
- §9 [apparatus-title/head] 'Preface to the Second Edition (6/9)'
- §10 [apparatus-title/head] 'Preface to the Second Edition (7/9)'
- §11 [apparatus-title/head] 'Preface to the Second Edition (8/9)'
- §12 [apparatus-title/head] 'Preface to the Second Edition (9/9)'
- weak, reported for reading (not held): 40 — e.g. §22 [foreign-work-byline] '. by\nAnnie Harwood Holmden'

### schaff-hcc3 — FAIL (2325 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Title Page'
- §2 [apparatus-title/head] 'Preface to the Third Revision'
- weak, reported for reading (not held): 64 — e.g. §989 [foreign-work-banner] 'Discourses of Basil'

### schaff-hcc5 — FAIL (1725 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 15 — e.g. §16 [foreign-work-byline] '. by G. H. Pertz'

### schaff-hcc6 — FAIL (1861 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 30 — e.g. §30 [foreign-work-byline] '. by U. Chevalier'

### schaff-hcc7 — FAIL (1672 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 11 — e.g. §99 [foreign-work-banner] 'Life of Chris'

### schaff-hcc8 — FAIL (2053 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 125 — e.g. §48 [foreign-work-byline] '. by J. J. Ulrich'

### schaff-npnf111 — FAIL (91 sections, declared author 'Schaff, Philip')
- §59 [apparatus-title/middle] 'The Argument'

### schaff-npnf112 — FAIL (76 sections, declared author 'Schaff, Philip')
- §2 [apparatus-title/head] 'Argument.'

### schaff-npnf114 — FAIL (125 sections, declared author 'Schaff, Philip')
- §89 [apparatus-title/middle] 'Argument.'

### schaff-person — FAIL (512 sections, declared author 'Schaff, Philip')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 1 — e.g. §432 [foreign-work-banner] 'Discourse of Matters'

### tolstoy-maupassant — FAIL (2 sections, declared author 'Tolstoy, Leo Nikolayevich')
- §2 [word-index-title/head] 'French Words and Phrases'
- weak, reported for reading (not held): 1 — e.g. §1 [foreign-work-banner] 'The Works of Guy'

### vanbraght-mirror — FAIL (7080 sections, declared author 'Braght, Thieleman J. van')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 31 — e.g. §53 [apparatus-title] 'Contents — To The Readers in General (1/25)'

### winkworth-tauler — FAIL (731 sections, declared author 'Winkworth, Catherine')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 203 — e.g. §2 [foreign-work-byline] 'By\n\nJohn Greenleaf Whittier'

### wuttke-ethics1 — FAIL (1135 sections, declared author 'Wuttke, Adolf')
- §1 [apparatus-title/head] 'Title Page'
- weak, reported for reading (not held): 1 — e.g. §2 [foreign-work-banner] 'Letter of Authorization'

### young-j-christ — FAIL (409 sections, declared author 'Young, John')
- §1 [apparatus-title/head] 'Title Page'

## PASS (no strong finding)

- adeney-expositorsonglament — PASS (29 sections)
- bangs-alphabetic — PASS (2 sections)
- barnes-crosswire-nt — PASS (7431 sections)
- bernard-song-sermons — PASS (86 sections)
- boethius-trinity — PASS (2 sections)
- bunyan-badman — PASS (5 sections)
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
- chesterton-aquinas — PASS (8 sections)
- chesterton-historyengland — PASS (399 sections)
- chesterton-rightworld — PASS (1 sections)
- clarke-entire-sanct — PASS (1 sections)
- clarkson-owenfuneral — PASS (1 sections)
- cranmer-doctrine — PASS (1 sections)
- cripplegate-puritan-sermons — PASS (70 sections)
- donne-deaths-duel — PASS (1 sections)
- donne-devotions — PASS (95 sections)
- donne-divine-poems — PASS (41 sections)
- donne-easter — PASS (1 sections)
- donne-spital — PASS (1 sections)
- edwards-charity-fruits — PASS (16 sections)
- edwards-trinity — PASS (1 sections)
- erasmus-against-war — PASS (1 sections)
- flavel-life — PASS (1 sections)
- foxe-martyrs — PASS (1334 sections); 7 weak finding(s) reported
- herrick-noble-numbers — PASS (270 sections)
- ignatius-autobiography — PASS (10 sections)
- ignatius-exercises — PASS (96 sections)
- jfb — PASS (15473 sections); 1 weak finding(s) reported
- jowett-brooks — PASS (27 sections)
- julian-revelations — PASS (86 sections)
- kempis-imitation-benham — PASS (114 sections)
- kierkegaard-untruth — PASS (1 sections)
- knox-prayer — PASS (2 sections)
- kronstadt-christlife — PASS (2 sections)
- lardner-n-mosaic — PASS (2 sections)
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
- luther-translating — PASS (1 sections)
- luther-works1 — PASS (8 sections)
- luther-works2 — PASS (8 sections)
- miller-history — PASS (1103 sections)
- neander-a-expo-phil — PASS (2 sections)
- newman-apologia — PASS (5 sections)
- pascal-memorial — PASS (1 sections)
- pascal-pensees — PASS (15 sections)
- pascal-provincial — PASS (20 sections)
- penn-sermon — PASS (2 sections)
- pink-law — PASS (2 sections)
- pnt-crosswire — PASS (6067 sections); 2 weak finding(s) reported
- poole-tcp — PASS (24104 sections); 3 weak finding(s) reported
- schaff-hcc1 — PASS (2159 sections); 4 weak finding(s) reported
- schaff-hcc4 — PASS (1755 sections); 19 weak finding(s) reported
- schaff-npnf106 — PASS (198 sections)
- schaff-npnf107 — PASS (143 sections)
- schaff-npnf108 — PASS (7 sections)
- schaff-npnf109 — PASS (14 sections); 1 weak finding(s) reported
- schaff-npnf110 — PASS (88 sections)
- schaff-npnf113 — PASS (6 sections)
- schaff-npnf201 — PASS (588 sections); 25 weak finding(s) reported
- schaff-npnf202 — PASS (495 sections); 11 weak finding(s) reported
- schaff-npnf203 — PASS (584 sections); 10 weak finding(s) reported
- schaff-npnf204 — PASS (238 sections); 2 weak finding(s) reported
- scofield-crosswire — PASS (3207 sections)
- shepard-sabbath — PASS (1 sections)
- spurgeon-catechism — PASS (1 sections)
- thayers-lexicon — PASS (5507 sections); 1 weak finding(s) reported
- thompson-chain-reference — PASS (1650 sections); 3 weak finding(s) reported
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
