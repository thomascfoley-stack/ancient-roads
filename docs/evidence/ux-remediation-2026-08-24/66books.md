# RD-002 through RD-005, RD-061, CP-01/CP-06 — 66-book sweep

Environment: local production build (`next build && next start`), port 3066, signed OUT, site-gate
cookie only. All checks via `curl`.

**Method note (important):** `/read/<book>/<chapter>` is a `'use client'` page
(`web/src/app/read/[book]/[chapter]/page.tsx`) — it server-renders only the app shell + a `Loading`
placeholder; verse text is fetched client-side from a static per-book JSON file
(`/bible/{translation}/{slug}.json`, default translation `web`) via `fetchChapter()` in
`web/src/lib/bible.ts`. `curl`ing the `/read/...` route therefore can never show verse text — no
`data-verse` marker or verse string appears in that HTML in any case, working or broken. I
adapted: HTTP status on `/read/<slug>/1` proves the route resolves and doesn't 404/500; verse
content is verified against the underlying JSON data file the client actually fetches. This is the
same content path the browser uses, just observed one layer down.

A first pass with Python's `urllib` silently dropped the `#HttpOnly_` cookie line (its
`http.cookiejar.MozillaCookieJar` doesn't parse that prefix) and every request 307'd to `/gate`,
which was misread as 66 identical bad JSON responses before I caught it and switched to sending
the cookie as an explicit header. Flagging this so nobody trusts a "66/66 identical size" result at
face value again — that shape is itself a smell.

## RD-002 — 66-book sweep

Slugs and chapter counts pulled from `web/src/bible/books.ts` (BOOKS array, authoritative). For
each: `curl /read/<slug>/1` (route resolves) + `curl /bible/web/<slug>.json` (real content),
checked file has a `chapters` key for every 1..chapterCount, verse 1 of chapter 1 non-empty text.

**Result: 66/66 clean. ✅**

