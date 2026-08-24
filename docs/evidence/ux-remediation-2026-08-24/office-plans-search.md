# Office / Plans / Search / Nav — signed-out pass, localhost:3066 prod build

## DO-001/002/009 — Daily Office / Home
- `/` redirects to `/home`. Shows real dated content: "Monday, August 24" (matches actual today's date, 2026-08-24), section "Evening", "Daily Light · Evening" passage, verse refs, and a second block "Exodus 22:6" / Spurgeon "Morning and Evening" commentary. Content is real, not empty/placeholder.
- No distinct `/office` route: navigating to `http://localhost:3066/office` returns a "Not found" page (404).
- Nav (see below) has no office/daily-labeled link at all. Daily Office is folded entirely into `/home` — there is no separate surface, and nothing in the sidebar names it.

## PL-001/002/017 — Plans, signed out
`/plans` shows:
- Header "Reading plans" + subtitle "Choose what to read and how long you want to take. We lay the readings out day by day and keep your place as you go."
- Single line: **"Sign in to build a reading plan."** ("Sign in" is a link to `/auth/sign-in`).
- No plan list, no descriptions/lengths, no browse-without-account view. Signed-out visitor cannot see what plans exist at all — pure gate, not a preview.

## SR — Search, signed out (`/search`)
- Plain input + "Search" button, no live/type-ahead suggestions. Placeholder: "Search the library…". Subtext: "Sign in to include your own studies, works, prayers, and notes." Body copy: "One search across the library — commentaries, sermons, hymns and poetry, theology, and lexicons — grouped by register, each group with its own count."
- **Phrase query "valley of the shadow"**: NOT treated as an exact phrase. Results are bag-of-words matches — e.g. top result only highlights "shadow" (not "valley"), a later result highlights "valley" alone. No phrase-vs-word distinction is surfaced to the user (no quote affordance, no "exact phrase" toggle).
- **"John" (ambiguous book/common word)**: returns 1,000+ plain commentary text matches only. No jump-to-book affordance, no distinct "Bible book" result type/section — pure text search treats it like any other term.
- **SR-012 race condition — CONFIRMED BUG**: typed "grace" → Search button click → results rendered (grace highlighted). Immediately triple-click input, typed "mercy", pressed **Return** — no visible change. Immediately retyped "faith", pressed **Return** again. Result: input showed "faith" but results pane still showed the stale **"grace"** matches, unchanged even after a 2s wait. Only after manually clicking the **Search button** did results update to match "faith".
  - Root cause is not the race itself but a **separate, more basic bug**: the search `<input>` does not submit on **Enter/Return** at all — only the Search button click submits. So typing a new query and pressing Enter silently does nothing, leaving stale results displayed next to a changed, unsubmitted input value. This will read as broken/unresponsive search to any keyboard-oriented user, and is worth filing as its own finding (Enter-to-submit unwired), separate from true request-ordering races (not exercised since Enter didn't even fire a request).
- **Unrelated observation during setup**: on first navigation to `/search`, a click at the expected input coordinates before the page had settled did not focus the input; the subsequent typed text ("valley of the shadow") was instead consumed as single-letter app hotkeys and silently navigated the tab to `/read/luk/10#v2`. Not re-tested in isolation — flagging as a possible global-hotkey/focus-race hazard, not confirmed as a reproducible product bug.

## NV-002/003/004 — Logo/home and Bible link
- Logo ("Ancient Paths", top-left) clicked from `/read/jhn/3`, from `/search`, and from `/home` itself → always lands on **`/home`**. Consistent.
- "Bible" nav link (from `/home`) → **`/read/jhn/3`** (John 3), a fixed default — not a "last-read chapter" (expected, since signed out / no session to remember position).

## Nav reachability from `/home`, signed out
Sidebar (main nav) hrefs, in order:
- `/home` (logo + Home)
- `/read/jhn/3` (Bible)
- `/ask` (Ask)
- `/desk` (Desk)
- `/plans` (Reading plans)
- `/auth/sign-in` (Sign in)
- `/prayers` (My prayers — under "Prayer journal")
- Library section: `/library` (All items), `/library/commentaries`, `/library/sermons`, `/library/hymns-poetry`, `/library/historians`, `/library/devotionals`, `/library/theology`, `/library/passages` (greyed/disabled-looking — "Passage search"), `/library/notes`, `/library/word-study`
- `/settings`

No office/daily-content link anywhere in nav — `/home` is the only entry point to the devotional content.
