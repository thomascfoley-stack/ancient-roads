# Pre-deploy deep audit — `fix/L2` @ `8a08dcf`, 2026-08-07

Mandated by `CLAUDE.md` ("before ANY production deploy") and by bylaw 4 (fixer ≠ verifier — every
commit in this deploy was written by one unreviewed agent session). Five non-overlapping lenses,
one parallel batch. **No agent audited work it wrote.**

## VERDICT: DO NOT DEPLOY

Not a judgement call — **the deploy cannot succeed.** `npm ci` fails on the Vercel builder, and it
fails *after* the 558 MB upload. Production would be untouched, but the irreversible step is
reached before the defect surfaces. Two CRITICALs below, then the rest.

## The finding that reframes the rest

**The guard built to prevent exactly this failure was green.** `test/invariants/upload-root-lockfile.test.ts`
exists because A6's third deploy failure was a lockfile the remote build rejected. It passed 8/8 at
the exact tree where `npm ci` returns `EUSAGE`, because it asserts a dependency has *some* locked
version rather than a *satisfying* one. Its own comment claims it would catch this.

That is the watchlist's shape — an assertion weaker than the property it names, standing guard over
the defect it was written for — and it means the pre-deploy check most trusted here proved nothing.

---

## CRITICAL — blocks the deploy mechanically

- [ ] **1. `web/package-lock.json` is out of sync with `web/package.json`.**
      `web/package.json:20` declares `pdfjs-dist ^6.2.108`; the lockfile still pins `5.7.284` (+12
      more, the whole `@napi-rs/canvas` set). `web/vercel.json:3` installs with
      `npm ci --legacy-peer-deps`, which refuses. **Red-proofed** with the exact command on a copy
      of the shipped files: `npm error Invalid: lock file's pdfjs-dist@5.7.284 does not satisfy
      pdfjs-dist@6.2.108`.
      *Why nothing caught it:* the dependabot bump updated `web/package.json` and the root
      `pnpm-lock.yaml`; CI installs from the **root** lockfile with pnpm, so CI is structurally
      incapable of seeing this. Local `next build` uses pnpm-linked `node_modules` where 6.2.108
      *is* installed — it builds green. The two lockfiles are compared only on Vercel.
      *Fix:* the recipe is already written at `test/invariants/upload-root-lockfile.test.ts:16-18`.

- [ ] **2. `test/invariants/upload-root-lockfile.test.ts:71` checks presence, not satisfiability.**
      `direct.filter((d) => !lock.packages[...]?.version)` never compares the locked version to the
      range in `package.json`. Silent for a *changed* range — i.e. for every dependabot bump.
      *Fix:* deep-equal `lock.packages[''].dependencies` against `pkg.dependencies` (the field
      `npm ci` actually diffs). Red-proof by reverting the pdfjs range and watching it fail both
      ways.

---

## HIGH

- [ ] **3. CI is red at the merge-base, and this branch has never been through CI.**
      Run `31213192317` on `main` (`ca3fc6c`) = failure: `db-invariants` →
      `web/test/invariants/work-reader.test.ts:246`, `?after=abc` expected 400, got 429 (limiter
      answering before validation). `fix/L2` is **unpushed** — zero runs for `8a08dcf`. Branch
      protection is unavailable on this plan (`403 Upgrade to GitHub Pro`), so nothing mechanical
      stops a red commit. Unknown whether the red is flaky or real; it was not re-run.

- [ ] **4. `docs/DEPLOY_PREFLIGHT.md:251` names the wrong deployment as live, and its rollback
      target predates two applied migrations.** It labels `dpl_DwoWDhh…` / `24677ba` / 2026-07-19
      "currently promoted — serves ancientpaths.app". Actually live: `dpl_DQhv71sb…` / `b4f2a96`.
      `:312-313` then tells the owner **not** to roll back to the one that is in fact live, and to
      use `dpl_Ejzk…` (2026-07-17) — a bundle that queries the
      `idx_embeddings_vector_{legal,song_verse,sermon,theology}` indexes MASTER's A9 row records as
      **dropped in production**. Read under pressure, this points recovery at a broken target.

- [ ] **5. `docs/STATE_OF_TRUTH.md:211-219` contradicts today's production change and was not
      touched.** §2f lists migrations "039, 041, 042 applied"; **106 is absent** though it was
      applied to production today. The same section claims `/plans` "is not deployed" — it is
      (`git ls-tree -r b4f2a96` contains `web/src/app/plans/page.tsx`, and a plan was built and
      deleted through it on production this evening).

