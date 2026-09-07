# Rail row marks + custom sections hidden — evidence (2026-09-07, ADR-124)

Branch `fix/rail-row-marks`. Owner ruling verbatim in ADR-124.

## What was seen RED before the fix (THE_LOOP rule 4)

`web/test/components/sidebar-row-marks.test.tsx`, 7 legs, run against the pre-ruling rail:

- Leg 1 (prayer rows carry no glyph) — RED: `expected 3 to be +0`.
- Leg 2 (prayer rows carry no date) — **first draft was GREEN for a bad reason**: `textContent`
  joins label and date with no space ("…TuesdaySun 6"), and my `\b` between two letters never
  matched. Corrected (no leading `\b`), re-run: RED. Recorded because an exit test that cannot
  go red proves nothing.
- Leg 4 (research/works/plans rows carry no glyph or uniform dot) — RED: `research: expected 1 to be +0`.
- Leg 5 (legacy sections hidden, storage untouched) — RED: `MY SERMONS` rendered.
- Legs 3, 6, 7 — positive controls (studies keep their colour dot; a work's indexing status still
  shows; every row keeps its 16px leading slot) — GREEN before and after, as intended.

After the fix: 7/7. `pr1c-prayer-surface.test.ts` leg 3 went RED for the right reason (the
`href="/prayers"` it pinned belonged to the rows now hidden) and was RE-POINTED under the ruling —
not edited to pass — to "no `StudySectionView`, no `removeItem(`, and the carry-forward still owns
the key string". Sibling sidebar suites (groups, collapse-label, tablet-default, writing-rail):
green, 24 tests.

**Caught by CI, missed locally (PR #240, run 34108920817, both jobs):** `n4-fake-doors.test.ts`
pinned the same `href="/prayers"` literal. I had run a hand-picked set of sidebar-named suites
rather than the whole gate — a selection is not the gate. Re-pointed to the N4 block's own two
allowed states ("the shipped journal, or hidden"): the Prayer journal group still reaches
`'/prayers'` AND no `StudySectionView`. The FULL web suite was then run locally before re-pushing;
its result is in the WORKLOG entry.

## Gate

`tsc --noEmit` exit 0 · `eslint` on the three touched files exit 0 · nothing of the retired
feature left in `sidebar.tsx` except the pointer comment · every remaining helper has a use
beyond its definition.

## Browser leg (Definition of Done)

The groups are signed-in only and sign-in is owner-only, so — as for Sidebar C — the signed-in
states are **composites**: the REAL component's markup from the render harness
(`sidebar-groups-render.snapshot.test.tsx`, `render/*.html`) wrapped in the app's compiled
stylesheet fetched from the dev server, screenshotted with headless Chrome. Faithful markup and
CSS, no live session. Looked at, not just produced:

- `composite-rail-studies-dark.png` — studies + prayers open: one glyph per header; prayer rows
  are plain text with no date; studies keep their per-study colour dot; rows nest under the
  header label; nothing rendered below Reading plans.
- `composite-rail-ask-dark.png` — research open: no uniform dots, capped at 3, `More research · 2`,
  per-row delete `×`.
- `composite-rail-studies-light.png`, `composite-sheet-ask-dark.png` — light rail and the mobile
  sheet, same markup.

Live, signed out, in the Browser pane against the dev server: `/library` at 1280 and at 375 —
no horizontal overflow (`scrollWidth === clientWidth`), the Menu sheet opens with 44px rows and
`MY SERMONS` / `JOURNALS` appear nowhere in the document. Console: only the dev-mode HMR socket
and the pane's own `eval()` CSP notice, identical to every earlier check. Captures:
`live-library-signed-out-1440.png`, `live-library-signed-out-390.png`.

**What this does NOT prove:** the owner's real data on the owner's browser. The composites use
fixture rows. The owner is the only one who can look at the live signed-in rail; the storage-key
preservation (leg 5) is what makes that look safe to take.
