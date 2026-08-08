---
doc: Ancient Paths — UX/Design Remediation Spec
version: 1.4
source: August 2026 in-depth UX audit deck + independent live walkthrough (authenticated desktop)
changelog: |
  1.4 - R0 executed (2026-08-07, branch fix/R0). Owner decisions applied on its findings:
      - STRUCK BY RECON: N3b step 2 (move the verse click binding to the verse span) — this repo
        shipped it, measured it breaking double-click word selection, and reverted it under owner
        ruling ADR-047, guarded by verse-open-gesture.test.tsx. ADR-047 stands. Its exit-test line
        ("clicking verse text opens the drawer") is struck with it, since that check could only
        pass by breaking the ruling. N3b now reduces to step 3.
      - STRUCK BY RECON: S2 old item 2 (import the Library skeleton into the reader) — the reader
        already has ChapterSkeleton, built to mirror VerseDisplay's box; doing it as written
        reintroduces the layout shift.
      - STRUCK: S2 old items 9, 10, 11 — present in no version of this document, unrecoverable.
        S2 renumbered so heading, status board and table all read 9 (old→new: 1→1, 3→2, 4→3, 5→4,
        6→5, 7→6, 8→7, 12→8, 13→9). All cross-references updated. Struck rows are recorded in the
        block rather than deleted, so S2's "nothing silently dropped" exit test can still be met.
      - Section 2.2 amended: the naming lock applies to USER-VISIBLE STRINGS ONLY. Wire fields are
        explicitly exempt — `lanes` on POST /api/ask/stream stays, and only its rendered label
        changes. The greps are re-scoped to the label surfaces; as written they could not return
        zero (R0 measured 106 hits, nearly all comments and exempt identifiers).
      - T4: the user_profiles migration is flagged as an OWNER DECISION and is a precondition of
        the block, not part of it. Translation has a dormant column; theme and text size have no
        column at all.
      - CLAUDE.md's scope-creep pointer corrected to section 9 (the Backlog). It had never been
        appended to CLAUDE.md at all — R0 found the snippet missing, not merely stale.
  1.1 - L2c rewritten: date-locale root cause corrected after direct testing (client locale,
        not server locale). Fix retained, rationale changed, hydration check added.
      - Auth migration (Supabase/OAuth) recorded as a dependency for T1/T2, and explicitly
        NOT a blocker for L1/L2 pending INSTR's finding on the plan-write status code.
  1.3 - Added section 0.0 reconciling this spec with the repo's standing conventions
        (CLAUDE.md DoD, WORKLOG/ROADMAP/DECISIONS, quality-slice + deep-audit skills,
        design-before-code, and the pre-existing design docs several blocks overlap).
  1.2 - Merged the Prayer-journal addendum (triage of a third-party audit + owner direction).
        N4 replaced: Channels repurposed as Prayers, Study Partners hidden. S2 gains items
        12-13. New Wave 5 (product, not remediation): PR1a, PR1b, PR2. New constraint C9
        (one-way retrieval). Sections renumbered: Backlog 8->9, Definition of done 9->10.
blocks: 16 fix blocks + 1 recon block
waves: 4 remediation + 1 product
status: not started
---

# Ancient Paths — UX/Design Remediation

Executable spec. Each block is self-contained: what was observed, the smallest change that
closes it, what must not be touched, and an exit test that decides when it is done.

**Read section 0 before doing anything.** It contains the constraints that keep this
remediation small. Most of the failure modes for this work are not "the fix was wrong" —
they are "the fix was four times bigger than it needed to be."

---

---

## 0.0 How this fits this repo

This spec was written before its author had repository access. The repo has mature standing
conventions in `CLAUDE.md`, `AGENTS.md`, `docs/ENGINEERING.md` and `docs/THE_LOOP.md`.
**Where this document and the repo's standing rules disagree, the repo wins.** The mapping:

| This document | The repo's existing convention | Rule |
|---|---|---|
| "Exit test" | **Definition of Done** in `CLAUDE.md` | The repo's DoD is *stricter* — it additionally requires `npm run audit` green and any UI change actually loaded in a browser at 390px **and** desktop width, with a screenshot. A block is not done until **both** its exit test and the repo DoD pass. |
| "Findings log" (in-block) | `WORKLOG.md` + `docs/DECISIONS.md` | Write findings to `WORKLOG.md` per the working protocol. Keep the in-block log as a short pointer, not the record. Architectural/irreversible calls go in `docs/DECISIONS.md`. |
| "Status board" (section 1) | `ROADMAP.md` | `ROADMAP.md` remains the source of truth for status. Section 1 is a local view; update both. |
| "One branch per block" | "Commit per logical change and push" | Compatible. Do not leave a large uncommitted tree. |
| Constraint C2 (escalate reluctantly) | "Boring, obvious code / no premature abstraction" | Same rule, different words. |
| Constraint C9 (one-way retrieval) | The product guarantee + `docs/PRINCIPLES.md` I1–I6 | C9 is a **data-privacy extension** of the existing guarantee, not a replacement. The guarantee says never interpret; C9 says never index the user's own words. Both hold. |

**Design-before-code applies.** `CLAUDE.md` requires a short design doc for anything touching
data model, auth, retrieval, or the output contract. That covers `PR1a` (new entity), `PR1b` and
`PR2` (retrieval surfaces), and `T4` (account/data). Check `docs/` first — several of these may
already have one:

- `docs/NOTE_RESONANCE_DESIGN.md` — very likely already covers `PR2`. **Read it before writing
  anything for `PR2`; do not duplicate or contradict it.** If it supersedes `PR2` as written
  here, say so and defer to it.
- `docs/AUTH_CUTOVER_DESIGN.md` — the auth migration `T1`/`T2` depend on. Read before either.
- `docs/STUDY_PLANS_DESIGN.md` — relevant to `L2`, `L2b`, `L2c`.
- `docs/LIBRARY_READER_DESIGN.md`, `docs/NAVIGATION_AND_SEARCH.md` — relevant to `N1`–`N3`, `S2`.
- `docs/USER_DATA.md`, `docs/SECURITY.md` — relevant to `T4`, `C9`, and the `PR` blocks.
- `docs/REMEDIATION_CHECKLIST.md` — **a different, pre-existing document.** Do not confuse the
  two; reconcile if they overlap.

**Existing skills take precedence over this document's procedures.** `quality-slice` governs any
retrieval/eval/corpus slice — which includes `PR1b` and `PR2`. `deep-audit` runs before any
production deploy. Neither is optional, and this spec does not override them.

**A caution about `R0`.** Its table exists because this spec was written blind. Much of it is now
answerable by reading the tree directly. Fill it in from the repo — and treat any place where
this document's assumptions contradict the actual code as the document being wrong, not the code.

---

## 0. How to work this document

### 0.1 The loop — run this inside every block

```
1. READ the exit test.
2. WRITE the exit test as a runnable check where possible (test, script, grep).
   Do this BEFORE touching product code.
3. MAKE the smallest change in the "Minimal change" list. Nothing else.
4. RUN the exit test.
     fail  -> change the FIX, never the TEST. Return to 3.
     pass  -> continue.
5. VERIFY in the real UI at three viewports (or on the device the block names).
6. REGRESS: run the exit tests of any block sharing the same surface.
7. COMMIT on the block's own branch. Update the status board in section 1.
```

### 0.2 Hard constraints

These are not preferences. A change that violates one of these should be reverted even if
it works.

| # | Constraint |
|---|---|
| C1 | **Never edit an exit test to make it pass.** If the test is genuinely wrong, stop and flag it in the block's Findings log. Do not silently rewrite it. |
| C2 | **Escalate reluctantly.** In order: a string -> a CSS declaration -> moving existing code -> a new component. Do not skip levels. Most blocks here resolve at level 1 or 2. |
| C3 | **Reuse before writing.** Several blocks depend on components that already exist in this codebase. Block `R0` confirms which. If a "reuse" claim turns out to be false, stop and report — do not build the missing thing without saying so. |
| C4 | **No new dependencies** without writing the justification into the block's Findings log first. |
| C5 | **One branch per block**, named `fix/<block-id>`. A block that turns out wrong reverts cleanly. |
| C6 | **Scope creep goes to the backlog, not the branch.** Anything discovered mid-block that needs more than the stated minimal change is appended to section 9 and left alone. |
| C7 | **If the minimal change does not close the finding, STOP.** Do not expand scope to force it. Report what you found and what it would actually take. |
| C8 | **Do not proceed to the next wave** until every block in the current wave has all `AGENT` exit checks passing and every `HUMAN`/`DEVICE` check either passed or explicitly deferred with a written reason. |
| C9 | **ONE-WAY RETRIEVAL.** Cross-reference and comparison read *from* the library *to* the user's content. User content — prayers, notes, highlights — is **never** indexed into any retrieval corpus: not Ask, not passage search, not another user's cross-references, not "to improve results". The user's words are the query, never the material. This is both the privacy guarantee that makes the prayer feature usable and the interpretation boundary that keeps comparison inside the brand promise. It binds every block, not just Wave 5. |

### 0.5 C9 in practice — the leak vectors

C9 is easy to state and easy to violate accidentally. The three routes that actually break it:

1. **Retrieval indexing.** The obvious one. Covered by each Wave 5 block's exit test.
2. **Error reporting.** If Sentry (or any error SDK) is wired up per `INSTR`, an exception thrown
   inside the prayer editor can capture prayer text in breadcrumbs, component state snapshots,
   or a serialised request body — and ship it to a third party. **Neither audit nor the addendum
   caught this.** Scrub the prayer and note surfaces explicitly: `denyUrls`/`beforeSend` on the
   editor routes, and no state serialisation from those components. Add this to `INSTR` if Sentry
   lands, and re-verify it in `PR1a`.
3. **Analytics.** Count and existence only — never content, never excerpts, never length
   distributions fine-grained enough to fingerprint.

### 0.3 Verification classes

Every exit check is tagged. **You can only mark `AGENT` checks yourself.**

| Tag | Meaning | Who signs it off |
|---|---|---|
| `AGENT` | Verifiable from code, tests, grep, or build output | You |
| `BROWSER` | Needs a rendered page — headless browser or dev server is acceptable | You, if browser tooling is available; otherwise a human |
| `HUMAN` | Needs a person's judgement (readability, comprehension, watching a real user) | A person. Never mark this yourself. |
| `DEVICE` | Needs real hardware — iOS Safari, Android Chrome, a screen reader | A person on that hardware. Never mark this yourself. |

If a block has `HUMAN` or `DEVICE` checks and no one is available to run them, the block is
**blocked**, not done. Say so.

### 0.4 When to stop and ask

Stop and report rather than proceeding if any of these happen:

- A "Minimal change" step turns out to require touching more than roughly 3 files, or more
  than roughly 50 lines, unless the block explicitly says otherwise.
- A `reuse the existing X` instruction is wrong because X does not exist.
- Fixing a block requires changing a public route, a database schema, or an API contract.
- Two blocks turn out to conflict.
- The root cause is materially different from the hypothesis written in the block.

---

## 1. Status board

