# W-UX2VERIFY — VERIFIED (2026-08-23)

- Surface: `/library/historians` on `next dev` (worktree swarm/W-SEC-CURSOR-sections-cursor,
  dev DB ep-tiny-hat), driven by real Google Chrome (headless=new), 1280x1000.
- The UX-2 line "Tap a work to read it, or + to open it beside what is on your desk."
  (web/src/app/library/[catalog]/page.tsx:191, shipped e196e4b) renders visibly ABOVE the work
  list, beside the item count. Screenshot: library-historians-ux2.png (full page + the crop
  read-back at native resolution confirms the exact string).
- The catalog needed no extra fixtures: 1 published historian on dev (josephus-whiston).
- Method note: Chrome headless screenshot, no new dependencies; the same server also served
  the W-SEC-CURSOR transcripts.
