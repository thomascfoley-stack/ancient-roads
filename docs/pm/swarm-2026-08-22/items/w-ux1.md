# W-UX1 — Bible reachable from the desk picker

**Workstream:** W-SEC-CURSOR (branch `swarm/W-SEC-CURSOR-sections-cursor`, base `origin/main` 9dce273)
**Status:** AUDIT-GREEN but for one pre-existing baseline red owned by swarm/w-basefix-thayers-guard (see Audit section) (transitions: CLAIMED → RED-PROVEN → FIXED → AUDIT-GREEN; VERIFIED/MERGED = Wave 7/8)
**A1 provider spend:** $0.00.

## Gap (as filed, MASTER.md UX-1)
The pane model already holds Scripture (`lib/desk.ts` kind:'scripture') and the desk's own
add controls already include a Bible button (5760eec, 2026-08-02) — the open gap was the
PICKER flow: the desk's "+" routes to `/library?desk=…`, which offered catalogs of works
only, so "I want the Bible beside this work" had no answer on that path.
Cost of not fixing: the desk's headline use case (Scripture beside a commentary) unreachable
from the desk's own add flow.

## RED
- Browser: `docs/evidence/swarm-2026-08-22/w-ux1/RED-library-desk-picker.png` —
  `/library?desk=work:josephus-whiston` shows works-only catalogs, no Bible entry, nothing
  saying a desk is being added to.
- Test: `docs/evidence/swarm-2026-08-22/w-ux1/RED-test.txt` — the new suite watched red
  (2 failed) against the unfixed hub.

## Fix (least code, existing machinery only)
- `web/src/components/desk-add-bible.tsx` (new, one client component): an "Adding to your
  desk" section with an "Add a Bible chapter" button that opens the EXISTING BookPicker in
  pick mode (the desk page's own idiom) and appends a `kind:'scripture'` pane via the
  EXISTING `decodeDesk`/`withPane`/`deskHref` — the carried-in desk is appended to, never
  replaced. No new pane type, no new data model, no new dependency.
- `web/src/app/library/page.tsx` — renders it only when `?desk=` is present (ordinary
  library visits unchanged; the alias-fallback invariant test scans the new
  BOOK_BY_BOOK_SLUG.get call site and it carries `?? resolveBookSlug(...)`).

## GREEN + browser-verify
- `web/test/library-desk-add-bible.test.tsx` (3 tests, real hub server component, query
  seams stubbed — the catalog-row-affordances harness): affordance present with `?desk=`,
  absent without it, and picking John 3 pushes
  `/desk?p=work%3Ajosephus-whiston&p=scripture%3Ajhn%2F3`. Red-proof: the RED above IS the
  seeded state (pre-fix code); the suite failed there and passes after.
- Browser: `docs/evidence/swarm-2026-08-22/w-ux1/GREEN-library-desk-picker.png` — the
  section renders at the top of `/library?desk=…` in real Chrome.

## Audit (2026-08-23, worktree /tmp/swarm-W-SEC-CURSOR)
`npm run audit` full log: docs/evidence/swarm-2026-08-22/audit-full-W-SEC-CURSOR.log.
Every leg green EXCEPT `tests + coverage — vitest`, which fails on exactly one test:
`test/publish-flip-toolchain.test.ts > thayers evidence gate` — a PRE-EXISTING BASELINE RED
at base 9dce273 (the evidence file it asserts absent, docs/evidence/thayers-source-verification.md,
is tracked at the base commit; verified via `git ls-files`), owned by the separate pushed
workstream `swarm/w-basefix-thayers-guard` ("repair stale thayers evidence-gate guard
(baseline audit red)"). Not caused by, and not fixed by, this branch (no opportunistic fixes).
One earlier failure of my own (web/test tsc on plan-day-toggle.test.tsx) was fixed and the
leg rerun green. NOT RUN inside the audit: `protected-branches-exist` (missing NEON_API_KEY —
declared loudly by the harness itself).
