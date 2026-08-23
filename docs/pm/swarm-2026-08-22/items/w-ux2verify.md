# W-UX2VERIFY — Browser-verify the UX-2 fix

**Branch:** `swarm/W-UX2VERIFY-ux2-browser-verify` · **Base:** `origin/main` = `9dce273ef09dffb03bc547cead0431f48fb71ffe`
**Worktree:** `/tmp/swarm-W-UX2VERIFY` · **Order:** `docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md` §6

## Transitions (§2.9)

- **CLAIMED** 2026-08-22 — worktree + branch created from the Wave-0 base sha; bootstrap per §2.7
  plus `web/node_modules` (both env files silently grepped clean: no `odd-fog`/`CUTOVER_`, dev
  host `ep-tiny-hat` only; booleans only, values never printed).
- **RED-PROVEN** 2026-08-22 — the check was watched fail with the defect seeded, twice:
  1. grep-level: `docs/evidence/swarm-2026-08-22/w-ux2verify/red-proof-transcript.txt`
     (explainer occurrences in rendered DOM: 0 → "CHECK FAILS (RED)").
  2. CDP harness: `docs/evidence/swarm-2026-08-22/w-ux2verify/cdp-red-transcript.txt`
     (`explainer present in DOM: FAIL` at both widths, exit 1).
  Seed in both cases: the one explainer `<span>` removed from
  `web/src/app/library/[catalog]/page.tsx:191`; restored with `git checkout --` immediately
  after. The seed was never committed.
- **FIXED** 2026-08-22 — no code fix was needed: the UX-2 change (`e196e4b`) is an ancestor of
  the base and renders correctly. "Fixed" for this item = the verification now exists and the
  false "NOT browser-verified" claim in MASTER.md's UX-2 row is corrected (§2.9 third-shape
  correction, in the doc where the reader meets it).
- **AUDIT-GREEN** — NOT REACHED, and not for this item's cause: the audit is red on one vitest
  leg that is red at pristine base `9dce273` (proven in a throwaway base worktree; owned by
  `swarm/w-basefix-thayers-guard`). Full account in the Audit section below. Every other leg
  green.
- **VERIFIED / MERGED** — left for Wave 7 (independent verifier) and Wave 8 (orchestrator).

## What was verified

UX-2 shipped at `e196e4b` typecheck-and-lint only (MASTER.md UX-2 row; WORKLOG 2026-08-07 NOT
DONE). This item browser-verified it: dev server (`next dev --turbopack`, port 3210, dev DB
`ep-tiny-hat` via `web/.env.local`) serving `/library/commentaries`, driven by real headless
Chrome over CDP (`scripts/ux2-verify.cdp.mjs`, zero new dependencies — Node 24 global WebSocket
+ system Chrome). Asserted at 1280px and 390px: explainer text present in the rendered DOM;
visible (non-zero box, not `display:none`/`visibility:hidden`); fully within the viewport width;
no horizontal page overflow; and above the first work row (`getBoundingClientRect` vs the first
`a[href^="/work/"]`). All PASS, exit 0:
`docs/evidence/swarm-2026-08-22/w-ux2verify/cdp-green-transcript.txt`.
Screenshots: `ux2-cdp-1280.png`, `ux2-cdp-390.png` (CDP, settled render),
`ux2-explainer-desktop-1280.png` (plain `--screenshot`).

**Artifact note:** `ux2-explainer-mobile-390.png` (plain `--screenshot` taken instantly at load)
shows the explainer's last word clipped at the right edge. The settled CDP measurement (4 s
after navigate, fonts loaded) shows the same text fully contained (right edge 339.5px in a 390px
viewport, `docScrollWidth == innerWidth`, PASS). The instant-screenshot clipping is a
pre-font-swap render artifact of `--screenshot`, not a layout defect — recorded here so the
file is not misread later.

## Reproduce (verifier)

```sh
cd <worktree>/web && PORT=3210 npm run dev &                 # needs web/.env.local (dev DB)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --remote-debugging-port=9222 \
  --user-data-dir=/tmp/ux2-chrome-profile about:blank &
node scripts/ux2-verify.cdp.mjs docs/evidence/swarm-2026-08-22/w-ux2verify   # exit 0 = pass
# red-proof: delete the explainer <span> at web/src/app/library/[catalog]/page.tsx:191,
# rerun -> exit 1 with FAIL lines; restore with git checkout --
```

## Files in this change

- `scripts/ux2-verify.cdp.mjs` — the check (new; call site is the reproduce recipe above and
  the Wave 7 verifier).
- `docs/evidence/swarm-2026-08-22/w-ux2verify/` — red/green transcripts, DOM dumps, screenshots.
- `docs/pm/MASTER.md` — UX-2 row: "NOT browser-verified" claim replaced with the verification
  record (falsehood correction per §2.9).
- `docs/pm/swarm-2026-08-22/items/w-ux2verify.md` — this file (A3).

## Spend (A1)

$0.00 — no embeddings, no DeepInfra, no paid API calls. Local Chrome + dev DB reads only.
Far under the $25 ceiling.

## Audit

`npm run audit` in `/tmp/swarm-W-UX2VERIFY`: **RED on exactly one leg — `tests + coverage —
vitest` — and that red is a PRE-EXISTING BASELINE DEFECT at `9dce273`, not this change.**
All other legs green (incl. the deploy.sh gate harness, 59/59, and Gate B license).

- Failure: `test/publish-flip-toolchain.test.ts:473` ("the SHIPPED CLI refuses at the same
  gate") asserts `docs/evidence/thayers-source-verification.md` does NOT exist; the file is
  tracked at base, committed in `abe5252` (Thayer's verification). 847 passed, 1 failed.
- Baseline proof: reproduced in a pristine throwaway worktree of `9dce273` with none of this
  branch's files — same failure (`npx vitest run test/publish-flip-toolchain.test.ts -t
  "SHIPPED CLI"`, 1 failed / 38 skipped). Worktree removed after the run.
- **Ownership:** a `swarm/w-basefix-thayers-guard` branch/worktree (`/tmp/swarm-basefix`,
  `156c5ff`) already exists — this baseline break is another workstream's item. Not touched
  here (§1.1: in-flight work; fixing the flip-gate test from a UX-verification lane would
  also be unscoped). Expectation: once the basefix merges in Wave 8, this leg is green; this
  branch carries no conflict with it.
- Not bootstrap-transient (deterministic tree-state at base), so no rerun applies. No leg was
  silently skipped; Gate B's "Published sources (DB): skipped (no DATABASE_URL)" line is the
  leg's own base behaviour, and it PASSED fail-closed.

**Item status: FIXED (verification delivered, red-proven) — audit gate held by the baseline
defect above; VERIFIED/MERGED left to Waves 7–8.**

## Adjacency / merge notes

- `swarm/W-SEC-CSRF-csrf-floor` touched 16 API route handlers; this change touches no route
  handler. Overlap surface: `docs/pm/MASTER.md` (W-T3 also edits it, different line — the dead
  ROADMAP pointer). Wave 8 orders the merges.
- The check script is dev-machine-specific (system Chrome path, localhost ports). It is an
  evidence/verification tool, not CI; no config/env added.
