# Reader deep-dive — RD/TR/IN/VS/CP

Run against local prod build, localhost:3066, signed out. Browser-driven (DOM + screenshots), not
source-read. Route/what-I-did/what-happened format per UX_TEST_PLAN.md §0.

---

## RD — state matrix (RD-018–025)

RD-018/RD-topic: translation persistence.
- Set translation to KJV on `/read/jhn/3`. ✅ Switched cleanly, text changed, dropdown closed.
- Navigate `/read/jhn/3` → `/read/jhn/4` (in-app link nav). ✅ KJV persisted — same translation banner ("KJV") on the new chapter.
- Full page refresh (`location.reload()`) on `/read/jhn/4` while KJV active. ✅ KJV persisted (stored client-side, not just React state — survives reload).
- `history.back()` from jhn/4 → jhn/3. ✅ Returns to John 3, KJV still active (translation is global/persistent state, not per-URL — consistent, no per-chapter reset).
- **Verdict: ✅ Translation choice survives chapter nav, refresh, and Back — one persistent global setting, behaves consistently. No finding.**

RD (interlinear) state, cross-referenced with IN-004/005 below: interlinear toggle does **NOT**
persist across chapter nav or refresh — resets to off every time, unlike translation. This is
*consistent* (always resets) so it doesn't fail the RD-025-style "document which, be consistent"
bar, but it's a different persistence model from translation with no visible explanation. Filing
as P3 — worth a product decision on whether both should behave the same way.

RD-025 (Ps 119 long chapter): ✅ All 176 verses of Ps 119 present in DOM at once (no
pagination/virtualization). Scrolled and rendered cleanly, no visible jank, no layout break.

---

## TR — translations (TR-010, TR-011)

Spot-checked John 3:16 and Ps 23:1 across WEB (default), BSB, KJV, ASV, BBE (4+ required).

- **KJV** — Jn 3:16: "For God so loved the world... only begotten Son... everlasting life."
  Ps 23:1: "The LORD is my shepherd; I shall not want."
- **ASV** — Ps 23:1: "Jehovah is my shepherd; I shall not want." (LORD → Jehovah, correct ASV convention)
- **BBE** — Jn 3:16: "For God had such love for the world that he gave his only Son, so that
  whoever has faith in him may not come to destruction but have eternal life." Ps 23:1: "The Lord
  takes care of me as his sheep; I will not be without any good thing." Clearly distinct paraphrase.
- All four texts are visibly different, plausible, no error text, no placeholder/lorem content.
- Ps 23 poetry: verse breaks (subscript numbers) preserved in all translations, but **line-break
  poetic formatting is not used anywhere** — Psalms render as continuous prose paragraphs, same as
  narrative books. Not a translation-switch bug (consistent across all 4), flagging under CP-05 below.

✅ **TR-010, TR-011 pass** — translation switch actually changes content, versification holds, no
mislabeled/blank/identical output across translations.

---

## IN — Interlinear (אα) (IN-001–009)

- IN-001/002: Toggle wired correctly — confirmed via `aria-pressed` flips false→true and DOM
  content actually replaces (glossed word-by-word view appears). **Caution for future testers:**
  reading `aria-pressed` via a synchronous JS eval immediately after `.click()` can read a stale
  value (React commit lag) — a naive check would false-report "not wired" (an L1 trap). Re-reading
  after a tick, or using the visible bg-color/class change, confirms it's genuinely wired.
- IN-003: ✅ Active state has an obvious visual affordance (accent-colored background on the button,
  not aria-only).
- IN-004: 🔴→documented, not a hard bug — interlinear does **not** survive chapter navigation
  (`/read/jhn/3`→`/read/jhn/4` resets it off). Consistent behavior, but inconsistent with how
  translation choice persists. P3, filed above under RD.
- IN-005: same — does not survive full page refresh either. Consistent with IN-004 (always resets),
  so passes the "must be consistent" bar, but worth a product call.
- IN-006: ✅ `/read/jhn/3` (NT) → Greek interlinear (Ἦν, δὲ, ἄνθρωπος...). `/read/gen/1` (OT) →
  Hebrew interlinear (בְּרֵאשִׁ֖ית, בָּרָ֣א, אֱלֹהִ֑ים...). Correct language per testament.
- IN-007: ✅ Hebrew renders RTL correctly — verified `dir="rtl"` explicitly set on the interlinear
  row container (not relying on Unicode bidi auto-detection), words flow right-to-left visually in
  the screenshot, niqqud (vowel points) render correctly.
- IN-008: ✅ Greek diacritics (breathing marks, accents) render correctly (Ἦν, Ἰησοῦς etc). No tofu
  boxes, no U+FFFD replacement characters anywhere in the rendered page text (checked
  programmatically: `innerText.includes('�')` → false).
- IN-009: ✅ Tapping a Hebrew word (אֵת, in Gen 1:1) opened the WordPanel for the **correct** word —
  header showed "אֵת · 'eth · PARTICLE · H853", full Strong's entry (lemma, definition, derivation,
  KJV usage, "appears in 6782 verses" list). Same pattern confirmed for Greek via VS-013 below.

✅ **IN-001–003, 006–009 pass cleanly.** IN-004/005 (no persistence) noted as a P3 consistency
question, not a functional bug.

---

## VS — Verse study panel (VS-001–019)

Opened panel via verse-16 tap on `/read/jhn/3` (note: verse numbers are `<sup role="button">`
elements, not real `<button>` tags — worth knowing for anyone scripting this).

- VS-001/002/003: ✅ Panel opens with correct header "JOHN 3:16", correct quoted text matching the
  active translation (BBE at time of test), prev/next chevrons, close (×).
