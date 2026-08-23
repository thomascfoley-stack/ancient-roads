# RED — cap 3→16, deskGridShape, grid page, re-expressed continuous-read

**Date:** 2026-08-23 · **Workstream:** W-UX3 · **Phase:** red-before-green (THE_LOOP rule 4)
**Code under test:** UNMODIFIED desk source @ 104d43c (`MAX_PANES = 3`, no `deskGridShape`,
flex-row layout, sentinel-button pane)

## Command

```
cd /tmp/swarm-ux3/web && npx vitest run test/desk-grid.test.ts test/desk-panes.test.ts \
  test/desk-cap-overflow.test.ts test/components/desk-cap-notice.test.tsx \
  test/components/desk-nav-and-session-note.test.tsx \
  test/components/desk-pane-continuous-read.test.tsx
```

## Result: RED across every new pin (40 failed / 49 passed for the seven-file batch)

- `test/desk-grid.test.ts` — ALL 19 cases fail: `deskGridShape` does not exist and
  `MAX_PANES` is 3, not 16 (`AssertionError: expected 3 to be 16` plus import/TypeError on the
  missing export).
- `test/desk-panes.test.ts` — the new-ceiling cases fail: `decodeDesk` of 20 entries returns 3,
  not 16; the 16-pane eviction case fails; dedupe-before-truncate at the new ceiling fails.
- `test/desk-cap-overflow.test.ts` — 6 cases fail: a 16-pane URL reports overflow 13, not 0;
  the 17/19-pane counts are all wrong under the old cap.
- `test/components/desk-cap-notice.test.tsx` — 6 cases fail: a 16-pane URL renders 3 regions,
  the full-desk notice says "3", the remedy href carries 2 panes, not 15.
- `test/components/desk-nav-and-session-note.test.tsx` — the full-desk case fails (3 panes is
  not a full desk under the new ceiling, so no status line exists).
- `test/components/desk-pane-continuous-read.test.tsx` — all 5 re-expressed cases fail: the
  pre-UX-3 pane exposes no `[data-pane-scroll]` container and has no window prefetch trigger
  (`AssertionError: the pane must expose its own scroll container: expected null not to be null`).

Every failure is on the thing being changed and nothing else — the 49 passes are the pins the
build must NOT break (under-cap silence, malformed/duplicate exclusion, mobile counter, nav
entries, loading-state truthfulness).

## Suite summary

```
 Test Files  7 failed (7)
      Tests  40 failed | 49 passed (89)
```
