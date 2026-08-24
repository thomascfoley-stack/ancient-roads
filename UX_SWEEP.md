# UX_SWEEP.md — findings, overnight run on fix/ux-overnight-sweep

Format: ID · lane · severity (P0 broken / P1 user-angry / P2 friction / P3 cosmetic) · narrative · repro · expected vs actual.

## MK-13 — 🔴 P1 — no privacy policy or terms linked on the landing page

**Narrative:** A first-time visitor scrolls the whole landing page looking for what happens to the
email they're about to hand over. There is no privacy policy, no terms link, anywhere — not in the
footer, not near the waitlist form.
**Repro:** Load http://localhost:3055/ (or prod), read the full page text / footer.
**Expected:** A linked privacy policy near the waitlist form or in the footer, per standard practice
for any product collecting emails + running analytics (PostHog is wired in per docs/ENVIRONMENT.md).
**Actual:** Footer text confirmed (get_page_text dump, 2026-08-23 tonight): "PRODUCT / HOME / FEATURES
/ WHY / MORE / ABOUT / LOG IN / © 2026 ANCIENT PATHS / CRAFTED WITH REVERENCE" — no privacy/terms link
anywhere in the rendered text. This matches the ledger's own pre-registered MK-13 prediction exactly.
**Confidence:** single-agent observation, not yet independently reproduced (P1 requires 2nd-agent
confirmation before it counts per the ledger's own rule — flagging for morning re-check, this is
real enough content-wise that I'm logging it now rather than losing it).

## LB-title-encoding — 🔴 P3 — double-encoded HTML entity in a work title

**Narrative:** A user browsing Historians sees a book title rendered with a literal `&amp;` instead of
an ampersand — reads as visibly broken, on every screen that shows this work's title (library list,
title tooltip).
**Repro:** Load `/library/historians` (signed-in, prod), find "Rutherford, Samuel" in the list; or
inspect the DOM directly: `[...document.querySelectorAll('main *')].filter(e => e.children.length===0
&& e.textContent.includes('Tryal'))`.
**Expected:** Title renders as `Tryal & Triumph of Faith: or An Exposition of the History of Christ's
dispossessing of the daughter of the woman of Canaan.`
**Actual:** Confirmed via `outerHTML`/`textContent` on the live DOM (2026-08-24 tonight, prod,
signed-in): the node's actual text content is the literal string `Tryal &amp; Triumph of Faith`, not a
decoded ampersand — both in the visible link text and in its `title=` attribute. The stored title
itself contains an HTML-escaped `&amp;` that the UI renders as plain text without decoding. Likely an
ingestion-time double-escape on this one work's (`rutherford-tryal` or similar slug, Samuel Rutherford)
metadata — worth a grep of `sources.title` for other `&amp;`/`&lt;`/`&gt;` occurrences since this may
not be isolated to one row.
**Confidence:** single-agent, DOM-verified (not a copy/paste artifact — confirmed via `outerHTML`).

## SM-scripture-refs — 🔴 P2 — no scripture references are clickable inside sermon body text