- [ ] **6. A production DDL/grant change is recorded in no ADR, no gate board, no roadmap.**
      `docs/DECISIONS.md` stops at ADR-105; `docs/pm/MASTER.md` has no row; `ROADMAP.md` matches
      nothing for `UX_REMEDIATION|INSTR|106`. `CLAUDE.md`'s working protocol requires irreversible
      calls in `DECISIONS.md`, and `UX_REMEDIATION.md:67` binds this work to updating `ROADMAP.md`
      as well as the local board.

- [ ] **7. The app's own CSP blocks its own webfonts — every page, for everyone.**
      `web/next.config.ts:39,41` sets `style-src 'self' 'unsafe-inline'` / `font-src 'self' data:`
      against a `<link>` to `fonts.googleapis.com`. Confirmed against production headers and
      reproduced locally: `document.fonts` holds none of EB Garamond, Literata or Source Sans 3;
      `h1` resolves to Georgia. Pre-existing, **not** in this diff — but this diff is a
      typography-and-contrast pass, so its visual judgements were made against a design nobody has
      ever seen. Also emits two console errors on every load.

---

## MEDIUM

- [ ] **8. `web/src/app/globals.css:285-287` + `sidebar.tsx:131,137` — the scroll mask erases the
      focus ring on fully-visible rows.** WCAG 2.4.7. Measured at 1280×720: "Hymns & Poetry"
      occupies 589-621 in a 622px scrollport — entirely inside the 32px ramp, rendered at ~3% → 0
      opacity while remaining a live link. Because it is already in view, Tab does not scroll it
      (`scrollTop` 0 before and after `focus()`), so the outline fades with it. *This shipped in
      `e196e4b` as the UX-5 fix.* A gradient painted **behind** the rows, or `padding-bottom` on the
      scrollport, avoids it.

- [ ] **9. `verse-display.tsx:253-275` — the verse handle's real hit area is 13×20 CSS px.**
      Probed at 390px with `elementFromPoint` including the `before:` pseudo-element. Below WCAG
      2.5.8 (24×24) and far below the 44px this repo's own DoD names. The comment on those lines
      defers this to "a MEASUREMENT, taken in the DoD pass" — it has now been taken and it fails.
      The new `VerseHandleHint` (`:59-73`) actively routes touch traffic onto it.

- [ ] **10. `ask-client.tsx:311-318` — retry is offered on a 401 that retrying cannot fix, and
      stacks.** Reproduced signed-out: each press re-fires, 401s, and appends another identical
      alert (`[role="alert"]` count 1 → 2). No link to `/auth/sign-in`. `:170` already discriminates
      401, so it can be suppressed for exactly this case.

- [ ] **11. No grant-parity check exists anywhere, and the suite that should have caught the outage
      was green.** `web/test/invariants/plan-tenancy.test.ts:72` asserts `setDayCompleted(...)` is
      `true` and `:40` calls `deletePlan` — both **throw** under production's ACLs. Zero hits for
      `has_table_privilege|role_table_grants|table_privileges` across `test/` and `web/test/`. CI
      runs against branch `ci-test-20260729`, whose name predates migration 032. **The next
      post-032 table fails identically with every gate green.**

- [ ] **12. `docs/SCHEMA_AS_BUILT.md` documents nothing created after migration 024** — absent:
      `bookmarks`, `library_items`, `reading_progress`, `tags`, `annotation_tags`, `plans`,
      `plan_days`, `plan_day_readings`, `verse_coverage`, `topical_entries`, four `user_*` corpus
      tables, `user_document_readings`, four `auth_*` tables, and 106. Actively false at `:225`
      (`waitlist` "keeps full DML" — revoked by `033:28`), `:278` and `:217` (RLS ❌ for
      `api_rate_limit`/`waitlist` — enabled by `032:22` and `034:42`). `AGENTS.md` names this file
      as a task entry point. **Same failure mode as 039 citing 016 forward.**

- [ ] **13. `schema_migrations` carries an unintended INSERT grant for `app_runtime`.**
      `032:61` creates the ledger *after* its own `ALTER DEFAULT PRIVILEGES … REVOKE` at `:49`, so
      it is born SELECT+INSERT; `:91` grants SELECT (additive, redundant) and nothing revokes
      INSERT. The runtime role can forge rows in the artifact built to detect skipped migrations.
      `scripts/lib/user-data-invariant.mjs:51` asserts the opposite.
      **My grant audit missed this**: it scoped to "tables created at or after 033", and the one
      excluded file is the only one that creates a table after its own narrowing.
      *Fix:* `REVOKE INSERT ON schema_migrations FROM app_runtime;`

