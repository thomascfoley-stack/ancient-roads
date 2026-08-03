# STUDY PLANS — the plan builder, the schedule, and calendar delivery (design doc, 2026-08-02)

**Status: PARTIALLY BUILT — owner approved §12 steps 1–4 + the topical-index corpus in the
2026-08-02 session; recorded as ADR-045/ADR-046.** Built on dev: `expandPlan` + `PlanSpec`,
`verse_coverage` + rebuild, `plans`/`plan_days` + RLS (two-account red-proof executed), the form
builder at `/plans`, and the topical-index ingest. **§8's `.ics` feed is NOT built and its
`feed_salt` column is NOT in the schema** — the owner ruled delivery goes through a third-party
push provider (Composio or similar) in a later slice. The model intake (§12 step 5), `planSource`
on Today (§12 step 6), and §11's remaining owner calls stay open. WORKLOG 2026-08-02 has the
build record.

**Sequencing note, stated up front so it is not discovered later.** `PRODUCT_ARCHITECTURE.md:62-66` puts
"build one mode" third, after retrieval reaches 10/10, and names Workspace Paths as the likely first mode.
`CLAUDE.md` records retrieval at ~9/10 with proper-noun HIT@1 at 60 against a 70 bar, an OPEN OWNER CALL.
`PRODUCT_ARCHITECTURE.md:42` marks Studies "DESIGN. Depends on the plan builder + integration work." The
board has UX-1..UX-4 queued behind A8 and Lane B blocked on five decisions. **Nothing here is next.** This
document exists so the design is settled when it becomes next, not to re-sequence the programme.

---

## 1. What this is

A Study Plan is a **schedule of passages with grounded materials attached**. A pastor says "take me through
Romans in eight weeks, five days a week"; the product produces a dated list of daily passages, each carrying
corpus voices on that passage, and can hand that list to the user's own calendar.

**What it is not.** It is not a devotional the product wrote. It is not a curriculum with the product's
questions in it. It is not a study guide with the product's summaries. `PRODUCT_ARCHITECTURE.md:38` states the
constraint directly: the plan builder "must **not** compose devotional content in its own voice."

The whole design below exists to make that constraint *structural* rather than a prompt instruction, in the
same way `today.ts:6-12` made it structural for the daily screen.

## 2. The division of labor (already committed)

`PRODUCT_ARCHITECTURE.md:38`, verbatim: "The LLM **parses intent**; **code generates the schedule**
(arithmetic — no hallucinated dates); grounded materials are attached."

That sentence decides most of this document. Concretely:

| Step | Who | Output |
|---|---|---|
| 1. Understand the request | LLM | a `PlanSpec` (§3) and nothing else |
| 2. Validate the spec | code | accept, or refuse with a reason (§6) |
| 3. Expand to days | code | `PlanDay[]` — pure arithmetic over the canon and the calendar |
| 4. Attach materials | retrieval | corpus sections per day, admission-filtered |
| 5. Verify | verifier | §5 checks, reusing the existing check vocabulary |

**The model never emits a date, a verse range, or a day-by-day list.** It emits a small typed intent object.
This is the property; §12 names its red-proof.

### 2.1 "Conversational and stateful" without cross-turn drift

`PRODUCT_ARCHITECTURE.md:26` gives the reason Explore is stateless: "no memory, so no cross-turn drift." The
plan builder is explicitly stateful, which reads like a contradiction. It is not, if the state is the spec.

**The conversation's entire memory is the `PlanSpec`, and the spec is on screen.** Each turn the model
receives the current spec plus the new utterance and returns a full replacement spec. The user can edit any
field by hand at any time, and a hand edit is authoritative over anything the model said. There is no
conversation transcript in the model's context, so there is nothing to drift.

This also means the builder degrades to a plain form when the model is unavailable, which is the correct
failure mode for a feature whose output is arithmetic.

## 3. Interface: `PlanSpec`

```ts
// web/src/lib/plan/spec.ts
export type PlanScope =
  | { kind: 'book'; book: string }            // canonical book slug
  | { kind: 'range'; ref: string };           // a parseable reference, e.g. "Romans 1-8"

export interface PlanSpec {
  scope: PlanScope;
  weeks: number;                 // 1..104
  days_per_week: number;         // 1..7
  unit: 'chapter' | 'verses';
  amount: number;                // chapters or verses per reading day
  start_date: string;            // 'YYYY-MM-DD', the user's LOCAL calendar date
  translation: string;           // must be a shipping translation id
}
```

Validated at the edge with a schema parse, per `CLAUDE.md` coding standards. Every field is bounded; `weeks`
and `amount` have ceilings because an unbounded spec is an unbounded expansion.