**Narrative:** A user reading a Spurgeon sermon that quotes or alludes to a Bible verse expects to be
able to tap the reference and land on that verse in the reader (this is the natural expectation set by
the rest of the app's verse-first design). There is nothing to tap — sermon prose renders as plain
text with zero interactive elements.
**Repro:** Load `/work/spurgeon-sermons01` (Volume 01: 1855, "Sermon 1: The Immutability of God"),
signed-in, prod. Inspect the DOM: `document.querySelector('main').querySelectorAll('a').length`.
**Expected:** Scripture references inside the sermon text (e.g. the sermon's own theme verse, Malachi
3:6, quoted in the opening lines) are clickable and route to `/read/[book]/[chapter]#[verse]`.
**Actual:** Confirmed via JS after the *entire* 1855 volume (50 full sermons, 1,396,180 characters,
2,041,057px of scroll height) was mounted in the DOM: `main.querySelectorAll('a').length === 0`.
Zero anchor tags anywhere in the reading surface. This is despite the underlying data model already
carrying structured verse metadata per sermon — `GET /api/work/spurgeon-sermons01/sections` returns
`"verseStart":39003006,"verseEnd":39003006` (Malachi 3:6) on the very sermon whose text quotes that
verse — so the reference-to-verse mapping exists server-side but is not surfaced as a link in the
reader UI at all.
**Confidence:** single-agent, DOM- and API-verified (not a sampling gap — checked the fully-mounted,
un-virtualized volume, and cross-checked the API payload for the metadata that would back a link).

## WK-content-empty-citations — 🔴 P2 — empty parenthetical scripture citations in stored source text

**Narrative:** A reader hits a scripture quotation mid-sentence with a citation that trails off into
nothing — `says the Lord ( ).` — which reads as visibly broken and undermines the concordance's core
promise of precise attribution.
**Repro:** Load `/work/kempis-imitation` (The Imitation of Christ), Chapter 1, signed-in, prod. Inspect
the paragraph containing "walks not in darkness": `[...document.querySelectorAll('main
p')].find(p=>p.textContent.includes('walks not in darkness')).innerHTML`.
**Expected:** `says the Lord (John 8:12).` — or whatever the correct reference is — filled in.
**Actual:** Confirmed via `innerHTML` (2026-08-24 tonight, prod, signed-in) — the literal stored text
reads `“HE WHO follows Me, walks not in darkness,” says the Lord ( ). By these words of Christ...` The
quote is John 8:12; the reference is simply missing from the ingested `body` text, not a rendering bug.
This generalizes an earlier finding from tonight's AS-01/AS-04 checks, which found the same empty-paren
pattern (`"compare with )"`, `"( e.g. , )"`) inside AI-answer-quoted excerpts — this confirms the defect
lives in at least one work's stored source text directly, independent of the Ask pipeline, meaning it's
an ingestion/source-formatting issue (original texts likely used footnote/superscript verse markers
that were stripped without capturing the reference target) rather than something introduced downstream.
Found on the very first devotional work sampled tonight, not after searching for it — worth a
corpus-wide grep for empty-parens patterns (`\(\s*\)`) across `sections.body`.
**Confidence:** single-agent, DOM-verified (`innerHTML`, not a text-extraction artifact).

## WK-progress-fake-100 — 🔴 P2 — reading progress reports 100% on first page load for unpaginated works

**Narrative:** A user opens a 63-sermon-volume book, glances at the first paragraph, and the library's
"Continue Reading" rail already claims they finished the whole thing — a progress indicator that lies
the moment it's used on this class of work.
**Repro:** Load `/work/spurgeon-sermons01` (Volume 01: 1855) signed-in on prod, read only the first few
lines, then check `/library`'s "Continue Reading" rail.
**Expected:** Progress reflects roughly how far the user actually scrolled/read (comparable to every
other work opened in the same session, which correctly showed 0%).
**Actual:** Confirmed 2026-08-24 tonight: after loading `/work/spurgeon-sermons01` and reading only the
opening of Sermon 1, `/library`'s Continue Reading rail shows **"Spurgeon's Sermons Volume 01: 1855 ·
100%."** Five other works opened in the same session (Schaff's Creeds, Calvin's Institutes, Kempis,
Watts, Adam Clarke) all correctly show 0%. Root cause is almost certainly the same one behind the
SM-scripture-refs finding above: this volume's 50 sermons (1,396,180 characters) all mount in the DOM
in a single unpaginated fetch, so if progress is computed from "sections fetched" rather than "sections
actually scrolled past," any work ingested this way will read 100% instantly regardless of what the
user actually read. Worth checking whether the same computation backs reading-PLAN completion tracking.
**Confidence:** single-agent, directly observed on the rendered library page (not inferred from code).

## NV-back-exits-reader — 🔴 P1 — Back from an open verse panel exits the reader entirely

