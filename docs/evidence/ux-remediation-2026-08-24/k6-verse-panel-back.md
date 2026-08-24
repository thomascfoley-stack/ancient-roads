# K-6 — Back from an open verse panel: red-proof and green-proof

Environment: local dev (`next dev`, port 3055), worktree `fix/ux-overnight-sweep`, **signed out**
(the verse panel is reachable signed out, which is why this one could be verified locally at all —
K-4/K-5 could not). Dev Neon branch. Assertions read from the live DOM via `javascript_tool` rather
than screenshots: a screenshot round-trip is ~8s here and lands after the state it was meant to catch.

## RED — before the fix

    /library  →  /read/jhn/3  →  tap verse 16's number  →  Back

    after opening the panel:  { hash: "",  history.length: 4  }   ← no entry, no hash
    after Back:               { landedOn: "/library" }

One Back threw the reader out of the chapter entirely. Reproduced twice; the first attempt was
discarded as contaminated (Back had landed on `/read/john/3`, which redirects to `/read/jhn/3`, so
the panel "closed" only because the page remounted — the bug looked like correct behaviour).

## GREEN — after the fix

    after opening the panel:  { hash: "#v16:study", history.length: 5 }
    after Back #1:            { path: "/read/jhn/3", panelOpen: false, verses: 36 }
    after Back #2:            { path: "/library" }

## Edge cases, all verified in the browser

| Case | Result |
|---|---|
| Four verse taps in a row (16 → 20 → 3 → 11) | **one** history entry total; hash re-aims in place (`#v11:study`). A reader who taps six verses does not press Back six times. |
| Deep link straight to `/read/jhn/3#v16:study` | panel opens (pre-existing behaviour, preserved) |
| Close a **deep-linked** panel by its own Close control | closes in place, hash cleared, reader NOT ejected from the site — this is what `pushedStudyEntry` exists to prevent |
| Close by the panel's own control after opening normally | consumes the pushed entry via `history.back()`, so the reader's next Back is not a dead press |

## A correction worth keeping

A first version of the fix also stripped a stale `:study` hash in the chapter-load effect, and I
recorded in a code comment that doing so **broke the deep link**. That was wrong, and the error was
in the measurement: I "navigated" to the URL the page was already on, which is a no-op, so nothing
re-ran and the panel never re-opened. Re-tested properly (navigate away first) the strip is
harmless. The strip was still removed — least code, and it sits one ordering step from the effect
that reads the hash — but the comment now says only what was measured, and tells the next person how
to test it if they re-add it.

---

# K-3 (unblocked half) — `/about` had no footer

`/about` was the one public marketing surface rendering no `<footer>` at all — so it had no way
back to Features/Why, and no legal column for the owner's Privacy/Terms copy to land in when it
exists. Fixed by using the shared `MarketingFooter` the other three already use.

Verified against **served HTML**, not source (all four pages, dev):

    /          footer marker occurrences: 1
    /about     footer marker occurrences: 1
    /features  footer marker occurrences: 1
    /why       footer marker occurrences: 1

Rendered at 375×812: `/about` scrollWidth 375 === viewport, no horizontal overflow, footer links
present (Ancient Paths, Home, Features, Why, About, Log in).

**Not fixed, and not fixable by an agent:** the LEGAL column (Privacy, Terms) is still absent. The
footer component's own comment says why, and it is a deliberate decision rather than an oversight —
the pages are owner-authored content that does not exist, and dead `#` links would be worse. That is
K-3 and MK-13, and it stays blocked on the owner's copy. The census test asserting privacy/terms
links on every marketing page should land WITH those routes, not before: written now it would go red
in CI for a reason nobody can fix.

## Incidental mobile check (375×812), no findings

| Surface | scrollWidth vs viewport | Overflowing elements |
|---|---|---|
| `/` | 375 = 375 | none |
| `/about` | 375 = 375 | none |
| `/read/jhn/3` (36 verses) | 375 = 375 | none |

One measurement note for whoever repeats this: an overflow check run while the browser pane is
hidden reports `window.innerWidth === 0` and therefore "overflow: true" for everything. Set the
viewport explicitly before believing any layout assertion.
