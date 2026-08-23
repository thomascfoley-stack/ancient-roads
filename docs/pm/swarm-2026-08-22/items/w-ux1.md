# W-UX1 — Bible reachable from the desk picker

**Workstream:** swarm/W-T3-cursor-ccel-ux · **Base:** origin/main `9dce273`
**Status: ALREADY-DONE** (§2.6 precondition false — the gap is closed at the build base)

Transitions: CLAIMED → ALREADY-DONE (with §2.9 doc correction)

## Finding

The brief's gap ("`+` routes to `/library?desk=…`, which offers catalogs of works only") no
longer exists at origin/main `9dce273`. `web/src/app/desk/page.tsx` ships TWO add affordances,
and its own header comment names UX-1 as the gap they close:

- `+` → `/library?desk=…` for a library work (appends, carrying the open desk);
- a book button ("Add a Bible chapter") → opens the existing `BookPicker` in pick mode and
  `addScripture` writes a `kind:'scripture'` pane into `?p=` via the EXISTING desk machinery
  (`withPane` / `deskHref`). Shipped by `b9b0392` and `600d639` (2026-08-17 wave). The empty
  desk has an equivalent "Open the Bible" CTA (a button since `5760eec`).

No new pane type, no new data model — exactly the minimal shape the brief asked for, already
built. No code change made.

## Evidence (docs/evidence/swarm-2026-08-22/w-ux1/)

- `already-done-tests-green.log` — `desk-empty-cta-adds-scripture.test.tsx` (2) +
  `desk-nav-and-session-note.test.tsx` (7) green at base, 9/9.

## §2.9 doc correction (discovered falsehood)

MASTER.md's UX-1 row (Lane "Queued behind A8") still filed the picker gap as open. Corrected
in place: the row now records the gap CLOSED with the confirming evidence above. This is the
only doc edit; no other rows touched.

## Spend (A1)

$0 — no provider calls.