| # | Slug | Book | HTML | JSON | Chapters (file/expected) | Verse 1 sample |
|---|---|---|---|---|---|---|
| 1 | gen | Genesis | 200 | 200 | 50/50 | "In the beginning, God created..." |
| 2 | exo | Exodus | 200 | 200 | 40/40 | "Now these are the names of the sons..." |
| 3 | lev | Leviticus | 200 | 200 | 27/27 | "The LORD called to Moses..." |
| 4 | num | Numbers | 200 | 200 | 36/36 | "The LORD spoke to Moses in the wilderness..." |
| 5 | deu | Deuteronomy | 200 | 200 | 34/34 | "These are the words which Moses spoke..." |
| 6 | jos | Joshua | 200 | 200 | 24/24 | "Now after the death of Moses..." |
| 7 | jdg | Judges | 200 | 200 | 21/21 | "After the death of Joshua..." |
| 8 | rut | Ruth | 200 | 200 | 4/4 | "In the days when the judges judged..." |
| 9 | 1sa | 1 Samuel | 200 | 200 | 31/31 | "Now there was a certain man of Ramathaim..." |
| 10 | 2sa | 2 Samuel | 200 | 200 | 24/24 | "After the death of Saul..." |
| 11 | 1ki | 1 Kings | 200 | 200 | 22/22 | "Now King David was old..." |
| 12 | 2ki | 2 Kings | 200 | 200 | 25/25 | "Moab rebelled against Israel..." |
| 13 | 1ch | 1 Chronicles | 200 | 200 | 29/29 | "Adam, Seth, Enosh," |
| 14 | 2ch | 2 Chronicles | 200 | 200 | 36/36 | "Solomon the son of David was firmly established..." |
| 15 | ezr | Ezra | 200 | 200 | 10/10 | "Now in the first year of Cyrus..." |
| 16 | neh | Nehemiah | 200 | 200 | 13/13 | "The words of Nehemiah..." |
| 17 | est | Esther | 200 | 200 | 10/10 | "Now in the days of Ahasuerus..." |
| 18 | job | Job | 200 | 200 | 42/42 | "There was a man in the land of Uz..." |
| 19 | psa | Psalms | 200 | 200 | 150/150 | "Blessed is the man who doesn't walk..." |
| 20 | pro | Proverbs | 200 | 200 | 31/31 | "The proverbs of Solomon..." |
| 21 | ecc | Ecclesiastes | 200 | 200 | 12/12 | "The words of the Preacher..." |
| 22 | sng | Song of Songs | 200 | 200 | 8/8 | "The Song of songs, which is Solomon's." |
| 23 | isa | Isaiah | 200 | 200 | 66/66 | "The vision of Isaiah..." |
| 24 | jer | Jeremiah | 200 | 200 | 52/52 | "The words of Jeremiah..." |
| 25 | lam | Lamentations | 200 | 200 | 5/5 | "How the city sits solitary..." |
| 26 | ezk | Ezekiel | 200 | 200 | 48/48 | "Now in the thirtieth year..." |
| 27 | dan | Daniel | 200 | 200 | 12/12 | "In the third year of the reign of Jehoiakim..." |
| 28 | hos | Hosea | 200 | 200 | 14/14 | "The LORD's word that came to Hosea..." |
| 29 | jol | Joel | 200 | 200 | 3/3 | "The LORD's word that came to Joel..." |
| 30 | amo | Amos | 200 | 200 | 9/9 | "The words of Amos..." |
| 31 | oba | Obadiah | 200 | 200 | 1/1 | "The vision of Obadiah..." |
| 32 | jon | Jonah | 200 | 200 | 4/4 | "Now the LORD's word came to Jonah..." |
| 33 | mic | Micah | 200 | 200 | 7/7 | "The LORD's word that came to Micah..." |
| 34 | nam | Nahum | 200 | 200 | 3/3 | "A revelation about Nineveh..." |
| 35 | hab | Habakkuk | 200 | 200 | 3/3 | "The revelation which Habakkuk..." |
| 36 | zep | Zephaniah | 200 | 200 | 3/3 | "The LORD's word which came to Zephaniah..." |
| 37 | hag | Haggai | 200 | 200 | 2/2 | "In the second year of Darius..." |
| 38 | zec | Zechariah | 200 | 200 | 14/14 | "In the eighth month..." |
| 39 | mal | Malachi | 200 | 200 | 4/4 | "A revelation, the LORD's word to Israel..." |
| 40 | mat | Matthew | 200 | 200 | 28/28 | "The book of the genealogy of Jesus Christ..." |
| 41 | mrk | Mark | 200 | 200 | 16/16 | "The beginning of the Good News..." |
| 42 | luk | Luke | 200 | 200 | 24/24 | "Since many have undertaken..." |
| 43 | jhn | John | 200 | 200 | 21/21 | "In the beginning was the Word..." |
| 44 | act | Acts | 200 | 200 | 28/28 | "The first book I wrote, Theophilus..." |
| 45 | rom | Romans | 200 | 200 | 16/16 | "Paul, a servant of Jesus Christ..." |
| 46 | 1co | 1 Corinthians | 200 | 200 | 16/16 | "Paul, called to be an apostle..." |
| 47 | 2co | 2 Corinthians | 200 | 200 | 13/13 | "Paul, an apostle of Christ Jesus..." |
| 48 | gal | Galatians | 200 | 200 | 6/6 | "Paul, an apostle—not from men..." |
| 49 | eph | Ephesians | 200 | 200 | 6/6 | "Paul, an apostle of Christ Jesus..." |
| 50 | php | Philippians | 200 | 200 | 4/4 | "Paul and Timothy, servants of Jesus Christ..." |
| 51 | col | Colossians | 200 | 200 | 4/4 | "Paul, an apostle of Christ Jesus..." |
| 52 | 1th | 1 Thessalonians | 200 | 200 | 5/5 | "Paul, Silvanus, and Timothy..." |
| 53 | 2th | 2 Thessalonians | 200 | 200 | 3/3 | "Paul, Silvanus, and Timothy..." |
| 54 | 1ti | 1 Timothy | 200 | 200 | 6/6 | "Paul, an apostle of Jesus Christ..." |
| 55 | 2ti | 2 Timothy | 200 | 200 | 4/4 | "Paul, an apostle of Jesus Christ..." |
| 56 | tit | Titus | 200 | 200 | 3/3 | "Paul, a servant of God..." |
| 57 | phm | Philemon | 200 | 200 | 1/1 | "Paul, a prisoner of Christ Jesus..." |
| 58 | heb | Hebrews | 200 | 200 | 13/13 | "God, having in the past spoken..." |
| 59 | jas | James | 200 | 200 | 5/5 | "James, a servant of God..." |
| 60 | 1pe | 1 Peter | 200 | 200 | 5/5 | "Peter, an apostle of Jesus Christ..." |
| 61 | 2pe | 2 Peter | 200 | 200 | 3/3 | "Simon Peter, a servant and apostle..." |
| 62 | 1jn | 1 John | 200 | 200 | 5/5 | "That which was from the beginning..." |
| 63 | 2jn | 2 John | 200 | 200 | 1/1 | "The elder, to the chosen lady..." |
| 64 | 3jn | 3 John | 200 | 200 | 1/1 | "The elder to Gaius the beloved..." |
| 65 | jud | Jude | 200 | 200 | 1/1 | "Jude, a servant of Jesus Christ..." |
| 66 | rev | Revelation | 200 | 200 | 22/22 | "This is the Revelation of Jesus Christ..." |

No 404s, 500s, empty bodies, or chapter-count mismatches anywhere in the canon.

## RD-003/RD-004 — book-boundary chapter nav

