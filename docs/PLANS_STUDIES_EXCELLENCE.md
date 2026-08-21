# PLANS & STUDIES — the excellence dossier (revised: the companion thesis)

**Status: INSPECTION + PROGRAM, revised 2026-08-20 after the owner's "fight back" steer and a
second independent inspection (Fable, WORKLOG 3d0489a). Nothing here is built by this document.**
Compiled from live signed-in walks of production plus the corpus inventory below. The bar the
owner set: *the world's best Bible study and reading-plan companion.*

**The thesis (revised):** the gap is not better features. It is a different shape — **a daily
rule of life and a guide that composes paths through any subject**, built entirely from material
the corpus already serves. No acquisition, no product-authored content. The work is composition.

---

## 1. What exists today — measured on prod

### The corpus ammunition (measured 2026-08-20)

- **Two date-keyed dailies**: `daily-light` (732 sections, headed "January 1 — Morning/Evening";
  Bagster 1875) and `spurgeon-morning-evening` (744). Both keyed to the calendar.
- **15 published devotionals**: kempis-imitation, ryle-holiness, lawrence-practice-presence,
  baxter-saints-rest, rutherford-letters, calvin-prayer, taylor-holy-living, guyon-prayer,
  habermann-dailyprayers, jowett-mattermost, scougal-life-of-god, spurgeon-faiths-checkbook,
  meyer-homily2, daily-light, spurgeon-morning-evening.
- **Three topical indexes** (subject → verses, machine-readable): naves-topical-bible (4,870
  sections), openbible-topics (6,711), torreys-topical-textbook (628).
- The machinery: plan scheduler (pure arithmetic), studies editor, voices retrieval with the
  coverage gate, highlights/notes/prayers all date-stamped.

### Reading Plans (`/plans`) — measured

- Builder: stepped manual form with a live preview running the server's own pure function —
  the best interaction design in the product (both inspections agree; protect it).
- Measured wounds: both plans at "Day 0 of 40"; Gospels plan "DUE NOW" on an Aug 3 reading —
  17 days stale, no catch-up. (Fable, code-confirmed: clearing the Weeks field crashes the page
  — `Number('')`→0 → zero days → `days[0]!` throws; range scope built+tested but unreachable;
  plans have no URLs — no refresh/back/share; topic preview bypasses the real expand function so
  a topic plan can be refused after submit; mark-as-read round-trips with a full refetch.)
- Unbuilt vs. its own design: grounded materials per day (§2 step 4), Today integration (§12
  step 6), .ics (§8, owner-deferred).

### Studies (`/studies`) — measured

- Two-pane editor (doc + six-register library panel), Pin, Export (Word/PDF), + Insert; the
  blocks feed re-checks servability server-side (the licensing belt — load-bearing).
- Measured wounds: both studies "Untitled study" since Aug 13; clippings carry
  citation-stripping artifacts (`( = ; ; )`, `(See ).`) in the user's own document.
- (Fable) /studies crashes to the error boundary signed out.

### Housekeeping flag

Duplicate topical slugs: `naves-topical-bible` (4,870) and `naves-topical` (5,357) both exist —
the same two-slug disease as `jfb`/`jamieson-jfb`. One must win; file with that cleanup.

---

## 2. The three properties "world's best" requires

The best companions **meet you** (in the reader, on the home screen, at the right moment),
**forgive you** (a plan survives a bad week), and **accumulate visibly** (insight compounds into
a body of work you can see growing). Every sprint below serves one of these.

---

## 3. The program

### Sprint 1 — The Daily Office (the retention engine)

Home becomes an appointment, morning and evening:

- *Morning*: Daily Light's morning reading (already keyed to today's date) + the plan's day +
  one voice on that passage. *Evening*: the evening half + tomorrow's reading.
