# W-UX3 — Desk layout model: sub-design

**Status:** DESIGN-FILED (awaiting independent verifier review — no product code written)
**Build base:** origin/main `9dce273` · worktree `/tmp/swarm-ux3` · branch `swarm/w-ux3-desk-grid`

## Problem

The desk (`web/src/app/desk/page.tsx`) renders up to 3 panes in one `lg:flex-row`
(`MAX_PANES = 3`, `web/src/lib/desk.ts:23`). MASTER.md UX-3 asks for a grid (top-to-bottom as
well as left-to-right), no 3-pane cap; drag-resize and collapsible left chrome are stretch.
The standing caveat is load-bearing: the cap is doing performance work. A work pane
(`web/src/components/desk-pane.tsx` `WorkPaneView`) appends every fetched keyset page to
`sections` and renders ALL of them — DOM nodes grow without bound as the reader scrolls.
`spurgeon-sermons` is 118,371 sections; the full reader survives that scale only because
`work-reader.tsx` windows (≈40 mounted sections). An uncapped grid over the pane's unbounded
renderer is a memory/DOM failure before it is a layout question.

## Approach (core only)

**1. Lift the cap to a 16-pane (4x4) ceiling.** `MAX_PANES` becomes 16 — the owner's own
stated shape ("we're gonna have to go to a 4x4", order 2026-08-02 §3). Not truly unbounded:
a desk URL is user-editable input, and the parser must stay bounded against a hostile
`?p=`×10⁴ link (the reason the cap is enforced in `desk.ts`, not the UI). Dedupe, overflow
counting, and the A078 cap notice generalize unchanged.

**2. Grid layout.** Add a pure, unit-testable `deskGridShape(n) → { cols, rows }` to
`desk.ts` (cols = ceil(sqrt(n)) capped at 4; rows = ceil(n/cols)). The desk container keeps
its `lg:h-dvh lg:overflow-hidden` contract and swaps the panes row for a CSS grid —
`grid-template-columns/rows` from the shape, rows `minmax(0, 1fr)` — so the whole grid fits
the viewport and every pane keeps its own scroll region (the desk's core contract). Below
`lg:` the stacked, page-scrolling layout is unchanged.

**3. Pane-content virtualization: reuse the in-repo windowed idiom, no new dependency.**
`web/package.json` has no virtualization library, and the order forbids adding one. The repo
already has the idiom: `work-reader.tsx`'s render window (WINDOW_BEHIND/WINDOW_AHEAD around
the active section, spacer divs sized from measured heights) over the scroller-agnostic,
already-tested `useWorkSectionPages` hook (`web/src/lib/use-work-sections.ts`, invariants in
`test/invariants/work-reader-paging.test.tsx`). `WorkPaneView` adopts `useWorkSectionPages`
(replacing its bespoke `loadFrom`/`loadMore`/`seq` machinery, gaining keyset prepend for
upward scroll) and renders a bounded window — BEHIND 8 / AHEAD 16 (≈24 mounted sections per
pane; panes are smaller cells than the reader, so a smaller window than the reader's 40) —
keyed to the PANE's own scroll container, replacing today's document-capture listeners.
Worst case 16 × 24 = 384 mounted articles, bounded, versus unbounded growth today.
Trade, named per the order: the window math is ADAPTED from `work-reader.tsx` (~100 lines),
not extracted — the full reader's window is coupled to its selection popover, resume record,
and header-line math, so extraction would put the reader in the blast radius of a desk
change. If the verifier prefers extraction, that is the one open design decision.

## Files expected to change

- `web/src/lib/desk.ts` — `MAX_PANES` → 16; new `deskGridShape()`; header comment rewritten ("THREE PANES, MAX" is the old model).
- `web/src/app/desk/page.tsx` — panes row → grid; cap-notice and empty-state copy.
- `web/src/components/desk-pane.tsx` — `WorkPaneView` on `useWorkSectionPages` + bounded window; `PaneFrame` exposes its scroll container.
- `web/src/components/sidebar.tsx:1273` — one comment references `MAX_PANES` = 3 (icon glyph unchanged).
- Tests: `web/test/desk-panes.test.ts`, `web/test/desk-cap-overflow.test.ts` (new ceiling + `deskGridShape` cases); `web/test/components/desk-cap-notice.test.tsx`, `desk-empty-cta-adds-scripture.test.tsx` (copy); **new** `web/test/components/desk-pane-windowed.test.tsx` (bounded DOM); `desk-stacked-pane-position.test.tsx` re-run to prove mobile unchanged.
- Evidence: `docs/evidence/swarm-2026-08-22/w-ux3/` — red transcripts.

## Explicitly NOT built

Drag-resize / user pane sizing; collapsible left chrome (both stretch — filed for the owner
packet); pane reordering; layout persistence beyond the URL; any change to `/work/[slug]`,
`useWorkSectionPages`, the library `+` flow, or the sections API; no new dependency.

## Test plan

- **Layout model unit tests:** ceiling 16, dedupe, overflow count; `deskGridShape(1..16)` pins the 4x4 shape table.
- **Bounded-DOM render test (the red-proof):** mount a work pane against a mocked fetch serving many pages (e.g. 10 × 25 sections); drive scroll/loads; assert mounted `article[id^="s"]` count ≤ the window bound regardless of sections loaded. RED first against the CURRENT renderer (node count scales with sections — transcript committed), then GREEN; plus a seeded red-proof (window bypassed → assertion fails).
- **Regression:** full desk test suite + `npm run audit`; browser-verify at ≥6 panes on dev with `spurgeon-sermons` if served (else a large fixture), sampling DOM node count before/after a deep scroll.

## Perf risk register

- **Mount storm:** a shared 16-pane link fires 16 meta + 16 section fetches against the rate-limited sections route (`publicReadThrottle`). Accepted: per-pane fetch-on-mount is today's behaviour at 3; page size stays server-capped. Watch in browser-verify.
- **Scroll-handler fan-out:** N panes × capture-phase document listeners (today's pattern) is N handlers per scroll event; the windowed pane attaches to its own container only.
- **jsdom has no layout:** the window must converge with zero-height rects (reuse the reader's activeIdx/chase guards); the bounded-DOM test asserts counts, never pixels.
- **Spacer drift at 118k sections:** average-height spacers mis-estimate on long scrollbar drags; same chase-to-position mechanism as the reader. Accepted risk, watched in browser-verify.
- **4x4 cells are small** (~460×250px at 1080p); the reading measure centres rather than fits. User-chosen pane count; acceptable.