Since verse content and nav links only exist in client JS, I read the nav logic instead of trying
to grep it out of curl'd HTML: `web/src/components/chapter-nav.tsx` calls `prevChapter`/`nextChapter`
from `web/src/lib/bible.ts`. Both walk `BOOKS` (canonical order, `bookNum` 1..66) by **slug**
(`canonIndex`, matches `b.slug === book.slug`) — the code comments document a prior bug where this
compared by object *reference* and silently wrapped/dead-ended at canon boundaries; that bug is
fixed (`canonIndex` is slug-based) as of this build.

Traced by hand:
- `nextChapter(mal, 4)`: `4 === chapterCount(4)` → not `<` → falls to cross-book branch → `idx=38`
  (Malachi) → `BOOKS[39]` = Matthew, chapter 1. **Malachi 4 → Matthew 1. ✅**
- `nextChapter(gen, 50)`: same pattern → `idx=0` → `BOOKS[1]` = Exodus, chapter 1.
  **Genesis 50 → Exodus 1. ✅**

Confirmed both routes resolve (`curl` 200): `/read/mal/4`, `/read/mat/1`, `/read/gen/50`,
`/read/exo/1` all HTTP 200.

## RD-005 — chapter-boundary edges

Same source, `prevChapter`/`nextChapter`:
- `prevChapter(gen, 1)`: `chapter > 1` is false → `canonIndex(gen) = 0` → `idx <= 0` → returns
  `null`. `ChapterNav` renders `<span />` (no link) when `prev` is null. **Genesis 1 has no
  "previous chapter" link. ✅**
- `nextChapter(rev, 22)`: `22 === chapterCount(22)` → cross-book branch → `idx=65` (last index) →
  `idx >= BOOKS.length - 1` (65 >= 65) → returns `null`. **Revelation 22 has no "next chapter"
  link. ✅**

Both routes 200 (`/read/gen/1`, `/read/rev/22`). Nothing odd observed in the underlying JSON for
either (Genesis 1 opens at verse 1 as expected; Revelation 22 is 21 verses, normal).

## RD-061 — the three "missing verses" (Matt 17:21, Matt 18:11, Acts 8:37)

Checked verse numbering and text directly in `/bible/web/mat.json` and `/bible/web/act.json`
(default translation is WEB — World English Bible).

- **Matt 17**: verses 1–27, continuous, no gap. Verse 21 **has real text**: "But this kind doesn't
  go out except by prayer and fasting." — WEB includes this verse (it's a majority/Byzantine-text
  edition, not a critical-text one that brackets it). Verse 20→21→22 numbering is unbroken.
- **Matt 18**: verses 1–35, continuous. Verse 11 **has real text**: "For the Son of Man came to
  save that which was lost." Same pattern.
- **Acts 8**: verses 1–40, continuous. Verse 37 exists in the numbering but **`text: ""`** — empty
  string, not omitted, not renumbered around. This is the one genuinely "missing" verse of the
  three in this translation.

This isn't a bug: `web/src/components/verse-display.tsx` explicitly handles an empty-text verse —
`data.verses.find((v) => v.text)?.verse` picks the chapter's opening verse for the drop-cap,
with a comment noting a verse with no text "renders nothing, and a cap on an empty verse would
float over the next one." So Acts 8:37 rendering blank inline is a known, deliberately-handled
case, not a numbering bug.

**Observation, not a defect:** the task brief assumed all three verses were "missing" the way
Acts 8:37 is. In this translation (WEB) only Acts 8:37 actually is; Matt 17:21 and 18:11 are fully
present with real text. Worth knowing if anyone builds a "missing verse" UI treatment expecting all
three to behave the same — they don't, and it's translation-dependent (a critical-text translation
like NA28-based ones would bracket/omit differently).

## CP-01 — pericope adulterae (John 7:53–8:11)

`/bible/web/jhn.json`, chapter 8: 59 verses, 1–59 continuous, no gap. Verses 1–11 all present with
real text (not the disputed-passage bracket treatment):
- v1: "but Jesus went to the Mount of Olives." (lowercase "but" — this is WEB's normal
  versification, where 7:53's sentence continues into 8:1; not a truncation bug)
- v3–v11: the woman-caught-in-adultery narrative, full text, ending "Neither do I condemn you..."

**Present, not silently missing. ✅**

## CP-06 — canon-boundary sanity (Gen 1 / Rev 22)

Already covered under RD-005 above — nothing additional observed. Both chapters load cleanly with
plausible verse counts and no boundary-nav leakage into a wrong book.

## Summary

66/66 books clean (200/200 HTTP, correct chapter counts, non-empty opening verse). Chapter-nav
boundary logic (book-to-book and canon edges) verified correct by source trace — the specific bug
class the code comments describe (reference-equality lookup causing prev/next to wrap or dead-end)
is already fixed in this build. One real, non-blocking finding: only Acts 8:37 is a genuinely empty
verse in the WEB translation; Matt 17:21 and 18:11 are not, contrary to the common assumption that
all three "long-ending" verses behave the same way. No P0/P1/P2 defects found in this slice.
