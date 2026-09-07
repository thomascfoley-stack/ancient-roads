# /ask redesign — findings and test re-points (2026-09-06)

Branch `redesign/ask`, base = union of `origin/fix/ux-overnight-sweep` (live `602bd9e`) and `origin/main`.
Owner decisions (in session, 2026-09-06): result click → full reader at the exact section with a
return strip; lane chips → inside the composer; History invitation → hairline row; composer
treatment → **Option 3 "Field first"** ("ok go with #3 for me").

## Test re-points caused by the file split — recorded BEFORE the edits (precedent: C-2, 2026-08-16)

`ask-client.tsx` (1,130 lines) splits into `ask-types.ts`, `ask-answer.tsx`, `ask-progress.tsx`,
`ask-scope-row.tsx`, `ask-composer.tsx`, `ask-empty-state.tsx`, with `ask-client.tsx` keeping the
state machine and re-exporting `InitialThread` and `SLOW_ANSWER_NOTICE_MS`. Three source-reading
tests name `ask-client.tsx` as the file holding a property that now lives in a sibling. Each is
re-pointed to the NAMED successor file — never a glob — with every assertion byte-identical:

| test | what it reads | now reads |
|---|---|---|
| `test/invariants/ask-composer-mask.test.ts` | the sticky `<form className="edge sticky …">` string | `ask-composer.tsx` |
| same | the `-mx-2.5` `ResultLink` overhang | `ask-answer.tsx` |
| `test/invariants/s2-polish.test.ts` item 3 | `aria-pressed` present; no `type="checkbox"`; no forms-plugin idiom | positive on `ask-scope-row.tsx`; both negatives over `ask-scope-row.tsx` AND `ask-client.tsx` |
| `test/invariants/naming-lock.test.ts` | the literal `collections` (the scope group's accessible name) | `ask-scope-row.tsx`; every new `ask-*.tsx` joins `LABEL_FILES` |

Why this is not loosening: no assertion changes, the file set stays a named file (a glob would let
any sticky form anywhere satisfy the check), the anti-vacuity legs stay, and each re-point is
red-proofed after the move (seed `after:h-4` into `ask-composer.tsx` → mask test red; delete
`-mx-2.5` from `ask-answer.tsx` → red; restore).

## Red seeds added (genuinely red on the current tree)

- `naming-lock.test.ts` RETIRED gains `from the Gospels` — the subtitle claims "Currently answering
  from the Gospels"; the corpus is 65 books (`docs/LONG_NIGHT.md:247`).
- `mode-toggle-pending.test.tsx` gains a source leg: no bare `rounded` (paints real corners; the
  radius ladder is zeroed — PRD §3).

## New tests (each seen red before its code)

**Client (this session):** `test/components/ask-running-signal.test.tsx` · `ask-stop.test.tsx` ·
`ask-rate-limited.test.tsx` · `ask-scope-row.test.tsx` · `test/invariants/ask-result-link.test.tsx`
— red in `red-run.log` (10 failures across 7 files against the unchanged code, incl. the two seeds),
green in `audit-run-2.log`. `first-run-after-fix.log` is the first run after the split: 84/86, the
two failures being test-side (a mount-time GET counted as a POST; the `rounded` guard reading the
word out of a comment) — both corrected in the tests, not the code.

**Plumbing (the background agent, transcribed from its report — its own run, not a log file):**
`source-ordinal`, `thread-id`, `thread-restore`: `Cannot find module '@/lib/source-ordinal'` /
`Failed to resolve import "@/components/thread-restore"` → green. `work-locate-sections` (4):
`TypeError: locateSections is not a function` → green. `teach-section-ordinal` (3): `expected
undefined to be 1234` / `expected undefined to be 9` → green. `history-context-bar-query` (+7):
`Unable to find an accessible element with the role "link"` → green (11/11).
`work-landing-client-nav` (F24's own red-proof, byte-identical to `83bcabc`): `expected null to be
171` against main's version of the page → green after the port. `work-landing-account-sync`:
`expected [{…}] to have a length of +0 but got 1` → green. `work-locate-sections-db` executed
against dev (`ep-tiny-hat`), 2 cases, not skipped.

**Post-move red-proofs of the re-pointed mask assertions:** `red-proof-repoints.log`. Seeding
`md:after:h-1` into `ask-composer.tsx` turned the desktop-mask leg red. Deleting `-mx-2.5` from
`ask-answer.tsx` did NOT — the scan matched a comment in the same file that names the class, so the
re-pointed check could not fail (the original had the same hole: `ask-client.tsx`'s own comment
named `-mx-2.5`). The check now strips comments before matching; the second attempt went red and
green again on restore. One re-point therefore did change an assertion — by tightening it — and it
is recorded here for that reason.

## Rulings amended by this work (to be filed in `docs/DECISIONS.md` with the code)

Design C placement (band → composer footnote line, caption "applies to your next ask", no number);
ruling 4 (raised-paper block → hairline row); L1 "do not touch the staged progress sequence"
(active step colour tier + an additive `.progress-travel` bar; the sequence itself unchanged).
