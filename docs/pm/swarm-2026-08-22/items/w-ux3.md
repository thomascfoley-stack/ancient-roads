# W-UX3 — Desk layout model (sub-design gated; core = grid + virtualization)

**Status:** FIXED (design approved with conditions; built; red-proofs + full web suite green; audit green except the W-BASEFIX-owned thayers baseline red — proven baseline at 9dce273; awaiting Wave 7 verification)

## Transitions

- CLAIMED → 2026-08-23 — workstream launched (DESIGN PHASE ONLY).
- DESIGN-FILED → 2026-08-23 — `docs/pm/swarm-2026-08-22/w-ux3/DESIGN.md` @ 104d43c.
- DESIGN-APPROVED-WITH-CONDITIONS → 2026-08-23 — verdict
  `docs/pm/swarm-2026-08-22/verdicts/w-ux3-design.md`: 5 conditions (1: re-express
  desk-pane-continuous-read pins, don't delete; 2: cross-ref comments both directions; 3: sweep
  ALL stale "three panes" language; 4: design-doc path slip; 5: red transcripts before green +
  exact ≤24 mounted `article[id^="s"]` bound). All five folded in.
- RED-PROVEN → 2026-08-23 @ 1dd4213 — seven test files pinned, watched RED on the unmodified
  desk (40 failed / 49 passed; headline `expected 250 to be less than or equal to 24`),
  transcripts committed BEFORE any product code (condition 5).
- FIXED → 2026-08-23 @ e7dbe20 — implementation + GREEN evidence committed. AUDIT-GREEN /
  VERIFIED / MERGED pending (Wave 7 verifier + Wave 8 integration).

## What was built

- `web/src/lib/desk.ts` — `MAX_PANES` 3→16 (the owner's stated 4x4; parser stays bounded against
  hostile `?p=` URLs); new pure `deskGridShape(n) → {cols, rows}`; stale "three panes" language
  swept (header, DeskDecodeReport A078 comment, decodeDeskReport doc, withPane doc).
- `web/src/app/desk/page.tsx` — panes flex-row → CSS grid driven by `deskGridShape` via static
  `lg:grid-cols/rows-N` lookups (Tailwind can't see computed classes); add controls take the
  next grid cell; empty-state copy matches the grid; mobile stack untouched.
- `web/src/components/desk-pane.tsx` — `WorkPaneView` rebuilt on the tested
  `useWorkSectionPages` hook (keyset fwd/back, in-flight dedupe) + an ADAPTED COPY of
  `work-reader.tsx`'s render window: 8 behind / 16 ahead ≈ ≤24 mounted sections whatever the
  work's size, keyed to the pane's OWN scroll container (`data-pane-scroll`, replacing
  capture-phase document listeners). Prefetch branch guarded on error (no-storm); spacers keep
  the scrollbar honest; "Read more" survives as the keyboard fallback; "↑ Earlier" prepends
  after a mid-work jump.
- `web/src/components/work-reader.tsx` — cross-reference comment naming desk-pane.tsx as the
  adapted sibling (condition 2, both directions).
- `web/src/components/sidebar.tsx` — DeskIcon comment updated (glyph deliberately unchanged).
- Tests: new `web/test/desk-grid.test.ts` (shape table + 4x4 bound + literal 16 pin), new
  `web/test/components/desk-pane-windowed.test.tsx` (bounded-DOM at 250-section scale);
  `desk-pane-continuous-read.test.tsx` RE-EXPRESSED against the windowed mechanism (proximity
  prefetch via active-section position, failure keeps the read, no storm, manual fallback —
  condition 1); cap arithmetic updated in `desk-panes`, `desk-cap-overflow`, `desk-cap-notice`,
  `desk-nav-and-session-note`.

## Evidence (docs/evidence/swarm-2026-08-22/w-ux3/)

- RED: `RED-desk-pane-windowed.md`, `RED-cap-grid-and-continuous-read.md` (pre-committed 1dd4213).
- Red-proofs (seeded, fired, reverted, re-watched green): `RED-PROOF-window-bypassed.md`
  (250 mounted > 24), `RED-PROOF-prefetch-error-guard.md` (storm returns, 2≠1),
  `RED-PROOF-grid-shape.md` (shape table fails).
- GREEN: `GREEN.md` — desk suite 103/103; full web suite 1638 passed / 0 failed; typecheck +
  lint clean; windowed+continuous files 5× consecutive green.
- Browser-verify (real Chrome via `scripts/capture-evidence.mjs`, dev DB serving
  spurgeon-sermons): `desk-pane-spurgeon-bounded-1280x800.png` — 30 full-scroll rounds,
  471,353px streamed, max 24 mounted articles, bound never exceeded;
  `desk-grid-5-pane-1280-1280x800.png` — five panes in the 3x2 grid;
  `desk-stacked-390-390x844.png` — mobile stack + A079 counter unchanged.

## Not built (stretch, per §8 size bound — for the owner packet)

Drag-resize / user pane sizing; collapsible left chrome. Also not built: pane reordering,
layout persistence beyond the URL, any change to `/work/[slug]`, the sections API, or
dependencies (none added).

## Spend (A1)

$0. No embeddings, no eval runs, no paid API calls in either phase (code study, vitest, local
dev server, local Chrome captures). Cumulative workstream spend: $0 of $25.

## Operational notes

- **Audit: all legs green EXCEPT the known thayers baseline red.** `npm run audit` in the
  worktree: every gate passes except `tests + coverage — vitest`, whose single failure is
  `test/publish-flip-toolchain.test.ts > thayers evidence gate > the SHIPPED CLI refuses at
  the same gate` (1 failed / 847 passed). Verified BASELINE, not caused by this change: the
  same file fails identically (1 failed / 38 passed) in a detached scratch worktree at the
  pristine base `9dce273` (run, then the scratch worktree was removed). Owned by W-BASEFIX
  (`swarm/w-basefix-thayers-guard`) — not fixed here, per the build brief. Everything else in
  the audit — typechecks, lints, knip, web suite, deploy.sh gate harness, Gate B license —
  green. Per §2.8 this is reported, not called green.
- First browser-capture session wedged: dev server had been started with stdout piped to
  `head -30`; restarted with `nohup > logfile` and all captures ran clean. The pre-wedge bounded
  capture had already passed (24/24) and was re-run for a better screenshot.
- Dev-server artifact `web/next-env.d.ts` (`.next/types` → `.next/dev/types`) reverted, not
  committed.
