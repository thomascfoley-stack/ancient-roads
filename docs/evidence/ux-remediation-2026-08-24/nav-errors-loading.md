# NV / ER / LD sweep — signed out, local prod build (localhost:3066)

Run date 2026-08-24. Gate password `local-prod-test-only`. All signed out (no account).
Note: `/` redirects to `/home`, which renders a signed-out dashboard (Daily Light devotional +
full nav sidebar), not a marketing landing page. Marketing pages live at `/about`, `/features`,
`/why` as separate routes.

---

## NV-001 — Back-map

| From → To (how reached) | What Back did |
|---|---|
| `/home` → `/about` (direct nav) → Back | Returned to `/home`. Correct. |
| `/read/jhn/3` → click verse 2 → commentary panel opens (URL unchanged, no push) → Back | **Panel closed, stayed on `/read/jhn/3`.** Confirms NV-008 regression guard still holds signed out. |
| `/search?q=shepherd` → click result "Exposition of the Book of Solomon's Song" → `/work/gill-song#s1` → Back | Returned to `/search?q=shepherd`, scrollY=0 (query preserved, list re-rendered top — no mid-list scroll restoration observed, but query wasn't lost). |
| `/home` → `/features` → `/why` → Back → Back | 1st Back: `/why` → `/features`. 2nd Back: `/features` → `/home`. Walked backward through both, correctly. |

No Back-map defects found in this slice — all four transitions matched the documented "should"
behaviour, including the previously-broken verse-panel case (NV-008), which held.

---

## NV-013 / NV-014 — 404 / invalid-route handling

| Route | Presentation | Title | Way home |
|---|---|---|---|
| `/this-does-not-exist-xyz` | **Branded, human.** "404" eyebrow, "That page isn't here", explains two possible causes, two CTA buttons: "Open the Bible" / "Browse the library". | `Not found · Ancient Paths` | Yes, two buttons |
| `/read/notabook/1` | **Different, plainer treatment.** Centered text only: `Unknown book: "notabook"`, single button `John 1`. No 404 badge, no "why this happened" framing, no library-browse option. | `Ancient Paths` (generic, unchanged) | Partial — one fallback link only |
| `/read/jhn/999` | Same plain-text family as above: `John has 21 chapters`, two buttons `John 1` / `Choose another chapter`. Reasonable and specific, but again not the branded 404 treatment. | `Ancient Paths` (generic) | Yes |
| `/word/INVALID` | Same family: `That isn't a Strong's number.` + explains the two valid formats (`/word/G2316`, `/word/H430`) + "Search the dictionary" button. Good copy. | `Ancient Paths` (generic) | Yes |

**Finding (P2/P3, B7 "one hand"):** the app has two different not-found idioms — the branded
`/not-found` boundary (404 badge, two-button recovery, updates the tab title) used for unknown
routes, versus a plainer inline "unknown resource" message used inside `/read/*` and `/word/*`
for bad params. Both are human and non-robotic (good — clears B2/ER-003), but they don't look like
the same product, and none of the three inline variants update `document.title`, so a user who
lands here from a bad link keeps a generic "Ancient Paths" tab forever (ties into NV-016 below).

---

## NV-016 — Tab-title sweep

| Route | `document.title` | Distinct? |
|---|---|---|
| `/` (redirects to `/home`) | `Ancient Paths` | **No — generic** |
| `/about` | `About · Ancient Paths` | Yes |
| `/features` | `Features · Ancient Paths` | Yes |
| `/why` | `Why · Ancient Paths` | Yes |
| `/gate` | `Private preview · Ancient Paths` | Yes |
| `/auth/sign-in` | `Ancient Paths` | **No — generic** |
| `/read/jhn/3` | `Ancient Paths` | **No — generic** (the core reader page, most-visited surface in the product, does not set "John 3 · Ancient Paths") |
| `/search` (and `/search?q=…`) | `Search · Ancient Paths` | Yes |
| `/word/G26` | `Ancient Paths` | **No — generic** |
| `/work/gill-song` (opened from a search result) | `Ancient Paths` | **No — generic** |
| `/library` | `Library · Ancient Paths` | Yes |
| `/library/books` | `My books · Ancient Paths` | Yes |
| `/library/word-study` | `Ancient Paths` | **No — generic** |
| `/library/uploads` | `My uploads · Ancient Paths` | Yes (title is fine even though content hangs — see below) |

**Finding (P2, NV-016):** 5 of 13 routes checked ship only the generic "Ancient Paths" title:
`/` (`/home`), `/auth/sign-in`, `/read/:book/:ch`, `/word/:strongs`, `/work/:slug`,
`/library/word-study`. The reader and word/work detail pages are the ones a returning user is most
likely to have several tabs of open at once — generic titles make tab-switching guesswork.

---

## NV-025 — Browser zoom (150%)

- `/home` at zoom 1.5: `scrollWidth 1271` vs `innerWidth 1280` → **no horizontal overflow.**
- `/read/jhn/3` at zoom 1.5: `scrollWidth 1271` vs `innerWidth 1280` → **no horizontal overflow.**
Both reset to zoom 1 cleanly. No finding — nav and reading surface hold at 150% zoom.

---

## ER — Error message inventory (signed out)

| # | Trigger | Exact text | Human or robotic |
|---|---|---|---|
| ER-a | Gate, wrong password `wrong-password-xyz` | "That wasn't it. Try again." | **Human.** Doesn't blame, doesn't leak whether the password exists. Password field is cleared after a wrong attempt (expected/correct for a password field — not an ER-007 violation). |
| ER-b | `/read/notabook/1` | `Unknown book: "notabook"` + `John 1` fallback | Human, terse; no "why"/next-step framing beyond the one link |
| ER-c | `/read/jhn/999` | `John has 21 chapters` | **Human**, specific, actionable (states the real bound) |
| ER-d | `/word/INVALID` | `That isn't a Strong's number.` / `A word page looks like /word/G2316 (Greek) or /word/H430 (Hebrew).` | **Human**, best of the set — explains the expected format |
| ER-e | `/search?q=zzyzxqqq123` (no results) | Per-category: "No matches in commentaries." / "No matches in sermons." / "No matches in hymns & poetry." / "No matches in historians." (and so on down every register) | Honest, no fabrication (clears ER-003, no vendor text). **But it doesn't teach the next action** (EM-017-style gap) — no "try fewer words" or "check spelling" suggestion, just a wall of six-plus "No matches in X" lines, one per library register. |
| ER-f | `/this-does-not-exist-xyz` (branded 404) | "That page isn't here" / "The link may be mistaken, or the work may not be published yet. The Scriptures and the library are both still where you left them." | **Human**, warm, on-brand copy; reassures nothing was lost |

No raw vendor/stack text, no bare error codes without a sentence, in any of the above — ER-003/ER-004
clear for everything triggerable signed out. Console did show **401 and 404 network errors** on
personalized API calls (e.g. `/api/...` for saved items/highlights) on pages that otherwise render
fine signed out — these never surface to the user, which is correct behaviour for signed-out gating,
but they are true console errors and worth flagging against the "no console errors" bar in CLAUDE.md's
Definition of Done if that gate is ever run against this signed-out state.

---

## LD — Loading-state sweep

Environment note: this is a local production build with no artificial network latency, so genuine
skeleton/spinner states were mostly too fast to catch by screenshotting after navigation — could not
reliably force a >100ms loading window on `/`, `/read/jhn/3`, or `/search?q=shepherd` under these
conditions. What was observed:

- **`/library/word-study`**: on load, shows a real interim state — "Loading greek lexicon…" — then
  resolves to "Start typing to search 5,523 greek entries." within ~1s. This is text, not a skeleton
  (LD-003 asks for skeletons on core surfaces; word-study isn't explicitly core-listed, but note it
  uses a plain loading sentence, not a skeleton or spinner).
- **`/library/uploads` (signed out): stuck on "Loading the library" indefinitely** — waited 4s+,
  no resolution, no error, no empty-state fallback. **CONFIRMS-SIGNED-OUT-TOO** for the filed F-012
  defect (previously only observed signed in on `/library`, `/library/books`, `/library/word-study`,
  `/library/uploads`). This run: `/library`, `/library/books`, and `/library/word-study` all loaded
  correctly signed out (no hang) — **only `/library/uploads` reproduced the hang signed out.** That
  narrows F-012's signed-out repro to the uploads route specifically; worth re-checking whether the
  other three routes were fixed, or whether the original signed-in report was route-specific too.
- **`/home` reload**: no white flash observed on repeated hard reloads; content (Daily Light
  devotional) was present by first screenshot each time — but given the near-zero local latency this
  is a weak negative (absence of evidence, not evidence of a skeleton system working under real
  network conditions).
- Did not get a reliable read on LD-005 (layout shift after skeleton replacement) or LD-007
  (Ask's >4s/>10s wording) in this slice — both need either real network throttling or signed-in
  Ask access; flagging as **NOT RUN**, not as passing.

---

## Summary for report

Back-map (4 transitions tested) — all correct, including the NV-008 verse-panel regression guard.
404/invalid-param handling is human everywhere but inconsistent in presentation (branded 404 page vs.
three different plain-text inline messages) and the inline ones never update the tab title. Tab-title
sweep: 5/13 routes generic, including `/read/:book/:ch` itself — the most-visited surface. Zoom
150% clean on `/` and reader. Error copy is uniformly human/non-robotic, no vendor leakage. Loading:
confirmed `/library/uploads` reproduces the filed F-012 hang signed out too (new: the other three
`/library/*` routes did NOT hang signed out in this run, narrowing the repro). Genuine skeleton/shift
timing (LD-005/007) not verifiable without network throttling — flagged NOT RUN rather than assumed
passing.
