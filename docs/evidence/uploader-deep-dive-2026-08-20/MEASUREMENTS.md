# Uploader deep dive — measurement log (2026-08-20)

Four runs against the **shipped** Lane B pipeline. Only the blob hop was substituted (bytes read
from disk); sniff, parse, chunk, anchor, embed, store, RLS and all three searches were the real
functions in `web/src/lib/user-corpus/`, against the real dev database (`ep-tiny-hat`).

**This is the run `docs/UPLOADER_DESIGN.md` §Q6/A9 required before multi-user ship and which never
happened** — "one more frozen held-out run … through the SHIPPED ingest path". Multi-user shipped
on 2026-08-05 without it.

## Corpus

C. H. Spurgeon, *Spurgeon's Sermons Volume 62: 1916*, from `data/raw/ccel/spurgeon_sermons62.xml`.
A set no prior harness has touched — Slice 0 used *Talks to Farmers*, the confirmation run used
CCEL volumes 10 + 13, the K-rederivation used 180 documents across 34 authors.

52 sermons extracted, each **de-headered** (the header paragraph carrying the stated text is
removed, so the channel must recover the passage from prose alone), 4.4k–6.8k words each.

**Labels were validated, not trusted.** The stated text comes from the header's `<scripRef>`. Two of
52 are CCEL transcription errors naming verses that do not exist (`Ezekiel 17:29` — that chapter has
24 verses; `Luke 10:44` — that chapter has 42). Both were rejected by checking the reference against
the KJV text itself before it entered any denominator. **50 valid labels.**

## Run 1 — end to end, n=30, through the real queue

```
=== PER DOCUMENT (K=3, KJV index) ===  [30 documents, all reached `ready`]
  STATED-TEXT RECALL through the SHIPPED path, K=3: 16/30 = 53%
  Wilson 95% CI [36, 70]   design bar: recall >= 70%
  precision proxy: 12.4 distinct verses returned per sermon
  EXPLICIT-channel anchors across all 30 documents: 4
  sections 945; drain 56.0s, median 1708ms/doc
```

Search latency, warm: semantic 102–113 ms, keyword 86–93 ms, verse-anchor scan 89–107 ms.
Tradition gap: 16–23 distinct authors per document in 1.6–2.1 s.
Cleanup: 30/30 deleted, residue `{"d":0,"s":0,"e":0,"a":0}` — the cascade is complete.

`53%` here is **exact-range** recall (an anchor overlapping the stated verses) at n=30. The
published numbers are **chapter-level**. Run 2 measures both so the comparison is honest.

## Run 2 — the grain question, n=50, no DB

Does anchoring per ~1200-char chunk (what ships) lose anchors against anchoring the whole document
(what every published number measured)?

```
  K=1  WHOLE-DOC chapter  92% exact  74% (56.9 v/doc) | PER-CHUNK chapter  92% exact  74% (56.8 v/doc)
  K=2  WHOLE-DOC chapter  82% exact  64% (25.2 v/doc) | PER-CHUNK chapter  80% exact  62% (25.0 v/doc)
  K=3  WHOLE-DOC chapter  70% exact  60% (16.7 v/doc) | PER-CHUNK chapter  70% exact  60% (16.6 v/doc)
  K=4  WHOLE-DOC chapter  66% exact  54% (13.0 v/doc) | PER-CHUNK chapter  64% exact  52% (13.0 v/doc)
                                                       [avg 34 chunks/doc]
```

**The grain hypothesis is REFUTED.** Per-chunk costs 0–2 points, not the material loss the theory
predicted. Do not spend a fix here.

**The harness replicates.** K=1 chapter-level 92% against the published 90% (n=30). The frozen
Slice 0 measurement is sound.

**The shipped configuration sits AT the bar, not above it.** K=3 chapter-level **70%** against a
pre-registered bar of ≥70%, and exact-range 60%. The design's headline "90%" belongs to K=1, which
is not what ships; K=3 was chosen deliberately in the precision run (96% precision) and the trade
is documented. Nothing here is a regression — but no document states the shipped operating point.

## Run 3 — translation sensitivity, n=50, no DB

ADR-100 ruled per-document translation detection. It was never built: `bible-index.ts:37` pins
`ANCHOR_TRANSLATION = 'kjv'` and `queue.ts:142` records `translationConfidence: 1.0`
unconditionally. Spurgeon quotes the KJV, so every published number is the **best** case.

Same 50 sermons, shingled against each of the 18 shipped translation indexes, K=3:

```
  translation   chapter-recall   exact-recall   verses/doc
  ukjv               76%           64%        17.4
  akjv               74%           62%        17.5
  webster            74%           64%        16.0
  rwebster           72%           62%        15.8
  kjv                70%           60%        16.7   <- what ships
  asv                64%           50%        11.9
  nheb               56%           38%        10.1
  web                54%           38%         9.7
  darby              52%           40%         8.4
  noyes              48%           40%         8.1
  anderson           38%           28%         7.5
  bsb                36%           30%         4.6
  geneva             34%           26%         4.1
  lsv                30%           22%         4.5
  rotherham          30%           28%         4.6
  bbe                26%           18%         4.0
  ylt                24%           20%         4.0
  tyndale            16%           10%         0.7
```

The five KJV-family members (ukjv, akjv, webster, rwebster, kjv) cluster at 70–76% — **ADR-100's
measured family finding, independently reproduced.** Everything outside the family collapses.
Median non-KJV translation: **48%**. BSB, the nearest modern English text the corpus can legally
hold: **36%**.

Read as a product statement: **a preacher who quotes anything but the KJV family gets roughly half
the recall, and the system records confidence 1.0 for every one of those anchors.**

Caveat, stated rather than rounded away: this is a simulation of index mismatch, not of a real
BSB-quoting preacher. It measures the cost of shingling against the wrong index — which is exactly
what a non-KJV user hits today, because there is only one index.

## Run 4 — the explicit-citation channel

The synthetic control recovered 2 of 3 citations. Isolating the stage:

```
  "As Paul writes in Romans 8:28, all things work…"  scan=[Romans 8:28]           kept=[Romans 8:28]
  "Compare John 3:16, and see also 1 Corinthians 13:4-7 on love."
                                                     scan=[John 3:16]             kept=[John 3:16]
  "see also 1 Corinthians 13:4-7 on love"            scan=[]                      kept=[]
  "1 Corinthians 13:4-7"                             scan=[1 Corinthians 13:4–7]  kept=[…]
  "1 Cor. 13:4-7"                                    scan=[]                      kept=[]
  "First Corinthians 13:4-7"                         scan=[1 Corinthians 13:4–7]  kept=[…]
  "2 Timothy 1:18 is the text."                      scan=[2 Timothy 1:18]        kept=[…]
  "Turn with me to Ephesians 2:8-9."                 scan=[Ephesians 2:8–9]       kept=[…]
  "Genesis 1:1-3 and Revelation 22:20"               scan=[Genesis 1:1–3, Rev 22:20] kept=[…]
```

Two reproducible drops, both in `scanReferences` rather than `isExplicitCitation`:

1. **A numbered book embedded in prose is dropped** — `1 Corinthians 13:4-7` resolves standalone
   and disappears inside `see also 1 Corinthians 13:4-7 on love`. Unnumbered books
   (`Ephesians 2:8-9`) survive the same framing, and a numbered book at the start of a string
   (`2 Timothy 1:18 is the text`) survives.
2. **The abbreviated form with a period is dropped entirely** — `1 Cor. 13:4-7` yields nothing even
   standalone. This form appears in the CCEL headers themselves (`1 Cor. 11:26`, `1 Cor. 9:7`,
   `2 Chron. 33:9-13`) and is ubiquitous in real sermon manuscripts. Note `parseRef` handles it
   correctly — the two functions disagree.

This is why the explicit channel produced **4 anchors across 30 sermons / 945 chunks**. Slice 0
attributed the 0% explicit rate to a structural property of the corpus (Spurgeon cites only in
headers). That explanation is correct for Spurgeon and has been masking a matcher gap that will
bite every user who cites normally.

## Live-data observation

A document has been sitting in status `embedding` on the dev database for **3.66 days**, `attempts:
1`. `claimNext` and `reapExhausted` both filter on `status = 'parsing'`, so nothing will ever
reclaim it, and the UI renders a retry control only for `failed`. Not a hypothetical.

## Reproduction

Extraction and probes ran from the session scratchpad and were removed afterwards; the tree is
unchanged. To rebuild: extract `<div1>` blocks from `data/raw/ccel/spurgeon_sermons62.xml`, take the
first `<scripRef passage="…">` as the label, drop every paragraph up to and including the one
containing it, validate each label against `web/public/bible/kjv/*.json`, then drive
`createDocument` → `drain` → `verseAnchorScan` for run 1 and `anchorChunk` / `chunkProse` /
`buildVerseShingleIndex` directly for runs 2–4.
