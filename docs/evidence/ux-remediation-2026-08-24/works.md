# WK-00 / LB-038 — published works enumeration + per-work spot-check

Run against **dev Neon branch `ep-tiny-hat`** (confirmed in host string before querying; read-only
SELECT only) and local production build at `http://localhost:3066`, signed out, gate cookie present
in `/tmp/ap-uxsweep/gc.txt`. **Note:** this is dev DB data, not production — MASTER.md cites "123
published works" for prod; this dev branch currently has 129. Do not conflate the two counts.

## WK-00 — enumerate every published work

`SELECT slug, title, author, source_type FROM sources WHERE status='published' ORDER BY
source_type, author;` → **129 rows.**

Counts by `source_type`:

| source_type | count |
|---|---|
| commentary | 26 |
| confession | 8 |
| devotional | 15 |
| father | 7 |
| historian | 1 |
| hymn | 32 |
| lexicon | 15 |
| poetry | 13 |
| sermon | 6 |
| theology | 3 |
| topical_index | 3 |
| **total** | **129** |

Full slug/title/author list captured at `/tmp/ap-uxsweep/works_full.txt` (not reproduced here —
129 rows). Notable: `historian` has exactly **one** work (`josephus-whiston`), so any "spread across
historians" instruction has a ceiling of 1.

## LB-038 — spot-check across 22 works (target ~20, spread across all 11 types except a
second historian, which does not exist)

**Method note (important):** `/work/[slug]` is a client-rendered app-shell page — raw `curl` HTML
(even with a valid gate cookie) contains **zero** work-specific text: no author name, no title, no
body. The router-state payload only encodes the slug param. This is not a content-missing bug, it's
architecture (RSC shell + client fetch); `curl` alone cannot verify LB-038 for this app. Confirmed by
diffing 22 raw HTML pulls: same size (~34.4KB), same generic nav chrome, only the embedded slug
differs.

**Verified instead against the client's own data source**, `GET /api/work/[slug]` (metadata: title,
author, era, license — the exact fields `work-header.tsx` renders, `· `-joined) and `GET
/api/work/[slug]/sections?limit=1` (first section body, to confirm non-empty content). This is what
the browser actually fetches and renders after hydration, so it's a faithful proxy for "does the
page show this" — a real-browser render was not additionally done for this slice.

| slug | source_type | HTTP (`/work/`) | author | title | era | content (first section) |
|---|---|---|---|---|---|---|
| adam-clarke | commentary | 200 | Adam Clarke | Adam Clarke's Commentary on the Bible | modern | present |
| matthew-henry | commentary | 200 | Matthew Henry | Matthew Henry's Complete Commentary | puritan | present |
| gill-song | commentary | 200 | Gill, John | Exposition of the Book of Solomon's Song | **unassigned** | present |
| calvin-calcom17 | commentary | 200 | Calvin, John | Commentary on Jeremiah and Lamentations - Vol 1 | **unassigned** | present |
| augustine-confess | confession | 200 | Augustine, Saint | Confessions of Saint Augustine | **unassigned** | present |
| schaff-creeds | confession | 200 | Philip Schaff | The Creeds of Christendom (3 vols) | modern | present |
| spurgeon-morning-evening | devotional | 200 | Charles Spurgeon | Morning and Evening: Daily Readings | modern | present |
| kempis-imitation | devotional | 200 | Thomas à Kempis | The Imitation of Christ | medieval | present |
| chrysostom-homilies | father | 200 | John Chrysostom | Homilies of John Chrysostom (...) | patristic | present |
| catena-aurea | father | 200 | Thomas Aquinas (comp.), trans. J.H. Newman | Catena Aurea | medieval | present |
| josephus-whiston | historian (only one) | 200 | Flavius Josephus | Josephus: The Complete Works (Whiston) | second-temple | present |
| watts-hymns | hymn | 200 | Isaac Watts | Hymns and Spiritual Songs | puritan | present |
| olney-hymns | hymn | 200 | John Newton & William Cowper | Olney Hymns | modern | present |
| neale-eastern-hymns | hymn | 200 | trans. John Mason Neale | Hymns of the Eastern Church | modern | present |
| bdb-lexicon | lexicon | 200 | Brown, Driver & Briggs | Brown-Driver-Briggs Hebrew and English Lexicon (1906) | modern | present |
| isbe | lexicon | 200 | James Orr (ed.) | International Standard Bible Encyclopedia (1915) | modern | present |
| dante-divine-comedy | poetry | 200 | Dante Alighieri, trans. H.W. Longfellow | The Divine Comedy (Longfellow translation) | medieval | present |
| herbert-temple | poetry | 200 | George Herbert | The Temple: Sacred Poems and Private Ejaculations | puritan | present |
| spurgeon-sermons | sermon | 200 | Charles Haddon Spurgeon | Spurgeon: New Park Street & Metropolitan Tabernacle Pulpit (63 vols) | modern | present |
| edwards-works | sermon | 200 | Jonathan Edwards | The Works of Jonathan Edwards (Hickman ed.) | modern | present |
| calvin-institutes | theology | 200 | John Calvin | Institutes of the Christian Religion | reformation | present |
| naves-topical-bible | topical_index | 200 | Orville J. Nave | Nave's Topical Bible | modern | present |

**22/22 spot-checks passed**: HTTP 200, attribution (author + title) present in the API payload the
page consumes, and body content non-empty for every work checked, across all 11 source_types
represented in the corpus (every type has at least one work checked; `historian` has only one work
total, so it's exhaustively covered here).

## LB-021 / CM-003 / B10 — attribution completeness

**No P1 finding.** All 22 sampled works carry a non-empty `author` and `title` in the data the page
renders. Zero unattributed works found in this sample. (Not exhaustive — 22 of 129; a full LB-038
sweep would need to check the remaining 107, particularly the 32 hymn works and 26 commentary works
where volume/series titles sometimes obscure per-work attribution.)

**Secondary finding, not requested but adjacent:** LB-021 expects "author, source, **year**"; the
actual `work-header.tsx` meta line renders `author · tradition · era · license` — there is no year
field at all, only a categorical `era` string. If the plan's "year" bar is taken literally, every
work fails it (no work shows a 4-digit year in the header) — filing as informational, not P1, since
`era` may be the intended substitute (design decision, not this slice's call).

## F-007 follow-up — literal "unassigned" leak

**CONFIRMED, still leaking**, not re-investigated further per instructions. `work-header.tsx:96`
renders `[author, tradition, era, license].filter(Boolean).join(' · ')` — `era` is not filtered for
the sentinel value, so when `era='unassigned'` in the DB it prints verbatim in the visible header.

Confirmed via API on 3 of the 22 sampled works:
- `gill-song` (commentary) — era: unassigned
- `calvin-calcom17` (commentary) — era: unassigned
- `augustine-confess` (confession) — era: unassigned

19/22 sampled works had a real era value (modern/puritan/medieval/patristic/second-temple/reformation).
3/22 (13.6%) leaked "unassigned" — consistent with a real, user-visible instance of the already-filed
gap, not a one-off.

## Method caveat

DB numbers (129 published, by-type breakdown) are from the **dev** branch `ep-tiny-hat`, not
production. Do not read the 129 total as a correction to MASTER.md's "123 published works" figure —
that number is prod-specific and was not re-measured here.