Update this as blocks complete. `-` = not started, `~` = in progress, `x` = done,
`!` = blocked (write why in the block's Findings log).

| Wave | Block | Title | Status |
|---|---|---|---|
| 0 | `R0` | Repo reconnaissance — fill in before any work | `x` |
| 1 | `INSTR` | Instrument both loops before touching them | `x` |
| 1 | `L1` | Ask — guarantee a terminal state, never lose the question | `-` |
| 1 | `L1b` | Ask — set an expectation for the wait | `-` |
| 1 | `L2` | Plan progress write must succeed | `~` |
| 1 | `L2c` | Human-readable plan names, correctly localised dates | `-` |
| 2 | `N1` | Rename sweep — strings only, no route changes | `-` |
| 2 | `N2` | Sidebar must reveal it has more in it | `-` |
| 2 | `N3` | Verse interactivity — uniform first, then visible | `-` |
| 2 | `N4` | Close the fake doors | `-` |
| 2 | `L2b` | Plan builder must not open in an error state | `-` |
| 3 | `T1` | First run — teach the one idea that differentiates | `-` |
| 3 | `T2` | Sign-up basics + passive email verification | `-` |
| 3 | `T3` | Mobile — tab bar must not cover scripture | `-` |
| 3 | `T4` | Settings that follow the user; an account section | `-` |
| 4 | `S1` | Landing page — show the product | `-` |
| 4 | `S2` | Polish sweep — 9 small fixes, one branch | `-` |
| 5 | `PR1a` | Prayer journal — the space and the entity | `-` |
| 5 | `PR1b` | Prayer journal — "From the tradition" rail (separable) | `-` |
| 5 | `PR2` | Compare a note with the tradition | `-` |

### Dependency graph

```
WAVE 1   [R0] --> [INSTR] --+--> [L1] --> [L1b]
                            |
                            +--> [L2]
         [L2c]  independent, ship any time

WAVE 2   [N1] --> [N2]
         [N1] ------------------------------+
         [N3a hydration] --> [N3b affordance] --+--> (T1, wave 3)
         [N4]   independent
         [L2b]  independent

WAVE 3   [T1] <-- requires N1 + N3b
         [T2] [T3] [T4]  all independent

WAVE 4   [S1] [S2]  independent

WAVE 5   [N1 naming lock] --> [PR1a] --> [PR1b]
         [S2 item 9 Lectio] ..soft..> [PR1a]
         [PR1a] --> [PR2]          (shared one-way retrieval mechanic)
         [T4 export] <-> [PR1a]    see PR1a note: whichever ships first
                                    must not hardcode its entity list
```

> **Wave 5 is product, not remediation.** Waves 1–4 close audit findings. Wave 5 builds a
> feature. It is in this document because it shares the naming lock, the polish work, and
> constraint C9 — not because the remediation is incomplete without it. **Section 10's
> definition of done does not include Wave 5.**

---

## 2. Naming — locked, do not re-litigate

Applied in block `N1`. These are decided.

| Old | New | Where |
|---|---|---|
| The corpus | **All items** | Sidebar, library hub, breadcrumbs |
| My library | **Saved** | Sidebar, page title. Route stays `/library/notes` |
| My Works | **My uploads** | Sidebar, page title, uploads page |
| Ancient Paths (sidebar nav item) | **Ask** | Sidebar only. Product name unchanged. |
| AP (mobile tab) | **Ask** | Mobile tab bar |
| ... 3 of 3 lanes | **... 3 of 3 collections** | Ask scope picker |
| CHANNELS | **PRAYERS** | Sidebar section. Repurposed as the prayer journal (`PR1a`). There is no longer a Channels concept in the product. |
| STUDY PARTNERS | *(removed)* | Hidden per `N4`. Any future cohort feature is greenfield, not a revival of this section. |
| New section | *(removed)* | No referent once sections are gone. |

### 2.1 Consequential renames — do not miss these

Choosing *All items* over *All works* changes the counted noun everywhere. Renaming the nav
while leaving these on the old noun reads as sloppier than the jargon it replaced.

| Current | Becomes |
|---|---|
| `33 works`, `7 works`, `45 works`, `15 works`, `12 works`, `1 work` | `33 items`, `7 items`, ... `1 item` |
| `Search your works, or type a passage like Romans 8` | `Search your uploads, or type a passage like Romans 8` |
| `9 sources across the corpus` | `9 sources across the library` |

### 2.2 Verification greps

> **Amended 2026-08-07 by owner decision, after `R0`.** The naming lock applies to
> **user-visible strings only.** Identifiers, type tags, comments and **wire fields are
> explicitly exempt** — renaming a wire field is an API contract change, which section 0.4
> forbids inside a strings-only block.
>
> **Exempt by name, do not rename:**
>
> | Thing | Where | Why |
> |---|---|---|
> | `lanes` | request field of `POST /api/ask/stream` (`route.ts:25-27,62-71`), and the `Lanes`/`LaneKey` types in `ask-client.tsx` | API contract. Only the **rendered label** `… 3 of 3 lanes` changes. |
> | `kind: 'work'` | desk-pane discriminated union, `lib/desk.ts` and `desk-pane.tsx` | Type tag, also serialised into `/desk?p=` URLs. |
> | `work` | `contract/schema.json` output-contract field; `metadata->>'work'` in SQL | The output contract and the corpus schema. |
> | `/library/notes`, `/library/uploads` | routes | Section 9 already defers route renames. |
>
> The greps below were written against the whole tree and **could not return zero** — `R0`
> measured 106 hits for the first one, nearly all comments and the exempt identifiers above. They
> are re-scoped to the label surfaces, which is what the lock actually governs.

```bash
# The label surfaces the naming lock governs. Must return zero after N1.
LABELS='web/src/components/sidebar.tsx web/src/components/mobile-nav.tsx web/src/app/library'
rg -n --glob '!*.test.*' -i 'the corpus|my works|my library' $LABELS
rg -n --glob '!*.test.*' '\bAP\b' web/src/components/mobile-nav.tsx
rg -n --glob '!*.test.*' 'lanes' web/src/components/ask-client.tsx | rg -v 'LaneKey|Lanes|lanes\[|lanes\}|lanes,|lanes:'

# The counted noun. Two user-visible call sites; `count()` lives in web/src/lib/plural.ts.
rg -n --glob '!*.test.*' "count\((.*), 'work'\)|work\\\$\{" web/src/app
```

**Known user-visible sites, measured by `R0`** — if `N1` changes more than these plus the page
headings, it has left its scope:

| String | Site |
|---|---|
| `AP` | `mobile-nav.tsx:51` — exactly one occurrence in the tree |
| `The corpus` | `sidebar.tsx:282`, `library/page.tsx:108` |
| `My library` | `sidebar.tsx:320`, `library/page.tsx:23`, `library/notes/page.tsx:49` |
| `My Works` | `sidebar.tsx:343`, `library/page.tsx:27`, `library/uploads/page.tsx:13`, `library/uploads/[id]/page.tsx:3` |
| `N works` | `library/page.tsx:126` (via `count()`), `library/[catalog]/page.tsx:177` (hand-rolled ternary) |
| `sources across the corpus` | `library/passages/page.tsx:405` |
| `New section` | `sidebar.tsx:259` |

---

## 3. `R0` — Repo reconnaissance

**Wave:** 0 · **Depends on:** nothing · **Blocks:** everything · **Status:** `[x]` **done 2026-08-07**

This spec was written from the outside — from a live walkthrough and an audit deck, with no
access to the codebase. Several blocks assert that something already exists and can be
reused. **Confirm each one before trusting the effort estimates.** If a claim is wrong, the
block that depends on it needs rescoping, and you should say so rather than quietly building
the missing piece.

Fill in the table below. This is the deliverable for `R0` — no product code changes.

| What | Why it matters | Path / finding |
|---|---|---|
| Framework + router | Determines how `T1`'s post-signup redirect works | **Next.js 16.2.12 App Router, React 19.2.8.** Root `web/src/app/layout.tsx`; 23 `page.tsx` routes under `web/src/app/`. Dev server is `next dev --turbopack`. |
| Sidebar nav item definitions | `N1`, `N2`, `N4` all edit this | **`web/src/components/sidebar.tsx`** — labels are inline JSX props on a `<NavItem>`, not a table: `The corpus` L282, `Passage search` L311, `My library` L320, `Word study` L329, `My Works` L343, `Settings` L358, `New section` L259. Mobile tab bar is a real array: **`web/src/components/mobile-nav.tsx:44-57`**. Library-hub duplicates of the same labels: `web/src/app/library/page.tsx:23-27`. |
| Skeleton loader component | `S2` claims it exists on Library pages and can be imported into the reader | **CLAIM FALSE — and the work is already done anyway.** `web/src/app/library/loading.tsx` is a Next.js route-convention `default export`, not an importable shared component, and its shape is the library hub's. The reader **already has its own skeleton**: `ChapterSkeleton`, `web/src/app/read/[book]/[chapter]/page.tsx:446`, used at L308 and L334. Its header comment states it deliberately mirrors `VerseDisplay`'s outermost box so there is no layout shift — importing the library skeleton would *reintroduce* the shift. See Backlog. |
| Verse render + click handler | `N3` moves this binding up one level | **`web/src/components/verse-display.tsx:253-275`** — handler is on the `<sup>` verse number (`role="button"`, `tabIndex`, `aria-label`, `onClick`, `onKeyDown`). **`N3b` step 2 asks for a change this repo already made, measured as broken, and reverted under an owner ruling** — `docs/DECISIONS.md` ADR-047, guarded by `web/test/invariants/verse-open-gesture.test.tsx`. See Backlog. Panel: `web/src/components/study-panel.tsx`; selection toolbar: `web/src/components/selection-popover.tsx`. |
| Book display-name map (e.g. `rom` -> `Romans`) | `L2c` claims the picker already has this | **CONFIRMED. `src/bible/books.ts:82` — `BOOK_BY_SLUG`**, byte-identical copy at `web/src/bible/books.ts` (enforced by `test/bible-sync.test.ts`). Each `Book` carries `slug`, `name`, `chapterCount` (`rom` → `Romans`, 16). Serves `L2c` (title) **and** `L2b` (chapters ÷ days-per-week) from one source. Import from `web/src/bible/books.ts`; do not edit either copy. |
| Date formatting call sites | `L2c` — grep `toLocaleDateString`, `toLocaleString`, `Intl.DateTimeFormat` | **3 call sites, 2 unpinned.** Unpinned: `web/src/components/plans-client.tsx:227` (`toLocaleDateString(undefined, …)` — the one the deck screenshotted) and `web/src/components/suggested-readings.tsx:221` (`toLocaleDateString()`, no args). Already pinned: `web/src/lib/today.ts:31` (`'en-US'`). No `Intl.DateTimeFormat` or `toLocaleTimeString` anywhere. |
| Preference persistence (theme/text size/translation) | `T4` claims the account record already persists notes | **CLAIM HALF FALSE — and the other half needs a schema change.** All three prefs are `localStorage` only: theme + size in `web/src/lib/reading-prefs.ts:53-74` (keys `reader-theme`, `reader-size`, re-read by the anti-FOUC inline script at `web/src/app/layout.tsx:82`), translation in `web/src/app/settings/settings-form.tsx:29-36` and again at `web/src/app/read/[book]/[chapter]/page.tsx:56,135`. A `user_profiles` table exists (`scripts/lib/user-data-invariant.mjs:180`) and already declares `preferred_translation` — **but zero application code reads or writes that table** (grepped repo-wide; prod census recorded 0 rows, `docs/evidence/a2-prod-readonly-2026-08-01/census.txt:58`). Notes persist to `notes`, a different table. So translation has a column and no code; theme and text size have neither. See Backlog. |
| Ask pipeline: submit / compose / verify | `INSTR`, `L1` | Client submit **`web/src/components/ask-client.tsx:156-203`** (`ask()`); transport **`web/src/app/api/ask/stream/route.ts:74-99`** (NDJSON `ReadableStream`, `maxDuration = 300`); compose/verify **`web/src/lib/teacher/teach.ts:101`** (`teach()`, emits `retrieved`/`composing`/`verifying`/`rejected`/`done` through `onEvent`). **Structured logging already exists** — `logAskOutcome` (`web/src/lib/ask-outcome-log.ts:5`) and `logEvent` (`web/src/lib/observability.ts:25`), both already called at `route.ts:82,85`. `INSTR` should extend these, not add a parallel channel. |
| Ask failure-state component | `L1` claims this exists and renders (observed in walkthrough) | **CONFIRMED, and it is richer than the block assumes.** Error state `web/src/components/ask-client.tsx:311-318` (`role="alert"` + `RetryButton`, L328); graceful fallback `L403` → `Fallback` + `RetryButton tone="fallback"` (L506). The question is already retained on the turn (`turns[].question`, L160) and retry already re-submits it (`L266`), so `L1` steps 2 and 4 are **already implemented**. What is NOT covered is a throw during *render*: `turns` is component state (`L137`) with no reset path, so the deck's "conversation resets to the empty state" (L237 shows examples only when `turns.length === 0`) can only be an unmount — an error boundary or navigation, not the fetch path. `INSTR` must settle this. |
| Plan progress write endpoint | `INSTR`, `L2` | **`POST web/src/app/api/plans/[id]/route.ts:33-62`**, body `{ kind:'day', dayIndex, completed }` → `setDayCompleted`, **`web/src/lib/plan/store.ts:287-301`** (single `UPDATE … RETURNING`, returns `false` → **404** when no row matched). Caller `web/src/components/plans-client.tsx:586-605`; the toast fires on any `!res.ok`. Four distinguishable failures reach the same toast (401 `UNAUTHENTICATED`, 400 `INVALID_REQUEST`, **404 no such plan day**, 500 `INTERNAL`) — which is exactly why `INSTR`'s sequencing question cannot be answered from the client. |
| Feature-flag mechanism | `N4` hides sections behind one | **DOES NOT EXIST.** No flag module, no `NEXT_PUBLIC_*_ENABLED`, no config gate. The only `flags` in the tree are the Ask lane booleans (`web/src/app/api/ask/stream/route.ts:25-27`), which are a per-request API field. The repo's existing idiom for "not built yet" is the `ComingSoon` component (`web/src/components/coming-soon.tsx`), used by `/study/[id]`, `/chat/[id]`, `/channel/[id]`, `/library/books` — i.e. the very placeholder `N4` exists to remove. See Backlog. |
| Test runner + existing test setup | Every exit test | **Vitest, two projects.** Root `vitest.config.ts` (`npm test`); web `web/vitest.config.ts` (`npm run qa`). Full gate `npm run audit` → `scripts/audit.sh`. Existing invariant suites live in `web/test/invariants/` and `test/invariants/` and are the right home for new exit tests. **Caveat carried from WORKLOG 2026-08-07: `npm run audit` refuses to run without a dev `DATABASE_URL`, which this tree does not have** — DB-backed legs will report NOT RUN. |
| Accent colour token (terracotta) | `S2` checkbox `accent-color` | **CONFIRMED. `web/src/app/globals.css:53-64`** — Tailwind v4 `@theme` block, `--color-accent-50` … `--color-accent-950` (oklch oxblood/terracotta). There is no `tailwind.config.*`; the theme is CSS. **`S2` item 4 is already shipped** — `ask-client.tsx:117` already uses `accent-accent-700` / `dark:accent-accent-500` (fixed at `e196e4b`). |
| Muted/tag text colour token | `S2` contrast fix | **`web/src/app/globals.css:180-181` (`--muted-foreground: --color-stone-500`) and `:202` (dark: `--color-stone-400`); ladder at `:43`.** The actual offending tag is **`web/src/components/commentary-panel.tsx:229`** — `text-stone-500` with **no `dark:` variant**, so the tradition tag keeps a light-mode value on the dark card. Fixing that one class is nearer the finding than moving a global token; measure both before choosing. |

**Exit test**

- [x] `AGENT` Every row above is filled in with a real path or an explicit "does not exist".
- [x] `AGENT` For each "does not exist", the dependent block is flagged in section 9 with a revised estimate.
- [x] `AGENT` No product code was changed in this block.

**Findings log**

> **Completed 2026-08-07** on `fix/R0`, from `ef5f619`. No product code touched — the diff is this
> document only. Sources: direct reads of the tree, plus `WORKLOG.md` 2026-08-07 and
> `docs/pm/MASTER.md` for what shipped at `e196e4b`.
>
> **Four "reuse the existing X" claims are false, and each rescopes its block.** Listed by cost.
>
> 1. **`T4` — "the account record already persists notes", so prefs can move onto it.** The
>    account record for *preferences* does not exist. `user_profiles` is declared in
>    `USER_TABLE_SPEC` with a `preferred_translation` column, has **zero application read or write
>    paths**, and held 0 rows in the last prod census. Notes persist to `notes`, which is not the
>    same record. So `T4` item 1 is: translation = wire up a dormant column; theme + text size =
>    **add columns**, i.e. a migration. Section 0.4 says a schema change is a stop-and-report, so
>    `T4` needs an owner decision before it starts — not a store swap.
> 2. **`N4` — "hide the sections behind a feature flag".** There is no flag mechanism. The repo's
>    idiom is the `ComingSoon` stub, which is the thing `N4` removes. Hiding must be a static
>    edit. **Worse for `PR1a`:** `N4` says the Channels section "already implements exactly the
>    shell the prayer journal needs". Visually yes — but it is **`localStorage` only**
>    (`sidebar.tsx:111-122`, key `study-sections:v1:<userId>`), and `sidebar.tsx` contains **no
>    `fetch` at all**, while `/api/channels/route.ts` and the `channels` table both exist and are
>    never called from it. `PR1a` inherits a shell with no persistence — the orphaned-write-path
>    shape A7b already found on bookmarks. This also makes `N4` step 5 ("migrate existing channel
>    objects") largely unexecutable server-side: those objects are in each browser's localStorage.
> 3. **`N3b` step 2 — "move the click binding up to the verse span; relocating, not writing".**
>    This repo shipped that binding, measured it breaking double-click word selection, and reverted
>    it under **owner ruling ADR-047** (`docs/DECISIONS.md:1099`), with
>    `web/test/invariants/verse-open-gesture.test.tsx` standing guard. Doing `N3b` step 2 turns that
>    test red and relitigates an owner ruling, which `AGENTS.md` forbids. `N3b` steps 1 and 3 are
>    unaffected — but step 1 is **already shipped** (`verse-display.tsx:272` has `cursor-pointer`
>    and a hover shift; `:253-263` has `role`/`tabIndex`/`aria-label`/`onKeyDown`).
> 4. **`S2` item 2 — "import the Library skeleton into the reader".** `library/loading.tsx` is a
>    route convention, not a component, and the reader already has `ChapterSkeleton`
>    (`read/[book]/[chapter]/page.tsx:446`) built to mirror `VerseDisplay`'s box. The item is done;
>    doing it as written would be a regression.
>
> **Five more items are already shipped** — all at `e196e4b`, 2026-08-07, after both audits were
> written. Verify before working them, do not re-do them: `S2` item 4 (Ask checkbox
> `accent-color` — `ask-client.tsx:117`); `S2` item 7's sidebar half (`aria-label` on the pencil
> and `+`, `sidebar.tsx:474,481` — the `title` tooltip half is genuinely absent); `N2`'s overflow
> affordance (the scroll mask, MASTER UX-5, red-proofed both ways); `N3b` step 1 as above; and the
> `Account` link `T4` calls missing (`/account/settings` exists, shows the email and a working
> change-password form, and was linked at `e196e4b`). **`T4`'s remaining gap is export and
> deletion, not "a single link".**
>
> **Two claims are about things that are not in this build.**
>
> - **`T3` step 3 — "the duplicate `Search` tab: remove it".** There is no Search tab. The mobile
>   bar has exactly four (`mobile-nav.tsx:44-57`): Home, Bible, **AP**, Library. There is a
>   separate search *button* in the mobile header (`:85`, `aria-label="Search passages"`), which is
>   not a duplicate of anything. `T3` is padding + the `AP` rename only.
> - **`S2` item 8 — Work TOC titles.** Already investigated and answered: per
>   `work-toc.tsx:205-208` the `Part N` rows are mechanical chunks of one work whose headings are
>   all the same title with an `(i/n)` suffix. There are no per-chunk titles in the data. This is
>   item 8's own "do not fake it" branch — logged to Backlog, not built.
>
> **Three defects in this document that change the plan.**
>
> **[Resolved 2026-08-07 by owner decision — see the v1.4 changelog. The three findings below are
> kept as the record of what was found, not as open items.]**
>
> - **`S2` has lost three items.** The heading says "11 small fixes", the section 1 status board
>   says "13", and the table lists **10** — numbered 1-8, then 12, 13. Items **9, 10 and 11 do not
>   exist anywhere in the document.** The v1.2 changelog says only that 12-13 were added, so this
>   is not a renumber; three fixes are missing. `S2`'s own exit test requires that nothing is
>   silently dropped, and three things have been. **Owner input needed** — I cannot recover them.
> - **Section 2.2's greps cannot return zero, so as written they are an exit test that must fail.**
>   `rg -i 'the corpus|my works|my library|\blanes\b'` returns **106 hits in `web/src`**, most of
>   them code comments and — critically — `lanes`, which is the **wire field name** of
>   `POST /api/ask/stream` (`route.ts:25-27,62-71`). Renaming it is an API contract change, which
>   section 0.4 forbids in a strings-only block. The greps need `--glob '!*.test.*'` plus a
>   comment/identifier exclusion, or `N1`'s exit test should assert against the label sites
>   directly. The user-visible surface is genuinely small: **`AP` is exactly one line**
>   (`mobile-nav.tsx:51`) and the counted noun `works` is **two** call sites
>   (`library/page.tsx:126` via `count()` in `web/src/lib/plural.ts:10`, and a hand-rolled ternary
>   at `library/[catalog]/page.tsx:177`). Note `kind: 'work'` is a desk-pane type tag — never
>   rename it.
> - **Section numbering.** `CLAUDE.snippet.md` and the per-block prompt both say scope creep goes
>   to "section 8". Since v1.2, **section 8 is Wave 5 and the Backlog is section 9**. `R0`'s own
>   exit test says 9 and is correct. Fix the snippet before it misfiles something.
>
> **One correction to `L2c`'s scope, in its favour.** `L2b`'s "derive weeks from the book" and
> `L2c`'s "use the display name" read the *same* record — `BOOK_BY_SLUG` carries `name` and
> `chapterCount` together, and the builder's bad default is literally `book='rom'`, `weeks=8`,
> `daysPerWeek=5` (`plans-client.tsx:241,248-249`) against `chapterCount: 16`. They are in
> different waves by the document, which is fine, but neither needs a new lookup table.
>
> **Recommended next block: `INSTR`, unchanged.** It is the only block whose output changes the
> order of everything after it, and this recon narrowed it usefully — the plan-write endpoint has
> **four** distinct failure paths collapsing into one toast (401/400/404/500), and the 404 arm
> (`store.ts:300`, no matching `plan_days` row) is a real candidate the deck's auth-scope
> hypothesis does not cover. For Ask, the client cannot produce the deck's silent reset: `turns`
> has no reset path, so a reset means an unmount. `INSTR` should watch for a client-side throw or
> an error boundary, not only a failed request. Both need a live authenticated session.

---

## 4. Wave 1 — Repair the loops

Nothing else ships until both loops close. Every other finding in both audits is friction on
top of a product that works. These two are the product working or not working.

**Loop 1 (acquisition):** ask a question -> get a grounded answer -> trust it -> ask again.
Currently breaks at the payoff step: the answer never renders and the question disappears
with no error, no retry, no trace.

**Loop 2 (retention):** build a plan -> daily "due now" -> mark as read -> progress/streak ->
return tomorrow. Currently breaks at the same step: `Mark as read` returns
"That change could not be saved" on every attempt, and progress stays at 0.

---

### `INSTR` — Instrument both loops before touching them

**Wave:** 1 · **Severity:** Prerequisite · **Depends on:** `R0` · **Blocks:** `L1`, `L2` (informs, does not gate) · **Status:** `[x]` **done 2026-08-07**

**Observed**

Neither loop emits anything readable after the fact. The Ask failure leaves no trace in the
UI. The plan failure shows a toast but nothing captures the response. Every root cause in
both audits — including the ones in this document — is an *inference* from observed
behaviour.

**Root cause**

N/A. This is the block that produces causes.

**Minimal change** — do not exceed

1. Add one structured log at each of four boundaries: Ask submit, Ask compose, Ask verify,
   plan progress write. Log request id, HTTP status, error body. Nothing else.
2. Reproduce each failure 5x with the network tab recording. Save the failing response bodies
   into the Findings log below.

**Do NOT**

- Do not add an analytics vendor or error-reporting SDK for this. Four log lines and a saved
  HAR file are sufficient and removable.
- Do not fix anything here. If you find the cause in ten minutes, write it down and move to
  `L1` or `L2`. Do not start editing in this block.

**Exit test**

- [x] `AGENT` The failing HTTP status and response body for the plan progress write are pasted into the Findings log.
- [ ] `BROWSER` For Ask, you can state which failure mode fired and at which of the three stages the request died. **CANNOT BE MARKED — 2/2 attempts SUCCEEDED, so no failure mode fired. Not a pass; the check has no answer to record.**
- [x] `AGENT` Both failures are reproducible by a second person following steps written in the Findings log. **Plan write only** — steps in the evidence README §6. The Ask failure was not reproduced at all.
- [x] `AGENT` No user-visible change shipped in this block. Diff is docs only.
- [x] `AGENT` **The sequencing question below is answered in writing.** 500 → server fault → `L2` independent of the auth migration.

> **This block decides an ordering question, so do not skip it.** The audit deck hypothesised
> that the plan-write failure is an *auth-scope* fault. If that is true, an auth migration is
> entangled with `L2` and must precede it. If it is false, `L2` is independent and should be
> fixed immediately. Read the status code and write the answer down:
>
> - **401 / 403** -> auth-scoped. Sequence the auth migration before `L2`. Flag it here.
> - **400 / 422** -> validation. `L2` is independent; fix now.
> - **5xx** -> server fault. `L2` is independent; fix now.
>
> Guessing this in either direction is expensive. Reading it costs an afternoon.

**Findings log**

> **Completed 2026-08-07** on `fix/INSTR`. Full capture, controls and repro steps:
> [`docs/evidence/instr-2026-08-07/README.md`](../evidence/instr-2026-08-07/README.md).
> Live authenticated session on production; owner authorised the session and the writes and typed
> both passwords. **Build under test `b4f2a96`** — 6 commits behind HEAD. The three plan files and
> the ask stream route are byte-identical to HEAD, so the plan findings are exact; `ask-client.tsx`
> is not, so the Ask findings are about the deployed build only.
>
> ### The sequencing question — ANSWERED: `500`, therefore `L2` is INDEPENDENT of the auth migration
>
> `POST /api/plans/<id>` `{"kind":"day","dayIndex":1,"completed":true}` → **`500 INTERNAL`, 5/5**.
> The deck's auth-scope hypothesis is killed, and so is `R0`'s 404 hypothesis: a control with an
> unknown plan UUID **also** returns 500 rather than 404, so `store.ts:300` is never reached — the
> query throws before it can return zero rows. A second control (`dayIndex: 999`) returns a clean
> `400 INVALID_REQUEST`, proving the arms are genuinely distinguishable rather than assumed to be.
>
> ### ⚠ STOP-AND-REPORT — the root cause is not what `L2` hypothesises, and the fix is not client-side
>
> Vercel runtime logs: **`plan day toggle error: permission denied for table plan_days`**. Not RLS,
> not auth, not validation — a **missing `GRANT`**.
>
> `db/migrations/032_...:49` (finding H15) narrowed the schema default to SELECT + INSERT:
> `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE, DELETE ON TABLES FROM app_runtime`.
> `db/migrations/039_...:61-62` then created **both** `plans` and `plan_days` and declined to grant
> anything, on the stated grounds that *"Migration 001's ALTER DEFAULT PRIVILEGES grants
> app_runtime full DML … so no new GRANT is needed (016:33-38 records this)."* **039 > 032. That
> comment was true when 016 wrote it and false by the time 039 cited it.** Both tables were born
> without UPDATE or DELETE.
>
> `INSTR`'s "add four log lines" step was **not needed for this loop** — the `console.error` at
> `route.ts:59` already existed and was already firing. Adding server logging would have required a
> gated production deploy before it could be read.
>
> ### A second defect neither audit found: `Delete plan` is broken the same way
>
> `DELETE /api/plans/<id>` → **500**, `plan delete error: permission denied for table plans`.
> Predicted from the migration reading, then confirmed. Create and read work because INSERT and
> SELECT were never revoked. `plan_day_readings` (migration 042) is also post-032 and should be
> assumed affected until measured.
>
> **Consequence for `L2`:** its minimal-change step 1 ("fix the endpoint") is a **database
> permission migration against production**, which is an owner-gated operation (`AGENTS.md`) and a
> section 0.4 stop condition. Step 2 (optimistic toggle) is cosmetic until that lands. `L2` should
> not be worked as a client-side block.
>
> ### Production is left with one artifact that cannot be removed
>
> Plan `40e1a8fb-4da5-4307-82d5-7c84f9111a03`, `rom in 3 weeks`, on the test account. The cleanup
> promised when the writes were authorised **cannot be honoured, because `Delete plan` is one of
> the two broken operations.** It becomes deletable when the grant is fixed, and deleting it is the
> natural first check that the fix works.
>
> ### Ask — the deck's failure did NOT reproduce
>
> **2/2 succeeded** against `b4f2a96`, with the recorder armed *before* submit (`window.onerror`,
> `unhandledrejection`, wrapped `console.error`, and a `MutationObserver` watching for the turn list
> emptying). Both ended in a composed, attributed answer. The question was never lost; no unmount
> fired; zero console errors.
>
> **So neither documented failure mode fired, and the block's `BROWSER` check cannot be marked.**
> This is not a refutation of the deck — different day, account and questions, n=2 against their
> n=3 — and the silent-reset mechanism remains unobserved and unexplained.
>
> What did show up is **latency: ~104s and ~58s**, with `Refining the answer (attempt 2)…` visible
> at 71s on the first. That materially undercuts `L1b`, whose premise is "~18s success, ~45s
> failure" and whose remedy is one line after 15s — aimed at a wait less than a fifth of what was
> measured. And production carries **no retry control at all** (`RetryButton` occurs 0× in
> `b4f2a96`, 3× at HEAD), so `L1`'s step 4 is already written and merely undeployed.
>
> ### Captured in passing
>
> `L2b` confirmed live (builder opens at 40 reading days with `Create plan` disabled). `L2c` title
> confirmed live (`"title":"rom in 3 weeks"`). `L2c` dates rendered correctly for `en-US`
> (`Fri, Aug 7`), consistent with v1.1's client-locale correction; the `zh-CN` leg was not run.
> **New, in neither audit:** production CSP blocks the Google Fonts stylesheet on every page load
> (`style-src 'self' 'unsafe-inline'`), so EB Garamond, Literata and Source Sans 3 never load and
> the app renders in fallback faces. Filed to section 9 — it is not a remediation finding.

---

### `L1` — Ask: guarantee a terminal state, never lose the question

**Wave:** 1 · **Severity:** P0 Critical · **Depends on:** `R0` · **Blocks:** `L1b` · **Status:** `[ ]`

**Observed** — the two audits disagree here, and the fix is designed to cover both

- **Audit deck:** 3 of 3 attempts, two phrasings, two sessions. The answer never rendered and
  the thread silently reset to the example-question state. Question gone. No error, no retry.
- **Live walkthrough (Aug 7):** same staged progress, three visible
  `Refining the answer (attempt N)` retries over ~45s, then an *explicit* message —
  "A grounded answer couldn't be composed for this one. Here are the sources we found. Read
  them directly." — followed by a correctly-cited source list. A second question succeeded
  outright in ~18s.

Both are probably true. A graceful fallback path exists in the code; a silent reset is what
you get when a later stage throws instead of returning.

**Root cause** — hypothesis

This is a missing state-machine guarantee, not two separate bugs. A submission can currently
end in at least three ways: answer, graceful fallback, or nothing. The third is unreachable
by the user.

**Minimal change** — do not exceed

1. Enforce one invariant: **every submission resolves to exactly one of two terminal states —
   an answer, or an explicit failure with a retry control — and the question text is never
   cleared by either.**
2. Hold the question in state independent of the response.
3. Add a `catch` that routes any unhandled throw into the failure state that **already exists
   and already renders** (confirmed in the walkthrough; verify path in `R0`).
4. Retry re-submits the retained question. The user never retypes.

This is a state guard plus a retry button on an already-built component. If it turns out the
failure component does not exist, **stop** (constraint C3/C7) and report.

**Do NOT**

- Do not touch the staged progress sequence. Both audits independently name it the best-designed
  thing in the product.
- Do not chase the 45s latency here — that is `L1b`.
- Do not replace the graceful-fallback source list. Returning real cited sources instead of a
  fabricated answer is correct for this brand; it just needs a retry attached.

**Exit test**

- [ ] `AGENT` With the compose endpoint forced to fail, 5/5 submissions leave the question visible in the DOM.
- [ ] `AGENT` 5/5 render an explicit failure state containing a retry control.
- [ ] `BROWSER` Clicking retry re-runs the same question with no retyping.
- [ ] `BROWSER` Happy path unchanged: a successful question renders its answer and the staged progress is visually identical to before.

**Findings log**

> _(write here — record which failure mode INSTR actually observed)_

---

### `L1b` — Ask: set an expectation for the wait

**Wave:** 1 · **Severity:** P0 Critical · **Depends on:** `L1` · **Blocks:** — · **Status:** `[ ]`

**Observed**

~18s for a question that succeeded, ~45s for one that eventually failed. Nothing on screen
indicates which the user is in for. A 45s wait with no expectation reads as a hang; the same
wait with one honest line reads as thoroughness — which, given the app really is verifying
quotes word-for-word, it is.

**Root cause**

The progress panel communicates *what* is happening but never *how long* it may take.

**Minimal change** — do not exceed

1. One timer, one string. After ~15s, append a line to the existing progress panel:
   *"This one is taking longer than usual — still verifying every quote."*

That is the entire block.

**Do NOT**

- Do not add a spinner, percentage bar, or countdown. The staged panel is already the progress
  indicator; this is one more line inside it.
- Do not begin optimising the retrieval pipeline. Hand the timings from `INSTR` to whoever owns
  the backend and move on.

**Exit test**

- [ ] `BROWSER` A question running past 15s shows the additional line.
- [ ] `BROWSER` A question resolving quickly never shows it.
- [ ] `BROWSER` The line disappears when either terminal state renders.

**Findings log**

> _(write here)_

---

### `L2` — Plan progress write must succeed

**Wave:** 1 · **Severity:** P0 Critical · **Depends on:** `INSTR` · **Blocks:** — · **Status:** `[~]` **step 1 DONE and verified in production 2026-08-07 (migration 106); step 2 deferred to the next deploy**

**Observed** — reported by the audit deck; not independently verified

On a plan for Romans over 3 weeks (15 readings), clicking `Mark as read` produces the toast
"That change could not be saved. Please try again." Progress stays at 0 of 15. Reproduced
twice; survives retry and reload.

The walkthrough kept its session read-only and never created a plan, so there is no
counter-evidence either way. The deck's account is specific, screenshot-backed and internally
consistent.

**Root cause** — hypothesis

The deck infers a server-side validation or auth-scope fault on the progress endpoint, and is
explicit that this is inference. `INSTR` confirms or kills it in minutes.

**Minimal change** — do not exceed

1. **Fix the endpoint first.** Everything else is worthless until the write succeeds — an
   optimistic toggle over a broken endpoint just moves the lie earlier.
2. Then make the toggle optimistic, and on failure roll the checkbox back visibly while keeping
   the existing toast. **Keep the toast copy verbatim** — it is already good.

**Do NOT**

- Do not build an offline queue, sync layer, or retry-with-backoff scheduler. One write is
  failing; make it not fail.
- Do not redesign the plan detail view. The `UP NEXT · DUE NOW` card is well-built; its button
  is wired to a broken endpoint.

**Exit test**

- [x] `AGENT` `Mark as read` increments the counter and the increment survives a hard reload. Verified live: 0 → 10 of 15, survived `location.reload()`.
- [x] `AGENT` Ten consecutive marks across ten readings all persist. 10/10 → `200 {"ok":true}`.
- [ ] `AGENT` With the endpoint forced to fail, the checkbox visibly rolls back and the toast still appears — no divergence between UI state and stored state. **NOT DONE — step 2 (optimistic toggle) deferred to the next deploy; see the Findings log. There is currently no optimistic update, so there is no rollback to test.**
- [x] `AGENT` The progress figure on the plan list matches the plan detail after each change. Both read `10 of 15 days` after reload.

**Findings log**

> **Step 1 DONE, verified against production 2026-08-07. Step 2 deferred.** Evidence:
> [`106-redproof.md`](../evidence/instr-2026-08-07/106-redproof.md).
>
> The failing response `INSTR` captured: `500 {"error":{"code":"INTERNAL",...}}`, 5/5, with the
> server log reading `permission denied for table plan_days`. **Not validation, not auth-scope — a
> missing `GRANT`**, because `039` created `plans` and `plan_days` citing a "no GRANT needed"
> comment that `032` had already invalidated. `Delete plan` was broken identically and neither
> audit had tried it.
>
> Fixed by `db/migrations/106_plan_write_grants.sql`: `UPDATE` on `plan_days`, `DELETE` on `plans`,
> derived from the only write verbs in `store.ts` and nothing more. Red-proofed on a throwaway
> Postgres first — the production privilege state reproduced from `001 → 032 → 039`, three checks
> watched RED, and the cascade claim proven with a control that could have falsified it. Applied to
> production by the owner; ledger records `sha256 7893d0d8ebc5…`.
>
> Live: 10/10 marks persist, `0 → 10 of 15`, survives a hard reload, list and detail agree, and
> `Delete plan` now works — which cleared the stranded test plan and left production as found.
> A `POST` to an unknown plan UUID now returns `404` where it returned `500` before, confirming the
> exception had been masking `store.ts:300` rather than the row-matching being wrong.
>
> **Step 2 (optimistic toggle + visible rollback) is deliberately NOT done.** It is a client change;
> production is 6 commits behind `HEAD`, so nothing client-side reaches users without a gated
> deploy. With the write succeeding, the path it improves is now rare rather than universal. It
> ships with the next deploy, and its exit check stays unmarked until then.

---

### `L2c` — Plan naming, and pinning date formatting to the content language

**Wave:** 1 · **Severity:** P1 High · **Depends on:** `R0` · **Blocks:** — · **Status:** `[ ]`

**Observed**

A plan auto-titled `rom in 3 weeks` (lowercase internal book code), and every date in the
reading list rendered in Chinese: `8月8日周六 → 8月26日周三`, in an otherwise entirely English
product.

> **Root cause corrected in v1.1.** Both audits originally inferred a server-locale leak. A
> direct test since disproves that: forcing the browser to `en-US` renders `Sat, Aug 8`, forcing
> `zh-CN` renders `8月8日周六`. The dates follow the **client's** browser locale. The Chinese
> dates in the audit deck came from the reviewer's test browser, not the server.

This does not close the finding — it changes what the fix is for. The app's content is entirely
English: the corpus is English-language historical writing, the UI is English, there are no
translations. A `zh-CN` browser therefore renders an all-English application with Chinese dates.
That is not correct locale behaviour, it is an inconsistent hybrid — and we have direct evidence
of how it reads, because it convinced a careful auditor it was a server bug and got
screenshotted as one.

**Root cause** — confirmed for dates, hypothesis for the title

- **Dates:** date-formatting calls with no explicit locale argument, resolving against the
  client runtime. Working as the API is documented to work; wrong for a monolingual product.
- **Title (hypothesis):** the generator uses the internal book key instead of the display name
  the picker already renders. Confirm the mapping exists in `R0`.

**Minimal change** — do not exceed

1. Title: reuse the display name the book picker already holds (`Romans`). Format as
   `Romans · 3 weeks`. **No new lookup table** — the mapping exists (confirm in `R0`).
2. Dates: pass an explicit locale to every date-formatting call. Pin to `en-US` while the
   product is monolingual.
3. Then grep for every other date-format call lacking a locale and fix them in the same pass.
4. **Check for a hydration mismatch.** If these calls run during both server and client render,
   server and client produce different strings for the same node — which throws React hydration
   warnings and can cause a visible flash. Pinning the locale fixes this as a side effect;
   confirm the warnings are gone rather than assuming.

> **Product decision to record, not a bug:** pinning to `en-US` is correct *while the product is
> English-only*. If localisation is ever on the roadmap, this becomes a real locale system rather
> than a pin. Note the decision in the Findings log so it is revisited deliberately.

**Do NOT**

- Do not add an i18n framework. Nothing needs translating; the dates need pinning.
- Do not build a plan-rename UI here. Correct generated names remove most of the demand.

**Exit test**

- [ ] `AGENT` A newly created plan is titled `Romans · 3 weeks` — correct casing, correct separator.
- [ ] `BROWSER` Plan dates render as `Sat, Aug 8` with the browser locale forced to `en-US` **and** forced to `zh-CN`. Testing only your own locale does not exercise this.
- [ ] `AGENT` `rg 'toLocaleDateString|toLocaleString|Intl\.DateTimeFormat'` returns no call site lacking an explicit locale. **This test is expected to FAIL before the fix** — that failure is the bug.
- [ ] `BROWSER` No React hydration warnings in the console on any page rendering a date.

**Findings log**

> _(write here — record the en-US pinning decision)_

---

## 5. Wave 2 — Names, IA, and the interactions they describe

Naming is locked first because five later blocks quote those labels in copy. The verse
interactivity work sits here rather than in polish because `T1` (first run) depends on the
interaction actually working on every verse.

---

### `N1` — Rename sweep: strings only, no route changes

**Wave:** 2 · **Severity:** P2 Medium · **Depends on:** `R0` · **Blocks:** `N2`, `T1` · **Status:** `[ ]`

**Observed** — both audits, independently

`The corpus`, `My library` and the `Library` section header read as three different places
when two are the same place and the third is something else. `Ancient Paths` in the sidebar
names both the Ask feature and the product. `AP` on the mobile tab bar means nothing.

**Root cause**

Features were named after the subsystem the team built rather than after what the user does
there.

**Minimal change** — do not exceed

1. Apply the table in section 2. Pure string replacement: sidebar, mobile tab bar, page
   headings, breadcrumbs, empty-state copy. No component changes, no logic, no routing.
2. Apply the consequential renames in section 2.1 — the counted noun moves from `works` to
   `items` everywhere.
3. `Commentary + 3 of 3 lanes` -> `Commentary + 3 of 3 collections`.

**Do NOT**

- **Do not change URLs in this block.** `/library/notes` will be titled `Saved`. That cosmetic
  mismatch is invisible to users; changing the route breaks bookmarks and deep links from the
  notes feature. Log it in section 9 as a separate cleanup that ships with redirects.
- Do not rename anything on the landing page. Brand language belongs there.

**Exit test**

- [ ] `AGENT` The three greps in section 2.2 all return zero user-visible hits.
- [ ] `AGENT` No file outside of copy/label definitions was modified (check the diff).
- [ ] `AGENT` No route, path, or href changed. `git diff` shows no URL edits.
- [ ] `HUMAN` Someone who has never used the product reads the sidebar and can say what each item does.

**Findings log**

> _(write here)_

---

### `N2` — Sidebar must reveal it has more in it

**Wave:** 2 · **Severity:** P1 High · **Depends on:** `N1` · **Blocks:** — · **Status:** `[ ]`

**Observed** — walkthrough only; absent from the audit deck entirely

Five real features sit below an unmarked scroll in the sidebar: `Theology & Creeds`,
`Passage search`, `Saved`, `Word study`, `My uploads`. No scrollbar, no fade, no arrow —
nothing indicating the list continues. `Settings` is pinned to the bottom, which makes the
visible list look deliberately terminated.

`My uploads` — upload your own sermons and papers, searchable alongside the whole library —
is arguably the most differentiated feature in the product, and it is the last item in a list
nobody knows scrolls.

**Root cause** — hypothesis

A scrollable container with no overflow affordance, visually terminated by a pinned element.

**Minimal change** — do not exceed

1. **Check this first:** if the eleven items nearly fit, reducing vertical padding on nav rows
   may remove the overflow entirely. One value change, and strictly better than signalling a
   scroll. Try this before anything else.
2. If overflow remains: a CSS mask on the scrollable nav container —
   `mask-image: linear-gradient(to bottom, black 85%, transparent)` — applied while the
   container is scrollable. ~3 lines, no JS if always-on is acceptable.
3. Unpin `Settings` so it stops reading as a terminator, or move it above the fade. One line.

**Do NOT**

- Do not restructure the information architecture. The Library hub page already surfaces all of
  this; the sidebar just needs to stop hiding it.
- Do not add a mega-menu, accordion, or "more" expander. Each is more code than the problem
  deserves.

**Exit test**

- [ ] `BROWSER` At 1280x800, 1440x900 and 1366x768, an unscrolled sidebar visibly indicates content continues below.
- [ ] `BROWSER` All eleven Library items are reachable at each of those heights.
- [ ] `HUMAN` Someone who has never seen the app is asked to find `My uploads` and does so without being told it exists.

**Findings log**

> _(write here — note whether step 1 alone was sufficient)_

---

### `N3` — Verse interactivity: uniform first, then visible

**Wave:** 2 · **Severity:** P1 High · **Depends on:** `R0` · **Blocks:** `T1` · **Status:** `[ ]`

**Observed** — combined from both audits

- **Deck:** in John 1, verses 1–22 open the study panel on tap; verses 23–32 render as plain
  text and ignore taps entirely.
- **Walkthrough:** the only trigger is the small superscript verse *number*. No hover state, no
  cursor change, no visual signal it is interactive. Clicking the verse *text* — where most
  readers click first — does nothing but select text.
- **Walkthrough:** a leftover text-selection toolbar rendered stacked on top of the verse
  drawer simultaneously, with no clear precedence.

These compound: some verses are dead, the live ones give no hint, and the natural click target
is inert.

**Root cause** — hypothesis

Per-chapter hydration dropping handlers partway through the chapter; click target scoped to
the verse-number element rather than the verse.

**Minimal change** — do not exceed

**Order matters. `N3a` before `N3b`.** There is no point advertising an interaction that works
on two thirds of a chapter.

- **`N3a` hydration:** fix the handler gap so every verse in a chapter is interactive.
- **`N3b` affordance:**
  1. ~~`cursor: pointer` plus a hover colour on verse numbers. Two CSS declarations.~~
     **ALREADY SHIPPED** (`R0`): `verse-display.tsx:272` carries `cursor-pointer` and a hover
     shift; `:253-263` carries `role`, `tabIndex`, `aria-label` and `onKeyDown`. Verify, do not
     re-add.
  2. ~~Move the existing click binding up one level, from the verse-number element to the verse
     span. This is relocating a handler, not writing one.~~ **STRUCK BY OWNER DECISION,
     2026-08-07, on `R0`'s finding.** This repo shipped exactly that binding, measured it breaking
     double-click word selection (the first click opened `StudyPanel`, whose `fixed inset-0` scrim
     swallowed the second), and reverted it under **owner ruling ADR-047**
     (`docs/DECISIONS.md:1099`), guarded by `web/test/invariants/verse-open-gesture.test.tsx`.
     ADR-047 stands. Reinstating this needs an owner ruling that supersedes it, which is not a
     remediation decision. **Do not do this step, and do not touch that test.**
  3. When the verse drawer opens, dismiss the text-selection toolbar. One call.

  **What remains in `N3b` is step 3 alone.** If `N3a`'s hydration gap is also disproved, `N3b`
  closes on one call and `N3` should be re-scoped rather than padded.

**Do NOT**

- **Do not break text selection for copying.** Guard the new handler so click-with-drag still
  selects rather than opening the drawer. Readers copy verses constantly; silently removing
  that would be a worse regression than the bug being fixed.
- Do not redesign the drawer. Both audits call it the best thing in the product.

**Exit test**

- [ ] `BROWSER` Every verse in John 1 opens the drawer on tap.
- [ ] `BROWSER` Same for three sampled chapters including one Psalm and one single-chapter book.
- [ ] `BROWSER` Verse numbers show a hover state on desktop.
- [ ] ~~`BROWSER` Clicking verse text opens the same drawer.~~ **Struck with step 2** — this check
      asserts the behaviour ADR-047 forbids. Leaving it would be an exit test that can only pass
      by breaking an owner ruling.
- [ ] `BROWSER` Selecting and copying a verse still works and does not open the drawer.
- [ ] `BROWSER` The selection toolbar and the drawer are never on screen simultaneously.
- [ ] `AGENT` `web/test/invariants/verse-open-gesture.test.tsx` is green and unmodified —
      `git diff` shows no change to it.

**Findings log**

> _(write here)_

---

### `N4` — Close one fake door, repurpose the other

**Wave:** 2 · **Severity:** P1 High · **Depends on:** `R0`, `N1` · **Blocks:** `PR1a` · **Status:** `[ ]`

> **Revised in v1.2.** The original finding is unchanged — UI for unshipped features was left
> enabled. The *disposition* changed: Channels is not hidden, it is repurposed.

**Observed** — deck; partially corroborated by walkthrough

The `+` beside CHANNELS opens a bare name field with no explanation of what a channel is.
Creating one succeeds and lands on a placeholder: *"…are being built. The study assistant that
powers them arrives with the trained model."* The creation input stays open afterwards as
though still waiting. Study Partners and `New section` behave the same way.

The walkthrough independently flagged that both sections show a bare `Nothing here yet` with no
explanation of the concept, and that `+ New section` gives no clue which section it adds to.

**Root cause**

UI for an unshipped feature left enabled rather than gated.

**Minimal change** — do not exceed

1. **CHANNELS -> PRAYERS.** The section already implements exactly the shell the prayer journal
   needs: a sidebar list of named personal objects with a create control. `PR1a` puts a real
   feature behind it. **Until `PR1a` ships, the section is hidden** — not badged "Coming soon",
   because `PR1a` is scoped in this document and scheduled, so a badge would be a second fake
   door.
2. **STUDY PARTNERS -> hidden**, per the original disposition. Any future cohort feature is
   greenfield, not a revival of this section.
3. **`New section` -> removed.** It has no referent once sections are gone.
4. **Channels route** -> redirect to the prayers journal, or remove with a redirect map.
   **Decide and write down which.**
5. **Existing channel objects** (e.g. `# Gospel of John study`) -> hide or migrate to prayers.
   **Decide explicitly and write it down.**

**Do NOT**

- Do not build Channels or Study Partners. The concept is retired, not deferred.
- Do not badge anything "Coming soon". Between this block and `PR1a`, the section is simply not
  there.
- Do not write onboarding copy for a section that is about to change meaning.

**Exit test**

- [ ] `BROWSER` A fresh account cannot create any object that leads to a placeholder page.
- [ ] `AGENT` No orphaned channels or study partners remain in the sidebar for accounts that already created them; the hide-or-migrate decision is recorded in the Findings log and implemented.
- [ ] `AGENT` The old Channels route either redirects or 404s per the recorded decision — it does not render a placeholder.
- [ ] `BROWSER` The sidebar PRAYERS section either shows the shipped `PR1a` journal, or is hidden. **No third state.**

**Findings log**

> _(write here — including the route decision and the pre-existing-objects decision)_

---

### `L2b` — Plan builder must not open in an error state

**Wave:** 2 · **Severity:** P1 High · **Depends on:** `R0` · **Blocks:** — · **Status:** `[ ]`

**Observed** — both audits

Choosing Romans (16 chapters) with the default 8 weeks x 5 days produces 40 reading slots and
an immediate validation error: *"This has only 16 chapters, not enough for 40 reading days."*
Create is disabled before the user has touched anything.

> The walkthrough originally logged this as a **strength** because the validation copy is
> excellent. The deck's framing is sharper and is the one adopted here: good error copy does not
> excuse defaults that are wrong out of the box.

**Root cause** — hypothesis

Weeks and days-per-week are fixed constants rather than derived from the selected book.

**Minimal change** — do not exceed

1. Derive default weeks from the chosen book: `ceil(chapters / daysPerWeek)`, recomputed on
   book change. One small function, one call site.
2. Change nothing else in the builder.

**Do NOT**

- Do not rebuild the builder. The validation copy and the `40 readings · about 2 chapters a day`
  pre-commit preview are the two best pieces of interaction design in the product — both audits
  say so independently.
- Do not remove the validation. It should become unreachable through normal use, not deleted.

**Exit test**

- [ ] `BROWSER` Cycling the book selector through Psalms (150), Romans (16), Jude (1) and two others leaves Create enabled every time with no error shown.
- [ ] `BROWSER` The validation still fires when a user deliberately sets an impossible combination.
- [ ] `BROWSER` The pre-commit preview still renders and its arithmetic matches the configuration.

**Findings log**

> _(write here)_

---

## 6. Wave 3 — Teach the promise, close the platform gaps

Only now is there something worth teaching: a renamed, consistent, discoverable interaction.
`T3` cannot be verified from a desktop browser — arrange device access before starting it.

---

### `T1` — First run: teach the one idea that differentiates

**Wave:** 3 · **Severity:** P1 High · **Depends on:** `N1`, `N3`, **auth migration** · **Blocks:** — · **Status:** `[ ]`

> **Sequencing (v1.1).** If the auth migration to Supabase/OAuth is going ahead, it must land
> **before** this block. `T1` changes the post-sign-up redirect; building it against the current
> flow means building it twice. This does not apply to `L1`/`L2` — those touch no auth surface
> and must not wait behind a migration.

**Observed** — deck; outside the walkthrough's scope (it entered already authenticated)

Current first run: landing -> gate -> sign-up -> home, then nothing. No welcome, no
orientation, no suggested first action. The verse panel — where the product's value becomes
obvious — is discovered only by accident. The landing page promises *"AI designed to lead you
to the Holy Spirit, not be the Holy Spirit"* and the product never restates it once inside.

Consistent with what the walkthrough did see: nothing in the reader hints verses are tappable,
and the instructions for the interlinear word-study feature live on a Library page most users
never find.

**Root cause**

Sign-up routes to `/home`, a fine daily destination and a poor first one — it demonstrates the
devotional but not the thing that makes the app unlike its competitors.

**Minimal change** — do not exceed

Two changes, not the deck's three.

1. Route the post-sign-up redirect to the reader at John 1 with the verse-1 drawer already
   open, instead of `/home`. A redirect target plus an initial-state flag — both already
   supported, since deep links to verses exist.
2. One dismissible line above it: *"Tap any verse to see how the church has read it. We quote
   and cite — we never interpret."* One component, one persisted dismissal flag.

**Deliberately skipped for v1:** the deck's third step, prompting a first highlight. Highest
code cost of the three, least certain to help. Ship the first two, measure, then decide.

**Do NOT**

- **Do not install a product-tour library.** Two changes do not justify a dependency, and tour
  libraries are hard to remove once product decisions accrete around them.
- Do not build a multi-step wizard. This is orientation, not a tutorial — skippable in one
  click, never seen again.

**Exit test**

- [ ] `BROWSER` A brand-new account lands in the reader with the verse drawer already open.
- [ ] `BROWSER` The orientation line appears once, dismisses in one click, never returns for that account.
- [ ] `AGENT` The metric is instrumented: % of new accounts opening a verse drawer in their first session.
- [ ] `AGENT` **The pre-change baseline for that metric was recorded before shipping.** Without it the measurement is worthless.

**Findings log**

> _(write here — record the baseline figure)_

---

### `T2` — Sign-up basics and passive email verification

**Wave:** 3 · **Severity:** P2 Medium · **Depends on:** **auth migration** · **Blocks:** — · **Status:** `[ ]`

> **Mostly superseded (v1.1).** If auth migrates to Supabase with Google/Microsoft OAuth, most
> of this block evaporates: provider-verified emails delete the verification banner, and no
> password field deletes the show/hide toggle. **What remains:** a magic-link option for users
> who will not use OAuth, and the stranded-account recovery path. Fold those into the auth
> migration rather than doing this work twice. Keep the block below only if the migration is
> cancelled.
>
> **Also note:** `T4`'s account-deletion requirement becomes entangled with Supabase user
> management rather than your own records. Re-estimate `T4` once the migration lands.

**Observed** — deck; outside the walkthrough's scope

A 12-character minimum, clearly stated (good). No confirm-password field, no show/hide toggle,
no email verification at any point. A mistyped address becomes a silently stranded account with
no recovery path.

**Root cause**

Verification was not built; password confirmation omitted.

**Minimal change** — do not exceed

1. A show/hide password toggle. One state variable, one input-type swap.
2. Passive email verification: a dismissible banner after sign-up with a resend control —
   **not** a wall blocking access.
3. **Skip the confirm-password field.** Current practice favours show/hide over confirmation —
   it solves the same typo problem with less friction and less code. Both is redundant.

**Do NOT**

- **Do not block sign-in on unverified email.** That converts a recoverable annoyance into a
  support ticket and a lost user.
- Do not build full account recovery here. Verification is the prerequisite; recovery belongs
  with `T4`.

**Exit test**

- [ ] `BROWSER` Signing up with a mistyped address produces a visible banner with a working resend.
- [ ] `BROWSER` The show/hide toggle works on both sign-up and sign-in.
- [ ] `BROWSER` An unverified user can still fully use the product.

**Findings log**

> _(write here)_

---

### `T3` — Mobile: tab bar must not cover scripture

**Wave:** 3 · **Severity:** P2 Medium · **Depends on:** `N1` · **Blocks:** — · **Status:** `[ ]`

> **This block cannot be closed from a desktop browser.** See the Do NOT section. Arrange real
> device access before starting.

**Observed** — deck; the walkthrough tested desktop only

On both the reader and home at 390x844, body text scrolls beneath the fixed bottom tab bar and
stays covered — the last lines of a chapter are unreadable. The `Search` tab duplicates Passage
search in the Library. One tap on mobile failed to open the verse panel at all.

**Root cause** — hypothesis

Scroll containers have no bottom padding accounting for the fixed bar or the device safe-area
inset.

**Minimal change** — do not exceed

1. `padding-bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom))` on the affected
   scroll containers. One declaration each.
2. The `AP` -> `Ask` rename is already covered by `N1`.
3. Duplicate `Search` tab: **remove it** and point users to Passage search. Deleting is cheaper
   than differentiating two things that do the same job.

**Do NOT**

- **Do not verify this on a resized desktop browser and call it done.**
  `env(safe-area-inset-bottom)` resolves to `0` in a desktop window and to a real value on a
  notched device. The desktop test cannot fail, which makes it useless as a test.
- Do not restructure the mobile navigation. The bottom-tab pattern and condensed toolbar both
  render cleanly; only the padding is wrong.

**Exit test**

- [ ] `DEVICE` On real iOS Safari, the last line of a chapter is fully readable above the tab bar — with the URL bar both expanded and collapsed.
- [ ] `DEVICE` Same on real Android Chrome.
- [ ] `DEVICE` Same on the home devotional.
- [ ] `DEVICE` The verse drawer opens reliably from touch across ten attempts on real hardware.

**Findings log**

> _(write here — record which devices and OS versions were tested)_

---

### `T4` — Settings that follow the user; an account section that exists

**Wave:** 3 · **Severity:** P2 Medium · **Depends on:** `R0` · **Blocks:** — · **Status:** `[ ]`

**Observed** — both audits, independently, in nearly identical terms

Theme, text size and default translation are all *"Saved on this device"*, so configuring on
desktop and opening on mobile starts over. What makes it read as a bug rather than a policy:
notes and highlights **do** sync. The user cannot tell which choices follow them.

The `Account` section contains exactly one link — back to highlights and notes. No profile, no
email display, no password change, no export, no deletion. For a product asking people to
entrust years of study notes, export and deletion are trust features, not admin chores.

**Root cause** — ~~hypothesis~~ **corrected by `R0`**

~~Preferences implemented against local storage; the account record they could live on already
exists, because notes are already persisted to it.~~

Preferences are `localStorage` only — theme and size at `web/src/lib/reading-prefs.ts:53-74`,
translation at `settings-form.tsx:29-36` and `read/[book]/[chapter]/page.tsx:56,135`. **The
account record they could live on does not exist for this purpose.** `user_profiles` is declared
in `USER_TABLE_SPEC` and already carries a dormant `preferred_translation`, but **no application
code reads or writes that table** and prod held 0 rows at the last census. Notes persist to
`notes`, a different table — so the block's "because notes are already persisted to it" does not
transfer.

> ### ⚑ OWNER DECISION REQUIRED BEFORE `T4` STARTS
>
> **Flagged 2026-08-07 by owner decision, on `R0`'s finding. `T4` does not begin until this is
> ruled.** The three preferences do not have one answer:
>
> | Pref | Column today | Cheapest honest path |
> |---|---|---|
> | Default translation | **`user_profiles.preferred_translation` exists, dormant** | Wire up the dormant column. No migration. ~30 lines. |
> | Theme | none | Needs a column |
> | Text size | none | Needs a column |
>
> So the choice is: **(a)** ship translation only against the dormant column and leave theme and
> size device-local with honest copy; **(b)** migrate — add columns for theme and size, with RLS,
> and re-think `layout.tsx:82`, the synchronous anti-FOUC script that reads `localStorage` before
> paint and would now be racing a server value; or **(c)** defer `T4` behind the auth migration,
> which `T2` already notes entangles account management with Supabase.
>
> A schema change is a section 0.4 stop-and-report, and `docs/DECISIONS.md` is where the ruling
> goes. **Recorded as flagged, not decided** — the owner rules when `T4` comes up.

**Minimal change** — do not exceed

1. Move theme, text size, default translation onto the account record — **scope set by the owner
   ruling above, which is a precondition of this block, not part of it.** Read on load, write on
   change.
2. Account page, in this order: email display -> password change -> export -> delete.
3. Export can be a synchronous JSON download of notes, highlights and bookmarks. ~30 lines. It
   does not need to be a background job with an emailed link until someone has enough data to
   need one.

**Do NOT**

- Do not build a preferences sync engine with conflict resolution. Last-write-wins on three
  scalar values is correct and is what comparable products do.
- Do not defer deletion because it is legally fiddly. A product collecting religious reading
  habits should be able to delete an account on request from day one.

**Exit test**

- [ ] `BROWSER` Change theme on desktop, open on mobile — theme matches. Same for text size and default translation.
- [ ] `AGENT` The `Saved on this device` caption is removed wherever it is no longer true, and kept wherever it still is.
- [ ] `AGENT` Export produces a file that actually contains the user's notes and highlights.
- [ ] `AGENT` Account deletion removes the account and its data — **verified against the database, not the UI.**

**Findings log**

> _(write here)_

---

## 7. Wave 4 — Surface and polish

---

### `S1` — Landing page: show the product

**Wave:** 4 · **Severity:** P2 Medium · **Depends on:** — · **Blocks:** — · **Status:** `[ ]`

**Observed** — deck only; the walkthrough never saw the landing page

The page argues the philosophy beautifully and never shows the thing being sold. Not one
screenshot of the verse panel — the strongest asset — which sits entirely behind a login.

Also: no footer, privacy policy, terms, contact or human "about" on a page collecting email
addresses; no statement of what membership includes, when access opens, or whether it costs
anything; and `Log in` competing visually with `Request access` for two different audiences.

**Root cause**

The page was written to establish a position rather than to demonstrate a product.

**Minimal change** — do not exceed

1. **One captioned screenshot of the open verse panel.** The deck proposes a live inline demo;
   that is a build. A still image captures most of the value for a fraction of the effort —
   ship it first, build the interactive version only if the still moves signups.
2. A footer with privacy, terms, contact, about.
3. Three sentences of expectation-setting: what membership includes, when doors open, whether
   it is free.
4. Visually demote `Log in` relative to `Request access`.

**Do NOT**

- **Do not build the interactive inline demo in this wave.** It is the single largest piece of
  net-new work anywhere in this document, and it is unproven.
- Do not rewrite the hero. The Jeremiah 6:16 grounding and the "AI is not the Holy Spirit" line
  are the differentiator stated plainly — these work.

**Exit test**

- [ ] `BROWSER` A visitor who has never heard of the product can see what it looks like without creating an account.
- [ ] `BROWSER` Privacy, terms and contact are reachable from the landing page.
- [ ] `BROWSER` The page answers what it costs and when access opens.
- [ ] `HUMAN` Waitlist conversion measured before and after — otherwise there is no way to know whether the screenshot earned its place.

**Findings log**

> _(write here)_

---

### `S2` — Polish sweep: 9 small fixes, one branch

**Wave:** 4 · **Severity:** P2 Medium · **Depends on:** `R0`, `N1` · **Blocks:** — · **Status:** `[ ]`

Grouped deliberately: one branch, one review, one regression pass. Reviewing nine one-line
changes separately costs more than making them.

> **Renumbered 2026-08-07 by owner decision, after `R0`.** This table read 1-8, 12, 13 against a
> heading of "11" and a status-board entry of "13" — three counts, none of them the row count.
> Old item 2 (reader skeleton) is **struck**: `R0` proved the reader already has `ChapterSkeleton`
> and that importing the Library one would reintroduce the layout shift it exists to prevent. Old
> items 9, 10 and 11 are **struck**: they appear nowhere in any version of this document and
> cannot be recovered. Everything else is renumbered sequentially, so heading, board and table now
> agree at **9**. Old → new: 1→1, 3→2, 4→3, 5→4, 6→5, 7→6, 8→7, 12→8, 13→9.

**Minimal change** — in this order

| # | Fix | Cost | Source |
|---|---|---|---|
| 1 | **Translation explainer.** One line in the picker: *"All 18 are public domain, so we can quote them freely. Modern translations require licences; we're working on it."* Converts a perceived defect into a stated position. **Do this first — it is free.** | string | both |
| 2 | **Tag contrast.** Raise the muted-gray token until denomination tags clear 4.5:1 on the dark background. **`R0`:** the offender is `commentary-panel.tsx:229` — `text-stone-500` with no `dark:` variant, so the tag keeps a light-mode value on a dark card. Measure the one-class fix against the global token move before choosing; the local fix may be nearer the finding. | 1 token | walkthrough |
| 3 | **Ask checkbox colour.** `accent-color` on the lane checkboxes to pick up the terracotta instead of browser blue. **`R0`: ALREADY SHIPPED** at `e196e4b` (`ask-client.tsx:117`). Verify, then mark done — do not redo. | 1 decl | walkthrough |
| 4 | **Single-chapter books** render as links while every other book renders as a button, in the same picker. Make them buttons. **`R0`:** the split is at `book-picker.tsx:171-184` and is conditional on the picker's *mode* (`onPick` present → `<button>`, absent → `<Link>`), not on the book. The same split exists for chapter cells at `:77,81`. Fix the mode inconsistency, not the book branch. | 1 swap | deck |
| 5 | **Jump-to-chapter input** in the picker — one input filtering an array already in memory. Psalm 119 currently costs a lot of scrolling. **`R0`: confirmed absent** — no `<input>` in `book-picker.tsx`. | small | deck |
| 6 | **`aria-label` + tooltip on every icon-only button** — the Library `+`, the sidebar pencil and `+`. **`R0`: the `aria-label` half is already shipped** (`sidebar.tsx:474,481`; the Library `+` has both an `aria-label` and a `title`). What is genuinely missing is a `title` tooltip on the sidebar controls — and note MASTER `UX-2`: `title` is hover-only and touch has no hover, so a tooltip is not a fix for discoverability on mobile. | small | both |
| 7 | **Work TOC titles.** **Check before doing:** if the source data has real section titles, surface them instead of `Part 1 of 23`. If it does not, this is a content-ingestion problem — log it against the corpus pipeline in section 9 and **do not fake it here.** **`R0`: the conditional resolves to the second branch.** `work-toc.tsx:205-208` chunks one work into slices whose headings are all one title plus `(i/n)`; no per-chunk titles exist. **Already filed in section 9 — do not build.** | conditional | walkthrough |
| 8 | **Era accents in the verse panel.** Fifteen voices on a verse render as visually identical cards, so parsing "the fathers think X, the Reformers think Y" means reading every name and date. Add a left-border tint per era group on the existing commentary card, coloured by the `era` field the data already carries. ~4 CSS declarations, palette tokens only. **`R0`: the field exists** — `eraLabel()`, `commentary-panel.tsx:135`, already used to group at `:391-399`. | 4 decls | third-party audit, triaged |
| 9 | **Reading presets in the `Aa` control.** Text size is incremental-only, so users hand-tune with no vocabulary for reading modes. Add three named presets — **Study** (denser, more verses per screen beside an open panel), **Read** (current default, unchanged), **Lectio** (largest, widest spacing and measure). Each is a stored configuration of existing CSS variables. Steppers remain for fine-tuning. | small | third-party audit, triaged |

**Struck by owner decision, 2026-08-07** — recorded here so the sweep's "nothing silently dropped"
exit test can still be satisfied:

| Old # | Fix | Disposition |
|---|---|---|
| 2 | Reader loading state — import the Library skeleton | **Struck by recon.** Already done and differently: `ChapterSkeleton`, `read/[book]/[chapter]/page.tsx:446`, deliberately mirrors `VerseDisplay`'s box. Doing it as written is a regression. |
| 9, 10, 11 | *(unknown)* | **Struck.** Present in no version of this document and unrecoverable. If they are ever remembered, they re-enter as new items at the end of the table, not by reviving these numbers. |

**Item 8 — additional constraints**

- Do not add avatars, icons, or illustrations. The third-party audit proposed line-art quills;
  rejected as decorative and off-brand.
- No new hues outside the existing palette. Suggested mapping: deep terracotta for Early Church,
  olive for Reformation, warm gray for Modern.
- Do not touch the grouping, the ordering, or the `Showing N of M voices` copy — that copy is
  honest expectation-setting about coverage and both audits praised it.
- **Colour must stay redundant, never the sole encoding.** The panel already groups voices under
  textual era headers (`MODERN`) and shows author, year and tradition on every card. The tint
  reinforces that; it must not replace it, or the feature is invisible to colourblind users.
  If anyone later proposes removing the text headers "because the colours do that now", refuse.
- Check this against item 2 (tag contrast) on the same branch — era tint and tradition tag are
  two encodings of adjacent information on one card. Make sure the result reads as one signal,
  not two competing ones.

**Item 9 — additional constraints**

- Do not remove the A-/A+ steppers. Do not add a fourth preset or a custom-preset builder.
- No new settings store. Presets save through the same settings record `T4` syncs. **If `S2`
  ships before `T4`, presets are device-local and migrate with `T4`** — note the dependency on
  the branch.
- **Resolve the stepper/preset interaction explicitly.** The `Aa` control currently shows a
  discrete step indicator (`2 / 5`). Decide and document: does choosing a preset reset the
  stepper to that preset's baseline, and does nudging the stepper afterwards clear the preset
  label or leave it shown? Either answer is fine; leaving it undefined produces a state where
  the control claims *Lectio* and `2 / 5` simultaneously.
- `Lectio`'s typography is reused as the prayer-space text style in `PR1a`. Do not diverge them
  later without updating both.

**Item 8 / 9 exit tests**

- [ ] `BROWSER` The John 1:1 panel shows a distinct border colour per era group.
- [ ] `AGENT` Border-vs-card contrast is >= 3:1, measured with a real tool (WCAG 1.4.11 for non-text UI).
- [ ] `HUMAN` A first-time user shown the panel can point to "which of these are the early church" without reading names.
- [ ] `AGENT` Textual era grouping is still present — the tint did not replace it.
- [ ] `BROWSER` Each reading preset applies in one tap with no reload, and the choice persists across sessions.
- [ ] `BROWSER` `Read` is pixel-identical to the pre-change default.
- [ ] `AGENT` The stepper/preset interaction behaves as documented in the Findings log — no contradictory state.

**Do NOT**

- **Do not build named highlight presets in this block.** The deck's suggestion (Promise /
  Command / Question / Warning / Comfort) is good, but it introduces persisted state and a
  management UI. It is a feature, not polish. Give it its own ticket in section 9.
