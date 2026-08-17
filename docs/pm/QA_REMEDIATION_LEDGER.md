# QA remediation ledger — both fleet sheets, one board

**Last measured:** 2026-08-17 · `fix/q1-signed-out-state`, 16 commits ahead of `ship/editor-deploy`
· web suite **1042 passed / 94 skipped / 1 failed** (the failure is pre-existing `ECONNREFUSED` in
`user-corpus/queue-never-drops`, proven by stashing this branch's changes) · **nothing deployed.**

Two source sheets:

- **Sheet A** — [`MASTER_QA_REPORT.md`](../evidence/qa-fleet-2026-08-16/MASTER_QA_REPORT.md), 20
  anonymous sessions, 104 severity-marked findings (2 blocker · 23 major · 40 minor · 7 cosmetic ·
  31 note). The 31 NOTEs are mostly positive and close no work.
- **Sheet B** — [`AUTHENTICATED_QA_REPORT.md`](../evidence/qa-fleet-2026-08-16/AUTHENTICATED_QA_REPORT.md),
  10 authenticated sessions, 26 severity-marked findings (4 blocker · 9 major · 12 minor · 1
  cosmetic) plus 25 notes.

**Sheet B's headline is not a defect and outranks everything in this file:** the
"concordance, not a commentator" guarantee was exercised against real model output for the first
time — 10 live queries including adversarial bait and a direct prompt injection — and **held on
every one. Zero breaches.**

---

## 1. Done

| # | What | Sheet | Evidence |
|---|---|---|---|
| D1 | **Both Sheet-A blockers corrected.** "No site-wide gate" is FALSE — the gate is up, unchanged since 2026-07-15; sessions were behind it holding an `httpOnly` cookie they could not read. The `/ask` 401 is correct behaviour, downgraded to a UX defect | A | `93f6be0` |
| D2 | **`/ask` announces sign-in before you type**, and the 401 carries a working sign-in link. The most-repeated finding of either run (13 of 20 sessions) | A | `22be8cf` |
| D3 | **One name per library route**, derived by both nav surfaces. "Saved" no longer opens two different destinations; "My Works" is no longer advertised as "My uploads" | A + B (×2) | `01a0747` |
| D4 | **Every hyphenated and unspaced-ordinal book URL resolves.** Filed as 4 missing aliases; was really the normalizer never converting hyphens, so *every* numbered and multi-word book failed from a pasted URL | A | `f1b72f5` |
| D5 | **`robots.txt` + `sitemap.xml` exist**, sitemap derived from the gate allowlist so it can never advertise a gated route | A | `f1b72f5` |
| D6 | **Funnel controls go where they say**: Log in → sign-in, footer "Contact" no longer claims a contact method it lacks, `/ask` tab says "Ask", sidebar stops duplicating the brand name | A | `4ce3146` |
| D7 | **The 11th voice is reachable** on the verse panel; the unrelated Gethsemane quotation is deleted from both panels | A | `0c1a050` |
| D8 | **Lexicon Hebrew tab no longer searches Greek** — an abandoned in-flight load could win the race and write itself into state | A | `079fe89` |
| D9 | **Chapter advance no longer depends on object identity.** A reconstructed book silently advanced to Genesis; a reconstructed Revelation *wrapped the canon* | A | `b95454b` |
| D10 | **Passage-search count** — both numbers were right; one noun was wrong | A | `3d72cd0` |
| D11 | **Marketing skip link, example prompts fill instead of auto-submitting, `/reading-plans` → `/plans`** | A | `c3c7370` |
| D12 | **Research threads can be deleted** — store fn, `DELETE /api/research/[id]`, two-step always-visible UI control, I-1 amended narrowly and red-proofed three ways | B | `fb33cf6` |

### Closed as NOT REPRODUCED — six findings, three of them BLOCKER/MAJOR

Each was **driven against the running app**, not reasoned about.

| Finding | What actually happens |
|---|---|
| No site-wide gate (BLOCKER) | Gate up and unchanged; `httpOnly` cookie invisible to `document.cookie` |
| Hero CTA is inert (MAJOR) | `<a href="#ask">` with a matching `<section id="ask">` 16 lines below |
| Catalog search doesn't filter (MAJOR) | 1000+ matches, 62 highlighted hits; empty case renders "No matches." |
| Library search no-ops on Sermons/Historians (MAJOR) | API returns results for **every** catalog |
| In-work ToC is a dead click (MAJOR) | Opens a dialog with 22 real chapter rows — and Sheet A's *own* Library session praised this same feature |
| Inconsistent `/ask` copy across loads (MINOR) | Describes the pre-Design-C build; `2d043ba` superseded it |

**Four of these six share one symptom — "I clicked it and nothing happened" — which is also exactly
what a hijacked tab looks like.** Sheet A records ~12 of 20 sessions hitting tab-cap exhaustion and
cross-agent hijacking. **Requirement for the next run: a dedicated tab pool per session.**

Sheet B also *retracts* three previously-filed bugs: `/settings` is a real preferences page (not a
stub), reading theme "Light" survives a reload, and `/auth/sign-in` does not serve a form to a
signed-in visitor.

---

## 2. Not done — and who should take it

**Legend.** **Me** = I can do it end-to-end on a branch with tests. **Owner** = needs your decision,
credential, or production action; no agent can do it. **Kimi / lane** = corpus & retrieval work that
carries the accuracy diagnostic and held-out eval, which is a different discipline
(`quality-slice`) and is where Kimi has already worked.

### 2a. Me — straightforward, plumbing already exists

| # | Item | Sheet | What it takes |
|---|---|---|---|
| M1 | **Delete a Study from the UI** | B (MAJOR) | `DELETE /api/studies/[id]` already exists. A button + confirm + optimistic rollback + test. Same shape as D12 |
| M2 | **Bookmark is stateless — can't see or remove one** | B (MAJOR) | Annotations DELETE already exists. Needs bookmark state surfaced in the popover and a remove path |
| M3 | **No discoverable way to un-highlight** | B (MAJOR) | **The capability already exists** — the study panel's `clear` control. It is a *discoverability* defect: removal lives on a different surface than creation. Put it in the selection popover |
| M4 | **Highlight popover doesn't mount across a verse boundary** | B (MAJOR) | Real bug in the selection→span mapping. Needs a repro test at the boundary, then a fix |
| M5 | **Upload "Remove" deletes instantly, no confirmation** | B (MINOR) | Reuse D12's two-step pattern |
| M6 | **Uploaded file size shows "0 KB"** | B (MINOR) | Rounding/format bug |
| M7 | **Stale search results after deleting a document** | B (MINOR) | Invalidate the result set on delete |
| M8 | **Retry stacks a duplicate error block** | A (MINOR) | `ask-client` — replace the failed turn rather than appending |
| M9 | **Third example prompt clipped at 390px** | A (MINOR) | CSS; I saw it myself in the browser |
| M10 | **Two POSTs per `/ask` submit** | A (MINOR) | Unverified; needs measurement first, then likely a guard |
| M11 | **`NaN` fetches on malformed chapter routes** | A (MINOR) | Validate the param at the edge, don't dispatch |
| M12 | **Out-of-range chapter is a dead end** | A (MINOR) | Add a chapter picker / recovery link |
| M13 | **Bible tab discards reading position** | A (MINOR) | Hardlinks John 1; use last position |
| M14 | **Keyboard focus order zigzags in the header** | A (MINOR) | DOM order vs visual order |
| M15 | **Catalog row link has no accessible name** | A (COSMETIC) | `aria-label` |
| M16 | **"UNLABELLED" + raw slug flash on a new desk pane** | B (COSMETIC) | Loading state |
| M17 | **Two settings surfaces with different content** | B (MINOR) | `/settings` vs `/account/settings`; needs a decision on merge vs cross-link, then the edit |
| M18 | **Word-study occurrence links land at chapter top; interlinear is dropped** | A (MINOR ×2) | Same verse-anchor pattern as the notes finding |
| M19 | **Desk has no nav entry at mobile width** | B (MINOR) | Subset of Q8 — but the mobile-menu entry alone is safe to add now |
| M20 | **Library copy overstates what sign-in adds** | A (MINOR) | Copy fix; position already persists anonymously |

### 2b. Me — bigger, needs a design decision inside it

| # | Item | Sheet | What it takes |
|---|---|---|---|
| M21 | **Study editor: buttons/inputs in the Library panel often don't respond** | B (MAJOR) | Needs reproduction first. Could be an overlay/pointer-events bug or the automation artifact Sheet B saw elsewhere — **do not fix before reproducing** |
| M22 | **`+ Add to study` inserts the whole chapter, not the matched excerpt** | B (MINOR) | Real product friction. Touches the clipping engine (`111_study_block_trim`), so it needs care |
| M23 | **Standalone lexicon is thinner than the in-reader tool** | A (MAJOR) | Parity work: parsing, occurrence list, commentary link. Genuinely a product question — should the two surfaces be at parity at all? |
| M24 | **No next/previous verse in the study panel; adjacent verse click closes it** | A (MAJOR ×2) | The panel needs the chapter's verse list threaded through the reader. Beyond "minimal change" |

### 2c. Owner — I cannot do these

| # | Item | Why it's yours |
|---|---|---|
| O1 | **`/library` hang on hard load** (A ×3, B ×2 — the most-reported defect in either sheet) | Does **not** reproduce in dev. Root cause is already diagnosed in-tree at `library/uploads/page.tsx:14-28` — the parent `loading.tsx` Suspense boundary never swaps on a hard load, measured at 43s. A production-build repro needs the gate password entered **by you** at `localhost:3003/gate`; I don't authenticate. **Then I can finish it** |
| O2 | **Unlabeled Menu button silently signed the account out** (B, BLOCKER) | I can label the control, but the underlying "why did it sign out" needs a look at a real authenticated session |
| O3 | **9 research threads + 1 highlight on your account** | The highlight is removable **today**: verse study panel → `clear`. The threads need D12 deployed |
| O4 | **Deploy anything** | `deploy.sh` gates on a clean tree, and the tree currently has another session's uncommitted `WORKLOG.md` + `AUTHENTICATED_QA_REPORT.md`. Also bylaw 7 |
| O5 | **Desk model** (A ×9, B: persistence) | Design decision you're mid-thought on. Overlaps UX-1/UX-3/UX-4. Desk state is URL-only signed in *and* out — login changes nothing |
| O6 | **Verse tap targets under WCAG 24×24** | Governed by **ADR-047**, an owner ruling whose asymmetry is documented as deliberate. Changing it re-litigates the ADR |
| O7 | **What the marketing funnel may promise pre-launch** | While SEC-1 is open, "See it answered" can only mean "see this screenshot". The honest fix may be copy |
| O8 | **`/bible/web`, `/commentaries` raw 400** | The error is the **Blob store's**, via the Lane D corpus rewrite. D3's store isn't connected; untestable locally |
| O9 | **`?next=` return path after sign-in** | Three call sites plus a Neon `callbackURL` validator that has already taken production auth down once. I can build it — but it wants your go, because the blast radius is auth |

### 2d. Kimi / quality-slice lane — corpus & retrieval

These carry the accuracy diagnostic and held-out eval. **Never ship these without re-running the
eval and recording it in `WORKLOG.md`** (CLAUDE.md).

| # | Item | Sheet |
|---|---|---|
| K1 | Watts's "When I Survey" not cross-linked to Galatians 6:14, despite the hymn's own printed header | A (MAJOR) |
| K2 | "Ignatius" ranks Loyola above Ignatius of Antioch | A (MINOR) |
| K3 | Historical Background lane returns irrelevant Josephus excerpts | B (MINOR) |
| K4 | No primary text of Ignatius of Antioch; Historians catalog holds one work | A (NOTE ×2) |
| K5 | Hymns tradition filter fragmented by capitalisation; Manton's set split by title prefix; a Greek commentary on James filed under Hymns | A (MINOR ×3) — **metadata normalisation, cheap and safe, good first Kimi task** |
| K6 | OCR artifact in a hymn heading ("Col. 9. 16"); "Amazing Grace" has no scripture heading | A (MINOR ×2) |
| K7 | Song of Songs commentary thin in Passage search | A (NOTE) — confirms the known `gill-song` gap |
| K8 | θεός gloss shows "figuratively" instead of a meaning | A (MINOR) |
| K9 | **"Suggested readings" never completes for an uploaded document** | B (MAJOR) — embedding/semantic-match path, Lane B |

### 2e. Measurement, not a fix

| # | Item | Note |
|---|---|---|
| X1 | **Live authenticated `/ask` latency is ~21–37s, avg ~28.5s** | B (MINOR). This is the **first production measurement** of the D4 question. It is 2–3× what the UI promises ("about ten seconds"), and D4's dev-local p50 was 9.1s. Either the copy changes or the pipeline does — an owner call informed by a real measurement, which now exists |
| X2 | **Interpretation guarantee: 10/10 clean, zero breaches** | B. Small sample beside the n=100 `interpretation_bait` gate, but it is the first real evidence and it is good |

---

## 3. Recommended order

1. **Me, now:** M1–M3 — the remaining delete/remove gaps. All three are UI over working plumbing; together they close the "creates but never deletes" theme that runs through Sheet B.
2. **You, 30 seconds:** clear the tree (another session's two files), then O3's highlight via the study panel.
3. **Me, after that:** M4–M9, then the M10–M20 batch.
4. **You, when convenient:** O1's password so I can finish the `/library` hang — the most-reported defect across both sheets.
5. **Kimi:** K5 first (metadata normalisation — contained, safe, no eval needed), then K1/K2/K9.
6. **Owner decisions, unblock at your pace:** O5 (Desk), O7 (funnel), X1 (latency vs copy).