- VS-004: ✅ Three tabs — Commentaries / Word study / Notes — each render genuinely distinct content
  (verified by switching and reading DOM, not just tab labels).
- VS-007: ✅ Commentary count badge said "17" — counted 17 distinct date badges (1710, 1832, 1871...)
  in the DOM. Badge is accurate, not decorative.
- VS-008: ✅ Sampled entry (Matthew Henry) carries author, date (1710), and tradition tag
  ("Nonconformist") — full attribution, not just a name.
- VS-012/013/014: ✅ Word study tab shows Greek word rows (lemma, transliteration, gloss) each with a
  separate Strong's chip (G1063, G25, G3588...). Clicked the G25 chip (ἀγαπάω) — navigated cleanly
  to `/word/G25`, showing full lexicon entry, "appears in 110 verses" concordance list with
  paginated verse refs (1–12 of 110, prev/next). Chip tap did not also trigger the row's own handler
  (separate targets, as required).
- VS-016: ✅ **Notes tab, signed out** → shows "Save notes to your account." + a "Sign in" button
  linking to `/auth/sign-in`. **Confirmed this is not a dead/inert editor** — no textarea rendered
  at all in the signed-out state, just the invitation. This is the exact behavior the block asked me
  to verify specifically, and it's correct.
- VS-019: ✅ Escape key closes the panel (confirmed via screenshot before/after).

No VS defects found. Panel behavior, attribution, and the signed-out Notes gating all check out.

---

## CP — content edge cases

**CP-03 — Matthew 17:21 (missing verse in critical-text translations):**
🔴 **Real finding, P2/P3 (cosmetic-but-confusing, not data-loss).** In **BBE**, Matthew 17:21 renders
as literally `21[]` — the verse number followed by an empty pair of square brackets and nothing
else (confirmed via DOM: `el.parentElement.textContent` → `"21[] "`). In **KJV** the same verse
renders full text ("Howbeit this kind goeth not out but but by prayer and fasting.") — expected,
since KJV includes the verse and BBE (following the critical text) omits it. The problem isn't the
omission itself (that's correct textual-critical practice) — it's that the app surfaces the
underlying source's bracket-omission marker (`[]`) raw to the reader instead of either hiding the
verse number entirely or showing a brief note like "[verse omitted in earliest manuscripts]". A
newcomer hitting `21[]` mid-read will read it as a rendering bug, not a textual footnote — which is
exactly what it looks like.

**CP-04 — Psalm 3 superscription:**
🔴 **Minor finding, P3.** KJV Psalm 3 traditionally carries the superscription "A Psalm of David,
when he fled from Absalom his son." This app's Ps 3 page has **no superscription at all** —
confirmed programmatically (`innerText` contains neither "Absalom" nor "Psalm of David"). Likely a
gap in the underlying public-domain KJV source text used, not a UI bug, but it's a real content gap
worth flagging — the superscriptions carry real interpretive/contextual info in the Psalms.

**CP-05 — Ps 23 poetry line breaks:**
Not a bug, but worth recording: Psalms are rendered as continuous prose paragraphs, identical
treatment to narrative prose books — no hanging-indent/line-break poetic formatting anywhere. Verse
numbers and paragraph markers (¶) are present and correct, but the "poetry line breaks survive the
switch" framing in TR-011 doesn't really apply since there are no poetic line breaks to begin with,
in any translation. Flagging as a product question, not a defect (this may be a deliberate scope
decision).

**CP-06 — Ps 119 (long chapter):**
✅ Loads and scrolls acceptably. All 176 verses present in the DOM on load, screenshot confirmed
clean rendering, no visible jank scrolling through it.

**CP-07 — Jude (single-chapter book) + bare verse-only reference jump:**
✅ `/read/jud/1` loads correctly (route works even though Jude has exactly one chapter). The
passage-jump search (magnifying-glass icon, "Go to passage") correctly parsed "Jude 5" as **"NT ·
verse"** (not chapter 5 — it knows Jude has only one chapter) and clicking the result scrolled
straight to verse 5. Note: pressing the physical Enter/Return key while the result was highlighted
did **not** trigger the jump in this automated session — only clicking the result row worked. This
may be an artifact of how the automation dispatches keydown vs a real browser keystroke; flagging as
a low-confidence observation, not a filed defect (P3 at most, unconfirmed).

**CP-11 — Esther 8:9 (longest verse in the Bible):**
✅ Verse 9 (530 characters) renders with normal text wrapping, no overflow, no broken layout — both
desktop (1280px, prior test) and mobile (390px). Screenshotted at 390px width specifically: text
wraps cleanly across ~8 lines, verse-number superscript stays inline, no horizontal scroll on the
page.

---

## Summary of filed findings

| ID | Severity | Finding |
|---|---|---|
| CP-03 | P2/P3 | Matt 17:21 (BBE) renders literal `21[]` instead of a clean omission — looks like a bug |
| CP-04 | P3 | Ps 3 KJV superscription ("A Psalm of David...") missing entirely from source/render |
| IN-004/005 | P3 | Interlinear toggle doesn't persist across nav/refresh, unlike translation choice — inconsistent persistence model, not documented anywhere in-app |
| CP-05 | P3/observation | No poetic line-break formatting anywhere (Psalms render as prose) — may be deliberate |
| CP-07 | P3/unconfirmed | Enter key on passage-jump search result didn't navigate in automation; click did |

Everything else tested (RD state matrix for translation, TR-010/011, IN-001/002/003/006/007/008/009,
VS-001 through VS-019 scope tested) passed cleanly with no B1–B10 polish-bar violations observed.