- **Do not let this sweep grow.** Anything discovered mid-sweep needing more than a few lines
  goes to section 9.

**Exit test**

- [ ] `AGENT` Contrast checked with a real tool, not by eye — tags pass 4.5:1.
- [ ] `DEVICE` Every icon-only button has an accessible name, verified with a screen reader rather than by reading markup.
- [ ] `BROWSER` Navigating into a chapter shows the same skeleton treatment as Library pages.
- [ ] `BROWSER` Jumping to Psalm 119 takes one input and one keystroke.
- [ ] `BROWSER` The translation picker explains itself.
- [ ] `AGENT` Every item in the table above is either done or explicitly moved to section 9 with a reason. **Nothing silently dropped.**

**Findings log**

> _(write here)_

---

## 8. Wave 5 — Product: the second half of the promise

> **This wave is not remediation.** Waves 1-4 close audit findings; this builds a feature. It
> lives here because it shares the naming lock (`N1`), the polish work (`S2` item 9), and
> constraint **C9**. Section 10's definition of done does **not** include this wave — the
> remediation closes without it.

**Sequenced after Wave 2** (naming must be locked — the sidebar section label depends on it).
Soft dependency on `S2` item 9. Otherwise independent of Waves 3-4: `PR1a` can start in
parallel with Wave 3.

