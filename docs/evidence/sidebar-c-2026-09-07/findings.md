# Sidebar C — findings and test re-points (2026-09-07)

Owner: "#1 do it" (2026-09-07) on canvas board "C · Rail with capped, collapsible groups", after the
2026-09-06 note ("cap research history to 3-4 max, make it expandable and collapsible. Do the same
thing with my studies, my sermons, prayer journal, bible studies etc.") and two accepted amendments:
the page's own group opens itself and is not remembered; "All … →" is a page, never an inline list.

Branch `redesign/ask` (live `d6e85f3` + tonight). New test `test/components/sidebar-groups.test.tsx`
— RED first (10 of 11 against the old rail; the eleventh, the research delete control, exists today
and is a regression guard), GREEN after the splice. Typecheck clean.

## Test re-points caused by the design — recorded BEFORE the edits (precedent: C-2, 2026-08-16)

| test | what it pinned | why it changes | now |
|---|---|---|---|
| `test/sidebar-catalog-nav.test.tsx`, DOM leg | every catalog has an anchor when the nav renders at `/` | the eleven library rows now appear only while you are in the library (owner-approved fold) | renders at `/library`; assertions unchanged; source-scan legs (`CATALOG_IDS.map(`, `/library/${id}`, `CATALOGS[id].label`, no hardcoded ids) untouched |
| `test/save-to-study.test.tsx`, "sidebar MY STUDIES" | pinned-then-recents rendered signed-in without interaction, FOUR studies then "All studies"; failure text "studies could not be loaded" | My studies is a group: closed unless the page owns it or the reader opened it; the cap is the owner's three; groups share one failure line | opens the group (click its header) before asserting; the expected list is the same partition cut at three (`s-pinned-1`, `s-pinned-2`, `s-recent-1`, then `/studies`) — **one assertion changed, by the ordered cap**; failure leg scoped to the studies panel's "Could not be loaded." with "All studies →" still reachable |

Why this is not loosening: the properties survive (every catalog reachable from the shell while in
the library; pinned-first order and a reachable "All studies" on failure). Each re-pointed leg is
red-proofed after the move: render the catalog leg at `/ask` → red; revert the group's open state
→ red.

## Deviations from the mockup, and why

- **No counts on closed groups.** The list APIs report no totals (`/api/research` caps at 50,
  `/api/studies` at 50, `/api/prayers` returns whole bodies up to 200). A count would mean fetching
  every group on mount — five requests for a rail showing one — or new count endpoints. Groups fetch
  lazily on open instead. Filed: counts, once a cheap count exists.
- **Research unfolds in place ("More research · N" / "Fewer").** There is no research list page;
  without it threads 4..N would be unreachable from anywhere. The owner's literal ask was
  "expandable"; the amendment (the page is the expand) applies where a page exists. Filed: a research
  list page, after which this becomes "All research →".
- **Prayer rows are plain, dated, not links.** The journal has no per-entry anchor; three links that
  all open the same page would be three small lies. Filed: deep-link a prayer.
- **Icon rail = five places + My prayers + Reading plans + Settings.** Derived from the same
  `places()` table; the two group entries stay because the writing-mode rail exists while a prayer
  is being composed (`sidebar-writing-rail.test.tsx` pins the journal link) — the narrow rail carries
  what a reader might leave for.
- **The `/ask` icon-rail label is "Ask"**, not "Ancient Paths" (the wordmark). PR #224's finding,
  closed here by derivation.

## Kept as-is

`StudySectionView` (legacy pre-N4 sections, localStorage) renders after the groups for the readers
who still have them; its item link is now the literal `href="/prayers"` at the site
`pr1c-prayer-surface.test.ts` checks. `useMoreBelow` / `scroll-fade-b` unchanged. Sign in / Sign out
moved to the footer beside Settings (B044 arming kept). `MY_STUDIES_NAV_CAP` and `RESEARCH_NAV_CAP`
(both 5) are gone; `GROUP_CAP = 3`.
