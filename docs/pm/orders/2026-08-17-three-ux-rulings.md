# Three UX rulings — Desk, funnel, latency copy

**Filed:** 2026-08-17 · **Lane:** C · **Authority:** owner delegated these three explicitly
("ok do it") after being shown the options. **Agent-made calls, recorded so they can be
overridden** — none of them is in the reserved set (`AGENTS.md`: content quarantine, prod
deletion, deploy timing), and each is reversible.

They are ruled together because between them they unblock **9 findings** that were otherwise
parked waiting on a decision rather than on work.

---

## R1 — The Desk becomes a first-class surface (unblocks A072, A074, A076, A077, B007)

**The findings, in one sentence:** the Desk has no entry point in any nav, multi-pane is reachable
only by hand-editing a comma-separated query param, there is no add-to-desk control on the reader,
its state lives only in the URL, and **login changes none of that** — B007 confirmed the same
URL-only behaviour signed in.

**Ruled.** The Desk is a real feature that behaves like a scratch surface nobody can find. It gets:

1. **A nav entry**, desktop and mobile menu (also closes B043). Cheapest, largest effect.
2. **An add-to-desk control on the reader** (A076), matching the library row's `+` — which,
   per B008, already adds correctly alongside existing panes. A073's "it replaces" was
   contradicted by B008 and must not be "fixed".
3. **Persistence**: per-account when signed in, `localStorage` when not. This is the substantive
   half and it is what makes the Desk worth finding.

**Sequenced deliberately:** 1 and 2 are small and ship first; 3 is a data change and ships after.
Until 3 lands, the Desk must **say** its state is session-only (A080) rather than implying
otherwise — an honest limitation beats a silent one.

**Explicitly NOT ruled here:** the grid/layout model and the 3-pane cap (backlog UX-3). The cap is
doing performance work — an uncapped grid over `spurgeon-sermons` (118,371 sections) is a
virtualisation problem before it is a layout one. It stays, and A078 only makes the drop audible.

---

## R2 — The funnel changes its copy, not its code (unblocks A009, A022, A024)

**The findings:** the homepage's "Ask the tradition" demo is entirely static with no path into the
live feature; `/features` repeats the same unlinked illustration; the waitlist copy ("we invite a
few readers at a time") reads as contradicted by how much of the app appears open.

**Ruled: copy.** While SEC-1 keeps the gate up, "See it answered" **cannot** mean "try it" — every
route into the product 307s to `/gate`. Building a path into a live try would be building a door
into a wall. The honest fix is to stop implying a try is available:

- The demo section is labelled as an illustration of a real answer, not an invitation to run one.
- `/features` likewise.
- **The waitlist copy stays as it is.** It is true: the app *is* gated, and A022 read it as
  contradicted only because that session wrongly believed there was no gate at all (A001, false).
  Correcting copy on the strength of a retracted finding would be the wrong move.

**Revisit when SEC-1 closes** — at that point a live try becomes possible and this ruling should be
reopened, not carried forward by inertia.

---

## R3 — The latency claim follows the measurement (unblocks B004)

**The finding:** live authenticated `/ask` takes **21–37s, averaging 28.5s** (B004, the first
production measurement ever taken). The page claims "about ten seconds". D4's dev-local p50 was
9.1s, which is where that number came from — and it says nothing about production.

**Ruled: the copy changes now; the pipeline work is filed separately.**

Stating a latency the system does not meet is the same defect class as a label that does not
follow its state — and this repo already learned it once: the "taking longer than usual" notice was
originally specified at 15s against a measured 58–104s, which would have fired on every single
request and told the reader something untrue every time. The threshold was re-derived from
measurement (`SLOW_ANSWER_NOTICE_MS`, ask-terminal-state.test.tsx). Same principle here.

**The copy states a range, not an average** — "usually 20–40 seconds". An average invites the
reader to treat 28s as the expectation and read a 37s answer as broken.

**Not ruled:** whether 28.5s is acceptable. That is a pipeline question, it is Lane D's D4, and it
now has a real production number to work against for the first time. Changing the copy is not
closing that — it is refusing to let the UI misreport it in the meantime.

---

## What this does not cover

`A032` (verse tap targets) stays with the owner: it is governed by **ADR-047**, an owner ruling
whose asymmetry is documented as deliberate, and re-litigating a ruling is not a delegated call.