**Constraint C9 governs this entire wave.** Read section 0.5 before writing any code — the
error-reporting leak vector in particular, which no audit caught.

---

### `PR1a` — Prayer journal: the space and the entity

**Wave:** 5 · **Severity:** P1 Product · **Depends on:** `N1`, `N4`, soft `S2`#9 · **Blocks:** `PR1b`, `PR2` · **Status:** `[ ]`

**Observed**

The product's promise is *"we never interpret — you wrestle and pray over it yourself."* Every
mechanic serves the first half: retrieve, quote, attribute. Nothing serves the second half. The
only creation tool is an academic note field, which frames responding to the text as
book-report work.

Notes and prayer are different acts — one says *I am studying*, the other *I am responding* —
and forcing the second into the first's container trains users to treat the app as a research
tool.

**Minimal change** — do not exceed

1. A **Pray** action in the verse panel, alongside Highlight and Notes.
2. **The prayer space:** the existing note-editor shell re-framed. Verse pinned at top, warmer
   background from existing palette tokens, `Lectio` preset typography (`S2` item 9). At most
   one prompt line, lectio-style: *"Read it again slowly. What is the text saying to you?"*
3. **Save creates a prayer entity** — distinct from notes, per the data-model rule below.
4. **The journal:** prayers listed in the repurposed sidebar PRAYERS section (`N4`) — ordered,
   reopenable read-first, editable, deletable.

