# UX_FINDINGS.md — execution of UX_TEST_PLAN.md

Run started 2026-08-24, after the auth hydration fix shipped (`90becf1`).
Signed-out: local dev at the deployed commit (production is behind SITE_PASSWORD, which I do not
have). Signed-in: production, owner's session.

Severity: P0 broken/data-loss · P1 user-angry or trust-damaging · P2 friction · P3 cosmetic.

## Method correction, recorded before the findings

`/desk` hangs forever on "Loading your desk…" in `next dev`, but renders correctly in a production
build and on the live site. Its whole page sits in a `<Suspense>` boundary ("useSearchParams needs
a Suspense boundary in the app router") and dev's Turbopack hydration resolves it unreliably.

**So local dev is not a faithful proxy for anything hydration-shaped, and the rest of this run uses
a local PRODUCTION build (`next build` + `next start`, gate passed) for signed-out testing.** Two
findings already came from that difference; a third nearly got filed as a product bug.

---

## Findings

### F-001 · MK-009 · **P1** · No privacy policy or terms, anywhere
Confirmed again on the current build: zero links matching privacy/terms on `/`. The waitlist
collects an email address and PostHog is now live and capturing. Beta blocker; needs owner copy.
The footer component's own comment says the column is deliberately absent until those pages exist.

### F-002 · MK-018 · **P3** · The waitlist form has no `method`, and its input has no `name`
Same class as the auth-form defect fixed today (L4). Lower severity here because the input carries
no `name`, so a JS-less submit sends nothing at all — it would reload the page and silently do
nothing rather than leak. Worth one attribute for consistency now that every other form is fixed.

### F-003 · DEV-ONLY · **P2 (contributor-facing)** · `/desk` never loads in `next dev`
Stuck on "Loading your desk…" past 10s, every load, signed out. Renders fine in a production build
and live. Not a user bug — but it makes the desk untestable in dev, which is where contributors
work, and it is the surface the product's core journey lives on.

### Passing, verified rather than assumed
- **MK-013** valid waitlist → warm, human confirmation naming the address. Good copy.
- **MK-014** duplicate waitlist → **identical** response, no existence leak.
- **MK-015** `a@b` → "Please enter a valid email address", input preserved.
- **DK-002** empty desk (production) → renders both CTAs, and explains the 16-pane model.

### F-004 · NV-016 · **P2** · 8 of 20 surfaces set no distinct tab title — including every reading surface

Measured from served HTML on the production build:

    /read/jhn/3           Ancient Paths     <- should be "John 3 · …"
    /read/psa/119         Ancient Paths
    /work/schaff-hcc1     Ancient Paths     <- should name the work
    /word/G26             Ancient Paths     <- should name the word
    /home                 Ancient Paths
    /desk                 Ancient Paths
    /library/word-study   Ancient Paths
    /library/notes        Ancient Paths
    (/about, /features, /why, /library, /ask, /search, /settings, /plans, /prayers, /studies all DO)

This is not cosmetic in *this* app. Its core journey is several things open at once — a chapter, a
commentary, a word study, a search. With eight tabs all reading "Ancient Paths", the tab bar and the
history menu are both useless, and that is exactly the reader this product is for.

### F-005 · **P3** · `/plans/[id]` renders a doubled title
`Reading plan · Ancient Paths · Ancient Paths` — the page sets a title that already contains the
suffix the root template appends.

### F-006 · **P3** · Invalid deep routes return HTTP 200, not 404
`/read/john/99`, `/read/notabook/1`, `/word/G99999`, `/word/XYZ`, `/work/nope`, `/library/nope`,
`/plans/nope` all answer **200**. Only `/studies/nope` and unknown top-level paths answer 404.
The reader-facing message is fine (see the pass below) — this is about what crawlers and link
checkers are told.

### F-007 · **P2** · Era metadata is too thin to support the promise it makes
`sources.era` on the dev corpus: **`unassigned` 135**, modern 40, puritan 14, reformation 7,
medieval 6, patristic 3, second-temple 1. **Two thirds of works have no era.** The verse panel
groups voices by era and showed only two headings ("Modern", "Reformation") for 17 commentaries
spanning 1710–1871; Matthew Henry — recorded as `puritan`, 1710 — did not appear under a Puritan
heading. The product's stated promise is showing how the church has read a passage *across the
centuries*; that is hard to deliver when most works have no century attached.

### F-008 · confirms K-2 · Corpus damage is visible on the most-read verse in the Bible
The John 3:16 commentary panel contains one `( )` — the empty citation left by the scripRef
deletion. 1,937 such sections are live. This is what the repair decision is about.

---

## Passing — verified by execution, not assumed

- **RD-007 invalid chapter** — *"John has 21 chapters"* with "John 1" and "Choose another chapter".
  Exactly the humane error the plan asks for. Best error message seen so far.
- **CM-003 / B10 attribution** — every commentary entry carries author, year, tradition AND work
  ("Matthew Henry — 1710 · Nonconformist · Matthew Henry's Commentary"). The product's promise,
  honored, on the surface where it matters most.
- **RD-022 signed-out verse panel** — "Sign in to highlight and save notes to your account →"
  rather than dead controls. The house pattern, working.
- **RD-035/036** — HL and interlinear toggles both expose `aria-pressed`.
- **MK-013/014/015** — waitlist accepts, refuses, and repeats without leaking existence.
- **DK-002** — empty desk explains the 16-pane model and offers both ways in.
