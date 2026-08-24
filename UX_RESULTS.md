# UX_RESULTS.md — execution results for every ID in UX_TEST_PLAN.md

Live tracker. ✅ pass · 🔴P0/P1/P2/P3 finding (see UX_FINDINGS.md for detail) · ⛔ blocked · — not yet run.
Method: batched checks (curl route sweeps, DB queries, single browser scripts touching many
assertions) rather than one round-trip per test, so this can actually cover the full plan.
Signed-out: local production build (`next build && next start`, gate passed). Signed-in: production,
owner's session, via Chrome MCP.

## Batch 1 — route sweep (curl, all 33 routes, prod build, signed out)

NV-016 🔴P2 8 routes share the generic title "Ancient Paths": /, /auth/*(4), /home, /read/*, /desk,
  /work/*, /word/*, /library/word-study, /library/notes, /library/passages, /channel/*.
  CORRECTION to earlier finding: /library/books ("My books ·"), /library/uploads ("My uploads ·")
  DO have titles — not every list-y page is affected, just the ones above. See F-004.
AU-002 ✅ every auth form (sign-in/up/forgot/reset) + /gate all carry method="post". Fix holds app-wide.
MK-027 ✅ og:image present on every route (metadataBase fallback), width/height/alt all set.
+MSG-001..007 ✅ NOT A BUG, resolved: `/channel/[id]` is a deliberate redirect stub → `/prayers`
  ("the concept actually moved" — code comment). `/chat/[id]` is a ComingSoon stub, not scaffolding
  left behind — ships a title, description, and a CTA. Downgrade from "unmapped surface" to "known
  placeholder, working as designed."
SE-002 ✅ resolved, not a naming collision: `/studies` (plural) is the real gated list; `/study/[id]`
  (singular) is a ComingSoon stub for a different, unbuilt feature. Two different maturity levels,
  not two routes for one concept.
+SE-003/L-4 🔴 confirmed still open (known, not new): `/studies` signed-out is a raw 307→/auth/sign-in,
  not the "sign in to create studies" invitation the ratified plan calls for.
ACCT-001/005 ✅ `/account/settings` is the only valid path (allowlisted), `/account/x` correctly 404s.
  It is auth-gated (307→sign-in) and distinct from public `/settings` — reasonable separation, not
  a duplicate surface. ACCT-004 relationship: /settings = app prefs (public), /account/settings =
  credentials (gated). Needs one signed-in check that /settings actually links to it (queued).

## Batch 2 — translations (browser, John 3:16, prod build)

TR-001 ✅ 18 translations enumerated: WEB BSB KJV ASV YLT DBY BBE LSV GNV TYN WBT NHEB AKJV REB RWB UKJV NOY ANT.
TR-002 ✅ switch WEB→KJV: label AND text both change AND agree ("his only begotten Son" — correct KJV
  wording). Bug #118 class does NOT reproduce.
TR-003 ✅ rapid BSB→KJV→BSB race: final label "BSB" matches final text ("one and only Son", correct
  BSB wording). No mismatch.
TR-006 ✅ persists across full page refresh (localStorage-backed).
TR-009 — not in the URL; confirms "documented default" branch of the test, not a defect.

## Batch 3 — highlights, notes, verse-panel deep link (production, signed in, owner account, John 3:20)

HL-001 ✅ two-tap highlight model discovered by reading source (verse-display.tsx): tap1 anchors a
  word, tap2 completes the range, one popover with 10 colors + Note. Not documented anywhere in-app.
HL-002 ✅ paints instantly, survives full page refresh.
HL-003 ✅ (covered by refresh above).
HL-004 ✅ "clear" removes it; control itself disappears once nothing to clear.
HL-008 ✅ "Highlight yellow" produced a yellow-family bg class — color fidelity holds for this one;
  other 9 colors NOT individually checked (queued).
VS-016/017 / NT-002 ✅ Notes tab signed in: write, Save note → persists.
NT-003 ✅ Delete → gone, confirmed by absence on next open.
RD-038/039 ✅ `#v20:study` deep link opens the panel on a real fresh navigation (first check falsely
  read "no" — my own regex was case-sensitive against "JOHN 3:20" vs "John 3:20"; corrected and
  re-verified true. Recording the near-miss per lens L6.)
PW-new ✅ discovered, not in the original plan: the verse panel's Notes tab links to "Pray over this
  verse" — a real cross-feature bridge into the prayer journal. Worth a dedicated PW test; queued.

## Batch 4 — Ask (production, signed in, real question, real LLM latency)

AS-002 ✅ "what does 1cor13 say about love" → real answer, sourced.
AS-007/AS-008/B10 ✅ 8+ voices, each with author + work + tradition + "Open on desk" link. No
  first-person app-voice detected in the answer text. The core promise, holding.
AS-016 ✅ Enter submits.
AS-017 ✅ loading state visible immediately.
AS-021 ✅ citation → `/read/1co/13#v7` → lands exactly on verse 7.
AS-033 ✅ submitting a fresh question routes to `/ask/[id]` immediately.
NV-016 correction: `/ask/[id]` on a REAL thread sets a distinct title ("Research thread · Ancient
  Paths") — my earlier curl sweep hit a fabricated id with no thread behind it. Not a finding.

### F-009 · AS-022 · **P1** · Back from a citation does NOT restore the answer — shows a blank composer
Click a citation into the reader, press Back: URL is correct (`/ask/[id]`) but the page renders the
EMPTY Ask composer ("Begin a study →"), not the 8,400-character answer that was on screen a moment
ago. A hard reload of the identical URL renders the full answer correctly — so the data is fine and
this is specifically a client-side Back-navigation bug, the same class K-6 was on the reader (Back
not restoring view state), unfixed here. For a surface whose whole value is "come back to your
answer", this reads as "my answer is gone."