- [ ] **14. `db/apply-migration.mjs:58` disables TLS verification on the owner connection.**
      `ssl: { rejectUnauthorized: false }` — the path 106 took to production, running arbitrary DDL
      as owner over an unauthenticated channel. Read-only census tooling does the opposite
      (`scripts/publish-flip.mjs:283` uses `rejectUnauthorized: true` + `assertStrongTls`). Same at
      `db/apply-migration-concurrent.mjs:90`. `CLAUDE.md` lists a `rejectUnauthorized` guard as a
      pre-signup gate item.

- [ ] **15. `deploy.sh:328-329`'s required-env list is stale in both directions.** It requires three
      `NEON_AUTH_*` vars with **zero code references** (auth is better-auth), and does **not**
      assert `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`. Passes today (all 18 names present in
      production, verified read-only, names only). *Failure:* rotate `BETTER_AUTH_SECRET` to empty
      → gate silent, deploy "succeeds", every login breaks. Hand-maintained expected set.

- [ ] **16. `PREDEPLOY_DB_URL` is documented nowhere on the deploy path**, and step 7 hard-stops
      without it (executed: `✗ PRE-DEPLOY GATE FAILED … PREDEPLOY_DB_URL is not set`). Absent from
      both `deploy.sh`'s own text and `DEPLOY_PREFLIGHT.md`. Fails safe; the message is clear.

- [ ] **17. Nothing would tell anyone this deploy broke.** No Sentry/OTel/error-reporting dependency;
      observability is one `console.log` line nothing is paged on. deploy.sh's post-deploy check
      compares deployment ids and **issues no HTTP request to the site** — a build that deploys
      cleanly and 500s on every request exits 0 and prints "Done!". Precedent: A7's X1 retraction,
      where production threw a hydration exception on every reader load, unnoticed.

---

## LOW — documentation defects from today's own session

Grouped because they share one cause: claims written faster than they were checked, in the tranche
whose subject is claims written faster than they were checked.

- [ ] **18. "6 commits behind HEAD" is wrong in all five places it appears** and is never the count
      of anything: `instr-2026-08-07/README.md:13`, `UX_REMEDIATION.md:506`, `:743`,
      `106-redproof.md:123`, `WORKLOG.md:33`. Measured: `b4f2a96..ef5f619` = **4**; at `771ad79` =
      7; at `18236c6` = 9; at HEAD = **12**. It is load-bearing — it is the stated reason for
      deferring `L2` step 2.
- [ ] **19. `work-toc.tsx:205-208` is stale in 5 citations** (`UX_REMEDIATION.md:393,1398,1673`;
      `WORKLOG.md:127,191`). Correct: rationale `:210-213`, render `:228`. Stale *at writing* —
      `e196e4b` shifted it +5 before any of these were written.
- [ ] **20. "All cross-references updated" (`:17`) is false** — old S2 numbers survive at `:332`,
      `:378`, `:379`, `:392`, `:395`, and `:1673` is internally contradictory (keyed "item 7",
      body says "Item 8's").
- [ ] **21. A struck item's exit test survived at `:1462`** — "shows the same skeleton treatment as
      Library pages" is old item 2's check, and satisfying it is a regression by R0's own finding.
      N3b step 2's exit line *was* struck; this one was missed.
- [ ] **22. The rewritten §2.2 greps still cannot return zero** — grep 3 returns 4 lines at HEAD,
      3 of which survive N1 and are exempt by `:271`'s own table. Worse: `$LABELS` is unquoted and
      this repo's shell is zsh, where that does not word-split — `rg` gets one bogus path and yields
      zero, *a check that passes without running*. And `rg` is not installed as a binary here.
- [ ] **23. Backlog row `:1674` contradicts the block it governs** — still "Unknown — owner input
      required" in the present tense for items the v1.4 decision struck. `:1672` says "mark done"
      for an item that was struck, not done.
- [ ] **24. `UX_REMEDIATION_PROMPTS.md` still routes scope creep to "section 8"** (`:23`, `:95-96`)
      — the exact defect R0 reported and the changelog claims fixed; only `CLAUDE.md` was corrected.
      `:114` also sends the reader to "the two end-to-end loops in section 9" (§9 is the Backlog;
      the loops are §4 and §10). `CLAUDE.snippet.md`, referenced at `:3`, exists nowhere.
