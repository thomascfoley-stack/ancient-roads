# RED-PROOF — the no-storm test fails when the prefetch error guard is removed

**Date:** 2026-08-23 · **Workstream:** W-UX3 · **Phase:** red-proof of the new check (THE_LOOP rule 4; verdict condition 1)

## Seed

`web/src/components/desk-pane.tsx` `updateActive` — the guard that stops the prefetch branch
re-firing a failed `loadNext` on every scroll frame (the deep-audit HIGH storm in its windowed
shape):

```diff
-    if (!errorRef.current && activeIdx >= list.length - PREFETCH_AHEAD) loadNext();
+    if (activeIdx >= list.length - PREFETCH_AHEAD) loadNext(); // SEEDED DEFECT (red-proof)
```

## Result: RED — the storm returns

```
 FAIL  test/components/desk-pane-continuous-read.test.tsx > ... > a failed load-more keeps the read, shows Retry, and does NOT storm
AssertionError: expected 2 to be 1 // Object.is equality
      Tests  1 failed | 4 skipped (5)
```

With the guard removed, scroll frames after the error produce additional failing requests —
exactly the defect class the pin exists to keep out. Seed reverted immediately; re-watched green.
