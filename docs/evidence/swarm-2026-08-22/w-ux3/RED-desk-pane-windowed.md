# RED — desk-pane-windowed (bounded DOM at spurgeon scale)

**Date:** 2026-08-23 · **Workstream:** W-UX3 · **Phase:** red-before-green (THE_LOOP rule 4; verdict condition 5)
**Code under test:** UNMODIFIED `web/src/components/desk-pane.tsx` @ 104d43c (the append-forever renderer)

## Command

```
cd /tmp/swarm-ux3/web && npx vitest run test/components/desk-pane-windowed.test.tsx
```

(run as part of the seven-file red batch: desk-grid, desk-panes, desk-cap-overflow,
desk-cap-notice, desk-nav-and-session-note, desk-pane-continuous-read, desk-pane-windowed)

## Result: RED, on the exact defect

```
 FAIL  test/components/desk-pane-windowed.test.tsx > a desk work pane at 250-section scale > mounts at most one render window of sections, however many pages stream in
AssertionError: expected 250 to be less than or equal to 24
 ❯ test/components/desk-pane-windowed.test.tsx:84:28
```

The fixture serves 250 sections in 25-section keyset pages. The current pane auto-loads every
page (the sentinel's zeroed jsdom rect reads "always near") and mounts ALL 250 sections —
node count scales with sections loaded, exactly the unbounded-DOM defect MASTER.md UX-3 warns
about at 118,371 sections. The new contract (≤ 24 mounted `article[id^="s"]`, the 8+16 render
window) fails against it, as required before the fix is written.

## Suite summary of the same run

```
 Test Files  7 failed (7)
      Tests  40 failed | 49 passed (89)
```
