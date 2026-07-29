# Reader Highlighter + Floating Popovers (polish)

A crisp, GitHub-grade highlighting and popover experience in the reader.

## Build split (important)
- **Overnight (Opus, unattended): the BACKEND + a functional UI.** Schema, API, sub-verse rendering, both color axes wired, floating popovers using a proper library. Working, not yet fine-tuned.
- **Morning (Thomas + Fable, supervised): the DESIGN fine-tuning.** The visual polish — spacing, motion, color-picker feel, the popover craft — is Thomas's Fable pass on the working feature. Fable is the design model; do the pixel-perfection there, with eyes on it.

So the overnight job makes it *work*; Thomas makes it *beautiful* in the morning.

## 1. Two ways to highlight (both open the same menu)
- **Tap/click a verse** → highlight menu, anchored to the verse (whole-verse highlight).
- **Drag-select text** (native selection, exactly like selecting to Cmd+C) → the *same* menu, anchored to the selection. **Native copy (Cmd+C) must still work.**

## 2. True sub-verse highlighting (backend)
- A drag-selection highlights the **exact selected characters**, not the whole verse. Tap-a-verse still does whole-verse.
- Extend `highlights` to store a character range within the verse (start/end offsets) **plus the translation it was made in**. Migration (DDL as owner, `GRANT ... app_runtime`), API, and rendering updated; rendering wraps the exact substring; whole-verse = full range.
- **Design decision to resolve BEFORE building (propose in WORKLOG):** offsets are relative to one translation's text, so switching translations breaks them. Recommended handling: store `translation_id`; render the sub-verse highlight only in that translation, and show a verse-level indicator (dot/underline) in other translations. Do not build until the approach is stated.

## 3. Two independent color axes (backend + UI)
- `highlights`: rename `color` → `highlight_color` (background) and add `text_color` (nullable = default). Migration + queries + API updated.
- The menu shows **two separate controls** — background swatches and text swatches — fully independent. Rendering applies both.

## 4. Floating popovers — GitHub-style, never clipped
- Both the highlight menu **and** the commentary popovers render in a **portal** with **collision-aware positioning** (Floating UI or Radix Popover): escape their container, flip/shift to stay on-screen, sit above everything (z-index), reposition or dismiss cleanly on scroll. Never buried in a window, never cut off, never lost on scroll — like GitHub's hovercards. Dismiss on outside-click / Escape.

## 5. Crisp interaction
Menu appears instantly on tap/select; works on both touch (the mobile study-sheet path) and mouse; no jank.

## Guardrails
Preserve existing highlight/note behavior; migration idempotent, DDL as owner + grant `app_runtime`; keep `npm run audit` green. This is independent of the retrieval/accuracy work — it touches the reader, not the teacher.