- [ ] **25. `UX_REMEDIATION.md:41` front-matter still reads `status: not started`.**
- [ ] **26. `:321` — there is no `NavItem` component** (it is `SidebarLink`, `sidebar.tsx:601`), and
      `Settings` is at `:357` not `:358`. `:273` cites `contract/schema.json`, which does not exist
      — there are two byte-identical copies (`src/` and `web/src/`) and the row names neither.
- [ ] **27. `WORKLOG.md:42` was superseded four minutes later** by `470f5cb` (the grant audit),
      which wrote only to `UX_REMEDIATION.md` — a 14-table audit with no WORKLOG entry, and the
      newest WORKLOG entry now contradicts the spec.
- [ ] **28. `:486` is ticked `[x]` while its own annotation says half of it did not happen**
      ("Both failures are reproducible by a second person" — the Ask failure never reproduced).
- [ ] **29. `WORKLOG.md:214` — "20 sites in 10 files"**; 20 sites is exact, the file count is **9**.
- [ ] **30. N2 was not annotated "already shipped"** although R0 lists it among the five that were,
      and its step 2 still reads "~3 lines, no JS if always-on is acceptable" — the opposite of what
      shipped and of `WORKLOG.md:174`.

Also LOW, not from this session: **31.** `verse-display.tsx:36-46,183` — the hint injects ~110px
above the chapter after paint, shifting the reading surface on first visit to every chapter.
**32.** `ask-client.tsx:333` — every historical turn's retry button is disabled by the *global*
`busy` flag and relabels itself "Asking…". **33.** `ask-client.tsx:312-317` — the alert announces
`"…sign in to explore the paths.Ask again"`, run together. **34.** `verse-display.tsx:66-71` "Got
it" is 48×24 and `RetryButton` 83×36, both under the DoD's 44px. **35.** `parse-pdf.ts:46-77` — the
loading task is not destroyed on the failure path, which is the path the change exists for.
**36.** `work-toc.tsx:190` — "Reading" can vanish entirely when `holds` (a range test) and the
derived chunk rows disagree; contiguity is asserted in a comment and enforced nowhere.
**37.** `db/migrations/106:57-58` states no exact inverse, breaking the convention `021`, `101`,
`103` follow. **38.** `store.ts:258` orders by `plans.updated_at`, which no code path ever writes —
a dead column that reads as live. **39.** `.github/workflows/dependabot-automerge.yml:11` is
permanently inert (gates on `workflow_run.event == 'pull_request'`; `audit.yml` is `on: push`
only), so its skip-major guard never runs — the pdfjs **major** reached `main` by manual merge.

---

## COVERAGE

**Audited:** client/frontend (rendered in a real browser at 390×844 and 1280×720, measured, not
read); data layer (every migration in numeric order, RLS on every user table, grant history,
indexes, transactions); docs vs reality (every R0 claim re-checked against the tree, plus the INSTR
and L2 logs and both evidence files); ops/deploy (deploy.sh end to end, all three upload guards
executed, `next build` run, CI state and branch protection read, production env var **names** read
read-only).

**NOT AUDITED — the gap is real and it is the highest-value lens:**

> **The attack-surface agent died mid-run on an API error.** Its brief was every route and entry
> point under "assume the shared-password gate is removed", with `parse-pdf.ts` — which parses
> **untrusted user-uploaded PDFs** — as its primary target, and an instruction to adversarially
> verify `d589140`'s claimed PDF.js RCE fix. **None of that was completed.** Finding 1 is a pdfjs
> **major** version bump (5 → 6), so the security review of the single riskiest change in this
> deploy is missing. Re-run this lens before shipping.

Also not covered: any signed-in path or second account (so **nothing here says anything about RLS
in practice**); dark mode contrast, taken on trust from the diff's own comments; real iOS/WebKit —
all client measurements are Chromium, and `mask-image` and `accent-color` were not verified there;
`/library/*`, `/work/*`, `/desk`, `/home` — all need DB credentials this tree lacks; whether the
`db-invariants` red on `main` is flaky or real; Vercel dashboard build settings, which can shadow
`vercel.json`; and the live ACL state of any database — every data-layer conclusion is derived from
migration text, deliberately, since no agent held credentials.
