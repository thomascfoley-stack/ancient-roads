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