`start_date` is a local calendar date string, never a `Date` and never an ordinal. `today.ts:20-24` records
why in this codebase specifically: "day 60 is Feb 29 in a leap year and Mar 1 otherwise, so an ordinal
silently shifts every entry after February." Plan expansion inherits that lesson or repeats the bug.

## 4. Interface: expansion

```ts
// web/src/lib/plan/expand.ts
export interface PlanDay {
  day_index: number;             // 1-based, contiguous
  date: string;                  // 'YYYY-MM-DD' local
  anchors: VerseRange[];         // canonical verse IDs
  book_slug: string;
  chapter: number;
}

export function expandPlan(spec: PlanSpec): { ok: true; days: PlanDay[] } | { ok: false; reason: string };
```

Pure function. No I/O, no model, no clock (the clock arrives as `spec.start_date`). Fully unit-testable, and
it must be, because every date bug in a reading plan is silent and only surfaces weeks later.

**Do not put this in `bible/`.** `CLAUDE.md` §Sync guards makes `src/bible/` and `web/src/bible/` byte-identical
under `test/bible-sync.test.ts`. Only the web app needs plan expansion, so putting it there arms a guard for no
benefit and doubles the edit cost. It lives in `web/src/lib/plan/` and imports from `bible/`.

## 5. Verification: the plan is code output, so the contract addition is not what I first proposed

An earlier framing had the model emit a `plan` block that the verifier checks. **That contradicts §2**: a model
emitting `days[]` is a model emitting the schedule. Resolved as follows.

- The **schedule** is code output. It needs no verifier, in the same way `today.ts` needs none: "no verifier
  runs on this read path (no generation)." It needs *tests*, which are stronger.
- The **materials attached to each day** are retrieval output, and they get the checks the answer contract
  already has. Reuse the existing vocabulary rather than inventing a parallel one: `section_resolves`,
  `attribution_author`, `attribution_work`, `attribution_tradition`.

Three new checks, all mechanical:

| Check | Property |
|---|---|
| `plan_days_contiguous` | `day_index` is 1..N with no gap, dates are strictly increasing, no date repeats |
| `plan_within_scope` | every day's anchors fall inside `spec.scope`; the union of all days covers the scope exactly once |
| `plan_sources_admitted` | every attached `section_id` is admitted by the shipped serving predicates at render time, not at build time |

`plan_sources_admitted` is the load-bearing one. A plan is a stored artifact that outlives a quarantine ruling.
If admission were checked only when the plan was built, a work withdrawn six weeks later would keep serving
inside every plan that captured it. Check at render, filter silently, and tell the user a source is no longer
available. This is the same failure the reader already has in reverse (a status flip that does not reach the
flat store, `legal-corpus.ts:74-78`), and it is cheaper to design out now than to discover.

**No new contract block type.** `OUTPUT_CONTRACT.md` forbids block types outside the schema, and the existing
`ReadingBlock` (`web/src/contract/types.ts:58-61`) already covers "here are sources to read" if a plan ever
needs to appear inside an answer.

## 6. The coverage gate: refuse a scope before building it

`PRODUCT_ARCHITECTURE.md:21`: "A mode can only be as good as the retrieval underneath it."

Topical retrieval is the weakest measured category, and `docs/DECISIONS.md` records topical queries as
"coverage-blind by construction," unsolved. A plan builder that picks passages by topical retrieval will
produce a confident, dated, eight-week schedule over passages the corpus cannot support. That failure is worse
than a bad answer because the user commits eight weeks to it.

**Derived table, rebuilt on every publish flip:**