> **Data-model rule, binding from the first line of code.** Prayers are a distinct entity.
> Never notes-with-a-flag. Never wired into sharing plumbing if any cohort feature ships later.
> Privacy is the feature, and retrofitting privacy onto a shared container does not work.

> **Export coupling with `T4`.** This block's exit test requires that account export includes
> prayers and deletion removes them — but `T4` is Wave 3 and ships first. **Whichever lands
> first must not hardcode its entity list.** Write `T4`'s export and delete against an
> enumerable set of user-owned entities so `PR1a` registers into it rather than amending it.
> If `T4` already shipped with a hardcoded list, fixing that is part of this block, not a
> surprise discovered late.

**Do NOT**

- **No AI anywhere in the prayer space.** No suggestions, completions, summaries, or "insights".
  The product that says *AI is not the Holy Spirit* cannot have AI in the prayer closet. The
  absence is the feature.
- **C9: one-way retrieval only.** Prayer text is never indexed into any corpus — Ask, passage
  search, cross-reference, or "improving results".
- **No analytics on prayer content** beyond count and existence. And see section 0.5 — error
  reporting is the leak route people forget.
- No sharing, no export-to-anywhere-social, no streaks, counts, or gamification. Prayer is not a
  habit metric.
- No prompt library, templates, or guided-prayer content in v1.
- Do not start before Wave 2's naming lock. No dependency on any trained-model roadmap.

