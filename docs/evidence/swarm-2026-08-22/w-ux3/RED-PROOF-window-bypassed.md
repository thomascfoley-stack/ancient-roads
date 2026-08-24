# RED-PROOF — the bounded-DOM test fails when the window is bypassed

**Date:** 2026-08-23 · **Workstream:** W-UX3 · **Phase:** red-proof of the new check (THE_LOOP rule 4; verdict condition 5)

## Seed

`web/src/components/desk-pane.tsx` — the one-line defect the test exists to catch:

```diff
-  const visible = sections.slice(win.start, win.end);
+  const visible = sections; // SEEDED DEFECT (red-proof): window bypassed
```

## Result: RED on the exact assertion

```
 FAIL  test/components/desk-pane-windowed.test.tsx > a desk work pane at 250-section scale > mounts at most one render window of sections, however many pages stream in
AssertionError: expected 250 to be less than or equal to 24
      Tests  1 failed (1)
```

Seed reverted immediately after the run; the suite was re-watched green (25/25 across
desk-pane-windowed, desk-pane-continuous-read, desk-grid, five consecutive runs).
