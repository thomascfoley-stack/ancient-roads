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

> **HUMAN attestations recorded 2026-08-08.** The owner states they personally ran the browser pass
> on the deployed build (`be67cb9`) and that all checks were green, across `L2`, `L2c`, `L2b`, `N1`,
> `N2` and `S2` items 1/2/5/8. Confirmed against the enumerated list rather than inferred.
> **Recorded as the owner's attestation, not as agent verification** — an agent may not mark a
> `HUMAN` or `BROWSER` check (§0.3), and did not.
>
> Separately, the agent drove three live checks in the same session; those are agent-verified and
> are logged in `L2`'s findings.

Update this as blocks complete. `-` = not started, `~` = in progress, `x` = done,
`!` = blocked (write why in the block's Findings log).

| Wave | Block | Title | Status |
|---|---|---|---|
| 0 | `R0` | Repo reconnaissance — fill in before any work | `x` |
| 1 | `INSTR` | Instrument both loops before touching them | `x` |
| 1 | `L1` | Ask — guarantee a terminal state, never lose the question | `x` **DONE 2026-08-08.** The catch/retry/question-retention were already there; the real hole was a stream ENDING without a terminal event — no throw, so no catch, and the turn hung forever. Guard added, seeded red. |
| 1 | `L1b` | Ask — set an expectation for the wait | `x` **DONE 2026-08-08.** One line in the existing panel. **Threshold RE-DERIVED, not taken from the block**: its ~15s came from a premise INSTR disproved (measured 104s/58s/64s), so 15s would call every ordinary request "longer than usual". Set to 90s — above measured median and mean, below the observed max. **n=3, recorded as provisional.** |
| 1 | `L2` | Plan progress write must succeed | `x` |
| 1 | `L2c` | Human-readable plan names, correctly localised dates | `x` |
| 2 | `N1` | Rename sweep — strings only, no route changes | `x` |
| 2 | `N2` | Sidebar must reveal it has more in it | `x` |
| 2 | `N3` | Verse interactivity — uniform first, then visible | `!` |
| 2 | `N4` | Close the fake doors | `x` **DONE 2026-08-08.** Channels → Prayer journal (links to shipped `PR1a`), Study Partners retired, `New section` removed, `/channel/[id]` redirects. 7 seeds red. `BROWSER` checks unticked. |
| 2 | `L2b` | Plan builder must not open in an error state | `x` |
| 3 | `T1` | First run — teach the one idea that differentiates | `x` **DONE 2026-08-08** (items 1–2; item 3 was already deliberately out of v1). Sign-up now lands on John 1 with the drawer open. **The block's "already supported" claim was FALSE** — no query params, hash only scrolled. Hash extended to `#v<n>:study`, reusing the existing effect and `openStudy`. |
| 3 | `T2` | Verify-at-signup ON (both methods kept) — RULED, sender fix first | `~` **STEP 2 DONE 2026-08-08** (owner turned `Verify at Sign-up` ON; prod re-measured 1 account / 0 unverified, so g38m's closure is structural for the current population). **Step 1 — the Resend sender — is OUTSTANDING and was the ruling's FIRST step**: verification-on makes auth mail load-bearing for every signup, and it currently leaves Neon's shared `auth@mail.myneon.app`. Console work, owner-only. |
| 3 | `T3` | Mobile — tab bar must not cover scripture | `~` **CODE COMPLETE, `DEVICE` OPEN.** The page-level fix is in `app-shell.tsx` and now has a regression guard. Its step 3 (duplicate Search tab) does not exist in this build — mobile-nav has 4 tabs and one search button. **`env(safe-area-inset-bottom)` is 0 in every desktop window, so no test here can prove the notched case.** 11 inner scroll containers are candidates for the device pass; deciding which are affected IS the diagnosis, and guessing would be an unverifiable change. |
| 3 | `T4` | Settings that follow the user; an account section | `-` |
| 4 | `S1` | Landing page — show the product | `~` **SUPERSEDED IN PART by ADR-111 (2026-08-08):** the owner replaced the whole marketing surface from a UX Pilot design (`feat/marketing-site` — Home, `/features`, `/why`, gate, waitlist success state), which delivers the footer, the expectation-setting line, and a demoted Log in. Still open from S1's original scope: a real product screenshot (the redesign uses truth-passed demo cards, not captures), and Privacy/Terms (owner content, skeletons below). |
| 4 | `S2` | Polish sweep — 9 small fixes, one branch | `~` |
| 5 | `PR1a` | Prayer journal — the space and the entity | `[x]` **BUILT AND DEV-VERIFIED 2026-08-08.** RLS proven two-account over `app_runtime`; carry-forward run against the live dev DB. Migration 107 **applied to production** 2026-08-08 (owner go; verified against the catalog, identical to dev). Signed-in browser walk NOT RUN by the agent — **the owner is running it**. |
| 5? | `F1-fonts` | Font stack blocked by our own CSP — self-host via `next/font` | `x` **DONE AND LIVE 2026-08-08** (`1bb5c3c`, deployed in `8eb2bd3`). Self-hosted, CSP untouched. **X3 closed by the owner** on extension evidence; **X5 (`HUMAN`) open** — needs a machine without these fonts installed. |
| 5 | `PR1c` | Prayer-surface polish (PR1a residue) | `x` **DONE 2026-08-08.** Dead `/channel/*` + `/study/*` rail links resolved to `/prayers`; `window.confirm` replaced with an in-page two-step. 4 seeds red. |
| 5 | `PR1b` | Prayer journal — "From the tradition" rail (separable) | `-` |
| 5 | `PR2` | Compare a note with the tradition | `-` |

### Every open block, its gate, and who owns it

**No block is ambiguous.** If it is not `x`, this table says what it is waiting for and whose move
it is. Re-measure before trusting; this was written 2026-08-08.

| Block | State | Gate — what it is actually waiting for | Owner of the next move |
|---|---|---|---|
| `L1` | `x` | **CLOSED 2026-08-08; row corrected 2026-08-10 — this table was stale against the board above.** The guard that shipped covers the real hole INSTR isolated: a stream ENDING without a terminal event (no throw, so no catch) now lands in the failure state with a retry. Red-proofed by `test/components/ask-terminal-state.test.tsx` (4 tests, green in the web suite). | done |
| `L1b` | `-` | **Its premise is disproved.** Written as "~18s success, ~45s failure"; measured 104s · 58s · 64s. The 15-second threshold must be re-derived from that series before anything is built. | ⚑ owner (pick the threshold) |
| `L2` step 2 | `x` (step 1) | Optimistic toggle — now cosmetic, since the write succeeds. Ships with any later deploy. | agent, low priority |
| `N3` | `!` | Blocked: `N3a`'s root cause has no mechanism in the source. Unblocks only via `N3c`. | blocked by `N3c` |
| `N3c` | `x` | **RUN 2026-08-08: did not reproduce, and the mechanism is disproved** — a both-ends-bounded dead range is not a hydration abort. Unblocks `N3`. | ⚑ owner (strike `N3a`?) |
| `N4` | `x` | **CLOSED 2026-08-08; row corrected 2026-08-10 — the redirect this table awaited shipped the same day.** `web/src/app/channel/[id]/page.tsx` is a thin redirect to `/prayers`; 7 seeds red-proofed per the board. `BROWSER` checks remain unticked — carried to the auth-gated browser pass. | done, browser pass owed |
| `T1` | `!` | Blocked: the metric is not instrumented and there is nowhere to count it. Deliberately deferred in §9. | ⚑ owner (schedule the prerequisite) |
| `T2` | `~` | **STEP 2 DONE 2026-08-08, OUT OF ORDER.** Owner attested from the Neon console that `Verify at Sign-up` is ON (method: Verification code) — which closes GHSA-g38m's precondition, and is recorded in `SECURITY.md`. **But the ruling's step 1 — fix the sender — is not confirmed done, and the ruling says in terms: "Shipping in the other order converts a security fix into a signup outage."** Verification-on makes auth mail load-bearing for every new signup, and the last recorded sender state is Neon's shared `auth@mail.myneon.app`, already logged as a deliverability regression (C5). **Also still open, and it is measurable rather than arguable:** accounts already created unverified are either grandfathered or prompted — if grandfathered, the closure is partial rather than structural for exactly those accounts. `SECURITY.md` says count them; nobody has. **COUNTED 2026-08-10 (read-only prod probe, owner go): 7 `auth_users`, ALL 7 `emailVerified=false`, `createdAt` 2026-08-05 → 08-07 — every one predates verify-on (08-08), so the closure is partial for exactly these 7 grandfathered accounts. 0 verified accounts exist yet, so no post-change signup has been observed completing verification.** | ⚑ owner (confirm sender; decide the 7 grandfathered accounts) |
| `T3` | `-` | **DEVICE only**, and its step 1 appears already implemented — so the device pass is a diagnosis, not a fix. | ⚑ owner (hardware) |
| `T4` | `-` | **HELD** on the owner seeing the `layout.tsx:82` first-paint flash. Now schedulable against the deployed build. | ⚑ owner (observe, then rule) |
| `S1` | `~` | **Largely superseded by ADR-111** (marketing replacement, 2026-08-08). Remaining: Privacy/Terms content (owner-only, skeletons below) and the real-screenshot question, which the redesign answers with verified demo cards instead. | ⚑ owner (legal content; review agent-drafted expectation line) |
| `S2` | `~` | 5 of 9 closed. Item 4 parked (needs a rendered judgment), 6 closed as a measurement, 7 out to §9, 9 parked on a design decision. | ⚑ owner (item 9's interaction call) |
| `PR1a` | `[x]` | Built, dev-verified, prod 107 applied 2026-08-08. Owner running the signed-in walk. | done |
| `PR1b`, `PR2` | `-` | Wave 5, gated behind `PR1a`. Not in the remediation's definition of done. | — |

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
| CHANNELS | **PRAYER JOURNAL** | Sidebar section. Repurposed as the prayer journal (`PR1a`). **Amended 2026-08-08 by owner ruling** — was `PRAYERS`; names the artefact rather than the contents. There is no longer a Channels concept in the product. |
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
| Ask failure-state component | `L1` claims this exists and renders (observed in walkthrough) | **CONFIRMED, and it is richer than the block assumes.** Error state is the `role="alert"` block in `TurnView` (+ `RetryButton`); graceful fallback is `Fallback` + `RetryButton tone="fallback"`. The question is already retained on the turn (`turns[].question`) and retry already re-submits it, so `L1` steps 2 and 4 are **already implemented**. What is NOT covered is a throw during *render*: `turns` is component state (`const [turns, setTurns]`) with no reset path, so the deck's "conversation resets to the empty state" (examples render only when `turns.length === 0`) can only be an unmount — an error boundary or navigation, not the fetch path. **Cite by symbol, not by line (amended 2026-08-17):** every `ask-client.tsx` line number this row originally carried had drifted by 100+ lines through `e59213d` and `2d043ba` — `turns` L137→193, the alert 311-318→482, `RetryButton` L328→498, `tone="fallback"` L506→887, the examples guard L237→329. Grep the symbol. `INSTR` must settle this. |
| Plan progress write endpoint | `INSTR`, `L2` | **`POST web/src/app/api/plans/[id]/route.ts:33-62`**, body `{ kind:'day', dayIndex, completed }` → `setDayCompleted`, **`web/src/lib/plan/store.ts:287-301`** (single `UPDATE … RETURNING`, returns `false` → **404** when no row matched). Caller `web/src/components/plans-client.tsx:586-605`; the toast fires on any `!res.ok`. Four distinguishable failures reach the same toast (401 `UNAUTHENTICATED`, 400 `INVALID_REQUEST`, **404 no such plan day**, 500 `INTERNAL`) — which is exactly why `INSTR`'s sequencing question cannot be answered from the client. |
| Feature-flag mechanism | `N4` hides sections behind one | **DOES NOT EXIST.** No flag module, no `NEXT_PUBLIC_*_ENABLED`, no config gate. The only `flags` in the tree are the Ask lane booleans (`web/src/app/api/ask/stream/route.ts:25-27`), which are a per-request API field. The repo's existing idiom for "not built yet" is the `ComingSoon` component (`web/src/components/coming-soon.tsx`), used by `/study/[id]`, `/chat/[id]`, `/channel/[id]`, `/library/books` — i.e. the very placeholder `N4` exists to remove. See Backlog. |
| Test runner + existing test setup | Every exit test | **Vitest, two projects.** Root `vitest.config.ts` (`npm test`); web `web/vitest.config.ts` (`npm run qa`). Full gate `npm run audit` → `scripts/audit.sh`. Existing invariant suites live in `web/test/invariants/` and `test/invariants/` and are the right home for new exit tests. **Caveat carried from WORKLOG 2026-08-07: `npm run audit` refuses to run without a dev `DATABASE_URL`, which this tree does not have** — DB-backed legs will report NOT RUN. |
| Accent colour token (terracotta) | `S2` checkbox `accent-color` | **CONFIRMED. `web/src/app/globals.css:53-64`** — Tailwind v4 `@theme` block, `--color-accent-50` … `--color-accent-950` (oklch oxblood/terracotta). There is no `tailwind.config.*`; the theme is CSS. ~~**`S2` item 4 is already shipped** — `ask-client.tsx:117` already uses `accent-accent-700` / `dark:accent-accent-500` (fixed at `e196e4b`).~~ **VOID 2026-08-17: `S2` item 4 no longer exists.** `2d043ba` (Design C) replaced the lane checkboxes with `aria-pressed` toggle chips — there is no `type="checkbox"` and no `accent-accent` string anywhere in `ask-client.tsx` (grepped at HEAD). There is no checkbox left to style, so this item is moot rather than done. |
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
> written. Verify before working them, do not re-do them: ~~`S2` item 4 (Ask checkbox
> `accent-color` — `ask-client.tsx:117`)~~ **[VOID 2026-08-17 — Design C removed the checkbox
> entirely; see the R0 row above]**; `S2` item 7's sidebar half (`aria-label` on the pencil
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

> ## LIVE VERIFICATION 2026-08-08 — through the deployed UI on `be67cb9`
>
> Tonight's earlier 10/10 went through the production route handlers via `fetch`, against a build
> whose *client* was one release behind. This run is the UI path on the newly deployed build:
>
> | Check | Result |
> |---|---|
> | Builder opens valid (`L2b`) | `rom` / **3 weeks × 5 days**, `Create plan` **enabled**, "15 readings · about 1 chapter a day". Was 8×5=40 with Create disabled. |
> | Plan title (`L2c`) | **`Romans · 3 weeks`** — was `rom in 3 weeks` |
> | Dates (`L2c`) | `Sat, Aug 8` · `Sun, Aug 9` · `Mon, Aug 10` — pinned English |
> | Mark as read | 0 → **1 of 15**, no error toast |
> | **Survives a hard reload** | **yes** — API `read_days: 1`, list and detail both `1 of 15 days`, `UP NEXT` advanced to Romans 2 |
> | Delete through the UI | succeeds — `{"plans":[]}`, `GET` the id → `404 NOT_FOUND` |
> | Account left clean | yes |
> | Scope picker (`N1`) | "Commentary + 3 of 3 **collections**" — was "lanes" |
>
> Plan `e9ce90aa-2897-4d8c-9cbf-338f49fb89af` was created and deleted; production is left as found.
>
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

- [x] `AGENT` A newly created plan is titled `Romans · 3 weeks` — correct casing, correct separator. `defaultPlanTitle`, tested for `rom`/`jhn`/`psa`, the unknown-slug fallback, and the other three scopes.
- [ ] `BROWSER` Plan dates render as `Sat, Aug 8` with the browser locale forced to `en-US` **and** forced to `zh-CN`. Testing only your own locale does not exercise this.
- [x] `AGENT` No date call site lacks an explicit locale. Watched RED first, naming both sites. **Scope narrowed with a reason, not to pass:** the scan also caught 9 unpinned `toLocaleString` calls on *numbers* across 6 files — past §0.4's ~3-file stop. Those are ratcheted at 9 (a new one goes red) and filed in §9, not silently fixed or dropped.
- [ ] `BROWSER` No React hydration warnings in the console on any page rendering a date.

**Findings log**

> **Steps 1 and 3 DONE 2026-08-08** on `fix/L2c`. Three files, plus two new modules and one test.
>
> **Title:** `defaultPlanTitle` (`web/src/lib/plan/title.ts`) reads `BOOK_BY_SLUG` — the same record
> the picker renders from, so the name shown and the name stored cannot drift. No new lookup table,
> as the block requires. Moved out of `api/plans/route.ts` only because the exit test must call it;
> that is C2 level 3 (moving existing code), not a new abstraction.
>
> **Dates:** both unpinned sites now pass `DISPLAY_LOCALE` (`web/src/lib/locale.ts`).
> `plans-client.tsx:227` is the one the deck screenshotted as `8月8日周六`; `suggested-readings.tsx:221`
> is the second site `R0` found that nobody had noticed.
>
> **PRODUCT DECISION RECORDED, per the block's own instruction:** `en-US` is pinned because the
> product is English-only — English corpus, English UI, nothing translated. If localisation ever
> reaches the roadmap this constant becomes a real locale system rather than a pin. The comment in
> `locale.ts` is the pointer, and §9 carries the backlog entry.
>
> **NOT DONE — the two `BROWSER` checks.** Rendering dates under forced `en-US` *and* `zh-CN`, and
> confirming no React hydration warnings, both need a rendered page against a database this tree
> has no credentials for. They are the checks that would catch a wrong `timeZone` or a
> server/client mismatch, so the block is `~`, not `x`. **Do not mark them from a code reading.**
>
> **Pre-existing failure, proven not mine:** `better-auth-wiring.test.ts` fails on `basePath` — a
> stale Better Auth test the Neon cutover left, which ADR-107 condition 1 deliberately keeps until
> Neon Auth is verified. Stashing this branch's changes reproduces it identically.

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

- [x] `AGENT` The label surfaces are clean, asserted by `web/test/invariants/naming-lock.test.ts` rather than by §2.2's greps — which cannot run here (`rg` is not installed as a binary; `$LABELS` unquoted does not word-split under zsh) and could not return zero anyway while `lanes` is a wire field.
- [x] `AGENT` Only label definitions changed. 7 files, 11 string replacements.
- [x] `AGENT` No route, path or href changed — the only diff lines mentioning a route carry an identical `href` on both sides, with the label alone moving.
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

> **REWORK DONE 2026-08-08** on `fix/N2`. **The block's original ask already shipped** at `e196e4b`
> (the `useMoreBelow` mask, red-proofed both ways, 158px of overflow hiding five destinations). `R0`
> recorded that. What this branch fixes is what the mask COST, found by the pre-deploy audit
> (finding 8) and not by this block:
>
> **The fade was swallowing focusable rows.** Measured at 1280x720: the scrollport is 622px and
> "Hymns & Poetry" occupied 589-621 — entirely inside the 32px ramp, at ~3% opacity down to 0, while
> remaining a live link. And because that row is *already fully in view*, Tab does not scroll it
> (`scrollTop` 0 before and after `focus()`), so the global `:focus-visible` ring faded out with it.
> A keyboard user's focus vanished. WCAG 2.4.7, on every page that renders the rail, and the same
> shape at 390px where the sheet is scrollable the instant it opens.
>
> **Fix: `padding-bottom: 2rem` on the scrollport**, so the ramp always lands on empty space and no
> focusable element can be inside it. Padding rather than a shorter ramp — shortening the gradient
> would weaken the very signal the fade exists to give. The invariant asserts padding **>= ramp
> height**, so the two cannot drift apart; seeded at 1rem and watched red.
>
> **Step 1 of the block's minimal change ("reduce padding so the items fit") was NOT taken and
> should be struck.** It is the opposite of what the measurement showed: at 1280x720 there were
> 158px of overflow — five destinations' worth — so no plausible padding reduction removes it, and
> tightening rows would have made the ramp problem worse by fitting more of them into it.
>
> **NOT DONE — all three exit checks.** Two are `BROWSER` (three viewport heights; all eleven items
> reachable) and one is `HUMAN` (someone finds `My uploads` unaided). jsdom implements neither
> `mask-image` nor layout, so a rendered assertion here would prove nothing — stated plainly rather
> than dressed up. Block is `~`.

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

- **`N3a` hydration:** ~~fix the handler gap so every verse in a chapter is interactive.~~
  **⚑ BLOCKED 2026-08-08 — the hypothesis has no mechanism in the source, so there is nothing to
  fix here.** `verse-display.tsx:185` is a single unconditional `data.verses.map(...)`, and the
  handle it renders (`:253-263`) carries `role`, `tabIndex`, `aria-label`, `onClick` and `onKeyDown`
  with **no branch on verse number, index or position**. There is no code path where verse 23
  differs from verse 22, so "per-chapter hydration dropping handlers partway through" cannot be
  produced by this component.
  The deck's observation may still be real — but if it is, the cause is a **hydration abort partway
  through the tree**, which would kill every handler after the throw and looks exactly like
  "1-22 live, 23-32 dead". A7b found production throwing React #418 on essentially every reader
  page load, which is a standing candidate. **That is a `BROWSER` investigation, not a source fix**,
  and doing anything to this component first would be changing code to chase a defect nobody has
  located.
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

### `N3c` — Find the hydration abort (NEW, 2026-08-08)

**Wave:** 2 · **Severity:** P1 High · **Depends on:** — · **Blocks:** `N3a` · **Status:** `[ ]` · **BROWSER**

Opened by the owner after `N3a`'s hypothesis was disproved at source level. `verse-display.tsx:185`
is a single unconditional map with no per-verse branch, so "verses 23-32 lost their handler" cannot
be produced by that component. **A hydration abort partway through the tree can produce it exactly**
— React stops hydrating at the throw, so every handler after that point is dead while everything
before it works. "1-22 live, 23-32 dead" is what that looks like from the outside.

A7b measured production throwing **React #418 on essentially every reader page load**, and its X1
check was retracted precisely because a console read taken *after* navigation cannot see an error
thrown *during* it.

> **Same failure class as `INSTR`'s open Ask question.** The deck reported the Ask thread silently
> resetting to its empty state; `INSTR` established the client has no reset path, so a reset means
> an **unmount** — an error boundary catching a throw. Two reports, two surfaces, one shape: a
> client-side throw killing a subtree. Investigate them together; a single root cause is likelier
> than two coincidences.

**Minimal change** — this block ships a DIAGNOSIS, not a fix

1. Arm an error recorder **before** navigation (`window.onerror`, `unhandledrejection`, a wrapped
   `console.error`), then hard-load a reader page. A read taken after the fact sees nothing.
2. Capture the #418 payload and identify which node mismatches.
3. Check whether the last-working verse index correlates with the throw point.
4. Write the cause into the Findings log. **Do not fix in this block** — `N3a` is where a fix lands,
   and only once there is something located to fix.

### RESULT 2026-08-08 — ⚑ **DID NOT REPRODUCE, and the reported shape is not producible by the mechanism it was attributed to.**

Run against the deployed build `be67cb9`, `/read/jhn/1`, hard document load.

| Probe | Result |
|---|---|
| React #418 (or #423/#425) in the console | **none** |
| Verse spans in the DOM | **51** (John 1 is 51 verses) |
| Interactive handles | **51** — every verse, none missing |
| Handles that respond (opened the panel) | **verses 3, 22, 23, 32, 45, 51 — all six** |

So on this build: no hydration error, no truncation, and **no dead range.** The panel opens on
verses either side of the reported boundary and at the end of a chapter twice as long as the deck's
sample.

### The finding that reframes this — the reported range is bounded at BOTH ends

The deck reported *"verses 1–22 open the study panel; verses 23–32 render as plain text and ignore
taps."* **A hydration abort cannot produce that.** React discards the remainder of the subtree at
the throw, so everything after the throw point is dead — the dead range runs to the END of the
chapter. John 1 has **51** verses; a range that stops at 32 and (implicitly) resumes is not what an
abort looks like.

That kills the mechanism this block was opened to investigate. Three candidates survive, and they
are cheap to separate next time:

1. **The observation was of a partial page** — the reader scrolled to ~32 and reported the boundary
   of what they had loaded or looked at, not a boundary in behaviour.
2. **It was real and is now fixed.** `be67cb9` is many commits past what the deck saw, and
   `verse-display.tsx` changed materially in that window (`e196e4b`'s hint and handle work).
3. **It is environment-specific** — a slower device, a different browser, or a mid-load interaction
   that this pane does not reproduce.

### What this does to `N3` and `L1`

- **`N3a` should be struck, not merely blocked.** Its stated root cause has no mechanism in the
  source (established 2026-08-08), and now its *symptom* does not reproduce on the shipped build
  either. Two independent reasons. ⚑ Owner call: strike `N3a`, leaving `N3b` step 3 as the whole of
  `N3`.
- **`L1`'s remaining guard loses its motivation.** It exists to catch an unhandled throw that
  unmounts the Ask turn. That reset has now failed to reproduce **four** times with a recorder armed
  correctly, and this run finds no client-side throw on the reader page either. The guard is still
  cheap and still correct defensive practice — but it should be built as defence, not as a fix for
  an observed defect, and the block should say so.

### NOT PROVEN, and worth stating plainly

**This is one build, one browser, one chapter, in a desktop pane.** "Did not reproduce" is not "does
not happen" — the deck's reviewer saw something, and three of this session's own findings began as
reports that looked wrong and turned out to be real. What is *proven* is narrower and stronger: the
**mechanism** is wrong. A both-ends-bounded dead range is not a hydration abort, whatever else it
might be.

### CSP note, unchanged and unrelated

The console is not silent: every load still emits the Google Fonts CSP refusal (pre-deploy audit
finding 7, already filed in §9). It is not a hydration error and does not affect this result — but
it does mean "the console has errors on every reader load" remains true, which is what made A7b's
report plausible in the first place.

---

### PROTOCOL — staged 2026-08-08. Start at step 1; no orientation needed.

**What you are looking for.** React hydration walks the server-rendered tree and attaches handlers.
If it throws partway, React discards the rest of that subtree — **every handler after the throw
point is dead, every one before it works.** That is exactly "verses 1-22 live, 23-32 dead", with no
per-verse mechanism required. `verse-display.tsx:185` is a single unconditional map, so the source
cannot produce that pattern; only an abort can.

**How #418 presents.** In production React errors are minified to a code and a link. #418 is
"Hydration failed because the initial UI does not match what was rendered on the server." It is
logged via `console.error` **during** hydration — which is why a console read taken *after*
navigation sees nothing, and why A7's X1 check was retracted.

**Steps.**

1. **Arm before navigating.** In the pane, on any page: wrap `console.error`, add `window.onerror`
   and `unhandledrejection` listeners, push into a global array. **Then** navigate to a reader page.
   Arming after the load is the mistake that produced a false green once already.
2. **Hard-load** `/read/jhn/1`. Not a client-side route change — hydration only happens on a real
   document load.
3. **Read the array.** Record whether #418 (or #423/#425, its siblings) fired, and the full text.
4. **Locate the boundary.** Walk the verse handles: `document.querySelectorAll('[role="button"][aria-label*="read commentary"]')`.
   Count them, then click one *early* (verse 3) and one *late* (verse 30) and see which opens the
   panel. **The index where behaviour changes is the throw point.**
5. **Distinguish the two candidates** — this is the step that decides the fix:
   - **Hydration kill:** the handles all EXIST in the DOM (server-rendered) but the late ones do
     not respond. Handler attachment stopped.
   - **Never attached:** the late handles are absent from the DOM entirely. A render problem, not a
     hydration one — and a different fix.
6. **If #418 fired, find the mismatching node.** The dev build names it; production does not. Reproduce
   locally against `next dev` with the same chapter to get the readable message.
7. **Write the cause into this block. Do not fix here** — `N3a` is where a fix lands.

**Prime suspects, from what this repo already knows.** A7b proved `layout.tsx:58`'s
`suppressHydrationWarning` does **not** cover the two mismatches it found (`sidebar.tsx:115-134`
Sign in/Sign out, `reader-header.tsx:68` WEB/KJV). Both are auth- or preference-dependent — server
renders one thing, client another. `reader-header` is on the reader page, which makes it the first
place to look.

**Do NOT**

- Do not edit `verse-display.tsx`. Owner ruling 2026-08-08: it has no mechanism to fix.
- Do not add `suppressHydrationWarning`. That hides the signal without closing the abort, and
  `layout.tsx:58` already carries one that A7b proved does not cover these cases.

---

### `N4` — Close one fake door, repurpose the other

**Wave:** 2 · **Severity:** P1 High · **Depends on:** `R0`, `N1`, **`PR1a`** · **Blocks:** — · **Status:** `[!]` **BLOCKED on `PR1a` (owner ruling 2026-08-08).** The ruling "migrate existing objects, nothing user-created dropped" cannot be honoured before the destination exists, and the objects are `localStorage`-only so there is nothing server-side to move. **The carry-forward spec moves into `PR1a` as a first-launch migration into Neon persistence** — see that block.

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

1. **CHANNELS -> PRAYER JOURNAL** (label amended 2026-08-08; see §2). The section already implements exactly the shell the prayer journal
   needs: a sidebar list of named personal objects with a create control. `PR1a` puts a real
   feature behind it. **Until `PR1a` ships, the section is hidden** — not badged "Coming soon",
   because `PR1a` is scoped in this document and scheduled, so a badge would be a second fake
   door.
2. **STUDY PARTNERS -> hidden**, per the original disposition. Any future cohort feature is
   greenfield, not a revival of this section.
3. **`New section` -> removed.** It has no referent once sections are gone.
4. **Channels route** -> **RULED 2026-08-08: REDIRECT to the prayers surface, not 404.** A 404 on a
   URL a reader was invited to create is a dead end they cannot act on; a redirect lands them where
   the concept moved.
5. **Existing channel objects** -> **RULED 2026-08-08: MIGRATE into the prayer journal as entries.
   Nothing user-created is hidden or dropped.**
   > ⚠ **This ruling collides with an `R0` finding and cannot be executed as stated yet.** The
   > sidebar's Channels items are **`localStorage` only** — `sidebar.tsx:111-122`, key
   > `study-sections:v1:<userId>`, and that file contains **no `fetch` at all**. `/api/channels` and
   > the `channels` table exist and the sidebar never calls them. So there is nothing server-side to
   > migrate, and a migration can only run **in the reader's browser, once, on next load**.
   > Additionally the destination does not exist until `PR1a` ships. **Sequencing consequence:**
   > `N4` cannot both hide Channels and honour "nothing dropped" until `PR1a` provides the journal —
   > so either `N4` waits for `PR1a`, or it ships a client-side one-time carry-forward into
   > localStorage that `PR1a` later imports. Owner call, and it is a new one this ruling surfaced.

**Do NOT**

- Do not build Channels or Study Partners. The concept is retired, not deferred.
- Do not badge anything "Coming soon". Between this block and `PR1a`, the section is simply not
  there.
- Do not write onboarding copy for a section that is about to change meaning.

**Exit test**

- [x] `BROWSER` A fresh account cannot create any object that leads to a placeholder page. — **CLOSED 2026-08-08 by the owner** on browser-extension verification.
- [~] `AGENT` No orphaned channels or study partners remain in the sidebar for accounts that already created them; the hide-or-migrate decision is recorded in the Findings log and implemented. — **NOT FULLY MET. Reopened by the owner's extension pass**, which found rail entries (`MY SERMONS`, `BIBLE STUDIES`) in *existing* readers' `localStorage` still linking to `/channel/*`. The seeded sections were removed, but reader-created ones survive. Carried to block `PR1c` item 1 — this check closes when that does.
- [x] `AGENT` The old Channels route either redirects or 404s per the recorded decision — it does not render a placeholder. — **CLOSED 2026-08-08 by the owner** on extension evidence, and the status settled by measurement: **`307 Temporary Redirect → /prayers`**.
- [x] `BROWSER` The sidebar PRAYER JOURNAL section either shows the shipped `PR1a` journal, or is hidden. **No third state.** — **CLOSED 2026-08-08 by the owner.**

> **How the 307 was settled, and why the obvious command could not do it.** `curl -I` against
> **production** returns `307 → /gate?next=%2Fchannel%2Fabc123` — **that is the site-password gate,
> not this route's redirect.** The control proves it: `/prayers`, which has no redirect of its own,
> returns an identical `307 → /gate?next=%2Fprayers`. An unauthenticated `curl` cannot observe this
> redirect at all, and closing the check on that response would have been an unearned green
> measuring a different mechanism. Measured instead where no gate intercepts (local build):
> `HTTP/1.1 307 Temporary Redirect`, `location: /prayers`. **307 is correct** — it is Next's
> `redirect()` default, preserves the request method, and unlike a 301/308 is not permanently
> cached, so retiring this route stays reversible. The owner's extension evidence was taken from an
> authenticated session past the gate and saw the real behaviour.

**Findings log**

> **EXECUTED 2026-08-08, unblocked by `PR1a` shipping.** The block's open sequencing question —
> "either `N4` waits for `PR1a`, or it ships a client-side one-time carry-forward into localStorage
> that `PR1a` later imports" — resolved the **first** way. `PR1a` is live, so the destination
> exists and its first-launch carry-forward already migrates the objects. No second migration was
> written, and none should be.
>
> **Route decision (exit check 3):** REDIRECT, per the owner's 2026-08-08 ruling.
> `app/channel/[id]/page.tsx` now calls `redirect('/prayers')` and renders nothing. The dynamic
> segment is deliberately ignored — every id resolves to the same place, because no channel ever
> had content; the route only ever rendered a placeholder. **The route file is deliberately KEPT**:
> deleting it would produce the 404 the ruling rejected, so a test asserts it still exists.
>
> **Pre-existing-objects decision (exit check 2):** MIGRATE, discharged by `PR1a` rather than here.
> Nothing user-created is hidden or dropped, and `PR1a`'s carry-forward leaves its `localStorage`
> source in place — a coupling flagged at `sidebar.tsx`'s `storageKey`, because deleting that key
> in a later release silently converts a recoverable miss into data loss.
>
> **Dispositions:** `SEED_SECTIONS` is now empty — Study Partners retired (not deferred), Channels
> repurposed to a `Prayer journal` section linking to `/prayers`, `New section` removed with them
> since it had no referent once sections were gone. Nothing is badged "coming soon"; that would be
> the second fake door this block exists to remove, and a test forbids it.
>
> **Seven exit tests, seven seeds watched red**, each on its own check — including the two that
> matter most: re-badging the section "Coming soon", and **deleting** the channel route, which is
> the 404 the owner ruled against and would otherwise have read as a pass.
>
> **Unticked:** exit checks 1 and 4 are `BROWSER`. Observed on the dev build — `/channel/abc123`
> landed on `/prayers`, and the rail showed no Study Partners and no New section — but observation
> is not the check, and no agent closes it.

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

1. ~~Derive default weeks from the chosen book: `ceil(chapters / daysPerWeek)`~~ **AMENDED
   2026-08-08, owner-accepted — the original was arithmetically impossible.** The validation
   (`expand.ts:130-134`) refuses when `chapters < weeks × daysPerWeek`. With `daysPerWeek` fixed at
   5, any book with **fewer than 5 chapters** has no positive week count that satisfies it, because
   `weeks >= 1` already demands 5 slots. That is **19 of 66 books**, so deriving weeks alone leaves
   nearly a third of the picker in the error state this block exists to remove. Derive **both**
   numbers (`defaultPlanShape`) — still one function, one call site, and it touches neither the
   validation nor the preview. **The exit test caught this before any code shipped, which is the
   process working as designed, not a failure of it.**
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

> **DONE 2026-08-08** on `fix/L2b`, with **one deviation from the block's literal text, flagged
> rather than taken quietly.**
>
> **The block's minimal change cannot close the finding.** It says "derive default weeks:
> `ceil(chapters / daysPerWeek)`". The real validation (`expand.ts:130-134`) refuses when
> `chapters < weeks × daysPerWeek`, so with `daysPerWeek` fixed at 5, any book with **fewer than 5
> chapters** has no positive week count that satisfies it — `weeks >= 1` already demands 5 slots.
> That is **19 of 66 books** (Jude, Philemon, Obadiah, 2–3 John, Haggai, Titus, Joel, Nahum,
> Habakkuk, Zephaniah, 2 Thess, Ruth, Jonah, Malachi, Philippians, Colossians, 2 Timothy, 2 Peter).
> Deriving weeks alone leaves nearly a third of the picker opening in the error state the block
> exists to remove. So `defaultPlanShape` derives **both** numbers. It is still one function and one
> call site, and it touches neither the validation nor the preview.
>
> **A second judgement, made smaller than the block asked.** "Recomputed on book change" would
> discard a reader's deliberate 8-weeks-at-3-days while they browse. `pickBook` re-derives **only
> when the current shape would error**, so valid choices survive. Smaller in effect, same outcome.
>
> **`setBook` had a second caller.** The `<select>` still called it directly, bypassing the
> derivation entirely. Found by grepping the caller set, not by assuming one — the same shape as the
> `/read/john/1` alias defect in A7.
>
> **Two existing tests asserted the DEFECT.** `plans-builder-preview.test.tsx` proved the preview
> refuses and Create is disabled by relying on the builder *opening* at 40 impossible slots. Their
> subjects are exactly what this block's Do-NOT protects, so the fixtures now set the impossible
> combination **deliberately** — which is verbatim what exit check 2 asks for — and the assertions
> are unchanged. Two more had numbers baked from the old constants; updated, properties untouched.
>
> **NOT DONE — all three exit checks are `BROWSER`** (cycling a live selector, confirming the
> preview arithmetic). They need a rendered page against a database this tree has no credentials
> for. The block is `~`. The AGENT-verifiable core beneath them — the derivation across all 66 books
> at 1/3/5/7 days a week — is `web/test/invariants/plan-builder-defaults.test.ts`, watched red first.
>
> **Filed, not fixed:** collection and topic modes inherit the book-derived schedule rather than
> deriving their own (Paul's letters, 87 chapters, opens at the 15 slots carried from Romans). It
> fits, so it is not an error state — but it is not derived either. Section 9.

---

## 6. Wave 3 — Teach the promise, close the platform gaps

Only now is there something worth teaching: a renamed, consistent, discoverable interaction.
`T3` cannot be verified from a desktop browser — arrange device access before starting it.

---

### `T1` — First run: teach the one idea that differentiates

**Wave:** 3 · **Severity:** P1 High · **Depends on:** `N1`, `N3` · **Blocks:** — · **Status:** `[ ]` — **auth dependency CLEARED 2026-08-08: the Neon Auth cutover is live.** The post-sign-up redirect is now one literal: `callbackURL: '/home'` at `web/src/components/auth-forms.tsx:76`. That is the line this block changes.

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
- [ ] `AGENT` **The pre-change baseline for that metric was recorded before shipping.** Without it the measurement is worthless. **RULED 2026-08-08: yes, capture it first.** `T1` does not ship until the baseline exists — shipping first destroys the only comparison that makes the block's success legible.

**Findings log**

> ## T1 BASELINE CAPTURE — 2026-08-08. Measurement only; no product code touched.
>
> **RESULT: the baseline cannot be captured, because the metric is not instrumented and no
> instrumentation exists to capture it with. That is the finding, and it is a blocker for the block
> rather than a detail of it.**
>
> The block's metric is *"% of new accounts opening a verse drawer in their first session."*
> Measured against the tree:
>
> | What the metric needs | What exists |
> |---|---|
> | An event when the verse drawer opens | **None.** `verse-display.tsx` and `study-panel.tsx` contain zero `logEvent` calls. |
> | A client analytics pipeline | **None.** Zero analytics dependencies in `web/package.json` (no PostHog/Segment/Mixpanel/Plausible/Amplitude/Vercel Analytics), and zero `track(` / `gtag` / `analytics.` call sites in `web/src`. |
> | A notion of "first session" | **None.** No session-scoped event exists to group by. |
> | Somewhere to aggregate it | **None that can answer a question.** `observability.ts:25-34` is the whole of it: `logEvent` builds a JSON line and `console.log`s it into Vercel runtime logs. Nothing consumes, stores or aggregates those lines — pre-deploy audit finding 17. |
>
> `ObsEvent` defines exactly seven events (`rate_limit_hit`, `rate_limit_fail_open`,
> `rate_limit_fail_closed`, `gate_rate_limit_hit`, `gate_locked`, `ask_outcome`, `waitlist_signup`,
> `error`) and **not one is user behaviour.**
>
> ### Why no proxy was substituted
>
> A tempting stand-in is "new accounts that created a highlight or note in their first day", which
> *is* answerable from the database. It was deliberately not used. It measures **writing**, not
> **opening** — the block's whole thesis is that the drawer is where value becomes obvious, and a
> reader can open it fifteen times and write nothing. A proxy that moves for a different reason than
> the change would make `T1` look successful or failed on evidence about something else. Recording
> "unmeasurable" is the true statement; recording a proxy figure would be the unearned green this
> repo audits for.
>
> ### Sequencing consequence
>
> `T1`'s own third exit check requires the metric instrumented, and its fourth requires the baseline
> recorded **before shipping** (owner ruling 2026-08-08). Both are now blocked on work that is not in
> this block: **an event on drawer-open, and something that can count it.** `T1` cannot ship until
> that exists — not because the redirect is hard, but because shipping first destroys the only
> comparison that would make the block's success legible, which is exactly what the owner's ruling
> was protecting.
>
> **Filed to §9** as the prerequisite. No code was written, toggled or measured-and-changed in this
> pass, per the brief.

---

### `T2` — The unverified-signup trade-off, post-migration

**Wave:** 3 · **Severity:** **P1 High** · **Depends on:** — · **Blocks:** — · **Status:** `[ ]` ⚑ **owner decision inside**

> **REWRITTEN 2026-08-08 by owner ruling.** The previous version was headed "mostly superseded — keep
> this block only if the migration is cancelled." **The migration was not cancelled; it happened**
> (to Neon, not Supabase — ADR-107), so by its own terms that block had struck itself. The
> contradiction is struck rather than edited at the margins, because what survives is not what the
> block was about.

**Observed** — console state read 2026-08-08, and the code beneath it

Two of the three original asks are genuinely gone. OAuth users have no password field, so the
show/hide toggle is moot for them; provider-verified emails need no banner. **The third inverted.**

| Setting | State | Consequence |
|---|---|---|
| Email sign-up | **ON** | anyone can register any address |
| `Verify at Sign-up` | **OFF** | …without owning it |
| Google OAuth | **LIVE** | and the real owner's later Google sign-in auto-links onto that account |

That is **GHSA-g38m's full precondition, assembled.** Under Better Auth it was closed
*structurally* — no OAuth existed, so the exploit had no mechanism. It is now **actively
exercised**, and Neon exposes no verified-email-before-link control (SDK types, OAuth guide and
management API all checked, 2026-08-08).

**Root cause** — not a missing feature; a setting whose two safe positions each cost something

### ⚑ RULED 2026-08-08 — keep BOTH methods; `Verify at Sign-up` **ON**, after the sender is fixed

Owner ruling. Option 3 (OAuth-only) was considered and rejected: keeping email/password matters
more than the simplicity of deleting it. So both sign-in paths stay, and **g38m is closed by
verification instead** — an unverified local account can no longer exist, so a later Google sign-in
has nothing to auto-link onto.

**Sequenced, and the order is the whole ruling:**

1. **Fix the Neon mail sender first.** Console → Configure email provider. Today auth mail sends
   from the shared `auth@mail.myneon.app`; verification-on makes that mail load-bearing for every
   new account, so shipping in the other order turns a security fix into a signup outage.
2. **Then turn `Verify at Sign-up` ON.**
3. Record both in `docs/SECURITY.md` beside SEC-1, with the date.

**Two questions this ruling does not answer, and they are the first things to check on execution:**

- **Existing email/password accounts.** Verification-on governs new registrations. Accounts already
  created unverified — the test account at minimum — need a decision: grandfathered, or prompted to
  verify. If grandfathered, g38m's precondition survives for exactly those accounts, and the
  closure is partial rather than structural. **Check the count before assuming it is empty.**
- **Owner lockout.** Verification-on plus a mail failure means no new account can complete signup.
  Existing sessions and existing accounts are unaffected, so this is a signup outage rather than a
  lockout — but confirm that is true of the owner's own recovery path before relying on it.

**The rejected options, retained so the reasoning is legible**



| Option | Closes g38m | Cost |
|---|---|---|
| `Verify at Sign-up` **ON** | yes — an unverified account cannot be linked onto | a mail outage locks out **every** account including the owner's, and auth mail is currently a regression (below) |
| `Verify at Sign-up` **OFF** (today) | no | the account-takeover stays live and reachable |
| Email sign-up **off**, OAuth only | yes — no unverified local account can exist | excludes anyone who will not use Google |

**Neither of the first two is free, and the third is a product decision about who may sign up.**
This block does not pick; it exists so the choice is made deliberately and recorded, rather than
inherited from a console default nobody set.

**Also in scope, and it makes option 1 worse than it looks**

Auth mail is a **regression**. It now sends from Neon's shared `auth@mail.myneon.app` instead of the
project's Resend account with Ancient Paths branding — worse recognition and worse deliverability on
a security-critical message. **Verification-on depends on that mail arriving**, so fixing the sender
is a prerequisite of option 1, not a nicety beside it. Fixable in the Neon console
("Configure email provider").

**Minimal change** — do not exceed

1. **Rule the trade-off** and record it in `docs/SECURITY.md` beside SEC-1. ⚑ owner.
2. If option 1: fix the mail sender **first**, then turn verification on.
3. Show/hide password toggle on the email path that remains — one state variable, one `type` swap,
   `web/src/components/auth-forms.tsx`.

**Do NOT**

- Do not turn verification on before the mail sender is fixed. That converts a security improvement
  into a lockout.
- Do not add a confirm-password field. Show/hide solves the same typo with less friction; both is
  redundant.
- Do not treat this as shipped because OAuth works. Google working is what *created* the exposure.

**Exit test**

- [ ] ⚑ `OWNER` The trade-off is ruled and recorded in `docs/SECURITY.md` with its date and reason.
- [ ] `AGENT` The chosen console state is asserted from the app where code can see it — and where it
      cannot, the doc says so rather than implying a test covers it.
- [ ] `BROWSER` The show/hide toggle works on sign-in and sign-up.
- [ ] `BROWSER` If verification is on: a new account receives the mail, from the branded sender, and
      can still reach the product before verifying.

### ⚑ EXECUTION CHECKLIST — staged 2026-08-08, NOT executed. Runnable cold by a future session.

Everything short of execution. Steps 1-3 are console work only the owner can do; 4-6 are checks
that must happen **in this order**, because two of them can invalidate the plan.

**BEFORE turning anything on — the two parked checks. Run these first; they can change the plan.**

- [ ] **1. Count existing unverified accounts.** Verification-on governs *new* registrations only.
      If accounts already exist unverified, g38m's precondition survives for exactly those and the
      closure is **partial, not structural**. Do not assume the set is empty — the test account is
      at least one. Read it from the Neon Auth console's user list, or from `neon_auth` in the
      database (read-only). **Record the number.** If it is non-zero, decide: grandfather them (and
      say so in `SECURITY.md`, because the closure is then partial) or prompt them to verify.
- [ ] **2. Confirm a mail failure is a signup OUTAGE, not an owner LOCKOUT.** Expected: existing
      accounts and live sessions are unaffected, so only *new* signups stall. Confirm against the
      owner's own recovery path specifically — if the owner's account ever needs a password reset
      while mail is broken, that is a lockout and this ruling needs revisiting.

**Then execute, in this order — the order is the ruling.**

- [ ] **3. Fix the sender.** Neon Console → project → Auth → **Configure email provider**. Today it
      sends from the shared `auth@mail.myneon.app`; point it at the project's own Resend account so
      mail arrives branded and deliverable. Verification-on makes this mail load-bearing for every
      new account, so it comes **first**.
- [ ] **4. Verify the sender works** before relying on it: trigger one password-reset to a real
      inbox and confirm it arrives, from the right address, not in spam.
- [ ] **5. Turn `Verify at Sign-up` ON.** Neon Console → Auth → Configuration.
- [ ] **6. Prove it end to end:** sign up a fresh address → mail arrives → the account cannot be
      used to auto-link a Google identity before verification → after verifying, both paths work.

**Then record.**

- [ ] **7. Update `docs/SECURITY.md`**: g38m closed by verification, the date, the unverified-account
      count from step 1, and whether the closure is structural or partial.

**Do NOT** turn verification on before step 4 passes. That converts a security fix into a signup
outage, which is the one failure this sequencing exists to prevent.

**Findings log**

> Call sites for whoever executes: all five auth actions go through `@/lib/auth/client` and are
> called only from `web/src/components/auth-forms.tsx` — `signIn.social` `:74`, `signIn.email` `:96`,
> `signUp.email` `:110`, `requestPasswordReset` `:122`, `resetPassword` `:135`.

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

> ## RECON 2026-08-08 — docs only. **NOT RUN** (needs hardware; forbidden by the overnight brief).
>
> **The block's step 1 appears ALREADY IMPLEMENTED, which changes what this block is for.**
> `web/src/components/app-shell.tsx:35` applies to the main scroll container:
>
> ```
> pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0
> ```
>
> That is verbatim the prescribed minimal change — tab-bar height plus the safe-area inset, dropped
> at the `md` breakpoint where the bar disappears. The same idiom recurs correctly at
> `read/[book]/[chapter]/page.tsx:401`, `work/[slug]/page.tsx:170`, `library/word-study/page.tsx:170`,
> `work-toc.tsx:117` and `book-picker.tsx:59`.
>
> **So the deck's observation is either stale, or it is not a padding bug.** Three candidates, and
> only a device can separate them: (a) the report predates this padding; (b) a specific page
> establishes its own scroll container inside the shell's, so the shell's padding never applies to
> it; (c) iOS Safari's dynamic toolbar changes the viewport after paint and `dvh`/`env()` resolve
> against a stale value. **Do not "fix" the padding before knowing which** — adding more padding
> against (b) or (c) would be motion that appears to work on a resized desktop and does nothing on
> the device, which is the exact failure the block's own Do-NOT warns about.
>
> **Step 3 is void.** "Remove the duplicate `Search` tab" — `mobile-nav.tsx:44-57` defines four tabs
> (Home, Bible, Ask, Library) and none is Search. A Search *button* renders beside them in the same
> bar with the same treatment, which is why it reads as a tab; whether it duplicates Passage search
> is a real question, but it is not a tab to remove. Step 2 (`AP` → `Ask`) shipped with `N1`.
>
> **What this block actually needs is a device pass, and its four exit checks are already `DEVICE`.**
> Nothing here is agent-closable. Untouched, per the brief.

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

> ## RECON 2026-08-08, RE-SCOPED POST-NEON — docs only, no code. **The store-vs-migrate call is the owner's and is NOT made here.**
>
> ### What actually exists now
>
> | Thing | State, measured |
> |---|---|
> | The three prefs | Still `localStorage` only. Theme + size at `lib/reading-prefs.ts:23-24` (`reader-theme`, `reader-size`), re-read by the anti-FOUC inline script at `layout.tsx:82`; translation at `settings-form.tsx` and again at `read/[book]/[chapter]/page.tsx`. **Unchanged by the auth cutover.** |
> | `user_profiles` | **Still zero application references.** Declared in `USER_TABLE_SPEC` with a dormant `preferred_translation`; no code reads or writes it; prod held 0 rows at the last census. |
> | Migration 104's `auth_*` tables | **Orphaned but not dropped.** The only surviving reference is `better-auth.ts:63`, which is now dead code — `session.ts` reads Neon's `getSession()` (`:12`). ADR-107 condition 1 deliberately keeps them until Neon Auth is proven, which it now is; retiring them is that ADR's step 10, not this block's. |
> | A Neon-created table to hang prefs off | **None added.** No migration after `106` exists; Neon manages its own `neon_auth` schema, and nothing in this repo's migrations touches it. |
> | GRANT posture | Unchanged and now well understood: `032` narrowed the default to SELECT+INSERT, so **any new table needs an explicit `UPDATE`/`DELETE` grant in its own migration** — the defect that cost two shipped features on 2026-08-07 (migration `106`). Whichever option below is chosen, if it creates or writes a table, it must state its grants. |
>
> ### What the cutover changed for this block — less than it looks
>
> The old v1.1 note said `T4`'s account-deletion becomes "entangled with Supabase user management".
> Substitute Neon and the shape holds: **account deletion now spans two systems.** Deleting the
> Neon-side identity is a Neon operation; deleting the 21 user-scoped tables keyed on that id is
> ours. Neither alone is "delete my account", and the block's exit check says *verified against the
> database, not the UI*.
>
> **A second consequence the block does not mention:** user ids come from Neon now
> (`session.ts:21`). Any prefs row keyed on a user id inherits whatever id format Neon issues, and
> `runAsUser` sets `app.current_user_id` from that same value — so a prefs table is only as correct
> as that binding, which is worth asserting rather than assuming.
>
> ### ⚑ RULED 2026-08-08: HELD until the owner has seen the first-paint flash
>
> **The observation is now SCHEDULABLE against the deployed build.** `layout.tsx:82`'s behaviour is
> live-visible on **every page load** of `be67cb9` — the inline script reads `localStorage`
> synchronously before paint, so what you are looking for is present on any load, not something to
> reproduce. **How to see it:** open the app with `reader-theme=dark` stored, then hard-reload and
> watch the first frame. Today there is no flash *because* the script runs before paint — that is
> the property option B would give up. Set the theme, reload, and judge whether losing that is
> acceptable; then rule. Nothing else in `T4` starts first.
>
> The store-vs-migrate choice is **deliberately not made yet.** Option B's real cost is the
> `layout.tsx:82` flash — a server-held theme is correct one render *after* paint — and that is a
> thing to judge with eyes, not from a description. `T4` stays `-` and this block does not start
> until that observation exists. **A held decision, not a forgotten one.**
>
> ### Three options, costs measured — ⚑ the choice is the owner's
>
> | | Option | Cost | What it does not do |
> |---|---|---|---|
> | **A** | Wire the dormant `user_profiles.preferred_translation` only | ~30 lines, **no migration**, no new grants | Leaves theme and text size device-local. Half the finding, honestly labelled. |
> | **B** | Add `theme` and `text_size` columns to `user_profiles` | One migration **plus explicit grants** (see above), **plus re-thinking `layout.tsx:82`** — the anti-FOUC script reads `localStorage` synchronously *before paint*, and a server-held preference cannot be read there without either a cookie mirror or accepting a flash | Closes the finding; introduces a first-paint problem the block never mentions. |
> | **C** | Defer until account deletion/export is designed | Zero now | Leaves the "settings don't roam" complaint open, which both audits raised independently. |
>
> **The `layout.tsx:82` interaction is the part most likely to be missed** and belongs in whichever
> option is chosen: syncing a theme to the account does not, by itself, make the theme correct on
> first paint — it makes it correct one render later, which is a visible flash on every load.
>
> ### Exit-test skeleton (not written as files, per the brief)
>
> `AGENT` a pref set on one session is read on a fresh session for the same account ·
> `AGENT` `Saved on this device` copy is removed where it stopped being true and kept where it is
> still true · `AGENT` export produces a file containing the user's notes and highlights ·
> `AGENT` deletion removes the account **and** its rows across all 21 user-scoped tables, verified
> against the database · `BROWSER` no first-paint flash after the change.

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

### PAGE SKELETONS — staged 2026-08-08. **Sections only, no copy.** ⚑ owner-blocked on review.

> **Owner ruling 2026-08-08 (evening, in session):** a standard generic Terms of Service and
> Privacy Policy WILL be drafted, with the corporate entity named per the owner ("Ancient Terms
> as the Corp" — entity name to be confirmed when drafted), **deliberately deferred** — not part
> of the marketing redesign (ADR-111). The skeletons below remain the structure to fill when
> that work is scheduled.

Three routes do not exist (`/privacy`, `/terms`, `/contact`); `/about` does. These are the sections
each page needs — **not the words.** An agent should not draft a privacy policy or terms of service:
they are legal statements about what this business actually does, and getting them wrong is worse
than not having them. What follows is the structure to fill.

**Two things make these unusually easy to write honestly here**, and both should be said plainly on
the page rather than buried: the corpus is public-domain or permissively-licensed by construction
(`DATA_SOURCES.md`), and **the product never sends user content to a model as training data** — C9
already forbids user content entering any retrieval corpus. Most products cannot say either.

#### `/privacy`
- What is collected: account email, and what the reader creates (notes, highlights, plans, uploads).
- What is **not**: no analytics vendor, no tracking pixels, no ad networks — **true today and worth
  stating, because it is a differentiator and a constraint** (see §9's T1 prerequisite: adding
  analytics later means amending this page, deliberately).
- Where it lives: Neon (Postgres), region; Vercel for hosting; Neon Auth for identity; DeepInfra for
  embeddings — **and what is sent to each.** Uploaded documents are embedded; prayers and notes are
  not (C9).
- Third parties, named, with why each exists.
- Retention, and what deletion actually removes — **must match what `T4`'s delete builds**, so these
  two are written together or the page becomes a promise the code does not keep.
- Reader rights: export, delete, correct. **Do not claim any of these before `T4` ships them.**
- Contact for privacy questions.
- Last-updated date.

#### `/terms`
- What the service is, in one paragraph: a concordance that quotes and attributes, **and never
  interprets** — the product guarantee, stated as a term rather than only as marketing.
- Account rules: eligibility, one person per account, responsibility for credentials.
- Acceptable use, and what gets an account closed.
- **Content ownership: the reader's notes, prayers and uploads are theirs.** State the licence
  granted to operate the service, and keep it minimal — no "we may use your content to improve our
  services", which would contradict C9 in a legally binding document.
- The corpus: public domain / permissively licensed, quoted with attribution; modern translations
  are absent for licensing reasons (the same stance `S2` item 1 now states in the picker).
- Availability, and that this is a private preview: no uptime guarantee yet.
- Liability, governing law, changes to terms.
- Last-updated date.

#### `/contact`
- One reachable route — an address that a person reads.
- What to use it for: access requests, privacy, bugs, licensing questions about a work.
- Expected response time, stated honestly, including "this is a small project".
- No form required; a mailto is sufficient and avoids collecting anything.

#### Wiring, when the content exists
- A `<footer>` on the landing page linking all four (`/about` already exists) — the landing page
  currently has **zero** matches for `<footer>`, `Privacy` or `Terms`.
- Same footer on the marketing surface only; the app shell has its own chrome.

**Findings log**

> ## RECON 2026-08-08 — docs only, no code.
>
> **Verified against the tree:**
>
> | Item | Status |
> |---|---|
> | Footer with privacy, terms, contact, about | **`/privacy`, `/terms`, `/contact` do not exist as routes.** `/about` does (`app/about/page.tsx`). The landing page (`app/page.tsx`) contains **zero** matches for `<footer`, `Privacy` or `Terms`. So three of the four destinations must be *written*, not linked. |
> | One captioned screenshot of the verse panel | Not present. **Blocked on an asset only the owner can produce** — and note it must be a screenshot of the panel *as it renders*, which is itself gated on the reader page rendering correctly (see `N3c`). |
> | Expectation-setting: what membership includes, when doors open, cost | Not present. **Content, not code.** |
> | Demote `Log in` relative to `Request access` | The only genuinely agent-doable item here — a class change on the landing page. |
>
> **Sequencing consequence the block does not state:** three of its four items are *content the
> owner must supply* (privacy policy, terms, contact details, the membership/pricing sentences), and
> a legal page cannot be drafted by an agent on the owner's behalf. So `S1` is **owner-blocked in
> substance**, not merely in verification — unlike `T3`, where the work exists and only the proof is
> missing.
>
> **Exit-test skeleton:** `AGENT` `/privacy`, `/terms`, `/contact` resolve and are linked from the
> landing page · `AGENT` the landing page renders a `<footer>` · `BROWSER` a visitor can see what the
> product looks like without an account · `HUMAN` waitlist conversion measured before and after.
>
> **Do not begin `S1` by demoting the login button.** That is the one thing an agent can do, and
> doing it alone would mark motion on a block whose substance is entirely unstarted.

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
- [~] `AGENT` Every item is done, verified-already-shipped, or moved to §9 with a reason. **Nothing silently dropped** — the per-item disposition is in the Findings log. **3 of 9 closed on this branch; 4 remain BROWSER/HUMAN/DEVICE; item 4 is flagged as a would-be regression and needs an owner call.**

**Findings log**

> **PARTIAL 2026-08-08** on `fix/S2`. Per-item disposition, so nothing is silently dropped:
>
> | # | Item | Disposition |
> |---|---|---|
> | 1 | Translation explainer | **DONE `49ff923`.** One line inside the version dropdown — the list that raises the question, not a settings page nobody opens. The second assertion pins that placement. Seeded. The rendered check stays `BROWSER`. |
> | 2 | Tag contrast | **DONE.** The tradition tag carried `text-stone-500` with **no `dark:` pair**, so a light-mode value stayed on a dark card. Now `text-stone-600 dark:text-stone-300` with a matching background. Seeded and watched red. The 4.5:1 measurement itself is `AGENT`-with-a-tool and remains unticked — I did not measure it, I fixed the missing pair. |
> | 3 | Ask checkbox colour | **ALREADY SHIPPED** at `e196e4b`; now asserted so it cannot regress to browser blue. The old class was the `@tailwindcss/forms` idiom with that plugin **not installed** — inert, a dead class that looked like the fix. |
> | 4 | Single-chapter books render as links | **PARKED after the amendment.** The owner re-scoped this to a signalling fix (rows that behave differently must look different), and authorised an attempt **only if expressible as a token/CSS change with a screenshot-verifiable property**. It is not: distinguishing "opens a grid" from "navigates" needs an added affordance (a chevron or equivalent) — markup, not a token — and its property is *legible at a glance*, which only a rendered screenshot can settle. Parked for the browser pass rather than guessed at. Original analysis retained: **the prescribed element swap would be a regression. ⚑** The split is not about single-chapter books; it is about picker MODE. With `onPick` (dialog picks a chapter) everything is a `<button>`; without it (navigate) a one-chapter book is a `<Link>` because it *navigates*, while a multi-chapter book is a `<button>` because it *opens the grid*. Making the link a button would lose middle-click, open-in-new-tab and the browser's own link affordances — worse semantics for a cosmetic match. The reader's real complaint is that two rows look identical and behave differently; that is a **signalling** fix, not an element-type one. |
> | 5 | Jump-to-chapter input | **DONE.** One input filtering an array already in memory. Shown only above 24 chapters — below that the grid is one glance and the control would be noise on 44 of 66 books. Prefix filter, not equality, so typing `1` on Psalms narrows toward 1/1x/1xx rather than hiding 119. |
> | 6 | `aria-label` + tooltip on icon buttons | **PARKED — closed as a MEASUREMENT, not a fix.** Audited every `<button>` in `web/src` for an accessible name (`aria-label`/`aria-labelledby`/`title`/visible text). 11 candidates surfaced and **all 11 are false positives** — each supplies its label through a `{expression}` the scan strips (`{label}`, `{busy ? 'Working…' : heading}`). **There is no icon-only button lacking an accessible name.** The only remaining ask is a `title` tooltip, which MASTER `UX-2` records as hover-only and therefore useless on touch — the surface the complaint came from. Doing it as written is motion without benefit. The `DEVICE` screen-reader check is untouched. |
> | 7 | Work TOC titles | **OUT — filed in §9.** Item 7's own conditional resolves to "do not fake it": `work-toc.tsx` chunks one work into slices whose headings are all one title plus `(i/n)`. No per-chunk titles exist in the data. A corpus/ingestion change, not a UI one. |
> | 8 | Era accents in the verse panel | **DONE `92b1b53`.** Left border on the card wrapper, derived from `eraLabel`, palette tokens only. The load-bearing test enforces the block's REFUSAL — colour stays redundant, so the text heading and per-card author/year/tradition cannot be removed later "because the colours do that now". Contrast (>= 3:1), the rendered border and the `HUMAN` check stay unticked: measuring contrast from tokens I chose myself would be an unearned green. |
> | 9 | Reading presets | **PARKED — design judgment, per the overnight brief's skip rule.** The block's own constraints require deciding whether choosing a preset resets the stepper, and whether nudging the stepper afterwards clears the preset label — it says either answer is fine but leaving it undefined produces a control claiming *Lectio* and `2 / 5` at once. That is a decision, not an implementation. Also `BROWSER`, and coupled to `T4`: presets persist through the settings record `T4` syncs, which is itself awaiting an owner call. |
>
> **Tally after the overnight pass: 5 closed (1, 2, 3, 5, 8), 4 parked (4, 6, 7, 9), 0 silently dropped.** Item 7 is out in §9; item 6 closed as a measurement with no defect found. The block stays `~` — its own exit checks include a `DEVICE` screen-reader pass and two `BROWSER` renders.

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

**Wave:** 5 · **Severity:** P1 Product · **Depends on:** `N1`, `N4`, soft `S2`#9 · **Blocks:** `PR1b`, `PR2` · **Status:** `[x]` **BUILT, DEV-VERIFIED, AND MIGRATION 107 APPLIED TO PRODUCTION 2026-08-08 on the owner's go.**

#### Completion record — 2026-08-08

**Shipped.** Migration `107_prayers.sql` (own table, RLS, grants stated not assumed — the 106
lesson, with a self-verifying `DO $$` block that raises rather than reporting a broken migration
applied); `lib/prayers.ts`; `POST/GET /api/prayers`; `components/prayer-journal.tsx`; `/prayers`;
the **Pray action** in the study panel; and the **first-launch carry-forward** that discharges
`N4`'s migration ruling.

**Verified against the LIVE DEV DATABASE, not a mock.**

| Check | Result |
|---|---|
| Migration 107 applied to dev | `✓ ledger 107_prayers.sql` · grants `SELECT,INSERT,UPDATE,DELETE` · 1 policy |
| **RLS, two accounts, over `app_runtime`** (not owner) | B cannot read / update / delete A's prayer; A's text intact; A can edit and delete their own |
| **Carry-forward through the real data layer** | 4 prayers written to dev and read back through RLS; second run created 0; source key intact; rows cleaned up |
| Unit + invariant suites | 20 prayer tests + 5 rendered tests green; **12 seeded red-proofs watched fail**, each on its intended test only |
| Browser, 390px and 1280px | `/prayers` renders, **no horizontal overflow at either width** |

**The Pray action is an ACTION, not a fourth tab.** `commentaries`/`word`/`notes` are facets of a
verse; prayer is something the reader *does* with it. A tab would file responding-to-the-text
alongside studying it — the exact conflation this block exists to undo. It carries the verse as a
reference the prayer space pre-fills and never requires.

**The carry-forward's three constraints are enforced in code and red-proofed, not asserted.** Runs
once (marker written BEFORE the first post, so a dead tab cannot re-run what landed); best-effort
(a failing API returns 0 and the journal still opens); **does not delete its `localStorage` source
this release** — which is what makes the once-only guard's "a miss beats a duplicate" choice safe
rather than lossy. A duplicated prayer is someone's words twice with no way to tell which is real.

> ### ⚠ LOAD-BEARING COUPLING — do not "clean up" `study-sections:v1:<userId>`
>
> **The once-only guard and the surviving source key are ONE decision, not two.** Read separately,
> the leftover `localStorage` key looks like dead weight a later release should tidy away. It is
> not. It is the reason the guard is allowed to be as strict as it is.
>
> The guard writes its marker BEFORE the first post and never retries a half-run, because after a
> crash mid-loop we cannot tell which prayers landed, and a duplicate is worse than a miss —
> someone's words twice, with no way for them to tell which is real. **That trade is only
> acceptable while the source still exists**, because "a miss" then means "recoverable later",
> not "gone".
>
> **Delete the key and the same unchanged code silently becomes data loss.** No test fails, no
> type breaks, and the failure is invisible until someone notices prayers that were never carried.
> `prayer-carry-forward.test.ts` guards the module against removing its own source, but it cannot
> see a `removeItem` added anywhere else — `sidebar.tsx`, a migration script, a storage-cleanup
> helper.
>
> **Before removing that key, a reconciliation pass must exist first**: read the source, compare
> against prayers already carried, create only what is missing. Then the key can go. Not before.
> The same warning sits at the key's definition in `sidebar.tsx`, which is where someone doing the
> cleanup would actually be looking.

**A defect the browser pass found in this block's own code, and fixed:** a signed-out visitor was
shown a red *"Your prayers could not be loaded"* beside a permanent *"Loading…"* — the app
reporting its own auth state as a fault, on the page least suited to alarming anyone. `load()` now
treats 401 as a state (a sign-in invitation) and a real failure as an error, with both branches
red-proofed. **This is the argument for the browser pass being a gate:** every test was green.

**NOT RUN, and recorded as such:** a **signed-in browser walk** — local sign-in needs Neon Auth
credentials (`NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`) that are not in this working tree, so
`/api/auth/get-session` 500s locally. The signed-in states are covered by rendered jsdom tests and
by the live-dev data-layer run, which is not the same thing as a walk and is not claimed to be.

**Known gap, deliberately not decided here:** the sidebar also writes a `guest` key when signed
out, and that data is **not** carried forward. Carrying it would move one person's list into
whichever account signs in next on a shared browser. A missed carry is recoverable (the source is
still on disk); that leak is not. Owner call if it should be revisited.

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
   background from existing palette tokens, its own typography from existing CSS variables — **decoupled from `S2` item 9 by owner ruling 2026-08-08**. At most
   one prompt line, lectio-style: *"Read it again slowly. What is the text saying to you?"*
3. **Save creates a prayer entity** — distinct from notes, per the data-model rule below.
3b. **FIRST-LAUNCH CARRY-FORWARD (moved here from `N4`, owner ruling 2026-08-08).** The retired
   Channels section stored its items in **`localStorage` only** — `sidebar.tsx:111-122`, key
   `study-sections:v1:<userId>`; that file contains no `fetch`, and `/api/channels` plus the
   `channels` table exist and were never called from it. So there is nothing server-side to migrate
   and a server migration cannot reach them. On a reader's first load after this ships, read that
   key **once**, create a prayer per item in Neon persistence, and mark it done so it cannot run
   twice. **Nothing user-created is hidden or dropped** — that is the binding half of the ruling.
   `N4` is blocked on this and cannot hide Channels until it exists.
4. **The journal:** prayers listed in the repurposed sidebar PRAYER JOURNAL section (`N4`) — ordered,
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
- [ ] `BROWSER` Saving creates a prayer that appears in the PRAYER JOURNAL, survives a hard reload, reopens read-first, edits, and deletes.
- [ ] `AGENT` Prayers appear in no notes list, no passage search, and no AI retrieval corpus.
- [ ] `AGENT` **An automated test asserts the prayer module imports nothing from the AI client.** A code-review check drifts; a failing test does not. This is cheap — write it.
- [ ] `AGENT` Error-reporting scrubbing is in place for the prayer surface, verified by triggering a deliberate exception in the editor and confirming no prayer text reaches the reporting payload.
- [ ] `AGENT` Account export includes prayers; account deletion removes them — **verified against the database**, not the UI.

**Findings log**

> ## DRAFT 2026-08-08 — ⚑ **OWNER-REVIEW BEFORE EXECUTION.** Spec text only; nothing implemented.
>
> Drafted under the overnight brief. `N4` is blocked on this block, so its shape is now load-bearing
> for Wave 2 as well as Wave 5.
>
> ### What `N4` hands over, and the trap in it
>
> `N4` retires Channels and this block inherits the space. **What it does NOT inherit is
> persistence.** Measured (`R0`, re-confirmed): the Channels list lives in **`localStorage` only** —
> `sidebar.tsx:111-122`, key `study-sections:v1:<userId>`; that file contains **no `fetch` at all**;
> and `/api/channels` plus the `channels` table both exist and were **never called from it**. So
> "re-frame the existing shell" describes the markup and nothing underneath it. **`PR1a` builds its
> own persistence from zero.** Anyone estimating this block from the sidebar's appearance will be
> wrong by the whole data layer.
>
> ### Persistence — Neon, and what migration 106 taught
>
> A `prayers` table, user-scoped, RLS default-deny keyed on `app.current_user_id` like every other
> user table. Two things are not optional and both were paid for on 2026-08-07:
>
> 1. **State its GRANTs in its own migration.** `032` narrowed the schema default to SELECT+INSERT,
>    so a new table is born unable to UPDATE or DELETE itself. `039` assumed otherwise and shipped
>    two features that never worked for any user. A prayer must be editable and deletable, so the
>    migration says so explicitly.
> 2. **User ids come from Neon now** (`session.ts:21`), and `runAsUser` binds
>    `app.current_user_id` to that value. The RLS policy is only as correct as that binding — assert
>    it two-account, never infer it.
>
> ### The first-launch carry-forward (moved here from `N4` by owner ruling)
>
> Owner ruling: *"nothing user-created gets hidden or dropped."* Since the items are in each
> reader's browser, the migration can only run **in the browser, once**:
>
> - On first load after this ships, read `study-sections:v1:<userId>`; for each item, create a prayer
>   in Neon; then write a done-marker so it can never run twice.
> - **Do not delete the localStorage key** in the same release. If the migration half-fails, the
>   source is the only copy — and it is a copy nobody has a backup of. Delete it a release later,
>   once the marker has been observed set in the wild.
> - A reader who never returns keeps their items in localStorage indefinitely, which is the honest
>   outcome. **This is a best-effort migration and must be described as one** — "nothing dropped"
>   holds for anyone who comes back, and cannot hold for anyone who does not.
>
> ### C9 — ONE-WAY RETRIEVAL, the rule that makes this feature safe
>
> The prayer is the **query**, never the **corpus**. Retrieval reads *from* the library *to* the
> user's content, never the reverse. This binds three routes, and §0.5 names the two people forget:
>
> 1. **Retrieval indexing** — no prayer text in any embedding, FTS index, or search corpus. Ever.
> 2. **Error reporting** — an exception thrown inside the prayer editor must not carry prayer text
>    in breadcrumbs, state snapshots, or a serialised request body. No error SDK is installed today
>    (verified: zero analytics/error dependencies in `web/package.json`), so the requirement is
>    forward-looking: **if one is ever added, the prayer surface is scrubbed before it ships.**
> 3. **Analytics** — count and existence only. Never content, never excerpts, never length
>    distributions fine-grained enough to fingerprint.
>
> ### No AI in the prayer space, and why it is structural rather than a preference
>
> No suggestions, completions, summaries or "insights". The product's stated position is that AI is
> not the Holy Spirit; a product that says so cannot put a model in the prayer closet. **The absence
> is the feature.** It is enforced by a test that the prayer module imports nothing from the AI
> client — a code-review convention drifts, a failing import test does not.
>
> ### Exit tests — draft
>
> - `AGENT` **the prayer module's import graph contains no AI client.** Assert on the resolved
>   imports, not on a grep for "openai" — a transitive import is the way this regresses.
> - `AGENT` **no user content enters any index.** Assert the prayer write path issues no embedding
>   call and touches no FTS/vector table; and that a prayer's text appears in no search result.
> - `AGENT` a prayer is a **distinct entity**, not a note with a flag — assert `prayers` is its own
>   table and that the notes list, passage search and the Ask corpus are all unaware of it.
> - `AGENT` RLS holds two-account: account A cannot read, edit or delete B's prayer. Executed, not
>   reasoned.
> - `AGENT` the migration's GRANTs are stated and sufficient — a prayer can be edited and deleted by
>   the app role. (The `106` lesson: prove it, do not assume the default.)
> - `AGENT` the carry-forward runs **once** — running it twice creates no duplicates — and does not
>   delete its source in this release.
> - `AGENT` account export includes prayers; deletion removes them. **Verified against the
>   database.** ⚑ Coupled to `T4`: whichever ships first must write export/delete against an
>   *enumerable* set of user-owned entities so this registers into it rather than amending it.
> - `BROWSER` **Pray** from John 1:1 opens a visually distinct space with the verse pinned; saving
>   creates a prayer that survives a hard reload, reopens read-first, edits and deletes.
>
> ### Open questions for the owner, before execution
>
> 1. ~~Does `N4` wait for this, or ship a carry-forward-only release first?~~ **RULED 2026-08-08:
>    `N4` WAITS.** Channels stays visible until the journal exists; the two land together, so the
>    section changes meaning in one step and no reader sees a gap. **Cost, accepted knowingly:** the
>    fake door — the finding `N4` exists to close — stays open longer. In exchange the carry-forward
>    can never half-fail into a state where the source is hidden and the destination is empty.
> 2. ~~Sidebar label — §2 locks `PRAYERS`.~~ **RULED 2026-08-08: `PRAYER JOURNAL`.** ⚑ **This
>    amends §2's naming lock**, which is otherwise not to be re-litigated — recorded here as the
>    owner's amendment, with §2 updated to match so the two cannot drift. It names the artefact
>    rather than the contents, matching how this block describes the feature.
> 3. ~~Does a prayer belong to a verse, or stand alone?~~ **RULED 2026-08-08: a prayer STANDS ALONE,
>    with an OPTIONAL verse reference. ONE table.** So `verse_id` is nullable, the journal lists
>    prayers whether or not they carry one, and a prayer outlives the verse that prompted it. Two
>    consequences to hold on to while building: the `Pray` action from the verse panel *populates*
>    that reference rather than requiring it, and deleting or re-versioning a passage must never
>    cascade into a prayer — the reference is a pointer, not ownership.
> 4. ~~`S2` item 9's `Lectio` preset is a soft dependency…~~ **RULED 2026-08-08: DECOUPLED.**
>    `PR1a` defines its own typography from existing CSS variables and does **not** wait for item 9.
>    That removes a cross-wave dependency from the critical path — item 9 is parked on a design call
>    *and* carries a `T4` dependency for where presets persist, so blocking on it would have chained
>    `PR1a` behind two unresolved decisions. **Consequence to hold:** if item 9 later ships `Lectio`,
>    there will be two definitions of that typography and they must be reconciled deliberately, not
>    left to drift. The block's original note said "do not diverge them later without updating both"
>    — that instruction now applies in reverse.

---

### `F1-fonts` — the font stack is blocked by our own CSP

**Wave:** 5 · **Severity:** P1 Product · **Depends on:** — · **Blocks:** — · **Status:** `[x]` **BUILT 2026-08-08. `AGENT` checks pass; X3/X5 are `BROWSER`/`HUMAN` and stay unticked.**

#### Findings log — 2026-08-08

**1. My own exit test was incapable of failing, and only a seed found it.** The scan for external
font hosts stripped comments before matching (borrowed from `prayers-c9.test.ts`, where
`layout.tsx`'s header legitimately names `fonts.googleapis.com` while explaining why it must not be
used). The stripper was `/\/\/.*$/gm` — and **the `//` in `https://` is a line-comment start to
that regex**, so it deleted the URL, the exact string being hunted, before the scan ran. Seeded the
real `<link>` back into `layout.tsx`: suite stayed **green**. Fixed to `/(^|[^:])\/\/.*$/gm` and
re-seeded to red. *A comment stripper that eats URLs cannot police URLs.*

**2. Two of the five exit tests were corrected mid-block, and the correction is the finding.** The
first versions asserted `variable: '--font-display'` in `layout.tsx` and that `globals.css`
*contains* "Georgia". Both passed; both were wrong, and the pair contradicted itself. Binding
next/font straight to `--font-display` was **measured in the browser** to override the whole
`@theme` declaration — computed value became `"EB Garamond", "EB Garamond Fallback"`, Georgia gone
at runtime — while the string "Georgia" sat in the stylesheet keeping the fallback test green. **A
test that reads the stylesheet cannot see a value the cascade overrode.** Flagged here rather than
quietly rewritten, per the block rules. The fix changed: next/font owns `--font-*-face`, and
`globals.css` composes it into the chain.

**3. Measured after the fix** (observation, not a ticked check): computed `--font-display` is
`"EB Garamond", "EB Garamond Fallback", "EB Garamond", Georgia, "Times New Roman", serif` — the
self-hosted face, next/font's metric-compatible fallback, and the original chain, all three
present. `[...document.fonts]` enumerates **EB Garamond, Literata and Source Sans 3** as loaded
faces. No CSP violation in console. The control ran too: `document.fonts.check('16px "Zzz Not A
Font"')` returned **`true`**, confirming again that `check()` proves nothing and enumeration is the
only honest probe.

**X3 CLOSED 2026-08-08 by the owner**, on browser-extension verification of the deployed build:
faces enumerated (not `check()`ed), all served from `'self'`, CSSOM clean. Recorded as the owner's
verification, not the agent's — no agent ticked it.

> **Wording correction that came with the closure, and it prevents a false alarm later.** The
> stack is **EB Garamond = DISPLAY** (headings, inscriptional old-style) and **Literata = READING**
> (scripture, commentary, answers), with Source Sans 3 for UI chrome. So **a reader page loading
> ZERO EB Garamond faces is CORRECT, not a failure** — a long-form reading view legitimately has no
> display type on it. Anyone auditing this later who expects all three families on every page will
> "find" a regression that is the design working. Assert per-surface, or assert the union across
> surfaces; never assert three families on an arbitrary page.

**Still unticked:** X5 (`HUMAN`) — verify on a machine **without** these fonts installed. Every
observation so far, agent and extension alike, was taken on machines that may have them locally,
which is precisely the masking this block exists to defeat.

**Owner ruling 2026-08-08:** self-host the stack via `next/font`. **No CSP widening.** Highest
visual-impact item remaining.

**Observed**

`web/src/app/layout.tsx:58,65` loads EB Garamond, Literata and Source Sans 3 from
`https://fonts.googleapis.com/css2?...`. The production CSP header, read from
`https://ancientpaths.app/`, is:

```
style-src 'self' 'unsafe-inline'; font-src 'self' data:
```

No `fonts.googleapis.com`, no `fonts.gstatic.com`. **The stylesheet request is blocked and not one
of the three families is ever downloaded** — `[...document.fonts]` on a loaded page contains only
the Next-served Geist faces. Every reader sees the CSS fallback chain (Georgia / Times) instead of
the typography the product was designed in. On a concordance whose entire visual identity is
typographic, this is the largest single visual defect in the app.

**Why every audit so far has missed it, and why the next one would too**

> **The defect is masked on exactly the machines that would find it.** `layout.tsx` declares
> `font-family: "EB Garamond", Georgia, "Times New Roman", serif`. Designers and developers tend to
> have EB Garamond and Literata **installed locally** — they were chosen by someone who had them —
> so the browser satisfies the family from the system and the page looks correct. The CSP block is
> silent in the rendered result. It appears only in the console, among the noise, on a page nobody
> was auditing for fonts.
>
> **A plausible-looking probe agrees with the wrong answer.**
> `document.fonts.check('16px "EB Garamond"')` returns `true` here — and it returns `true` for
> `'16px "Zzz Not A Font"'` as well, because it answers "can text in this family be rendered",
> which a fallback always satisfies. **Run the control before believing the probe.**
>
> The two checks that actually settle it, for whoever audits this next:
> 1. `[...document.fonts].map(f => f.family)` — the faces genuinely loaded. Webfonts absent = blocked.
> 2. The CSP header itself, read from production with `curl -sI`, not from `next.config.ts` — the
>    shipped header is the one that matters.

**Minimal change**

`next/font/google` at build time. It downloads the faces, self-hosts them under `/_next`, and
generates the `@font-face` CSS — so everything is `'self'` and the existing CSP passes untouched.
This also removes a render-blocking third-party request from every page load and the FOUT that
comes with it.

1. `layout.tsx` — replace the `<link rel="preconnect">` / `<link rel="stylesheet">` pair with
   `next/font/google` imports for EB Garamond, Literata and Source Sans 3, binding each to the CSS
   variable the theme already uses.
2. `globals.css` — point the existing `@theme` font variables at the generated families. **The
   fallback chains stay**; self-hosting is not a reason to remove a safety net.
3. Delete nothing else. The CSP is correct as it stands and is not to be touched — that is the
   ruling.

**Do NOT**

- **Do NOT widen the CSP** to allow `fonts.googleapis.com` / `fonts.gstatic.com`. Ruled out: it
  loosens a security header for a problem that self-hosting solves outright, and puts a
  third-party request on the critical path of every page.
- Do NOT change the typefaces, sizes, weights or the `@theme` variable names. This block makes the
  chosen fonts actually load; it does not redesign anything.
- Do NOT drop the CSS fallback chains.
- Do NOT subset aggressively on a first pass — these are reading faces and the product renders
  Greek and Hebrew elsewhere.

**Exit checks**

| # | Check | Kind |
|---|---|---|
| X1 | `grep -r "fonts.googleapis.com" web/src` returns nothing | `AGENT` |
| X2 | An invariant test fails if any `fonts.googleapis.com` / `fonts.gstatic.com` URL reappears in `web/src` — **red-proofed by re-adding the link and watching it go red** | `AGENT` |
| X3 | On the deployed page, `[...document.fonts].map(f => f.family)` **contains all three families**. This is the check the old probe could not make; assert on the loaded-face list, never on `document.fonts.check()` | `BROWSER` |
| X4 | Console shows **no CSP violation** on load, and the production CSP header is **unchanged** from the value quoted above (`curl -sI`) | `BROWSER` |
| X5 | Verified on a machine **without** the three fonts installed locally, or with them disabled — otherwise the check cannot fail, which is the whole reason this defect survived | `HUMAN` |

> X5 is the point of the block. Every prior check passed on a machine where the fonts were already
> present. A verification that cannot fail is not a verification (`docs/THE_LOOP.md` §6).

### `PR1c` — Prayer-surface polish (PR1a residue)

**Wave:** 5 · **Severity:** P2 · **Depends on:** `PR1a`, `N4` · **Blocks:** — · **Status:** `[x]` **DONE 2026-08-08.** `AGENT` checks pass; no `BROWSER`/`HUMAN` check ticked.

Two defects found by the owner's post-deploy verification of `PR1a`. Both small, one branch.

**Item 1 — dead affordances rendered as live navigation.** `N4` removed the two *seeded* sidebar
sections, but readers who had already made their own — `MY SERMONS`, `BIBLE STUDIES` — still hold
them in `localStorage`, and their items still rendered as links. **Both destinations were dead:**
`/channel/[id]` redirects to `/prayers` (N4), and `/study/[id]` is a `ComingSoon` placeholder.

> **The `/study/[id]` half was NOT in the reported finding, and was fixed with it.** It is the
> other branch of the same ternary (`sidebar.tsx`, one expression), pointing at the same kind of
> placeholder this remediation exists to remove. Fixing only the reported half would have shipped
> the identical fake door one line over, and the block's own exit check would have been false.
> Recorded here rather than filed to §9 because it is the same line of code, not adjacent work.

**Resolved, not made inert.** Both now go to `/prayers`, which is TRUE rather than convenient:
`PR1a`'s carry-forward already migrated these items into the journal, so the journal genuinely
contains what the reader is clicking. The `#` channel glyph went with the retired concept.

**Item 2 — `window.confirm` in the delete path.** It froze the renderer 60+ seconds during
verification and is impassable to automation and to assistive tech. *A modal that blocks the main
thread is an outage with a button on it* — and behind this one is someone's own words.

Replaced with an in-page two-step (`Delete` → `Delete this prayer?` with `Keep` / `Delete`),
focusable, cancellable, `role="group"`, and cleared when a different prayer is opened so a pending
confirmation cannot follow the reader onto another entry. **The confirmation was replaced, not
removed** — deleting a prayer on one unguarded click would be worse than the dialog was.

**Exit tests** — 4 seeds watched red, each on its own check.

| # | Check | Kind | State |
|---|---|---|---|
| X1 | No rail item links to `/channel/[id]` | `AGENT` | pass |
| X2 | No rail item links to `/study/[id]`, which is still a placeholder — with a precondition assert so the check cannot go vacuous if that route is ever deleted | `AGENT` | pass |
| X3 | **A headless delete completes end to end without page-context patching** | `AGENT` | pass |
| X4 | `Keep` cancels without deleting | `AGENT` | pass |

> **X3 is the one that matters, and its value is in what it does NOT do.** jsdom's `window.confirm`
> returns `undefined`, so the old path fails closed there and the tempting fix is
> `vi.stubGlobal('confirm', () => true)`. **That asserts the opposite of the requirement:** it
> proves the blocking dialog is still in the path and that only a patched environment gets past it.
> The test therefore stubs *no* dialog and asserts the `DELETE` reached the API. Seeded
> `window.confirm` back in — it went red without needing to know the dialog had returned.

**Also fixed, because it was an ESLint ERROR in a file this block edits:** the signed-out sign-in
control was an `<a>` (`@next/next/no-html-link-for-pages`), introduced with `PR1a`'s signed-out
state and live on `main`. An anchor forces a full document reload on the way to sign-in. Now
`next/link`.

**No new dependency.** The headless test uses `fireEvent` rather than `@testing-library/user-event`,
which is not a dependency here — and a new one needs its justification written first.

**Observed, not ticked:** on the dev build the rendered rail contains **zero** `/channel/*` or
`/study/*` hrefs and no horizontal overflow. Observation is not the check.

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

### Filed 2026-08-08 by the owner's post-deploy extension verification

Recorded **verbatim** as filed. None investigated, none fixed — they are queue items, not findings
this session closed.

> post-deploy 503s in minute one (18/18 clean after — watch tomorrow); /home hydration blocks ~30s
> on heavy devotional page — client bundle review; /api/prayers updates are POST-to-collection not
> PATCH-on-resource — works, unusual, note for the API-style pass.

Notes on disposition only, added without altering the text above:

- **The 503s have a one-day clock on them.** "18/18 clean after" is the reassuring half; a
  cold-start burst in minute one is the ordinary explanation and it is not the only one. If they
  recur tomorrow *without* a deploy, the cause is not cold start and the item changes character.
- **`/home` at ~30s is the largest live performance defect on the board** and is a client-bundle
  question, not a retrieval one — so it is independent of the accuracy bar and can be worked
  without an eval.
- **The `/api/prayers` shape is mine** (`PR1a`): a single `POST` to the collection carrying
  `kind: 'create' | 'update' | 'delete'` rather than `PATCH`/`DELETE` on `/api/prayers/[id]`. It
  works and is tested; it is unusual, and it belongs in an API-style pass rather than a one-off
  correction, because changing it in isolation would leave this the only route shaped that way.

### Filed 2026-08-08 — RATE LIMITER RE-WIRE: **STOPPED**, cannot be done without redesign

**Instructed:** wire A1-2's persistent rate limiter into the live auth path; *"if the limiter as
built can't serve the live path without redesign, STOP, report, don't redesign unilaterally."*
**It can't. Stopping.**

**The limiter is a Better Auth plugin adapter.** `web/src/lib/auth/rate-limit-storage.ts:73`
exports `createAuthRateLimitStorage`, and its own header (`:21`, `:32`) states the contract it
implements: Better Auth's atomic `consume`, taking a `ConsumeRule` whose `window` is in seconds,
returning the `null`-not-`undefined` shape *"Better Auth's `BetterAuthRateLimitStorage` types it
that way"*. It was built to be passed as `authOptions.rateLimit.customStorage` — a plugin point
that exists **only when we run the better-auth instance ourselves**.

**We no longer do.** ADR-107/108 replaced the self-hosted instance with Neon's hosted one:

- `web/src/lib/auth/neon-auth.ts:25,31` — the entire config is `{ baseUrl, cookies: { secret } }`.
- The SDK's type is `NeonAuthConfig = NeonAuthBase & NeonAuthLoggingInput`, and its **complete**
  field set is `baseUrl`, `cookies`, `loginUrl?`, `log?`.
- **Measured across the whole SDK type surface: `rateLimit` 0 occurrences, `customStorage` 0,
  `secondaryStorage` 0.** There is no plugin point to pass it to.
- `web/src/app/api/auth/[...path]/route.ts:16,20` — GET/POST delegate to `getAuth().handler()`,
  which `fetch`es `baseUrl`. **better-auth runs on Neon's servers, not ours.** Our code is an HTTP
  proxy, and a storage adapter cannot be injected into a process we do not run.

**Current call sites of the limiter: 0** (repo-wide, excluding its own file).

**So the re-wire is not a wiring job — it is a different limiter.** Serving the live path means
rate-limiting *in front of* the proxy route rather than inside better-auth: different placement,
different keying (IP + path, since better-auth's rule model is not ours to read), different
failure semantics, and a decision about what Neon's hosted service already enforces — **which is
unknown and not observable from this repo.** That is a design, and designs are ruled on, not
improvised. `CLAUDE.md`: *"Design before code… get approval before implementing."*

**What the owner must decide:**
1. **Build a proxy-level limiter** in `route.ts` — new design, needs a written spec first.
2. **Confirm Neon's hosted rate limiting** is sufficient and **delete** `rate-limit-storage.ts` —
   bylaw 3, deletion is an allowed remedy, and a module with zero call sites is debt.
3. **Leave it orphaned** — the current state, which is the one option that should not survive a
   decision, because 7 green tests were certifying it until 2026-08-08.

**Until then A1-2 is UNMITIGATED on the live path.** That is not a regression this run introduced —
it has been true since the Neon cutover — but it was previously hidden behind a passing test suite,
and it should not be hidden again.

### Filed 2026-08-08 — DEPLOY BLOCKED by a concurrent session writing into the deploy tree

**`F1-fonts` is built, merged to `main` (`8e1de21`) and NOT DEPLOYED.** `deploy.sh`'s clean-tree
gate refused, correctly:

```
✗ DEPLOY BLOCKED — the working tree is dirty.
?? docs/FEATURE_AUDIT.md
```

`docs/FEATURE_AUDIT.md` — 114 lines, 11,457 bytes, mtime 2026-08-08 10:58, i.e. **written during
this run** — is not this session's work. It cites `Polish_Plan.md` (Desktop) Phase 0 and
`docs/MARKETING_SITE_DESIGN.md` §5, neither of which this session has touched or read, and its own
header records that the second does not exist in the working tree.

**This is `AGENTS.md`'s "one agent per working tree" hazard, live**, and the same shape as the
2026-07-12 incident that rule exists for: a session deployed a concurrent session's un-reviewed
in-flight changes to production without either intending it.

**Not worked around, and the reasoning is deliberate.** `vercel --prod` uploads `web/` alone (A6),
so a file in `docs/` physically cannot reach production — which is an argument for *bypassing* the
gate, and it is rejected. Reasoning past a safety gate on a case-by-case judgement is how the gate
stops meaning anything. The file is also not this session's to commit, stash, or delete.

**Owner action required, and it is a choice, not a fix:** identify the concurrent session and let
it commit its own work, or authorise this session to set the file aside. Until then every deploy in
this queue is blocked, `F1-fonts` included.

**What is NOT blocked:** building and merging the remaining queue items. Only the deploy step waits.

### Filed 2026-08-08 by `PR1a`'s browser pass — two findings outside this block

Both found while verifying `PR1a`, both **measured against production, not inferred**, and neither
touched — reporting a finding is not licence to fix it in an unrelated branch.

**F1 — PROMOTED 2026-08-08 to its own block, [`F1-fonts`](#f1-fonts--the-font-stack-is-blocked-by-our-own-csp). Summary retained here for the audit trail.**

**The product's entire font stack is blocked by the product's own CSP. LIVE.**
`layout.tsx:58,65` loads `https://fonts.googleapis.com/css2?...EB+Garamond...Literata...Source+Sans+3`.
The production CSP header, read from `https://ancientpaths.app/`, is `style-src 'self'
'unsafe-inline'` and `font-src 'self' data:` — no `fonts.googleapis.com`, no `fonts.gstatic.com`.
The browser reports the stylesheet request **blocked**, and `[...document.fonts]` contains only the
Next-served Geist faces: **not one of the three families is ever downloaded.** Readers see the
CSS fallbacks (Georgia / Times) unless they happen to have the fonts installed locally, which is
why this has been invisible on developer machines.

> **A check that proved nothing, recorded because the near-miss is the lesson.**
> `document.fonts.check('16px "EB Garamond"')` returned `true` and briefly read as "the font
> loaded". The control settles it: `document.fonts.check('16px "Zzz Not A Font"')` **also** returns
> `true`. The API answers "can text in this family be rendered", which a fallback always satisfies.
> The load-bearing evidence is the empty face list and the explicit block message. **Run the
> control before believing the probe.**

**RULED 2026-08-08: self-host via `next/font`. No CSP widening.** See the block.

**F2 — a stale auth gate is red at HEAD, and it now asserts the opposite of the shipped
architecture.** `web/test/invariants/better-auth-wiring.test.ts` dates from the move *to* Better
Auth and demands that `@neondatabase/auth` **not** be a dependency — but ADR-107/108 moved the app
*back* to Neon Auth, so 2 of its 8 assertions fail. Verified pre-existing: red with this branch's
changes stashed. Related dead weight from the same cutover: `src/lib/auth/better-auth.ts` is
imported by **no production code** (only by this test), and `better-auth` is still in
`web/package.json`. **Reassuring finding:** only one auth path is actually mounted —
`api/auth/[...path]/route.ts` serves Neon Auth alone, so this is dead code, not a second live
front door.

Bylaw 3 says a check that cannot be made honest should be removed rather than padded, but deleting
an auth guard written by another session is an owner-level call, so it is filed rather than taken.

> **CLOSED 2026-08-08** (owner ruling, bylaw 3) in `dc87099`; re-confirmed at HEAD 2026-08-15 on the
> owner's "fix F2" directive — the deletion is already complete and nothing remained to take down.
> `better-auth-wiring.test.ts`, `better-auth-live.test.ts`, `better-auth-schema.test.ts`,
> `auth-rate-limit-storage.test.ts`, `signup-survives-mail-outage.test.ts` and
> `src/lib/auth/better-auth.ts` are all deleted, and `better-auth` appears in neither manifest. The
> four live `AUTH_PATHS` checks inside the wiring test — which guarded a production 500 and had
> nothing to do with which auth system is mounted — were preserved in
> `web/test/invariants/auth-route-table.test.ts` and re-red-proofed there, and the Neon replacements
> (`neon-auth-wiring/config/live.test.ts`) cover the rest. The `better-auth@1.4.18` still in the
> lockfile is transitive under `@neondatabase/auth@0.4.2-beta` and was ruled on separately
> (`docs/pm/RULINGS-2026-08-11.md` §1). `src/lib/auth/rate-limit-storage.ts` survives deliberately:
> the same commit found A1-2's limiter is wired into nothing on the live path, and its fate is an
> owner call, not a side effect of this cleanup.

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

### Filed by `L2b`/`L2c` — 2026-08-08

| Item | Block | Reason |
|---|---|---|
| Collection and topic modes do not derive their own schedule | `L2b` | They inherit whatever the book mode left. Paul's letters (87 chapters) opens at the 15 slots carried over from Romans — it *fits*, so no error state, but the number is arbitrary rather than proportionate. Out of L2b's "one function, one call site". |
| **9 unpinned `toLocaleString` calls on numbers** | `L2c` | `n.toLocaleString()` renders `1.234` on a German browser and `1,234` here — the same reader-locale inconsistency as the dates, smaller blast radius. Across `word-study/page.tsx`, `work-toc.tsx` (×4 lines, 6 calls), `plan/store.ts`, `plural.ts` — six files, past §0.4's ~3-file stop condition, and `L2c`'s minimal change says "every other **date**-format call". Ratcheted at 9 by `date-locale-and-plan-title.test.ts` so a tenth goes red; it is bounded, not ignored. |
| Real locale system (beyond the `en-US` pin) | `L2c` | Already listed below — `locale.ts` is now the single constant a real system would replace. |

### Filed by the T1 baseline capture — 2026-08-08

| Item | Block | Reason |
|---|---|---|
| **Instrument drawer-open, and somewhere to count it** ⚑ **DEFERRED DELIBERATELY 2026-08-08** — owner ruling: parked here on purpose, not lost. `T1` stays `!` until it is picked up. | `T1` | `T1`'s metric ("% of new accounts opening a verse drawer in their first session") has no event, no analytics pipeline, no session grouping and no aggregation — `logEvent` is one `console.log` into Vercel runtime logs that nothing consumes. `T1` is blocked on this: its own exit checks require the metric instrumented AND a pre-change baseline, and shipping first destroys the comparison. Scope is small (one event at the drawer-open call site) but the *aggregation* half is a real decision — an analytics vendor is a dependency, and §0.5's C9 constrains what may ever be sent. |

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

## 9b. Week close-out — 2026-08-08

**`main` `3190f8d` · production `49b6d0a` · no code commits between them.** Re-measured at close,
not carried from a narrative.

This section exists because the board tracks *blocks* and the useful question at close is different:
what a reader can now do that they could not, what is deliberately parked, and where to look next.

### Shipped and live this week

| | What changed for a reader |
|---|---|
| `L2` / `L2c` / `L2b` | Reading plans **work**. `Mark as read` and `Delete plan` had never succeeded for any user — a `500` from a grant migration 039 assumed it had. Plans also stopped opening in an error state and got human-readable names and correct dates |
| `N1` / `N2` | The naming lock applied to user-visible strings; the rail stopped hiding five destinations below an unmarked scroll — without swallowing focus (WCAG 2.4.7) |
| `N4` / `PR1c` | The fake doors are shut. Channels and Study Partners are retired, `/channel/[id]` redirects rather than apologising, and no rail item points at a placeholder |
| `PR1a` | **The prayer journal** — its own table with RLS, a Pray action from any verse, and a once-only carry-forward of what readers had already made |
| `F1-fonts` | The typography actually loads. Three families were being blocked by the app's own CSP and had **never** rendered for anyone without them installed locally |
| `C5` / `F2` | Auth moved to Neon (Google + email/password), `Verify at Sign-up` is on, and the dead Better Auth system is gone |
| `S2` | 5 of 9 polish items |

### Parked, with the reason — none of it is remediation any more

| | Item | Why it waits |
|---|---|---|
| ⚑ | **Resend sender** (`T2` step 1) | Console work, owner-only. **It was the ruling's FIRST step and shipped second**: verification-on makes auth mail load-bearing for every signup while that mail leaves Neon's shared sender. Not urgent, but it is the one parked item with a live dependency under it |
| `HUMAN` | X5 fonts · signed-out `/prayers` · account-B RLS | Each needs a person with a second credential, a clean machine, or a device. **No agent may close these**, and `PR1a`'s RLS is proven on dev against the identical migration — a strong inference, not a production measurement |
| | `L1b` threshold · `N3c` hydration · `T3` · `T4` · `S1` | Slow-burn. `L1b`'s premise was **disproved** (written for ~18s/~45s; measured 104s/58s/64s) and its threshold must be re-derived before anything is built. `N3c`'s mechanism was disproved twice |
| | Rate limiter | **STOPPED, not deferred.** A1-2's limiter is a Better Auth plugin adapter and the live path is Neon's hosted instance — no plugin point exists. Re-wiring is a different limiter and needs a design. **A1-2 is unmitigated on the live auth path** |

### Where everything lives

- **Status** → §1 board. **Reasons** → this section and §9. **History** → `WORKLOG.md`, newest first.
- **Evidence** → `docs/evidence/`; deploy receipts under `deploys/`, `PR1a` under `pr1a/`.
- **Security posture** → `docs/SECURITY.md`, including the GHSA-g38m ruling and the standing note
  that its mitigation is a **Neon console toggle no test here can observe**.
- **Two rules added this week** because the gate, not the rule, was what stood between a concurrent
  session and production: one agent per working tree, in `AGENTS.md` and `CLAUDE.md`.

### The three lessons worth carrying, all of them about checks rather than code

1. **A check that cannot fail is worse than no check.** Three shipped green this week while proving
   nothing: a font scan whose comment-stripper ate the `//` in `https://`; a fallback assertion
   reading a stylesheet the cascade had overridden; and 7 tests certifying a rate limiter with zero
   call sites. **Every one was found by seeding, never by reading.**
2. **Measure the mechanism you name.** `curl -I` on `/channel/abc123` returns a 307 — from the site
   password gate, not the redirect. The control (`/prayers`, no redirect of its own) returns the
   same thing. Closing on that would have been an unearned green measuring something else.
3. **A documented fact is not a current fact.** Migration 039 broke two features by citing a
   comment `032` had invalidated; `SECURITY.md` still declared g38m closed "structurally" after
   Google SSO removed the structure. Re-read state; do not cite it forward.

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