**Exit test**

- [ ] `BROWSER` From John 1:1, **Pray** opens a visually distinct space (background, typography) with the verse pinned.
- [ ] `BROWSER` Saving creates a prayer that appears in the PRAYERS journal, survives a hard reload, reopens read-first, edits, and deletes.
- [ ] `AGENT` Prayers appear in no notes list, no passage search, and no AI retrieval corpus.
- [ ] `AGENT` **An automated test asserts the prayer module imports nothing from the AI client.** A code-review check drifts; a failing test does not. This is cheap — write it.
- [ ] `AGENT` Error-reporting scrubbing is in place for the prayer surface, verified by triggering a deliberate exception in the editor and confirming no prayer text reaches the reporting payload.
- [ ] `AGENT` Account export includes prayers; account deletion removes them — **verified against the database**, not the UI.

**Findings log**

> _(write here — including the T4 export-coupling decision)_

---

### `PR1b` — Prayer journal: the "From the tradition" rail

**Wave:** 5 · **Severity:** P2 Product · **Depends on:** `PR1a` · **Blocks:** — · **Status:** `[ ]`

> **Split from `PR1a` in the v1.2 merge, deliberately.** The addendum scoped this as part of
> `PR1a` v1. As written that made `PR1a` the largest single block in this document — a new
> action, a new editor view, a new entity, a new list view, *and* a retrieval surface. The
> finding `PR1a` closes ("nothing serves the second half of the promise") is closed by the
> journal alone. The rail is what makes it *Ancient Paths'* prayer feature rather than a generic
> journal, so it is not optional in the long run — but it is separable, and separating it is
> what the rest of this document would do. Ship `PR1a`, then this. Same treatment `T1` gave the
> deck's third onboarding step.

