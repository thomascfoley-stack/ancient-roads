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

**CORRECTED 2026-08-02, after reading the code instead of assuming.** The paragraph here
previously said this was a data-model problem — that the desk's panes are built over the corpus and
Scripture is a different substrate needing a design decision. **That was wrong.** `lib/desk.ts`
already defines TWO pane kinds: `kind: 'scripture'` (serialised `scripture:john/3`) and
`kind: 'work'` (`work:spurgeon-sermons`), and `/desk` renders both today. The desk's own empty
state advertises it: "a chapter of Scripture, a commentary on it, and a sermon, hymn, poem or
history beside them."

So this is a **picker gap, not a model gap**, and it is far cheaper than first filed. A Scripture
pane can be opened right now by URL; what cannot be done is reaching one through the `+`, because
that routes to `/library?desk=…` and the library offers catalogs of *works* only. The fix is a
route into the Bible from the add-pane flow, not a new pane type.

The open questions below still stand — they are about behaviour, not substrate.

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

---

## 4. RESULTS CANNOT BE OPENED — captured 2026-08-02, DELIBERATELY NOT DESIGNED

Owner, thinking aloud and explicitly paused on the design:

> "you still can't click into them, so while I can read them in that pane of glass, I can't open
> them into a new work yet... If I click into it, there should be an ability to say 'open in
> reader' while keeping that search open. Searches should persist with memory and history so I can
> look through them. We should add those histories to study partners tabs, I think. I gotta really
> think about how the UI functionality of this thing is gonna work. I'm kind of at a pause, but I
> do know that we wanna click into things."

Recorded as a REQUIREMENT and a set of open questions, not a design. The owner is mid-thought and
said so; deciding this here would be answering a question that was not asked.

**What is settled:**
- A result in the answer pane is currently terminal. It can be read and nothing more.
- Clicking a result must be able to **open it in the reader**.
- Doing so must **not destroy the search**. The search stays; the work opens alongside.
- Searches **persist** — history, revisitable, not lost on navigation.
- That history probably belongs in the **study-partner tabs**.

**What is open, and should stay open until the owner returns to it:**
- Does "open in reader" mean the Bible passage the voice is anchored to, the voice's own work at
  that section, or a choice between them? A quoted voice has both.
- Is search history per-device or per-account? Per-account means a new user table, RLS, and a
  retention decision; per-device means it does not follow the reader.
- Does a persisted search store the query only, or the answer too? Storing answers means caching
  generated output, which CLAUDE.md forbids from a pipeline below the accuracy bar and which
  raises staleness once the corpus changes — as it just did.

**THIS IS THE SAME PROBLEM AS UX-1, AND SHOULD BE SOLVED WITH IT.** "Open this in the reader
without losing what I have" and "open the Bible beside a commentary" are one requirement wearing
two hats: both need the desk to gain a pane from an arbitrary place in the app, and both need the
pane model to hold Scripture as well as corpus works. Solving them separately would mean two
routes into the desk with different rules, which is how the `+` affordance in item 2 became
ambiguous in the first place. Whoever picks this up should take 1 and 4 as one slice.
