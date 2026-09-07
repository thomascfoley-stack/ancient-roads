# Stage 2 wave 2 — evidence note (2026-09-07)

Order: docs/pm/orders/2026-09-07-clean-acquisitions-order.md. Branch fix/ux-overnight-sweep,
dev staged only, never publish:true. Adapter: gutenberg (register path via adapter-loop).

## Landed

### newman-grammar-assent — PG #34022
- Licence: Public Domain (Gutenberg header, US). Author's own English — no translator, no editor.
- Edition READ from the title page (2026-09-07): "An Essay In Aid Of A Grammar Of Assent. by
  John Henry Newman, Of the Oratory. … London: Burns, Oates, & Co. 17 & 18, Portman Street,
  and 63, Paternoster Row. 1874". Candidate said "1870 original"; the 1874 printing is the same
  publisher with no edition statement — recorded as fetched, not as targeted.
- Profile: scope opens at the whole-line part-title "PART I. ASSENT AND APPREHENSION." (the
  indented CONTENTS lines cannot pre-match) so Newman's 1870 Dedication is excluded front
  matter; contents = the ten chapters + Newman's own third-edition NOTE.; scope ends at the
  collected FOOTNOTES block (edition apparatus). `filtered: []` — nothing dropped.
- Ingest: adapter-loop, staged; 11 sections, 735 flat embeddings (register plane) on dev.

### newman-idea-university — PG #24526
- Licence: Public Domain (Gutenberg header, US). Author's own English — no translator, no editor.
- Edition: the etext prints NO publisher imprint. Edition evidence READ from the text itself
  (2026-09-07): dedication dated "NOV. 21, 1852"; Introductory Letter signed "[_November 1858._]
  JOHN H. NEWMAN."; Advertisement dated "_November, 1858._" — the 1852-58 combined original the
  candidate names. Recorded as such, not as a specific print run.
- Profile: scope = "UNIVERSITY TEACHING." … "INDEX."; 9 Discourses + Introductory Letter + 10
  Lectures + Newman's own NOTE ON PAGE 478.; every "Discourse N."/"Lecture N." number line is a
  marker boundary so it can never attach to the previous unit's tail. The 1852 Preface and both
  dedications are excluded front matter. Newman's 1858 "Advertisement." is dropped by the shared
  GUT_MATTER front-matter heading filter — REPORTED in the scoped filter list
  (`filtered: [{"heading":"Advertisement.","reason":"front/back matter"}]`), inspected and
  accepted: authorial front matter, not a discourse.
- Ingest: adapter-loop, staged; 21 sections, 854 flat embeddings (register plane) on dev.

## Parked (data looked at before parking, per quality-slice)

### doddridge-hymns — PARKED: source text below serving quality
Not on Gutenberg (gutendex + PG author search 2026-09-07: only "Submission to Divine
Providence…" #26097 and "Life of Col. James Gardiner" #11253). archive.org holds only 18th-c.
long-s printings (1755 first and later; no 19th-c. reset reprint found). Read
hymnsfoundedonv00doddgoog_djvu.txt: title page OCR "HYMNS FOUNDED ON VARIOUS TEXTS … Published
from the Author's Manuscript. A NEW EDITION, Corrected. … LONDON: Printed in the Year 1716*"
(year digits OCR-garbled — itself an edition-trap problem); hymn I body carries pervasive
unrecoverable OCR ("MIj Admire thy matchlefs Grace", "Hofb cf Foes", "diiBpate the Night").
Verse served raw to users cannot carry this. Job Orton's editorial preface would also have
needed exclusion. A PD source may surface later (PG digitization, or a 19th-c. reprint scan);
the candidate stays blocked_on:null.

### burroughs-rare-jewel — PARKED: no clean text of the target edition
Not on Gutenberg (gutendex author search, 2026-09-07). archive.org: 17th-c. long-s originals
only (rarejewelchrist00burrgoog READ — 1651 first edition, OCR "dtChrijtteachethuwork"
class, below serving quality); 1964 reprint is in-copyright (refused); the two provenance-free
user uploads ("TheRareJewelOfChristianContentment", "JerimiahBurroughsTheRareJewel…") carry no
edition statement at all — licensing/edition ambiguity fails closed (modernized texts can be
copyrighted derivative works; the candidate's target is a 19th-c. reprint). Candidate stays.

### vincent-t-shorter-catechism — PARKED: no fail-closed segmentation
Not on Gutenberg (the only "Vincent, Thomas" hit is W. T. Vincent's Gravestones — a different
person; NOT Marvin R. Vincent either — vincent-word-studies untouched). Found a clean PD 19th-c.
reprint and READ its title page: "AN EXPLANATION OF THE ASSEMBLY'S SHORTER CATECHISM BY THE
REV. THOMAS VINCENT. PHILADELPHIA: PRESBYTERIAN BOARD OF PUBLICATION. NO. 265 CHESTNUT STREET."
(n.d.; archive.org catalogs 1854), modern type, good OCR. But the edition prints the catechism's
own questions and Vincent's sub-questions in the SAME "Q. N." line format (only Q1 spelled
"Question 1."), sub-numbering restarting per question, so a number-based split can silently
mis-segment (sub "Q. k+1." is indistinguishable from catechism "Q. k+1." without an answer-text
anchor); the 1837 printing is identical in format. Licensing was clean — the park is purely
fail-closed structure discipline within the wave budget. Candidate stays.

### broadus-preparation-sermons — PARKED: OCR structure/junk beyond the wave budget
Not on Gutenberg (only Robertson's Harmony *based on* Broadus's, a different work). Not on CCEL
(no works under /ccel/broadus/). archive.org treatiseonprepar00broarich READ: title page "ON
THE PREPARATION AND DELIVERY OF SERMONS. BY JOHN A. BROADUS … NEW YORK: A. C. ARMSTRONG & SON.
51 East 10th Street." (imprint year OCR-garbled "<B7"; verso "Entered according to Act of
Congress, in the year 1870, by JOHN A. BROADUS") — PD, licensing clean. But the OCR interleaves
running heads with page numbers every page ("THE SEVERAL PARTS OF A SERMON. 269") and garbles
several chapter headings ("CHAPTER lY.", missing "CHAPTER II." lines, mixed caps/title-case
title lines); the scoped register path has no running-head junk filter, so clean 21-chapter
boundaries could not be made fail-closed within the remaining wave budget. Candidate stays.

## Gate
docs/evidence/stage2-2026-09-07/gate-after-wave2.log: same 5 reversible gates red as the
Stage 1 baseline and the wave-1 after-gate, 0 irreversible. R1 coverage-sections 24,930 →
24,962 = +32 = 11 + 21, the two register-path works' sections (register path writes flat
embeddings, not section_embeddings — the structural red the order anticipates, not a new
failure). R1-commentary 64,344 unchanged; R3/R4 byte-identical; L4 staged-source-provenance
clean at 282 (+2).
