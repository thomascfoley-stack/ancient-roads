# Order — prove the structural partition before the 314 flip (2026-09-07, owner via Claude relay)

Worktree ~/Projects/ap-ingest. Explicit pathspecs; `Model:` trailer. Small job — one
validation, one commit. Do not start another remediation wave.

## Why

The 314-work flippable set rests on "this source item maps 1:1 to one work by one author."
What is committed for it is a bare list of 24 slugs with no derivation record, and the
list's shape reads as slug/title-pattern classification. If that is what it is, it is a
third heuristic with the same open-class failure mode that cost two detector rounds. The
argument for switching off the detector was provability — so prove it.

## 1. Write the rule down

Commit the derivation as code — `scripts/structural-composite-check.mts` or equivalent —
taking a slug and returning composite / single / unknown, with its reason. Prefer real
structure over inference: the source item's own table of contents or section headings,
the count of distinct declared works/authors, a SWORD module's one-work-by-construction
shape. Fall back to title/slug patterns only where nothing else exists, and mark those
returns **unknown, not single** — an unknown is not a pass.

## 2. Validate it blind against the answer key

The answer key is the 19 works carrying true foreign-person text, found by the detector.
Run the structural rule against those 19 without the detector's input.

Pre-register the bar before running it, in the evidence file, with a timestamp:

> The rule flags all 19 as composite/unknown. Any miss = the rule does not carry the
> publish decision.

Then run it. Report hits and misses with the denominator, and name every miss. Also run
it over the 314 and report how many come back unknown rather than single.

## 3. The two outcomes, decided in advance

- 19/19 flagged, and the 314 are single not unknown → the property is earned; the batch
  is ready for the owner's terminal.
- Any miss, or a meaningful unknown population inside the 314 → the rule is a heuristic.
  Say that plainly, hold the batch, and do NOT patch the rule against the misses — that
  is the tuning-to-the-test loop this order exists to break. Report the misses and stop.

## 4. One line the runbook is missing

Whatever the outcome, add to the runbook, in the owner's words not a footnote: flipping
the 314 publishes some works containing hygiene-class non-authorial matter — indexes,
title pages, publisher colophons, editor apparatus labels, transcriber credits. The
structural filter does not address that class and the detector demonstrably misses it
(6/15 on never-seen works). This is an accepted, reversible cost, not a clean set.

## Done means

`docs/evidence/corpus-copy/structural-validation-2026-09-07.md` (pre-registered bar with
timestamp, the 19-work result with denominators, the unknown count inside the 314,
one-line verdict) and `docs/worklog/2026-09-07-structural-validation.md`. Do not touch
WORKLOG.md or ROADMAP.md. Do not flip anything. No production connection.