```sql
-- migration 038 (re-measure the next free number; other work may land first)
CREATE TABLE verse_coverage (
  verse_id       INTEGER PRIMARY KEY,     -- canonical verse ID
  author_count   SMALLINT NOT NULL,       -- distinct ADMITTED authors anchored over this verse
  section_count  INTEGER  NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Not user data, so no RLS. It must therefore be classified in `USER_TABLE_EXCLUDED` in
`scripts/lib/user-data-invariant.mjs` or `test/invariants/user-data-invariant.test.ts` goes red. That is not
optional bookkeeping; it is the mechanism that keeps the user-table census honest.

**It must be derived, never hand-maintained.** The failure-mode watchlist in `docs/pm/MASTER.md` is at eleven
instances of a hand-typed expected set, one of them introduced by the tranche meant to fix the class and one
guarded by a test built from the same wrong list. The rebuild script computes `author_count` from
`section_anchors` joined against **the shipped admission predicates**, and its test derives the expected set
the same way. A typed list of admitted authors here would be instance twelve.

**Two uses, and the second pays for the table on its own:**

1. The builder refuses up front: "I can build a plan over Romans. I cannot build one over Song of Solomon;
   the corpus has no commentary on it." Honest, specific, before the user commits.
2. `hasPassageCoverage` (`web/src/lib/teacher/teach.ts:132`) currently decides "no coverage" **after** paying
   for one embedding call and four vector queries. One indexed lookup before the embed replaces that. This is
   a direct cost reduction on the paid path and it is independent of whether plans ever ship.

## 7. A plan day is a `DailySource`

`web/src/lib/today.ts:68`: "A source picks the passage. Tier 1/2 later = another impl of THIS, emitting the
same shape." The seam was built for this.

```ts
export function planSource(planId: string, days: PlanDay[]): DailySource;
```

It returns the same `PickedDay`, so it inherits voice attachment, the license filter, the register wall, the
grounding invariant and the render **for free** — and it inherits the guarantee at `today.ts:6-12` that the app
authors nothing but the date and a bare attribution.

One difference from `spurgeonSource` worth naming: Spurgeon's entry carries a `lead` with attributed devotional
prose (his verbatim words). A plan day has no lead author, so `lead` is absent and the day renders as
passage plus voices. The `Rung` degrade ladder still applies: verse-exact, then whole chapter, then
passage-only. **A plan day with no voices renders the passage, never a substitute.**

## 8. Delivery: a signed `.ics` feed

Two facts about this codebase decide the delivery mechanism. There is **no cron** (`docs/pm/MASTER.md` gate B3,
Vercel Pro, OPEN) and there is **no outbound email or push of any kind**. So nothing can *arrive*. A plan that
only lives in the app is a plan the user has to remember to open.

A subscribable calendar feed inverts this: the user's own calendar client does the polling and the reminding.
No cron, no push, no email, no OAuth.

```
GET /api/plans/{planId}/feed.ics?t={token}
```

- `token` is an HMAC over `(user_id, plan_id, salt)` with a server-only secret and a per-plan salt. Rotating
  the salt revokes the URL. **This is a bearer URL and therefore a new auth surface**, smaller than OAuth but
  not zero. State it plainly rather than claiming it is free.
- The feed contains **no personal data and no composed prose**: `SUMMARY` is `Ancient Paths: Romans 1:1-17`,
  `DESCRIPTION` is a deep link to the day in the reader, `DTSTART` is an all-day event on the local date.
- ADR-011 requires that "any AI-composed content pushed out (sermon draft, study plan) still passes the
  verifier — the concordance guarantee extends to exports." Satisfied trivially: nothing composed is in the
  feed. That is a design choice, not an accident, and it should stay that way. The moment a devotional
  paragraph goes in an event body, this export needs the full verifier and `ROADMAP.md:237-242` re-arms V2.
- **This is not a Composio integration** and does not consume ADR-011's "pick ONE integration" budget. Composio
  Google Calendar *write* remains the later option for users who want editable events.

**Scaling risk, named.** Calendar clients poll. Apple Calendar can be set to every 5 minutes; Google refreshes
on its own schedule, typically hours. At 100k plans with a 1-hour average poll that is ~28 requests/second on
an uncached authenticated-by-token route, against a database with no cache layer anywhere
(`web/next.config.ts` sets no cache headers; there is no Redis, no `unstable_cache`). Mitigations, in order:
serve `Cache-Control: public, max-age=3600` with a strong `ETag` over the plan's `updated_at`, answer
conditional requests with 304, and read the feed from the stored `plan_days` rows in one indexed query. Measure
it in the §9.6 load-test suite before this ships, not after.

## 9. Data model

```sql
-- migration 038 (re-measure the number)
CREATE TABLE plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  spec          JSONB NOT NULL,          -- the validated PlanSpec
  feed_salt     TEXT NOT NULL,           -- rotate to revoke the .ics URL
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plan_days (
  plan_id       UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day_index     INTEGER NOT NULL,
  day_date      DATE NOT NULL,
  verse_start   INTEGER NOT NULL,
  verse_end     INTEGER NOT NULL,
  completed_at  TIMESTAMPTZ,             -- NULL = not yet read
  PRIMARY KEY (plan_id, day_index)
);
CREATE INDEX idx_plan_days_date ON plan_days(plan_id, day_date);
```

Both carry the standard block: `ENABLE ROW LEVEL SECURITY`, a cmd=ALL policy on
`current_setting('app.current_user_id', true)` in both `USING` and `WITH CHECK`, no new `GRANT` (migration 001's
`ALTER DEFAULT PRIVILEGES` covers it), all access through `runAsUser`, and an explicit `WHERE user_id = ...`
belt in every query. `plan_days` has no `user_id`, so its policy goes through `EXISTS (SELECT 1 FROM plans ...)`
and its writes use the `INSERT ... SELECT ... WHERE EXISTS` pattern from `web/src/lib/chat.ts:122-134`.
Both must be classified in `USER_TABLE_SPEC`. **RLS is proven with two real accounts, not by reading policy**
(`CLAUDE.md` §Security). Neither product walk has ever used a second account, so this is the first feature that
must not inherit that gap.

### 9.1 Why not `study_guides`

`db/schema.sql:145-157` already has a table whose header comment reads "Study guides (topical studies, reading
plans)." It is tempting and it is wrong for this:

- It has `channel_id UUID REFERENCES channels(id)`. The channels UI is a `ComingSoon` stub and
  `PRODUCT_ARCHITECTURE.md:30` calls the channel metaphor "misleading; this is a personal workspace." A new
  feature should not take a dependency on a table the architecture doc is retiring.
- `sections JSONB` and `progress JSONB` predate the `sources`/`sections` model (ADR-010). Storing plan days as
  an opaque blob forfeits the `(plan_id, day_date)` index that the `.ics` feed and the "what is today" query
  both want.
- It has 0 rows in production and 0 code references, so nothing is lost by leaving it.

**Owner call (§11.4):** supersede `study_guides` and drop it in a later migration, or leave it dormant.

## 10. Out of scope

- **Streaks, badges, and completion percentages beyond a simple day count.** Retracted from an earlier draft.
  Nothing in the product docs asks for them, `WORKLOG.md` records streaks as explicitly not built for the Today
  screen, and a streak counter sits badly against the product's own stated tone.
- **Shared or group plans.** `PRODUCT_ARCHITECTURE.md:52`: personal-first, collaboration only if users ask.
- **Topical plans** ("a plan on suffering"), until §6's coverage table exists and topical retrieval clears its
  bar. Book-scoped and range-scoped only in the first slice.
- **Any AI-written study question, discussion prompt, or day summary.** `ROADMAP.md:237-242` makes V2 a required
  pre-ship gate the moment the app-voice generative surface expands, and the current 35/35 bait result is
  "bound to the extractive composer" and "does not transfer."
- **Composio calendar write, Google Docs export, sermon management.** ADR-011 sequencing: record now, build later.
- **Plan templates and sharing a plan with another user.** Flat first (`PRODUCT_ARCHITECTURE.md:50`).

## 11. Owner decisions

| # | Decision | Blocks |
|---|---|---|
| 11.1 | Does this get built at all before Workspace Paths? `PRODUCT_ARCHITECTURE.md:65` says Workspace Paths is the likely first mode | everything here |
| 11.2 | Is a bearer-token `.ics` URL an acceptable auth surface, given `docs/SECURITY.md` treats integrations as auth-grade? | §8 |
| 11.3 | Does `verse_coverage` ship independently of plans? It reduces cost on the paid Ask path on its own | §6 only |
| 11.4 | Supersede `study_guides`, or leave it dormant? | §9 migration shape |

Proposed **ADR-045** (next free number is 045; re-measure): "Study plans are code-generated schedules over a
coverage-gated scope, delivered by subscribable feed." Records: the model emits only a `PlanSpec`; the schedule
is arithmetic; admission is checked at render not at build; `.ics` is not a Composio integration and does not
consume ADR-011's single-integration budget.

## 12. Smallest slice, and its red-proofs

Build order, each step shippable and each with a check that could have failed:

1. **`expandPlan` alone**, no UI, no DB. Red-proof: a spec starting 2026-02-27 with 5 days/week produces
   correct dates across the leap boundary; seed an ordinal-based implementation and watch it go red.
2. **`verse_coverage` + rebuild script.** Red-proof: seed a published work, rebuild, watch `author_count` rise;
   flip it to `staged`, rebuild, watch it fall. Then wire `hasPassageCoverage` to it and measure the saved
   embed calls. This step is independently valuable (§11.3).
3. **`plans` + `plan_days` + RLS.** Red-proof: two real accounts, account B cannot read, write or delete
   account A's plan, through the HTTP routes and not only the data layer.
4. **The builder UI as a plain form**, no model. Proves expansion and storage end to end.
5. **The model's intent parse**, added in front of the form. Red-proof: an adversarial prompt instructing the
   model to emit specific dates must produce either a valid `PlanSpec` or a refusal, never a schedule. This is
   the property from §2 and it is the one thing in this document that a prompt change can silently break.
6. **`planSource` on the Today screen.**
7. **The `.ics` feed**, with the poll-load measurement from §8 recorded before it is announced.
