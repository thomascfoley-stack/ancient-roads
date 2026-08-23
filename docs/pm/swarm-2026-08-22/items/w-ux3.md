# W-UX3 — Desk layout model (sub-design gated; core = grid + virtualization)

**Status:** DESIGN-FILED — 2026-08-23 (sub-design written, awaiting independent verifier design review per §8 before any build)

## Transitions

- CLAIMED → 2026-08-23 — workstream launched (DESIGN PHASE ONLY).
- DESIGN-FILED → 2026-08-23 — `docs/pm/swarm-2026-08-22/w-ux3/DESIGN.md` committed on
  `swarm/w-ux3-desk-grid` (base: origin/main `9dce273`). No product code written; RED/GREEN/
  AUDIT-GREEN/VERIFIED/MERGED all pending the verifier's design review.

## What this phase did

- Bootstrapped `/tmp/swarm-ux3` per §2.7 (worktree from `9dce273`, corpus assets + node_modules
  APFS-cloned, both env files copied after silent prod-token check: root clean, web clean — booleans only).
- Read the desk surface end to end: `web/src/lib/desk.ts` (pane model, `MAX_PANES = 3`, A078
  overflow reporting), `web/src/app/desk/page.tsx` (flex-row layout, cap notice), 
  `web/src/components/desk-pane.tsx` (`WorkPaneView` — keyset paging with UNBOUNDED section
  accumulation; all fetched sections render), `web/src/components/work-reader.tsx` +
  `web/src/lib/use-work-sections.ts` (the existing in-repo windowing idiom and the
  scroller-agnostic, tested keyset hook), `web/src/components/app-shell.tsx`/`sidebar.tsx`
  (left chrome), `web/src/app/api/work/[slug]/sections/route.ts` (server-capped pages),
  `web/package.json` (no virtualization dependency present).
- Confirmed the scale fact: `spurgeon-sermons` = 118,371 sections (WORKLOG:5817, MASTER.md UX-3).

## Key design decisions (see DESIGN.md for the full text)

- Cap lifted to **16 (4x4)**, not unbounded — the parser must stay bounded against hostile
  URLs; 16 is the owner's own stated shape (order 2026-08-02 §3).
- Grid via pure `deskGridShape(n)` in `desk.ts` + CSS grid in the page; stacked mobile layout unchanged.
- Virtualization WITHOUT a new dependency: adopt the tested `useWorkSectionPages` hook and
  adapt `work-reader.tsx`'s window idiom (spacers + BEHIND/AHEAD around the active section),
  keyed to the pane's own scroll container. Named trade: adaptation, not extraction, to keep
  the full reader out of the blast radius — the one open question for the verifier.
- Drag-resize and collapsible chrome explicitly NOT built (stretch per §8 size bound).

## Spend (A1)

$0. No embeddings, no eval runs, no paid API calls this phase (read-only code study + two
doc files). Cumulative workstream spend: $0 of $25.

## Pending

- Independent verifier design review (§8) — then RED-PROVEN (bounded-DOM test watched red on
  the current unbounded renderer), implementation, audit, verification, merge.
