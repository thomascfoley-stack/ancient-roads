# Order — the desk is not a study surface yet (owner, 2026-08-02)

**Status: FILED, not started. Deliberately queued behind A8 act 3** at the owner's direction
("we can wait until all of the work is published and A8 is done, but I wanted to flag this").

Raised while walking the Library and the multi-pane desk on production, with the registers still
staged. Three items. The first is the one that decides whether the product does its job.

---

## 1. THE BIBLE CANNOT BE OPENED ON THE DESK — blocking, and the point of the app

The desk composes commentaries, sermons and hymns beside each other. It cannot open **Scripture**.

> "The idea of a Bible study app is that you need to have the Bible open along with commentaries
> side by side."

Pressing `+` on an open commentary offers commentary / sermons / hymns. There is no Bible. So the
one pane a reader always wants — the text being commented ON — is the only thing the desk cannot
show. Every other pane is a voice about a passage the reader cannot see.

This is not a missing filter on a picker. The desk's pane model is built over the **corpus**
(`sources` / `sections`), and Scripture is a different substrate: translations, verse ids, the
reader at `/read/[book]/[chapter]`. Making the Bible a pane type means the desk has to hold two
kinds of pane, or the Bible has to be expressible as one. That choice is the work; it should be
made deliberately rather than by whichever is easier to bolt on.

**Open questions for the design pass, not to be settled here:** does a Bible pane follow the
reader's translation preference or carry its own? Does opening a commentary auto-open the passage
it is anchored to? When the reader moves chapter in the Bible pane, do anchored commentary panes
follow, and is that opt-in?

## 2. THE `+` AFFORDANCE IS UNEXPLAINED — small, real, cheap

On `/library/commentaries` each row has a title and a `+`. Clicking the **row** opens that work
alone. Clicking the **`+`** adds it to the desk. Nothing on screen says so; the tooltip
("Add to desk") only appears on hover, which does not exist on touch.

> "We need to make it clear what that plus sign is so that way people are not confused. That's bad
> UI functionality."

Two controls, two outcomes, no label. The reader learns the difference by making the mistake.

## 3. THE DESK NEEDS A REAL LAYOUT MODEL — the largest of the three

Today: up to 3 panes, side by side, equal width, horizontal only.

What the owner asked for:

- **Grid, not a row.** Top-to-bottom as well as left-to-right ("we're gonna have to go to a 4x4,
  not a side-by-side aspect").
- **No pane cap.** The 3-pane limit goes. With 30 published works and hundreds of chapters, the
  ceiling is the reader's screen and judgement, not a constant.
- **User-controlled sizing.** Drag to resize; halve a pane; expand another. "Some things can go
  bigger, some things can go smaller, but it should be on the user's preference."
- **Collapsible chrome.** Hide the left-hand option menu (Bible / Sermons / Ancient Paths) to give
  the panes the full window.

**Design risk to name now:** an uncapped, freely-resizable grid of panes, each rendering thousands
of sections, is a virtualisation and memory problem before it is a layout problem. The current
3-pane cap is doing performance work that removing it will expose. Whoever takes this should
measure a 12-pane desk on the largest works (`spurgeon-sermons` 118,371 sections, `isbe` 26,475)
before committing to a model, and should decide whether layout state persists per reader.

---

## Why this is queued and not merged into A8

A8's remaining act is a status flip on production. These are client changes to a surface that
works today. Mixing them would put a UI refactor inside the one operation this repo has kept
narrow on purpose, and would mean a Deploy B that exists to carry unreviewed reader-facing work.
Sequence: finish A8, then take item 1 (the Bible pane) as its own slice with a design doc, since
it is the only one that changes the desk's data model.
