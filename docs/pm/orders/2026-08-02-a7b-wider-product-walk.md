# A7b - the WIDER product walk. The journey list, filed BEFORE the walk.

**Filed 2026-08-02**, `main` @ `b569c90`, against the live deployment at `ancientpaths.app`
(deployment `dpl_3pbnsm9c3CKi5rKhsTNzVbnCprtR` per the A6 row of `MASTER.md`).

## Why a second walk

A7 walked twelve journeys and passed twelve
([order](2026-08-02-a7-product-walk.md) · [results](../../evidence/a7-product-walk-2026-08-02.md)).
Its own order says the list was **derived from the app's primary navigation and sidebar**, and that
it is **NOT Stage 5's twelve journeys**, which per bylaw 1 were never issued because they are not in
the repo. A derived list is bounded by the derivation. This one was bounded by the nav, so
everything the nav does not point at went unwalked - and, materially, **A7 exercised no write-path
UI interaction at all**, which `CLAUDE.md`'s Definition of Done treats as non-optional ("a real
interaction exercised").

**This list is also derived, and it is also NOT Stage 5's list.** It is derived by a different rule:
*the surfaces A7's rule could not reach.* Nothing below should be read as evidence that Stage 5's
list was satisfied. The two lists together are still not that list, and no future document should
add them up and call the sum "the twelve journeys".

Filed before the walk, for the same reason A7's was: so the walk is measured against a fixed set
rather than against whatever it happens to find.

## How this list was derived

Four sources, each a place A7's nav-derived rule was blind to:

1. A sidebar entry A7 listed but never opened (`/library/notes`).
2. Every **write** path in the product - the annotation stack. A7 was read-only end to end.
3. Routes with **no nav link at all**, reachable only by URL: `/desk`, whose parser
   (`web/src/lib/desk.ts`) accepts a pane spec from user-editable input.
4. The **controls** rather than the pages: the translation picker, reading settings, the
   interlinear toggle, `/settings`, and the auth entry point as a flow.

## The journeys

| # | Surface | Passes if |
|---|---|---|
| W1 | `/library/notes` - "My library" | renders for the signed-in session; correct state (empty vs populated); no console error |
| W2 | **Write:** highlight a verse from the reader | the highlight is applied, **survives a full reload**, and appears in `/library/notes` |
| W3 | **Write:** add a note on a verse | the note saves, **survives a full reload**, and appears in `/library/notes` |
| W4 | **Write:** bookmark a verse | a bookmark can be created and appears where the product says it appears |
| W5 | **Write:** remove the highlight and the note again | both deletions persist across a reload, and `/library/notes` returns to its prior state (leave production as found) |
| W6 | `/desk?p=work:<slug>` - a work pane, one of the six published commentary works | the work loads, is **attributed** (author/tradition), and carries its **register label** |
| W7 | The work pane's "Read more" paging button | a real click appends further sections; the button is a keyset pager, not a no-op |
| W8 | A pane's close button | the pane is removed and the URL is rewritten to the remaining panes |
| W9 | Three panes at once | all three render side by side; the `MAX_PANES` cap holds against a fourth `?p=` |
| W10 | Independent per-pane scrolling | scrolling one pane does not move the others |
| W11 | A deliberately bad pane spec, `?p=scripture:notabook/1` | the pane renders the "Unknown book" message; the page does not crash and the other panes still work |
| W12 | `/settings` | renders; and the walk reports **what it actually is**, not what the nav label implies |
| W13 | The translation picker in the reader | selecting a different translation re-renders the chapter in it, and the choice is remembered |
| W14 | Reading settings ("Aa") - theme and text size | both controls change the rendered page, and the choice persists across a reload |
| W15 | The interlinear / original-language toggle | toggles on, renders original-language data, toggles off |
| W16 | `/auth/sign-in` as a page | renders, carries the controls a reader would expect, no console error. **No credential is entered** |
| W17 | Sign-out as a flow | the control exists and is wired to a real endpoint |

Plus the two cross-cutting checks, run against every surface reached, exactly as A7 defined them
and as `CLAUDE.md` requires:

- **X1** no uncaught console error;
- **X2** 390px mobile **and** desktop width - no horizontal overflow, no overlap.

## Standing constraints on this walk

- **No credential is ever entered**, for any reason, in any field, on any page. If a journey needs
  one, it stops and is recorded **NOT RUN** with the reason. This is absolute and outranks
  completing the list.
- **W17 is expected to be NOT RUN by design.** Signing out destroys the only authenticated session
  this walk has, and restoring it would require entering a credential, which is forbidden above. The
  control's existence and wiring are verified without firing it.
- **Production is left as found.** W5 exists so W2/W3 do not leave residue in the owner's account.
- **A defect found here is filed, not fixed.** Same rule as A7: a walk is not a gate, and a UI fix
  should get its own review rather than riding in on an evidence commit. A licensing or attribution
  breach is the exception and stops everything.
- **A clean first pass is grounds for looking harder** (`docs/THE_LOOP.md`). A check that could not
  have failed is not evidence. Every PASS below should name the thing that would have made it FAIL.

## Results

Recorded in `docs/evidence/a7b-wider-product-walk-2026-08-02.md` as the walk proceeds.
