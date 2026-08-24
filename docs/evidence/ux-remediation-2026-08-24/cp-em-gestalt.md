# CP-08/09/10/12, EM, CO-020 — signed-out prod, localhost:3066

Test plan has no literal "CP" section; mapped to nearest RD rows (RD-006 citation deep links,
RD-058 Psalm superscriptions, RD-027/062 single-chapter+verse-0 convention, RD-049 red-letter).

Note: browser tab pool is shared across concurrently-running agents in this batch; tab-8 showed
contamination (unrelated search state) mid-run. Switched to tab-1 and re-verified every claim below
via DOM inspection (not just screenshot) to avoid false positives from cross-session bleed.

## CP-08 — citation-link chapter span proxy

- `/read/luk/9#v57` → resolves, scrolls to and underlines v57 ("And it came to pass, that, as they
  went in the way..."). PASS.
- `/read/luk/10#v2` → resolves; DOM check confirms `#v2` span exists with class
  `verse inline scroll-mt-20 rounded` and correct text ("Therefore said he unto them, The harvest
  truly is great..."), visible in viewport after load. PASS.
- Both individually resolve correctly; a genuine multi-chapter range (9:57–10:2) would need the
  citation renderer to stitch two `/read/.../#v` targets — not tested here (out of scope per task).

## CP-09 — Psalm 3 superscription

`/read/psa/3`: verse 1 begins directly with "LORD, how are they increased that trouble me!..." —
**no superscription text rendered** ("A Psalm of David, when he fled from Absalom his son" is
absent). No verse 0. Verse 1 = the KJV's first numbered verse, not the title.

## CP-10 — Jude (single-chapter, bare verse ref) + omnibox

- `/read/jud/1#v5` resolves; header shows "Jude" (no chapter number in the chapter-picker button);
  heading reads "Jude 1". Verse 5 is scrolled into view and underlined/highlighted. PASS.
- Omnibox: "Search passages" button in reader header opens a text input
  (`aria-label="Go to a passage"`, placeholder "Go to passage, e.g. John 3:16"). Typed "Jude 5",
  pressed Enter → navigated to `/read/jud/1#v5` correctly. PASS. No visible autocomplete/suggestion
  dropdown appeared while typing (checked DOM for `[role="option"]` etc. — none found); it's a
  plain type-and-submit form, not a typeahead. Minor: if the spec expects a jump-as-you-type
  suggestion list, that's not implemented — it's submit-only.

## CP-12 — red-letter check, John 3

`getComputedStyle` on v1 (narration, "There was a man of the Pharisees...") and v3 (Jesus speaking,
"Jesus answered and said unto him, Verily, verily...") both return **identical color:
rgb(43, 33, 25)**. DOM grep for `[class*="red"], [class*="jesus"], [class*="wordsof"]` → zero
matches. **No red-letter feature exists.** Not toggleable, not present.

## EM — empty states, signed out

- `/search?q=zzyzxqqq123nomatch`: per-register accordion (Commentaries/Sermons/Hymns & Poetry/
  Historians/Theology & Creeds/Lexicons), each "0 matches — No matches in commentaries." etc.
  Does NOT teach a next action (no "try different terms", no link out). Just states absence, six
  times over. Mildly repetitive but not broken.
- `/desk`: "Your desk is empty" + explains the grid (up to 16 panes) + two CTAs ("Open the Bible",
  "Browse the library") + explicit note that the desk isn't account-saved, lives in the URL. Best
  of the four — teaches the model and the next action. Confirmed still correct.
- `/work/does-not-exist-xyz`: "This work isn't available. It may still be staged for review, or
  the link is mistaken." + "Browse the library" CTA. Human, branded, teaches next action.
- `/word/G999999`: "That isn't a Strong's number. A word page looks like /word/G2316 (Greek) or
  /word/H430 (Hebrew)." + "Search the dictionary" CTA. Teaches next action — but the copy is
  slightly wrong: G999999 IS a validly-formatted Strong's number (G + digits), it's just out of
  range/nonexistent. The message describes a format problem when the actual problem is "no such
  entry." Minor mislabel, P3.

Ranking: desk > work/word (both teach + CTA) > search zero-results (states absence only, no CTA,
repeated 6x per register).

## CO-020 — one-hand-test gestalt (desktop screenshots: `/`, `/read/jhn/3`, `/search?q=shepherd`, `/library/notes`)

Reads as one product. All four surfaces share the same warm stone/parchment background (`#f5f1e8`-
ish), the same serif display headings (Psalms/John/Search/Saved all set in the same serif at
similar weight), the same left sidebar nav pattern (present on reader/search/notes, absent only on
the marketing home which is a deliberately different, photo-hero landing page — a normal split, not
a seam). Chips/pills (Aa, HL, אα, KJV) in the reader and the search-result highlight color
(mustard/tan `#e8d5a3`-ish background on matched terms) both draw from the same warm-brown/tan
accent family as the homepage's dark rounded CTA button and the "Proverbs 11:14" caption styling.
Nothing looks bolted-on: no stray sans-serif system font, no mismatched button radius, no
off-palette blue/green interactive color anywhere in the four shots. The one soft seam: the
marketing homepage's hero typography is noticeably larger/more editorial (serif italic mixed with
roman in one heading) than the utilitarian, smaller serif used for in-app page titles ("Search",
"Saved", "John 3") — a marketing-vs-product register shift, common and not jarring, but it is the
one place you can feel the seam between "landing page" and "the app."