**Minimal change** — do not exceed

1. In the prayer space, a **From the tradition** rail: retrieve what the confessions and hymns
   say about the same passage or theme. Westminster beside a prayer over John 1; the hymn that
   voices the same cry.
2. Retrieval over the existing corpus. Quotes shown with author, work and year, in the same
   attribution card style as the verse panel.
3. **Scope v1 to Theology & confessions + Hymns & sacred poetry** — the two corpora that speak
   devotionally. Commentaries stay out; they answer a different question.

**Do NOT**

- The app **finds**; it never **says**. No generated text in the rail, ever.
- C9 applies: the prayer is the query, never the corpus.
- Do not widen to commentaries in v1. That is the boundary between devotional and academic, and
  it is the whole reason this rail is not just search.

**Exit test**

- [ ] `BROWSER` The rail returns real confessions and hymns with correct attribution for at least two probed passages.
- [ ] `AGENT` It never renders generated text — verified by code path, not by inspecting output.
- [ ] `AGENT` Only the two scoped corpora are queried.
- [ ] `AGENT` C9 holds: prayer text present in no retrieval index.

**Findings log**

> _(write here)_

---

### `PR2` — Compare a note with the tradition

**Wave:** 5 · **Severity:** P1 Product · **Depends on:** `PR1a` · **Blocks:** — · **Status:** `[ ]`

**Observed**

Notes are write-only. You record a thought on a verse and it sits alone in a list; nothing ever
speaks back. Yet the product's entire thesis is that the church has walked these paths — a user
who writes *"the eternal God taking on what's human"* on John 1:14 has arrived at Chalcedon on
their own, and the app says nothing.

Showing the tradition's voices beside the user's own thought is the thesis experienced
firsthand, and it converts notes from an archive into a study instrument with a reason to
revisit.

**Minimal change** — do not exceed