**Narrative:** A reader taps a verse to see commentary, decides they're done, and reflexively hits
Back — a completely ordinary "dismiss this overlay" gesture, doubly so on mobile where Back is often a
physical button or edge-swipe. Instead of closing the panel, it throws them off the page they were
reading and back to wherever they came from.
**Repro:** Signed-in, prod: navigate to `/read/john/3`, click verse 3's superscript to open the verse
panel (confirm open via DOM: `document.body.textContent.includes('Commentaries')`), then trigger
browser Back.
**Expected:** The panel closes; the user stays on John 3.
**Actual:** Confirmed 2026-08-24 tonight via `window.location`/document title before and after: Back
navigated all the way to the previous page in history (in this test, "My Studies"), skipping the reader
entirely. Root cause (read from source, `web/src/app/read/[book]/[chapter]/page.tsx:277-281`): the
panel's open/closed state is a plain client `useState`, with no `history.pushState`/route change when
it opens — so there is no history entry for Back to consume, and it falls through to whatever preceded
the reader visit. This was a pre-registered "likely gap" from tonight's NV-00 back-map draft, confirmed
live rather than left as a guess.
**Confidence:** single-agent, confirmed live (not inferred from code alone) via URL/title observation
across the Back action; root-cause line citation is from source reading, not executed/stepped-through.

## WS-panel-dead-click — 🔴 P2 — the verse panel's own "Word study" tab looks clickable but isn't

**Narrative:** A user taps a verse number (the documented, banner-advertised way into word study),
switches to the panel's "Word study" tab, sees a list of Greek words each styled like a row with a
Strong's-number badge — and taps one expecting to open that word's full entry. Nothing happens except
the panel closing. The only way to actually reach a word's entry is to close the panel and instead
double-tap the word directly in the passage text — a completely different, undocumented gesture.
**Repro:** Signed-in or signed-out, prod: `/read/john/3`, tap verse 3, switch to "Word study" tab, tap
any word row (e.g. Ἰησοῦς/G2424). Compare with: close the panel, double-tap "Jesus" in the verse text.
**Expected:** Either the panel row navigates to `/word/[strongs]`, or the panel doesn't present the rows
as tappable in the first place.
**Actual:** Confirmed 2026-08-24 tonight: tapping a Word-study-tab row closes the panel (click falls
through to the panel's own backdrop-dismiss handler) with no navigation. Double-tapping the same word
directly in the passage text correctly opens `/word/2424` (Ἰησοῦς, full definition/concordance/lexicon).
Two entry points to the same feature, one dead, one live, with no hint in the dead one pointing at the
live one.
**Confidence:** single-agent, directly observed (both the dead click and the working double-tap path).

## ST-dead-controls — 🔴 P2 — Text Size and Column Width settings do nothing

**Narrative:** A user who wants larger text for comfortable reading finds the control right there on
Settings, labeled and interactive-looking — and nothing happens, with no error, no feedback, and (per
the page's own copy) no explanation of why. Column Width has the identical problem.
**Repro:** Signed-in, prod: `/settings`, click "Larger text" (or "Smaller text") 3×, observe the
"Medium" label; click "Narrower column", observe the "Widest" label; then check
`Object.keys(localStorage)` and the computed `font-size` on `/read/john/3`'s `<main>`.
**Expected:** The label advances (e.g. Medium → Large), the setting persists (matching Theme and
Default Translation, which both work correctly on the same page), and the reader's actual text size or
column width changes.
**Actual:** Confirmed 2026-08-24 tonight: label never changes after repeated clicks on either control;
`localStorage` after the clicks contains only `translation`, `reader-theme`, `bible-position:v1`, and
the PostHog id — no text-size or column-width key exists at all; computed `font-size` on the reader's
`<main>` stayed `16px` before and after. Theme and Default Translation, immediately adjacent on the
same settings page, both work and persist correctly — making the two dead controls easy to miss as
broken (nothing LOOKS different about them).
**Confidence:** single-agent, verified three independent ways (label, storage, computed style) to rule
out a display-only sync issue.

## PL-title-duplication — 🔴 P3 — reading-plan tab title says the site name twice

**Narrative:** Cosmetic, but visible in every browser tab and history entry for the page.
**Repro:** Signed-in, prod: open any reading plan detail, e.g. `/plans/[id]`, check the document title.
**Expected:** "The Gospels in 8 weeks · Ancient Paths" or similar, one site-name suffix.
**Actual:** Confirmed 2026-08-24 tonight: title reads **"Reading plan · Ancient Paths · Ancient
Paths"** — the site suffix is duplicated.
**Confidence:** single-agent, directly observed.