- Streak = "days kept." Dated content is the only return-trigger a generator cannot fake.
- Every piece exists today; this is composition onto one screen, not acquisition. Ships with
  PostHog events (see §4's prerequisite).
- **PREREQUISITE INSIDE THE SPRINT (Fable's catch): plan URLs first.** A home card needs
  something to link to — `/plans/[id]` (exposing the built-but-hidden range scope while there)
  is part of this sprint, not trailing hygiene. Without it the card links nowhere and the
  sprint can't close.

### Sprint 2 — Journeys (the centerpiece; "search-created study")

The user types any subject — "anxiety," "covenant," "Rahab" — and the product composes a
multi-day guided path:

- the topical indexes supply the verse sequence (the tradition's own editorial ordering);
- voices retrieval supplies 2–3 attributed excerpts per day — the DESIGNED mechanism is
  `planSource` (STUDY_PLANS_DESIGN §7, designed and unbuilt); the coverage gate applies;
- the plan machinery supplies days, mark-read, and catch-up — a Journey IS a plan.
- This generalizes both inspections' Tier-1 "voices on the day" into paths on any subject.
  Nothing else in the market does it; every component is already built and tested.
- Faithfulness: the composer assembles, never writes — zero generated prose, same spine as the
  history lane's "every string is a template or a verbatim excerpt."

### Sprint 3 — Historic rules of life (the shelf, Fable's framing)

The 15 devotionals become followable companions: "Walk with Kempis for 40 days," "Ryle's
Holiness for Lent," "Lawrence's Presence as a 28-day practice," M'Cheyne's 1842 calendar,
Daily Light as a followable year. Tradition-authored, public domain, attributed — this satisfies
STUDY_PLANS_DESIGN §10's scope-out (the product authors nothing) while giving users the shelf a
form can never be. **Owner call needed to un-scope §10 under this framing.**

### Sprint 4 — The companion remembers

"On this day last year you highlighted this." Your most-returned-to chapter. A prayer-journal
anniversary. All inputs are date-stamped already. Quiet and reverent — a candle, not confetti.

### Sprint 5 — Lectio mode (the immersive read)

One slow-reading screen for the day's passage: full typography, deliberate pacing, one voice
after the second read. The design language is already 90% there.

### Hygiene track (threads under every sprint)

- Weeks-field crash fix (Fable's chip) and the same `Number('')` pattern on days-per-week.
- Catch-up: "17 days behind — restart from today?" (pure re-run of expandPlan).
- Plan URLs (`/plans/[id]`) — refresh/back/share; expose the built-but-hidden range scope.
- Optimistic mark-as-read; pericope-snapped day boundaries (`src/bible/pericopes` exists).
- Citation-artifact cleaner (red-proofed: strip only empty parens); title-from-content;
  /studies signed-out error boundary → clean gate; duplicate topical slugs resolved.
- "Study this day": plan day → create-or-append to a study with passage + voices pre-attached
  (the plans↔studies bridge; R4's "all of the app working together" made literal).

### Explicitly not recommended

- LLM plan intake (form is honest; model adds a failure class for seconds saved).
- Social/shared plans (off-spine).
- Confetti-and-badges gamification (cheapens the register; the streak is a candle, not a slot
  machine).

---

## 4. Proof, not vibes — and the prerequisite

- **Meets you**: % of plan-days opened from /home or the reader chip vs. /plans directly.
- **Forgives you**: % of plans active 7 days after first falling behind, before/after the
  restart button.
- **Accumulates**: median blocks per study at 30 days; % of studies titled; days-kept streak
  distribution once the Daily Office ships.
- **PREREQUISITE**: PostHog event flow on prod was unverified as of 2026-08-19 (CSP/static-assets
  defect). Sprint 1 does not ship without `plan_day_open`, `streak_kept`, `journey_created`,
  `study_insert` events observed landing. No pipe, no numbers, no claims.

---

## 5. Evidence index

- Live walks: 2026-08-20 (this dossier's author: plans index/detail/builder, studies editor,
  + Insert flow, insert-panel tabs) and Fable's 2026-08-21 pass (WORKLOG 3d0489a: Weeks crash,
  range scope, URLs, topic preview, signed-out crashes).
- Corpus inventory: prod `sources`/`sections` counts, 2026-08-20 (devotionals, topical indexes,
  dated dailies).
- Designs: STUDY_PLANS_DESIGN.md (§2, §8, §10, §12), STUDY_DOCS_DESIGN.md (R1–R5).
