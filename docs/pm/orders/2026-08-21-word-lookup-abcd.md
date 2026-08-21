# Order — single-word Greek/Hebrew lookup: A + C, then D, then B (2026-08-21)

Owner-directed in session ("do a + c now then D and b as the experiment"), recorded per
bylaw 1. Design canvas (four boards + write-up): https://claude.ai/code/artifact/aa0a4f44-78a9-4b77-bba7-64d494814956

## The finding that shaped everything

The feature already existed: the selection popover's **Define** button did the single-word
Greek/Hebrew lookup — behind the one label that didn't say what it does. And the interlinear
carries **no positional English↔original alignment** (original.ts states it), so every lookup
is a gloss/KJV-usage match that honestly returns 0, 1, or several candidates. Both facts are
load-bearing: the designs surface existing machinery, and none may claim "this exact word."

## What shipped

- **A — the popover answers** (`b9acc90`): a single-word selection resolves at selection time
  and the popover renders the word row(s) — surface, transliteration, Strong's chip, and the
  concordance count for one confident match. Several candidates ALL render (John 21:15 "love"
  → both ἀγαπᾷς and φιλῶ) with a *compare in word study* door; zero shows the quiet word-study
  line. The Define verb and DefineSheet are deleted — their duty lives here now.
- **C — Word study pins the selection** (`b9acc90`): arriving with a carried selection pins
  the candidate rows on top ("Matches your selection · …", first row expanded, same-Strong's
  repeats folded into a "twice in the Greek" caption) with the remainder under "The rest of
  the verse · N words". Matched-nothing says so plainly over the full list.
- **D — the word as a destination** (`8cf1049`): `/word/[strongs]` — deep-linkable, case-folded,
  honest invalid/missing/unavailable states; entry + full concordance (θεός: 1,148 verses,
  paged); back link to the arriving verse. Every Strong's chip in Word study and WordPanel is
  now a real link there (moved beside, never nested inside, the row's toggle). The page names
  BDB · ISBE · Smith's · Easton's · Nave's as COMING — this is the "reference-pane UX" the
  DECISIONS ruling holds those five works staged against; **serving them is now unblocked
  pending the owner's flip plus a data slice.**
- **B — the experiment** (`7b89b0e`): the gesture was already free — double-click natively
  selects a word, native selection raises the popover, the popover answers (A). Verified live
  with a real double-click. B therefore ships as teaching: the reader's first-run hint now
  carries the double-tap line. No parallel tap pipeline was built, deliberately.

Exit tests red-first throughout (15 legs across 5 files); `npm run audit` green per commit;
browser-verified signed-out at desktop + 375px (popover row + count, both-candidates compare
→ pinned Word study, /word/G2316 with paging, mobile stacked box, no overflow).

## Filed, not shipped

- The **Strong's ingest data nit**: some entries (G2316 included) carry a def/derivation field
  split and a truncated short gloss ("figuratively") — an `ingest-strongs`/`ingest-original`
  fix, visible on the new surfaces, not caused by them.
- `/library/word-study` URL sync (`?q=G2316`) — cheap, wanted eventually; `/word/{s}` covers
  the deep-link need today.
- Serving the five held reference works on `/word` — owner flip + data slice, per above.
