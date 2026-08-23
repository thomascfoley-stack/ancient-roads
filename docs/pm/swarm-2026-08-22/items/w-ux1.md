# W-UX1 — Bible reachable from the desk picker

Workstream: W-UX1 · Branch: `swarm/W-UX1-ux1-desk-bible` · Base: `9dce273` (origin/main)

## Status: ALREADY-DONE (2026-08-23, per §2.6 — the defect was fixed before this run)

Transitions: CLAIMED → ALREADY-DONE. No code written: the brief's precondition ("the gap is only
the picker") was false at base — the picker gap closed 2026-08-02. Building a second Bible
affordance would duplicate existing machinery (least-code rule).

## Evidence the capability exists end-to-end

- **The fix:** commit `5760eec` (2026-08-02, "Desk panes navigate themselves; the Bible can be
  added"). BookPicker gained a pick mode (`onPick(book, chapter)`); `web/src/app/desk/page.tsx`
  uses the EXISTING `kind:'scripture'` machinery — `withPane(panes, { kind:'scripture', book,
  chapter })` → `router.replace(deskHref(...))`, no navigation, no new pane type, no new data
  model. Two affordances: the populated desk's add rail carries an "Add a Bible chapter" button
  (book icon) beside `+`; the empty desk has "Open the Bible".
- **Guards green:** `docs/evidence/swarm-2026-08-22/w-ux1/guard-tests-green.log` —
  `desk-empty-cta-adds-scripture.test.tsx` (drives the whole pick path, asserts the desk URL),
  `desk-cap-notice.test.tsx` (asserts the Bible button's presence under the cap, absence at it),
  `desk-panes.test.ts`, `desk-cap-overflow.test.ts` — 59/59 pass.
- **Browser re-verified** (per W-UX2VERIFY's method; dev server from this worktree, system
  Chrome via Playwright CLI): `desk-empty-open-bible.png` (the "Open the Bible" CTA),
  `desk-populated-add-bible.png` (work pane + the add rail with `+` and the Bible button).

## Discovered falsehood fixed in place (§2.9)

`docs/pm/MASTER.md` UX-1 row still read as an open "picker gap … Much cheaper than filed".
Corrected in that row to CLOSED with the `5760eec` lineage, the guard files, and the evidence
path. (Separate W-T3 note: the ROADMAP pointer the order called dead is live — see w-t3.md.)

## Note for the verifier

No test drives the POPULATED desk's Bible button through to the URL (the empty-state path is
driven; `desk-cap-notice` asserts presence only). Both call the same `addScripture`; recorded
here, not changed — ALREADY-DONE means no change.

## Provider spend (A1)

$0.00 — no embeddings/LLM calls; vitest + dev-server screenshots only.
