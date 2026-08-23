# RED-PROOF — the grid-shape test fails when the 4x4 cap is lowered

**Date:** 2026-08-23 · **Workstream:** W-UX3 · **Phase:** red-proof of the new check (THE_LOOP rule 4)

## Seed

`web/src/lib/desk.ts` `deskGridShape`:

```diff
-  const cols = Math.min(Math.ceil(Math.sqrt(n)), 4);
+  const cols = Math.min(Math.ceil(Math.sqrt(n)), 3); // SEEDED DEFECT (red-proof)
```

## Result: RED — the shape table and the 4x4 bound both catch it

```
 → expected { cols: 3, rows: 4 } to deeply equal { cols: 4, rows: 3 }   (10, 11, 12 panes)
 → expected { cols: 3, rows: 5 } to deeply equal { cols: 4, rows: 4 }   (13, 14, 15 panes)
 → expected { cols: 3, rows: 6 } to deeply equal { cols: 4, rows: 4 }   (16 panes)
 → expected 6 to be less than or equal to 4                              (rows bound)
```

Seed reverted immediately; re-watched green.
