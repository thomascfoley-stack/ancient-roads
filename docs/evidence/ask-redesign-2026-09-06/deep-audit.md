# Deep audit — pre-deploy sweep of `redesign/ask` (2026-09-06)

Six lenses, one parallel batch, read-only, non-overlapping: attack surface · data layer/SQL · AI
pipeline invariants · licensing/provenance · client/frontend · docs-vs-reality + deploy/ops.
Scope: the diff versus `origin/fix/ux-overnight-sweep` (live `602bd9e`) plus new files. Each agent
returned findings-only with file:line, a verified-clean list and a not-covered list.

**Reframing finding:** none of the six lenses found a CRITICAL or HIGH defect in the *code*. The one
CRITICAL was procedural — the work was uncommitted, and `deploy.sh` refuses a dirty tree — with two
HIGHs of the same kind (dev-server dirt in `web/next-env.d.ts`; test-residue logs in a tracked
evidence directory). Everything ship-blocking was process, not product.

## Fixed before deploy (from the sweep)

| # | Lens · severity | What | Where |
|---|---|---|---|
| 1 | data · MEDIUM | Ordinal lookup sat serially on the ask path (the lanes it was awaited with had already settled). Now awaited only where the rows ship, overlapping compose+verify. | `web/src/lib/teacher/teach.ts` |
| 2 | attack · MEDIUM | Unbounded `retryAfterSec`/`Retry-After` could arm a timer past 2^31 ms → immediate-fire loop in the reader's tab. Finite, >0, clamped to 86 400 s. | `web/src/components/ask-client.tsx` |
| 3 | client · MEDIUM | Ask and Stop share a button slot; a double-click's second click landed on Stop. Stop ignored for 300 ms after submit. | `ask-client.tsx` (+ `ask-stop.test.tsx` waits past the guard) |
| 4 | client · MEDIUM | Scope-row OFF state 2.25:1 (stone-400) on 12px text. Now stone-500 / dark stone-400 (5.7:1). | `web/src/components/ask-scope-row.tsx` |
| 5 | client · MEDIUM | Mask arithmetic assumed a 1px form border the box now owns → 1px live slot under the composer. Form carries a 1px transparent bottom border (inline; `.edge` beats any utility). | `web/src/components/ask-composer.tsx` |
| 6 | client · MEDIUM | Reader's fixed Continue chip covered the bottom-sticky return strip at 390px. Chip lifts 44px when `?from=` is present. | `web/src/app/work/[slug]/page.tsx` |
| 7 | AI · LOW | `attachSectionOrdinals`'s guard covered only the query; a malformed row could reject the promise. Whole body guarded — the promise never rejects. | `web/src/lib/teacher/section-locate.ts` |
| 8 | attack · LOW | `sessionStorage` throws when storage is blocked (Safari); unguarded on a URL-triggered effect. try/catch both ways. | `web/src/components/history-context-bar.tsx` |
| 9 | attack · LOW | Slug interpolated raw into `/work/${slug}`. `encodeURIComponent`, matching the reader's own fetch. | `web/src/components/ask-answer.tsx` |
| 10 | attack · LOW | `thread` event id relabelled the URL unchecked. `isThreadId` guard. | `ask-client.tsx` |
| 11 | client · LOW | 429 retry timer measured from a stale mount-time `now`. Wall clock. | `ask-client.tsx` |
| 12 | client · LOW | Keyboard hint and mobile price caption could concatenate on a narrow hover-pointer window. Caption hidden wherever the hint shows. | `ask-composer.tsx` |
| 13 | ops · HIGH | `web/next-env.d.ts` rewritten by `next dev` (build path → dev path); would have failed the second clean-tree check after the full build. Restored before commit. | — |
| 14 | ops · HIGH | Four `flip-run-*.log` residue files from `npm run audit`. Deleted before commit; the test that writes them is filed. | `docs/evidence/work-order-v2-stage2/` |
| 15 | ops · HIGH | ADR-121 asserted "browser screenshots" that did not exist. Corrected to what is in the tree, and screenshots of the reachable surfaces captured. | `docs/DECISIONS.md`, this directory |
| 16 | ops · MEDIUM | `green-run.log` was not green (2 test-side failures fixed after it). Renamed `first-run-after-fix.log`; `audit-run-2.log` is the green. | this directory |
| 17 | ops · MEDIUM | The strip's sticky-bottom placement post-dated the ADR. ADR amended. | `docs/DECISIONS.md` |

## Filed, not fixed (owner-visible; none blocks this deploy)

- **Stop stops waiting only** — the route ignores `req.signal`; a Stop then "Ask again" writes the
  question twice server-side. (AI · LOW, attack · LOW) → UX_REMEDIATION backlog.
- **`locateSections` carries the published filter but not the forbidden-provenance belt** its
  body-serving sibling has; a dirty row in a mixed-provenance work resolves to an ordinal the reader
  then refuses — a dead link, never a leak. (licensing · LOW)
- **served ⇔ published lockstep** has no db-invariant; a served-but-quarantined row could mint a link
  that 404s at the reader. Pre-existing, one more consumer. (licensing · LOW)
- **Newest turns of a >33-turn all-classic thread lose links** past `LOCATE_SECTIONS_MAX`; ordinals
  for old threads re-resolved on every open. (data · MEDIUM/LOW) → backlog.
- **`work-locate-sections-db.test.ts` never runs in CI** (outside the db-invariants globs). (data · MEDIUM) → backlog.
- `fq` (the question) rides `/work/…` URLs and therefore history and request logs; not sent to
  PostHog (sanitiser strips it). (attack · LOW)
- `#s<n>` accepts any digit run; an unreachable ordinal suppresses persistence for that visit
  (pre-existing shape, F24 extends it). (attack · LOW)
- Scope row scrolls sideways at 390 with no visible affordance; the last toggle is off-screen until
  scrolled. (client · LOW) — accepted for now; the alternative stacked three 40px rows under the box.
- `stageMs.lanes` no longer includes the locate wait (moved) — D4 re-measurements are unaffected.
- Eight of the plumbing agent's tests have their red output only in its report (transcribed into
  `findings.md`), not in a log file. (ops · MEDIUM)
- `.small-caps` still dead on `studies/page.tsx` / `plans-client.tsx`. → backlog.

## Coverage

**Audited:** every file in the diff; the SQL and every migration touching `sections` /
`section_anchors` / `sources.status`; the teach pipeline's read of retrieval metadata end to end;
all three tombstone branches; the reader's published belt; the sync guards; the deploy script's
gates against this tree; the lockfile change; the ADR's claims.

**Not covered:** no query was executed against any database by the auditors (the branch's own DB
test ran against dev, 2 cases, not skipped); no `EXPLAIN` on the locate query; production
`app_runtime` grants inferred from the migration ledger; `next build` had not run in this worktree
at audit time (it runs inside `deploy.sh`); CI has not run on this branch; no auditor rendered a
browser — the strip/chip geometry and the composer mask were reasoned from CSS and then measured by
DOM on the dev server by the implementing session only; the signed-in `/ask` composer, running and
answer states were exercised in jsdom only (owner-only surface, no owner session on the pane).