1. A **Compare** action on any note — from the verse-panel Notes tab and from the `Saved` view.
2. **The comparison view:** the user's note on one side, retrieved historical works on the same
   passage on the other. Commentaries are in scope here — this is where they belong — plus
   confessions where relevant. Same attribution card style; each source opens in the library.
3. **Retrieval: passage-first only in v1.** Same verse reference. No new index — the existing
   corpus search is the engine.

> **Objection folded in from the v1.2 merge — theme retrieval deferred, not dropped.** The
> addendum scoped v1 as "passage-first, then theme". Passage matching is mechanical and
> defensible: same verse, same verse. Theme matching is a similarity judgment, and *selection is
> already evaluation* — if a user writes something heterodox and the system surfaces the three
> commentaries that most contradict it, that is a verdict rendered by curation, even with no
> verdict label anywhere in the copy. A product that swears off interpretation should not ship
> interpretive retrieval in the same release that promises pure juxtaposition. Ship
> passage-first, watch what users do with it, then decide whether theme retrieval can be made
> defensible. Logged in section 9.

**Do NOT**

- **Juxtapose, never evaluate.** No alignment verdicts ("your note matches the Reformed
  reading"), no agreement scores, no "the fathers would disagree". Sources shown, proximity
  implied, verdict never rendered. Evaluation is interpretation — the thing the product swears
  off.
- **No side-by-side diff UI, no highlighting of "matching" phrases.** That reads as automated
  judgment even when it is only string overlap.
- C9 applies: the note is the query, never the corpus.
- Do not build comparison against other users' notes. There is no multi-user dimension here.

**Exit test**

- [ ] `BROWSER` Comparing a note on John 1:14 returns real commentaries on that passage with correct attribution, shown beside the note text.
- [ ] `AGENT` No generated text anywhere in the view — verified by code path.
- [ ] `AGENT` **Copy is grepped against a banned-evaluative-language list** — `matches`, `aligns`, `agrees`, `disagrees`, `contradicts`, `consistent with`, `differs from`, `similar to`, `score`. Reading the copy once is not a repeatable test; this is.
- [ ] `AGENT` Retrieval is passage-first only; no theme/similarity path is reachable in v1.
- [ ] `AGENT` Notes are present in no retrieval index; deleting a note leaves no trace in any search result.

**Findings log**

> _(write here)_

---

## 9. Backlog — deferred, with reasons

Anything moved out of a block during execution lands here. Pre-seeded with items deliberately
deferred at planning time.

### Filed by `R0` — false reuse claims, with revised estimates

Each row is a block whose "reuse the existing X" premise `R0` killed. The estimate is the
**delta** against what the block assumed, not the block's whole cost.

| Item | Block | Finding | Revised estimate |
|---|---|---|---|
| Preference columns for theme + text size | `T4` | `user_profiles` exists but **no code reads or writes it**, and it has columns for neither theme nor text size. Only `preferred_translation` exists, dormant. | **Was "choose a different store". Now: a migration + an owner decision.** Translation alone is ~30 lines against the dormant column. Theme and text size need `db/migrations/1NN_*.sql`, an RLS check, and the `layout.tsx:82` anti-FOUC script re-thought (it reads localStorage synchronously before paint; a server-side pref changes that). Section 0.4 stop condition — **schema change, escalate before starting.** |
| A way to hide a sidebar section | `N4` | **No feature-flag mechanism exists.** The repo's only "not built yet" idiom is the `ComingSoon` stub `N4` exists to delete. | **Unchanged in size, changed in kind:** a static edit to `SEED_SECTIONS` (`sidebar.tsx:24-27`), not a flag lookup. No new mechanism — do not build one for two sections. |
| Prayer-journal persistence | `PR1a` (via `N4`) | The Channels shell `N4` hands over is **`localStorage` only**. `sidebar.tsx` has no `fetch`; `/api/channels/route.ts` and the `channels` table exist and it never calls them. | **Was "re-frame the existing shell". Now: `PR1a` must build its own persistence** — table, RLS, API route, client wiring. Materially larger. Re-estimate `PR1a` before Wave 5 is scheduled. |
| Verse-span click binding | `N3b` step 2 | Already shipped, measured breaking word selection, reverted under **owner ruling ADR-047**, guarded by `verse-open-gesture.test.tsx`. | **Removed from `N3b`, not re-estimated.** Reinstating it needs an owner ruling that supersedes ADR-047, which is not a remediation decision. `N3b` keeps steps 1 (already shipped) and 3. |
| Reader loading skeleton | `S2` old item 2 (struck) | The reader already has `ChapterSkeleton`, purpose-built to mirror `VerseDisplay`'s box. The Library "component" is a route-convention `loading.tsx`. | **Zero. Already done.** Mark the item done in the sweep with this note; doing it as written regresses layout shift. |
| Work TOC section titles | `S2` item 7 | Item 8's own conditional resolves to "do not fake it": `work-toc.tsx:205-208` chunks one work into `Part N` slices whose headings are all one title plus `(i/n)`. No per-chunk titles exist in the data. | **Out of `S2` entirely.** This is a corpus/ingestion change (real section boundaries at ingest), owned by the ingestion pipeline and governed by the `quality-slice` skill. Not a UI fix at any size. |
| `S2` old items 9, 10 and 11 (struck) | `S2` | **Missing from the document.** Heading says 11 fixes, status board says 13, table lists 10 (1-8, 12, 13). The v1.2 changelog only records adding 12-13, so these were not renumbered away. | **Unknown — owner input required.** `S2` cannot satisfy its own "nothing silently dropped" exit test until these are recovered or explicitly struck. |

### Filed by `INSTR` — 2026-08-07

| Item | Block | Reason |
|---|---|---|
| **Production CSP blocks the webfonts** | `INSTR`, in passing | Every page load logs `Loading the stylesheet 'https://fonts.googleapis.com/css2?family=EB+Garamond…' violates … "style-src 'self' 'unsafe-inline'"`. EB Garamond, Literata and Source Sans 3 never load in production; the app renders in fallback faces. **In neither audit.** Not a remediation finding — belongs to whoever owns the CSP, and the fix is a policy decision (allow the host, or self-host the fonts), not a UI change. |
| ~~Audit the other post-032 tables for the same missing grant~~ **DONE 2026-08-07 — no further migration needed** | `INSTR` | All 14 tables created at or after 033 were checked: code write-verbs vs. actual GRANT statements. **`039` is the only migration that got it wrong, and only for the two tables `106` fixed.** `100` (user-corpus, 4 tables), `104` (auth, 4 tables) and `105` (`user_document_readings`) all grant full DML explicitly — later authors followed 032's rule. `plan_day_readings` is INSERT-only in code, which the post-032 default still covers. `topical_entries` is written only by `src/ingest/ingest-topical-index.ts:249`, which opens its own owner connection via `assertDevBranch()` and never touches `app_runtime`, so its SELECT-only grant is correct and deliberate. `verse_coverage` has no app writer. **Method note:** the first pass used a per-table `GRANT … ON <table>` regex and reported 5 false positives — `100` and `104` grant via multi-line comma lists that the pattern could not match. The finding above is from reading the statements, not from the grep. |
| **A CI test deriving required grants from the code's write verbs** | `INSTR` | The audit above is a point-in-time human read; nothing re-runs it. The durable form asserts, per table, that `app_runtime`'s privileges match exactly the verbs the app's SQL uses — derived from source, never hand-listed. Needs a live DB, so it belongs with the `db-invariants` CI job rather than the offline suite. Not built here: it is a new mechanism, and a fix is not the place to introduce one. |
| **A check that a migration's cited premise still holds** | `INSTR` | 039 broke two features by citing 016's "no GRANT needed" comment, which 032 had already invalidated. Nothing detects a migration reasoning from a superseded fact. This is the watchlist's hand-maintained-expected-set class in a new shape and deserves one deliberate decision rather than a fifteenth instance. |
| **`L1b`'s 15s threshold is aimed at the wrong number** | `INSTR` | Measured 104s and 58s against the block's stated "~18s success, ~45s failure". Re-derive the threshold from real timings before building the line, or it sets an expectation the product misses by 5×. |

### Pre-seeded at planning time

| Item | Deferred from | Reason |
|---|---|---|
| Rename `/library/notes` -> `/library/saved` | `N1` | Needs redirects; breaks deep links from the notes feature. Ship separately. |
| Named highlight presets (Promise / Command / Question / Warning / Comfort) | `S2` | Persisted state + management UI. A feature, not polish. |
| First-run "prompt a first highlight" step | `T1` | Highest code cost of the deck's three onboarding steps, least certain to help. Revisit after measuring `T1`. |
| Interactive inline demo on the landing page | `S1` | Largest net-new build in the document. Ship the still image first. |
| Ask latency optimisation | `L1b` | Backend project. Hand `INSTR` timings to whoever owns retrieval. |
| Plan rename UI | `L2c` | Correct generated names remove most of the demand. |
| Theme/similarity retrieval in note comparison | `PR2` | Selection is already evaluation. Ship passage-first, then decide whether theme retrieval can be made defensible without rendering a verdict by curation. |
| Commentaries in the prayer rail | `PR1b` | v1 is confessions + hymns only — the devotional/academic boundary is the reason the rail is not just search. |
| Guided-prayer content, prompt library, templates | `PR1a` | Explicitly out of v1. Revisit only if users ask for it. |
| Any group/cohort feature | `N4` | Channels and Study Partners are retired, not deferred. A future cohort feature is greenfield. |
| Real locale system (beyond the `en-US` pin) | `L2c` | Only needed if localisation reaches the roadmap. The pin is correct while the product is English-only. |
| Auth migration to Supabase / OAuth | — | Not a remediation item, but a dependency of `T1`/`T2` and a re-estimate trigger for `T4`. Sequence after `INSTR` answers the auth-scope question. |

---

## 10. Definition of done

**Scope: Waves 1–4.** Wave 5 is product work and is not part of the remediation's definition of
done. The remediation closes without it.

A wave closes when every block passes its own exit test **and**:

- [ ] Every block's exit test passes on a **fresh account**, not a developer account with
      accumulated state.
- [ ] **Both loops complete end to end.** Ask a question, get either an answer or an honest
      error with a working retry. Build a plan, mark a reading, close the browser, come back
      tomorrow, and the progress is still there.
- [ ] No finding was closed by editing its test. Diff the exit tests against this document
      before signing off.
- [ ] Nothing in the interface promises something the product does not do — no fake doors, no
      labels naming subsystems, no settings that silently fail to follow the user, no button
      that cannot save.
- [ ] `HUMAN` Someone who has never seen the product completes a first session — sign up, read
      a chapter, open a verse, ask a question — without being told anything in advance. Watch
      it happen; do not survey it.
- [ ] `AGENT` **C9 holds across the whole product.** No user-authored content — prayers, notes,
      highlights — appears in any retrieval index, analytics payload, or error-reporting
      payload. Re-verify at every wave close, not once at the end.

---

## Appendix — evidence provenance

Findings are attributed throughout. Confidence varies and it matters when scoping:

| Source tag | Meaning |
|---|---|
| **both audits** | Independently observed twice. Highest confidence. |
| **deck** | From the audit deck only, screenshot-backed. The walkthrough had no access to that surface (landing, sign-up, mobile) or deliberately avoided it (creating plans/channels, to keep the session read-only). |
| **walkthrough** | From the live desktop walkthrough only; absent from the deck. |
| **disputed** | The two observers saw different behaviour. Only `L1`. Its fix is designed to close the finding either way. |
| **third-party, triaged** | From a third-party "Deep UX/UI audit". That review contained **no new bugs and no evidence of product use**. Three items survived triage: prayer mode (promoted to `PR1a`/`PR1b`), era accents and reading presets (`S2` items 8-9). Rejected: "Voices/Tradition" renaming, hiding category counts, an auto-hiding tab bar, semantic search, and commentator avatars. |

### Rejected third-party suggestions, and why

| Suggestion | Disposition |
|---|---|
| Rename library sections to "Voices" / "Tradition" | **Rejected — but not for the stated reason.** The addendum rejected it as violating the plain-language rule; that reasoning is inconsistent, since the product already uses "voices" in body copy (`Showing 10 of 11 voices`, `Found 6 voices across 4 traditions`). The correct reason is simpler: `Commentaries` is already plain, accurate and specific, and "Voices" is vaguer. Keep the body-copy usage; do not rename nav. |
| Hide category counts | Rejected. Conflicts with the honesty-about-coverage principle both audits praised. |
| Auto-hiding mobile tab bar | Rejected. Directly contradicts `T3`'s "do not restructure the mobile navigation" — and `T3`'s actual bug is padding, which auto-hide would mask rather than fix. |
| Semantic search | Rejected as a checklist item. Partially exists already as Ask retrieval; a real version is an infrastructure project, not a block. |
| Avatar / line-art icons for commentators | Rejected as decorative and off-brand. See `S2` item 8's constraints. |

One correction to pass back to whoever prepared the deck: its cover slide states
*15 findings · 2 critical · 4 high · 9 medium*, but the individual slide tags show three at
High rather than four. Small, but the deck holds itself to the standard that every
recommendation is tied to a reproduced behaviour rather than an opinion — a stray arithmetic
error on the cover costs more credibility than it should.
