# GREEN — desk grid + windowed panes, all legs

**Date:** 2026-08-23 · **Workstream:** W-UX3 · **Phase:** green (after RED transcripts, per verdict condition 5)
**Commit under test:** the W-UX3 implementation on `swarm/w-ux3-desk-grid` (src: desk.ts, desk/page.tsx, desk-pane.tsx, work-reader.tsx comment, sidebar.tsx comment)

## 1. Desk suite — 103/103 green

```
cd /tmp/swarm-ux3/web && npx vitest run test/desk-grid.test.ts test/desk-panes.test.ts \
  test/desk-cap-overflow.test.ts test/components/desk-cap-notice.test.tsx \
  test/components/desk-nav-and-session-note.test.tsx \
  test/components/desk-pane-continuous-read.test.tsx test/components/desk-pane-windowed.test.tsx \
  test/components/desk-stacked-pane-position.test.tsx \
  test/components/desk-empty-cta-adds-scripture.test.tsx test/components/desk-pane-loading.test.tsx

 Test Files  10 passed (10)
      Tests  103 passed (103)
```

The seven files that were RED on the unmodified desk (40 failed) are green; the three
pre-existing pins (stacked-pane-position, empty-cta, pane-loading) never moved.

Stability: desk-pane-windowed + desk-pane-continuous-read re-run 5 consecutive times — 6/6
green each run (the windowed test's fetch-count assertion is a documented BAND, not an exact
count: the hook dedupes data but not requests across a same-tick prefetch race, same shape as
the full reader; exact-count no-storm pins live in the continuous-read file).

## 2. Full web suite — 1638 passed, 0 failed

```
cd /tmp/swarm-ux3/web && npx vitest run
 Test Files  254 passed | 20 skipped (274)
      Tests  1638 passed | 128 skipped (1766)
```

## 3. Red-proofs (seeded defects, each reverted and re-watched green)

- `RED-PROOF-window-bypassed.md` — `visible = sections` → `expected 250 to be less than or equal to 24`. FIRES.
- `RED-PROOF-prefetch-error-guard.md` — error guard removed from the prefetch branch → storm leg `expected 2 to be 1`. FIRES.
- `RED-PROOF-grid-shape.md` — `deskGridShape` cols cap 4→3 → shape table + rows bound fail. FIRES.

## 4. Typecheck + lint

`npx tsc --noEmit` (web), `npx tsc --noEmit -p tsconfig.test.json`, `npx eslint --quiet` over all
touched files — clean.

## 5. Browser-verify (real Chrome, CDP, dev DB serving spurgeon-sermons — 118,371 sections)

Dev server `next dev :3930` against the worktree (dev DB), captures via
`scripts/capture-evidence.mjs` (viewport asserted):

- `desk-pane-spurgeon-bounded-1280x800.png` — the eval scrolled a spurgeon pane to its bottom
  30 times, throwing if mounted `article[id^="s"]` ever exceeded 24. **No throw.**
  In-screenshot banner: `max mounted articles over 30 full-scroll rounds = 24 (bound 24) · pane
  scrollHeight = 471353px` — 471,353 CSS px of streamed sermon (≈ hundreds of sections deep)
  with the mount count pinned at the window. The screenshot shows real sermon text
  ("Sermon 44. Repentance Unto Life"), so the visible window tracks the scroll.
- `desk-grid-5-pane-1280-1280x800.png` — five panes (Scripture + 4 works) render the
  `deskGridShape(5)` = 3x2 grid: three cells top row, two panes + the add-controls cell below.
  The desk grows top-to-bottom as well as left-to-right; every pane scrolls independently.
- `desk-stacked-390-390x844.png` — mobile unchanged: single-column stack with the A079
  per-pane counter ("Pane 1 of 2 — scroll down for the next").

## Operational note (not a product defect)

The first capture session wedged because the dev server was started with its stdout piped to
`head -30`; restarted with `nohup … > logfile`, after which all captures ran clean. The pre-wedge
bounded capture had already passed (24/24) and was re-run afterwards for a better screenshot.
