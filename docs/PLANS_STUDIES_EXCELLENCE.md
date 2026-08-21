# PLANS & STUDIES — the excellence dossier

**Status: INSPECTION + PROGRAM, 2026-08-20. Nothing here is built by this document.** Compiled from
a live signed-in walk of production (dpl_6rkRV96mPVHbhEwNXPSpS3mkUR8t, serving `d09d4f2`) plus the
two governing designs (`STUDY_PLANS_DESIGN.md`, `STUDY_DOCS_DESIGN.md`). Every "measured" line was
observed on prod, not inferred from code. The bar the owner set: *the world's best Bible study and
reading-plan companion.*

---

## 1. What exists today — measured on prod

### Reading Plans (`/plans`)

- **Builder**: stepped manual form — WHAT TO READ (one book / a collection / a topic) → HOW LONG
  (weeks) → days each week → start date → a live-computed preview ("15 readings · about 1 chapter
  a day · Romans · 16 chapters · Thu, Aug 20 → Mon, Sep 7"). Expansion is pure arithmetic, as
  `STUDY_PLANS_DESIGN.md` §2 rules. The LLM natural-language intake (§12 step 5) is **not built**.
- **Plan detail**: UP NEXT · DUE NOW card (Read it / Mark as read) + a dated ALL READINGS list
  (weekday schedule). Measured: the Gospels plan reads "DUE NOW" on a reading dated Aug 3 —
  **17 days stale with no catch-up affordance**.
- **Not built vs. its own design**: grounded materials per day (§2 step 4 — corpus voices attached
  to each reading; nothing renders but Read it / Mark as read); Today-page integration (§12 step
  6); `.ics` feed (§8 — owner ruled third-party push, later slice).
- Measured engagement: 2 active plans, both "Day 0 of 40". The feature has never carried a user
  past day zero — including its owner.

### Studies (`/studies`)

- **Editor**: two-pane (document + library panel with six register tabs: Commentaries, Sermons,
  Hymns & Poetry, Historians, Theology & Creeds, Lexicons). Pin, Export (Word/PDF), + Insert —
  all work. The blocks feed re-checks servability server-side before rendering a stored clipping
  (F-W3-2 — the licensing belt; correct and load-bearing).
- **Measured wounds**: both studies are "Untitled study" since Aug 13. Clippings carry
  citation-stripping artifacts — `( = ; ; )`, `(See ).` — empty parentheses where cross-references
  were removed at ingest. On every JFB clipping, in the user's own document.
- R4's two-area split (Research History = capture, Studies = curation) is live and clean.

---

## 2. The verdict

Plans today is a **schedule generator**, not a companion: it doesn't meet you where you are,
forgive you for falling behind, or show you why a day matters. Studies is a **working document**
that doesn't yet feel curated. Both are pre-delight, not broken. The designs were right; the
programme stopped two steps short of them.

The gap to "world's best" is not more features. It is three properties the best companions have
and this one doesn't, yet: **it meets you** (in the reader, on the home screen, at the right
moment), **it forgives you** (a plan that survives a bad week), and **it accumulates visibly**
(your insight compounds into a body of work you can see growing).

---

## 3. The program, sequenced

### Sprint 1 — retention and trust (small, high-yield)

1. **Catch-up intelligence.** One button on a stale plan: "17 days behind — restart from today?"
   Expansion is already pure arithmetic; a replan is a re-run of `expandPlan` with a new start
   date. Reading plans die silently without forgiveness. This is the single highest-value line of
   code in this dossier.
2. **Citation hygiene at render or ingest.** Strip empty cross-reference parens (`( = ; ; )`,
   `(See ).`) from clippings. This is a visible quality wound *in the user's own document* — the
   surface where polish matters most. Needs a red-proofed cleaner (strip only when the parens are
   empty post-strip; never eat real content).
3. **Title-from-content.** After the first insert into an untitled study, suggest the clipping's
   heading as the title, inline, one click to accept. "Untitled study" forever is a small sadness
   that compounds in the sidebar (two identical entries today).

### Sprint 2 — meet the user where they are

4. **Today's reading on /home.** One card: plan name, today's passage, Read / Mark done. The plan
   must live in the room the user is already in, not a room they must remember to visit.
5. **"Mark today's reading done" in the reader.** When the reader is showing the day's passage
   (the plan knows; the reader knows), a quiet chip closes the loop where reading happens.
6. **Progress texture.** A 40-day grid on the plan card and index (the streak is the motivation);
   "% through Romans" on the index card. Static "Day 0 of 40" text motivates no one.

### Sprint 3 — the differentiators

7. **Grounded materials per day** (the design's unbuilt step 4). Each day expands to 2–3 corpus
   voices on the passage, admission-filtered. Retrieval and the grounding tests already exist
   (`passages-anchor-grounding`). Every app has reading plans; nobody else's day comes with
   Matthew Henry already attached. **This is the "world's best" claim made literal.**
8. **"Study this day."** One action on each plan day: create-or-append to a study with the day's
   passage and its voices pre-attached. Plans supply the discipline; studies accumulate the
   insight. This is R4's "all of the app working together" as a feature, and it makes Sprint 3's
   materials write-through instead of read-only.

### Sprint 4 — zero-decision starts and coverage

9. **Plan templates.** Advent, Lent, Psalms-in-a-month, the Gospels — one-tap starts. The builder
   is good; a template is no decisions at all.
10. **Save-to-study coverage audit** (R3: "one canonical verb on every surfaced item, on every
    surface"). Verify presence on verse panel, history results, word study, passage search —
    attach where missing.
11. **Sidebar hygiene.** Two "Untitled study" entries dedupe via Sprint 1.3; add date or snippet
    preview to the sidebar rows so studies are distinguishable at a glance.

### Explicitly not recommended

- **The LLM plan intake** (design §12 step 5). The manual form is honest and works; the model
  adds a failure class (bad spec → bad schedule) for a few seconds saved. Revisit only after
  Sprint 3 lands and real usage data says the form is the drop-off point.
- **A social/shared-plans layer.** Out of the product's spine (concordance, not commentator —
  and not a social network).

---

## 4. What "world's best" requires beyond this list

The three best-in-class properties named in §2 each have a measurable proxy the programme can
track without inventing vanity metrics:

- **Meets you**: % of plan-days opened from /home or the reader chip rather than /plans directly.
- **Forgives you**: % of plans still active 7 days after first falling behind, with and without
  the restart button (the before/after is the proof Sprint 1.1 mattered).
- **Accumulates visibly**: median blocks per study at 30 days; % of studies titled.

All three need observability that works — PostHog events on plan-day open, restart, mark-done,
and study insert. As of 2026-08-20 PostHog is initialized but event flow on prod is unverified
(see WORKLOG 2026-08-19: the CSP/static-assets defect). **Fix the analytics pipe before Sprint 1
ships, or none of these numbers will exist.**

---

## 5. Evidence index

- Live walk: 2026-08-20, signed-in, prod — plans index/detail/builder, studies index/editor,
  + Insert flow, library panel tabs.
- Stale-plan measurement: Gospels plan "DUE NOW" on an Aug 3 reading, observed Aug 20.
- Artifact examples: JFB clippings in the owner's Aug-13 study (`( = ; ; )`, `(See ).`).
- Designs: `STUDY_PLANS_DESIGN.md` (§2 steps 4-5, §8, §12 step 6 unbuilt), `STUDY_DOCS_DESIGN.md`
  (R1-R5; R3 coverage unaudited).
