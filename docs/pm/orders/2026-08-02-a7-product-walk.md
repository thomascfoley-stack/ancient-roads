# A7 — walk the product. The journey list, filed BEFORE the walk.

**Filed 2026-08-02**, `main` @ `f02316c`, against the live deployment
`dpl_3pbnsm9c3CKi5rKhsTNzVbnCprtR` (`ancientpaths.app`).

## Why this document exists at all

`MASTER.md`'s A7 row says **"Stage 5's twelve journeys"**. Those twelve journeys are **not in the
repo.** `docs/pm/WORKORDER_V2.md` does not exist — the index in `MASTER.md` says so in as many
words ("**NOT YET FILED**"), and the only two other mentions of "twelve journeys"
(`DEPLOY_PREFLIGHT.md:299`, the A7 row itself) both *refer* to a list neither of them contains.

Bylaw 1: **if it is not in the repo, it was never issued.** So A7's payload is unissued, and there
are exactly two honest options: walk nothing, or derive a list and say plainly that it is derived.
This is the second. **It is NOT Stage 5's list**, it is not a reconstruction of it, and nothing
below should be read as evidence that Stage 5's list was satisfied.

The list is filed **before** the walk so the walk is measured against a fixed set rather than
against whatever it happens to find — the same reason the held-out evals pre-register their bars.

## How the list was derived

Every entry in the app's own primary navigation and sidebar, read from the live page, plus the two
things the product's guarantee turns on: that a commentary is attributed, and that `/ask` refuses
to interpret. Nothing here is invented; it is the shipped surface enumerated.

## The journeys

| # | Journey | Passes if |
|---|---|---|
| J1 | `/home` loads | renders, no console error |
| J2 | Bible reader, canonical slug `/read/jhn/1` | chapter text renders |
| J3 | Bible reader, natural book name `/read/john/1` | resolves to John 1, or fails in a way a reader can act on |
| J4 | A verse's commentary opens | at least one voice, each **attributed** (author + work) |
| J5 | `/library` — the corpus | renders; counts are not zero |
| J6 | `/library/commentaries` | catalog lists works; no quarantined author appears |
| J7 | `/library/sermons` | renders |
| J8 | `/library/hymns-poetry` | renders, and is a LABELLED register (the register wall) |
| J9 | `/library/historians` | renders |
| J10 | `/library/passages` — passage search | a query returns results |
| J11 | `/library/word-study` | renders |
| J12 | `/ask` — **G7, the live pipeline, first time ever** | an answer returns, every claim attributed, no interpretation in the product's own voice |

Plus two cross-cutting checks, run against every page reached:

- **X1** no uncaught console error;
- **X2** 390px mobile width — no horizontal overflow, no overlap (CLAUDE.md's Definition of Done
  makes this non-optional for any UI change, and nothing has ever walked it on production).

## What a failure here is

A7 is a **walk**, not a gate on the deploy — the deploy already happened. A defect found here is
filed, not a rollback trigger, unless it is a licensing or attribution breach, which is
existential and stops everything.

## Results

Recorded in `docs/evidence/a7-product-walk-2026-08-02.md` as the walk proceeds.
