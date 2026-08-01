OUTCOME: **A6 CANNOT RUN, for two independent reasons, and neither was on the board.** (1) The Vercel CLI on this machine is authenticated as `thomas-5672` with `currentTeam = team_r1x75frSIu8VcBB7nE8ozwUM` — the Composio scope. Production `web` lives under `team_TQ3BYCSyzQ3m0yatlkKmUzM0`, and every existing deployment was made by a different Vercel user (`thomascfoley@gmail.com`). `deploy.sh:84` passes no `--scope` and no project id, and no `.vercel/project.json` exists, so step 7 either hard-fails or **creates a new project in the employer's Vercel scope and uploads 558 MB of licensed corpus into it** while `ancientpaths.app` stays on `24677ba` and the script prints `Done!`. (2) `web/public/commentaries/` ships 16,469 entries by authors on this repo's own `MUST_NOT_SERVE_AUTHORS` list — 15,161 of them Tyndale Study Notes — plus 1,843 by 20th-century authors including a living one, as unauthenticated static files whose licence filter runs **in the browser, after delivery**. Seven lenses, 100+ findings. **A4 was executed correctly and its six works are genuinely clean** — but the writer that performed it can be driven unattended against production by one argv token, verified empirically below. A5 is safe to run.

# Deep audit — gates A1 through A6

> ## REMEDIATION STATUS, 2026-08-02
>
> Seven fix tranches landed on `main` (`cee437a` … `651fa19`), each red-proved, `npm run audit`
> green at the tip.
>
> **CLOSED:** C3 · C4 · C5 · M1 · M2 · M3 · M4 · M10 · M15 · M17 (record) · M19 · H1 · H2 · H8 ·
> H9 · H10 · H11 · H12 · H13 · T1 · T2 · plus three destructive writers the audit did not find,
> surfaced by enumerating the tree instead of reading files.
>
> **C1 — half closed.** `deploy.sh` now pins the project and org and refuses before uploading;
> verified refusing against the current session. The `vercel login` as the owning account is
> still yours.
>
> **C2 — gated, not resolved.** The deploy now hard-fails on 18,323 served entries by forbidden
> or in-copyright authors. Nothing was deleted: content quarantine is an owner call (AGENTS.md).
>
> **STILL OPEN:** H3 · H4 · H5 · H6 · H7 (partly) · H14 · H15 · M5–M9 · M11–M14 · M16 · M18 ·
> M20–M26 · T3–T10. H4 and H5 are the same owner question as C2.
>
> One finding in this document was **wrong and is corrected in place** — see M10.

**Filed 2026-08-02**, `main` @ `4369d37`. Seven parallel lenses, non-overlapping by construction, per `.claude/skills/deep-audit`. All seven reported.

Every CRITICAL below was re-verified by the synthesizing session against the tree or by direct execution, not accepted from an agent. Two agent CRITICALs were **downgraded** on verification and are recorded as such in §5.

---

## 1. Blocking A6 — must close before any deploy

- [ ] **C1. The Vercel CLI cannot reach the production project, and its default target is the employer's scope.**
      `deploy.sh:84`. Measured: `vercel whoami` → `thomas-5672`; `~/Library/Application Support/com.vercel.cli/config.json` `currentTeam` → `team_r1x75frSIu8VcBB7nE8ozwUM`. Production `web` = `prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR` under `team_TQ3BYCSyzQ3m0yatlkKmUzM0`, created by uid `gs6z03rWKk1EtQTeHbPk5exq` (`thomascfoley@gmail.com`). No `--scope`, no project id, no `.vercel/project.json`; zero hits repo-wide for `--scope`, `VERCEL_PROJECT_ID` or the project id in any script. On a TTY the prompt defaults to the directory name `web`, which does not collide in that scope, so it **creates** the project.
      *Fix:* `vercel login` as the owning account, `vercel link` to the project id, then make `deploy.sh` assert the resolved project id rather than trusting CLI state.

- [ ] **C2. The static corpus ships must-not-serve and in-copyright content; the licence filter is client-side.**
      `web/src/lib/bible.ts:132` applies `isPublishedCommentaryEntry` inside `fetchCommentary` — *after* Next has served the file. Measured across 1,212 files / 191,749 entries / 381 MB of text: Tyndale Study Notes **15,161** (4.35 MB), Origen of Alexandria **1,272**, Oecumenius **36** — all on `web/src/lib/legal-corpus.ts:10-19` `MUST_NOT_SERVE_AUTHORS`. Plus CS Lewis 1,102, GK Chesterton 714, Douglas Wilson 16 (living, scraped from his own site), JRR Tolkien 11. `web/public/commentaries/_manifest.json` is a public index that makes bulk collection a for-loop.
      *Current mitigation and its expiry:* `middleware.ts:57` gates these paths today; `middleware.ts:10` says "Remove the gate when SEC-1 closes."
      *Fix:* a server-side route handler over `/commentaries/*`, or a build step that emits a filtered artifact. A client-side filter cannot gate delivery.

- [ ] **C3. `--local-redproof` defeats every human gate on a production target. VERIFIED BY EXECUTION.**
      `scripts/lib/publish-flip-guard.mjs:58-63` consults `localOk` **only** inside the `isTrulyLocal` branch; a production URL skips that branch and falls through to the ordinary checks, which pass. Run against the real production host:
      ```
      assertPublishTarget(<prod url>, {allow:true, declared:'ep-odd-fog-atnykudm', localOk:true})
        -> ACCEPTED  ep-odd-fog-atnykudm.c-9.us-east-1.aws.neon.tech
      ```
      Downstream: `publish-flip.mjs:105` skips the non-TTY refusal, `:115` returns from `ownerGate()` immediately, `:126` sets `ssl:false`. One argv token turns the irreversible write into an unattended one. The flag's own comment says "Red-proof only; never set by the operator path" — nothing enforces that. Only the server-side role assert survives, and it passes for the owner URL the operator already holds.
      *Fix:* `localOk` must **require** `isTrulyLocal`, not merely permit it. One line in the guard, plus a test.

- [ ] **C4. `ssl: {rejectUnauthorized:true}` on the write path is overridden by the connection string.**
      `pg/lib/connection-parameters.js:59-60` does `Object.assign({}, config, parse(connectionString))` — the URL wins. `?sslmode=no-verify` yields `{rejectUnauthorized:false}`; `?sslmode=disable` yields no TLS. Affects `publish-flip.mjs:126` and `publish-flip-verify.mjs:68,80`. The URL is deliberately never inspected, so **no artifact records what TLS was in force during the flip.** `pg-connection-string` already warns that v3 changes `sslmode=require` semantics, which moves today's safe-by-accident case into the unsafe column with no code change.

- [ ] **C5. Three unguarded production write paths, all exposed as npm scripts.**
      `src/ingest/migrate-sections-slice.ts` — **no guard of any kind**; resolves `DATABASE_URL_UNPOOLED ?? DATABASE_URL` and runs `DELETE FROM sections WHERE source_id=$1` (`:198-200`). Exposed as `pnpm migrate:sections-slice`. Every guard lives in the optional wrapper `scripts/cutover-e4-slice-all.mjs`. This is the script that wrote all 72,863 production sections.
      `src/ingest/ingest-commentary-fts.ts:45-48` — `TRUNCATE commentary_entries` gated **only** by `NEON_BRANCH !== 'dev'`, a self-attested string; the connection string is never checked. Same shape in `ingest-sermon.ts:190` and `ingest-historian.ts:113`.
      The fix already exists and was never propagated: `src/ingest/register-writer.ts:162-165` additionally requires the URL to name a non-prod endpoint, with a comment explaining exactly why the label alone is insufficient.

---

## 2. Blocking public launch — must close before the password gate is removed

- [ ] **H1. LLM spend is bounded only by account count, and registration is open.**
      `web/src/lib/rate-limit.ts:13-14` keys on `user.id` at 10/min, 100/day. No per-IP cap, no global ceiling, no kill switch. No signup allowlist exists in `web/src`. Each accepted request is five paid calls (embed, rerank over 28×1200 chars, up to three composes at `max_tokens: 6000`) inside `maxDuration = 300`.

- [ ] **H2. The rate limiter fails OPEN, and the failure is cheap to induce.**
      `rate-limit.ts:79-83` catches everything and returns `{ok:true}`. `:41` does `rows[0]!.count`, so a zero-row return is a TypeError → fail-open. The limiter shares one Neon endpoint with the unauthenticated, unthrottled search routes below, so load on the free routes removes the spend cap on the paid one. The site-gate brute-force throttle fails open identically.

- [ ] **H3. Every new public read surface is unauthenticated, unthrottled and uncacheable.**
      `api/search/works`, `api/search/commentaries`, `api/work/[slug]`, `api/work/[slug]/sections`. No `requireUser`, no rate limit, no `Cache-Control`. `searchSections` issues two queries per request across 72,863 sections; its own header records 3,781 ms for `grace` pre-optimisation.

- [ ] **H4. `barnes-notes` is held back by one boundary and served by another.**
      A3 excluded it, A4 correctly left it `staged` — but that binds only the `sources` path. `legal-corpus.ts:41-42` lists `"Barnes' Notes"` in `PUBLISHED_WHOLE_BIBLE_AUTHORS`, which compiles into the only gate on `searchCommentaries`; that query hits `commentary_entries`, never joins `sources`, never reads `status`. Its manifest entry says `quarantine: "biblehub provenance (ADR-008 forbidden aggregator)"` and no serving code reads that field. Reachable today via `web/src/app/library/passages/page.tsx:304`.

- [ ] **H5. The forbidden-aggregator condition was deliberately removed from the serving predicate.**
      `legal-corpus.ts:52-58` records it: the predicate carried `source_url ILIKE '%crosswire%'`, that matched zero rows for Barnes/Wesley/Calvin, and the fix rebuilt it "with no URL condition" so 45,390 biblehub-sourced entries would serve. Migrations `011` and `019` then rebuilt the partial index to match. `test/invariants/fts-legal-index-sync.test.ts` passes precisely *because* both were widened together — it can detect a performance regression, never a legality one.

- [ ] **H6. Provenance is checked at publish time only; no serving path checks it.**
      `publish-flip.mjs:210-237` is a genuinely strong one-shot admission gate. Nothing re-checks afterward: `library.ts:73,93`, `catalog.ts:53,70`, `search-sections.ts:108`, `work.ts:64,77` filter on `status` alone and select no provenance column. A row ingested before a rule existed serves forever. Live example: `teacher/routing.ts:28-30` documents Augustine and Chrysostom rows carrying `historicalchristian.faith` provenance — a forbidden domain — admitted to the `/ask` pool by name.

- [ ] **H7. The provenance ratchet is satisfiable while exposure grows.**
      `scripts/predeploy-gate.ts:141-157`, baseline `static-forbidden-provenance.json` = 0. Three blind spots: it scans only `web/public/commentaries/` (never the database); its domain list is 3 entries, none matching the sources in C2; and `forbidden-provenance.mjs:37` returns `null` for `''`, so empty `sourceUrl` counts clean. Licence fails closed on unknown; **provenance fails open.** The gate printed `✓ ratchet holds` during this audit's own commits.

- [ ] **H8. A drifted second copy of the forbidden-domain list sits on the legal rail.**
      `web/test/helpers/verse-key-scan.ts:22` — `/biblehub\.com|studylight\.org/i`, two domains where the canonical list has three, omitting `historicalchristian.faith`. This regex backs the deploy gate's served-entry check at `predeploy-gate.ts:267-273`. `forbidden-provenance.mjs:10-11` says "Do not re-type it anywhere."

- [ ] **H9. `/api/search/commentaries` has no numeric validation and no error handling.**
      `route.ts:11-15` — bare `Number()` on `book`/`limit`/`offset`, no `Number.isInteger`, no try/catch in the file. `?book=abc` → `"NaN"::smallint` → 500; `?limit=2.5` → 22P02 → 500. **This is the exact defect fixed in the sibling `/api/search/works` on 2026-08-02 and never carried across** — that route's comment now reads "the sibling route has always checked Number.isInteger; this one now agrees," while the actual sibling has never checked anything.

- [ ] **H10. `offset` is unbounded on `/api/search/works`.**
      `search-sections.ts:88` — `Math.max(0, opts.offset ?? 0)`, no upper clamp, while `limit` on the line above gets `Math.min(..., MAX_LIMIT)`. `?offset=1e21` → 500. The 2026-08-02 fix validated integer-ness and not magnitude.

- [ ] **H11. `getWorkWithToc` returns an unbounded result set on a public route.**
      `web/src/lib/work.ts:94-100` — no LIMIT. `john-gill` is 28,843 rows; served by `api/work/[slug]/route.ts:9`, the reader's first call. The same file's header at `:40-45` states "NEVER an unbounded response (CLAUDE.md) … enforced HERE in the data layer so no caller can bypass it." This query is the bypass.

- [ ] **H12. No security headers at all.** `web/next.config.ts` is `{}`. No CSP with two `dangerouslySetInnerHTML` sinks live; no `frame-ancestors`/XFO, so every authenticated write UI is framable (note delete, highlight clear, sign-out); no `nosniff`; no Referrer-Policy.

- [ ] **H13. The per-IP limiter keys on a client-settable header.** `api/gate/route.ts:19-23`, `api/waitlist/route.ts:13-17` take the first hop of `x-forwarded-for`, never `x-vercel-forwarded-for`. Rotating one header defeats both the waitlist throttle and the gate brute-force throttle; header-less clients all share one `'unknown'` bucket.

- [ ] **H14. `waitlist` holds email PII with no RLS and full DML for `app_runtime`.**
      `db/migrations/014_waitlist.sql:21-27`. The migration argues the case but the accepted cost is stated as "one public, non-sensitive signup table" — it is 4 rows of email addresses on production, and the grant includes UPDATE and DELETE, not the INSERT the design needs. This repo's own derivation classifies it as a user table (`scripts/lib/user-data-invariant.mjs:73-80`). Second instance: `api_rate_limit` (`008:11-13`), 8 distinct user ids, no RLS.

- [ ] **H15. `ALTER DEFAULT PRIVILEGES` grants `app_runtime` full DML on every future table.**
      `001_sec2_least_priv_role.sql:49-50`, still in force; `010:19-21` explicitly declines to change it. Every new table in `public` is born writable by the web role, and the only protection is a human remembering a per-table REVOKE. That has already failed twice (`section_anchors`/`section_embeddings`, repaired four migrations later). No test enumerates `app_runtime`'s grants against an expected set.

---

## 3. Correctness and evidence integrity — not launch-blocking, but the record is wrong

- [ ] **M1. `STATE_OF_TRUTH.md:155` says the flip has not happened.** "Publish flip on prod | **NOT DONE** | ✅ no published row exists", plus `status='published'` **0** ✅ measured, and ":164 the published cohort … cannot be run until a flip exists." `AGENTS.md:24` instructs every agent to trust this file over any narrative. **Fix first — it is the document that causes the next mistake.**

- [ ] **M2. `PUBLISH_FLIP.md:1,7` still declares itself unexecuted.** "NOT AN AUTHORISATION, AND NOT EXECUTED" / "written, never run." This is the file the owner-level go is called against, and the same file that contains a correction block about code landing while its correction did not.

- [ ] **M3. No A4 order exists, against bylaw 1.** A2 has a filed order. A4 — the irreversible write — has none. The only record of the go is a commit message an agent wrote. ADR-042 ruling 2 requires the go to name the endpoint, the script and the occasion.

- [ ] **M4. A3's verdict evaluated one of four codified STOP rules.** `publish-flip-adjudicate.mts:136` passes `forbidden: undefined, voices: undefined, serving: undefined`; `publish-flip-census.mjs:124-135` optional-chains all three, so §2 forbidden-provenance, §3 voice floor and §4 serving-not-zero cannot fire, and the return is byte-identical to all-four-clean. The board reports "NO STOP" unqualified. **Two independent agents graded this CRITICAL and last night's verifier graded it a downgrade** (§1 *is* the A3 rule; §2–§4 belong to A5). Both readings agree the function's signature makes "not measured" and "measured clean" the same value. Open as merge condition 2 since 2026-08-02.

- [ ] **M5. "§4 diff verified" names a different §4.** `PUBLISH_FLIP.md:167-170` defines a four-row acceptance table including forbidden-provenance and voice-floor deltas. `publish-flip-verify.mjs:99-134` emits its own §1/§2/§3 — a colliding, unrelated numbering. The logs contain no provenance and no voice-floor measurement. Those are the same two legs M4 shows could not fire at adjudication: **§2 and §3 were unmeasurable on both sides of the irreversible write.**

- [ ] **M6. `--reverse` is the exact inverse of the slug list, not of the executed flip.** `publish-flip.mjs:93-94,186-189` never reads the snapshot. Any listed slug already `published` before the forward flip gets un-published by a reverse. Exact for *this* run only because `already` happened to be empty — a property of the data, not the tool.

- [ ] **M7. The rollback gate refuses in exactly the states where rollback is needed.** `publish-flip.mjs:206-246` runs the full-corpus legality gate in **both** directions, so one unrelated illegal published row makes `--reverse` roll back and exit 1. There is no second rollback path: `PUBLISH_FLIP.md:193` still reads "There is no id here because nothing has been run," forks are forbidden, and the Neon rollback branch is unprotected (M9).

- [ ] **M8. No run log for the writer.** `4369d37` adds the two verify logs, the snapshot and `MASTER.md`. The writer's stdout — including `role neondb_owner (asserted at the server)` and the target/direction header — exists only as three hand-transcribed lines in a commit message, and the transcription omits the role line. The artifacts cannot distinguish the scripted flip from a manual `psql UPDATE`, nor one flip from flip→reverse→re-flip.

- [ ] **M9. The Neon rollback branch is unprotected at both layers.** `neonctl branches get br-late-recipe-atxl68sh` → `protected: false`; repo-wide, the only files referencing `refuseProtectedBranchDelete` are the guard, its `.d.mts` and its own test — **no script calls it.** Measured 36 minutes before the flip and recorded in `RECOVERY.md`; the A4 row does not mention it. Fix is a Neon console action.

- [ ] **M10. `corpusHash` is computed, printed and never compared — and two documents say it is.** Verified: `predeploy-gate.ts:214` prints it; grep across `scripts/` finds no equality test anywhere. `DEPLOY_PREFLIGHT.md:274` checklist item 4 says "step 3 prints and checks it"; `:151-152` repeats it; `§9:344-347` says the opposite. The uncorrected copy is the line the operator ticks. A corpus whose content changed with unchanged shape — text swapped, `sourceUrl` edited in place — passes every leg.

- [ ] **M11. Every rollback instruction inverts the moment A6 completes.** `RECOVERY.md:107-119`, `DEPLOY_PREFLIGHT.md:225-231,285-287`, `STATE_OF_TRUTH.md:316-320` all say "do NOT roll back to `dpl_DwoW…` — that is the live one." Correct now; the instant Deploy A promotes, `dpl_DwoW…` becomes the correct one-step-back target and `dpl_Ejzk…` becomes two states back, predating the cutover. No document carries an as-of qualifier.

- [ ] **M12. `DEPLOYMENT.md:68-69` — "the one source of truth" — names the rollback target as live.** It says `ancientpaths.app` is served by `dpl_Ejzk…`; the API returns `dpl_DwoW…`. `:20` also asserts the project id "matches `web/.vercel/project.json`", a file that does not exist and cannot be committed.

- [ ] **M13. Production dependencies are resolved fresh at every deploy from a tree CI never tested.** `deploy.sh:75` makes `web/` the upload root; `web/` has **no lockfile**, and `web/.npmrc` sets `legacy-peer-deps=true` for Vercel's npm build. `next`, `react`, `@neondatabase/serverless` and others are floating ranges. CI runs `pnpm install --frozen-lockfile` on a *different* tree. Two deploys of one sha can ship different code.

- [ ] **M14. The local `next build` is not the artifact that ships.** `web/.vercelignore:8` excludes `.next` and `deploy.sh:84` has no `--prebuilt`, so Vercel rebuilds remotely. Step 6 green is a smoke test on a different toolchain. CI is Node 22; the Vercel project is Node 24.x.

- [ ] **M15. Nothing pages a human.** No provider, no DSN, no drain, no alert rule. `/api/health` is deliberately outside `PUBLIC_PATHS`, so no unauthenticated uptime check can reach it. Worst case is silent: `middleware.ts:36-42` returns 503 site-wide when `SITE_PASSWORD` is unset, indistinguishable from an outage.

- [ ] **M16. The clean-tree gate runs before the step that dirties the tree.** `deploy.sh:18-30` checks `git status`; `:76` `next build` rewrites the tracked `web/tsconfig.json` and `web/next-env.d.ts`; `:84` uploads that tree. The script's own invariant at `:27-28` is "what's in prod must be reproducible from git."

- [ ] **M17. Nothing verifies the target project's environment, and `deploy.sh` records nothing.** No `vercel env ls`, no assertion, no post-deploy probe; production needs seven variables and a deploy into a newly created project (C1) has none, so it 503s on everything while printing `Done!`. The script ends with `echo "Done!"` — no deployment id, no sha, no `corpusHash` written to evidence.

- [ ] **M18. No migration ledger exists.** `.cutover-checkpoint.json` is a client-side file covering only the cutover-era subset, and its ordering shows migrations were applied out of numeric sequence (016,017,020…,then 018,019,then 024). No detection of a skipped, out-of-order or doubly-applied migration. Already open as `docs/REMEDIATION_CHECKLIST.md:74` (M9).

- [ ] **M19. `db/migrate.mjs` is an unguarded DDL runner that exits 0 on error.** No endpoint check, no override env; errors are caught per statement, printed as `x`, and the process exits 0. Against a post-031 database `CREATE OR REPLACE FUNCTION hybrid_search` **succeeds** and reverts migration 004. Harmless only because `hybrid_search` currently has no callers.

- [ ] **M20. The catalog page runs a per-source `count(DISTINCT …)` that went from 0 to ~71,563 tuples 40 minutes ago.** `web/src/lib/catalog.ts:48-59`, server-rendered per visitor, uncached. Before the flip the outer `WHERE status='published'` matched zero rows and the SubPlan never ran. No partial index on `sections` restricted to published sources exists, unlike `commentary_entries` which got one across three migrations.

- [ ] **M21. Re-ingest of a published work will fail once any annotation exists.** Section FKs (`notes.section_id`, `highlights.section_id`, `bookmarks.section_id`) are unindexed and carry no `ON DELETE` action, while the three re-ingest paths do `DELETE FROM sections WHERE source_id=$1`. ADR-027's drift design assumes sections get replaced; the FK forbids it. No cleanup path exists.

- [ ] **M22. The two ingest "refuse to overwrite a published work" guards are TOCTOU.** `ingest-sermon.ts:198-202`, `ingest-historian.ts:142-146` — the status SELECT runs before `BEGIN`; the destructive DELETE runs in the transaction that follows. Six works became publishable 40 minutes ago, which is when this window starts mattering.

- [ ] **M23. The flip's legality gate runs at READ COMMITTED with no locking.** `publish-flip.mjs:151` is a bare `BEGIN`; no isolation statement exists anywhere in the repo. The gate asks "is the published corpus legal" over a non-serializable snapshot, and `barnes-notes` is unlocked for the whole transaction. Under REPEATABLE READ the delta check would instead become one that *cannot fail* — and the level actually in force on 2026-08-01 is unrecorded and now unrecoverable.

- [ ] **M24. A6's stated blocker is measurably false.** `DEPLOY_PREFLIGHT.md §9` and the `MASTER.md` A6 row say the corpus is in a clone 29 commits behind that cannot build and lacks `served-assets.mjs`. Measured in that exact clone: on `main` at `4369d37`, `served-assets.mjs` present, all six served dirs matching the recorded census exactly. The two-clone problem is closed; the board cites it as a blocker for its own irreversible gate.

- [ ] **M25. Board staleness.** `MASTER.md:6-7` header 36 commits stale, still naming the working branch; `:38` marks A2 "(unmerged)" when it merged at `1f4bf8d`; `:41` A5 carries no ⚑ although it is a production connection; `:67` "348 today" is 353. `MASTER.md:37` is cited for the A3 rule by seven documents; A3 moved to `:39`.

- [ ] **M26. `supabase/migrations/0001_init.sql` — a 486-line alternate schema still advertised as executable** by `docs/SCHEMA.md:8`, with `supabase/config.toml` migrations enabled. Delete it or delete the pointer.

---

## 3b. The gates that report green without proving anything

Lens 7. Findings marked **PROVEN** were demonstrated by construction in a scratch copy, not asserted.

- [ ] **T1. CRITICAL — a provider outage turns the content↔vector pairing invariant into a PASS, not a skip.**
      `web/test/invariants/section-vector-pairing.test.ts:127` and `:146` both `return` out of the test body on provider unavailability. **Vitest reports a `return` as `passed`.** The doctrine it was written to serve says otherwise — `web/test/helpers/loud-skip.ts:31`: *"LOUD SKIP, never a failure and never a pass."* Its sibling `web/test/invariants/licensing.test.ts:185` does it correctly with `ctx.skip()`.
      Both CI receipts are structurally blind: `ci-skip-ceiling.mjs:44-48` counts a file only when `pending === total`, and this file has exactly one test; `ci-db-invariants-receipt.mjs:47-50` fails only when `executed === 0`. A single DeepInfra 429 — which has already happened once, at `ca53457` — converts the only check standing between the corpus and content↔vector mispairing into `executed=N passed=N failed=0`.
      *Fix:* `ctx.skip()`, one line. *Red-proof:* stub `embedQuery` to throw 429, assert the result is `skipped` and that the ceiling script now counts the file.

- [ ] **T2. HIGH — `scripts/` is in no tsconfig, and the compiler already knows about M4.** VERIFIED.
      `tsconfig.json` includes `src/**/*.ts` and `test/**/*.ts`. `tsconfig.cutover.json` includes exactly four files. So **43 `scripts/*.mjs` plus 7 `.mts`/`.ts` files are never typechecked**, including `publish-flip.mjs`, `publish-flip-verify.mjs`, `cutover.mjs` and `predeploy-gate.ts`. Compiled directly, `publish-flip-adjudicate.mts` errors at exactly:
      ```
      136:44  TS2322 Type 'undefined' is not assignable to type 'ForbiddenExposure'
      136:66  TS2322 Type 'undefined' is not assignable to type 'VoiceFloor'
      136:85  TS2322 Type 'undefined' is not assignable to type 'Serving'
      ```
      **The type system has known about the one-leg A3 verdict all along.** Nothing ever compiled the file. `tsconfig.cutover.json:9-13`'s stated reason for the narrow scope names an implicit `any` in `predeploy-gate.ts` that no longer exists.
      Second-order: the 13 `scripts/lib/*.d.mts` files are hand-written and nothing checks them against their `.mjs`. Tests typecheck against a declaration while running the implementation, so signature drift is green in `tsc` and only surfaces at runtime.

- [ ] **T3. HIGH — the predeploy-gate test passes with every real call deleted. PROVEN.**
      `test/corpus-manifest.test.ts:258-267` — six raw greps over `predeploy-gate.ts` with no comment stripping. Removing every call site (`evaluateCorpusRatchet(`, `verseKeyOffenders(`, `forbiddenServedEntries(`, the import, both message strings) and adding one explanatory comment naming them leaves **all six assertions passing.** `codeOnly()` exists in this repo for exactly this and two sibling tests use it; this one does not.

- [ ] **T4. HIGH — "refuses production outright" passes with the production refusal deleted. PROVEN.**
      `test/publish-flip-census.test.ts:162-165` asserts only that `isProdHost(url)` and `REFUSING` appear *somewhere* in the file. Changing the guard to `if (false) {` and rewording the message leaves both assertions green.

- [ ] **T5. HIGH — the "retrieval contract" tests exercise a module the product does not import.**
      Nothing in `src/`, `web/src/` or `scripts/` imports `src/retrieval/*`; knip does not flag it because `knip.json:3` lists the test files as entry points, so the tests keep the dead module alive. The headline assertion is a tautology: `src/retrieval/retrieve.ts:21` does no ranking at all, while the fake store sorts descending — so `test/retrieval.contract.test.ts:41-43` checks the fake's own sort against itself sorted. The shipped path is `web/src/lib/teacher/{retrieve,routing}.ts`.

- [ ] **T6. MEDIUM — `npm run audit` is green with 77 web tests not run, and says nothing about it.**
      `scripts/audit.sh` never calls `ci-skip-ceiling.mjs` or `ci-db-invariants-receipt.mjs`. Measured under CI-audit-job conditions the web suite is **265 passed / 77 skipped across 16 files.** What is therefore unchecked in the `audit` job: RLS/tenancy isolation, the licensing read-path invariant, the published/staged library boundary, the register wall, search-section dedup and capping, content↔vector pairing, the annotation schema constraints, and the unit-ordinal red-proofs. Those get a real run only in `db-invariants`.

- [ ] **T7. MEDIUM — `codeOnly()` leaks, and in one scanner it leaks fail-OPEN.**
      `scripts/lib/source-scan.mjs:26-30` strips whole-line comment prefixes only; a block-comment body without a leading `*`, and any trailing `// …`, survive. Two consumers fail closed on a leak, which is fine. `scripts/lib/gate-leg-inventory.mjs:41` fails **open**: delete a real `pass('G6 …')` call, leave a trailing comment mentioning it, and the declaration test stays green while the gate no longer runs G6.

- [ ] **T8. MEDIUM — coverage is measured on the wrong tree.** `vitest.config.ts:16` instruments `src/**` only; `web/src/**` — the entire shipped product — is never measured, while `scripts/audit.sh:57-67` prints the gap report from that same restricted summary. Total 16.07% statements, **64 files at zero**, including `src/ingest/check-licenses.ts`, which `audit.sh:44` runs as *"Gate B license (fail-closed)"* — nothing proves it fails closed.

- [ ] **T9. MEDIUM — the ownership-check regex spans the whole file. PROVEN.**
      `web/test/regression/add-message-rejects-foreign-channel.test.ts:36-40` uses `[\s\S]*` between `INSERT INTO messages` and `WHERE EXISTS`, so an unguarded insert plus an unrelated `WHERE EXISTS` elsewhere in the file satisfies it. The behavioural half mocks `runAsUser` to return `[]`, proving "throws on zero rows", not "rejects a foreign channel."

- [ ] **T10. MEDIUM — two `teach-budget` assertions cannot fail. PROVEN.** `web/test/teach-budget.test.ts:20` compares `ASK_MAX_DURATION_SEC * 1000` against a constant *defined* as that expression; `:28-29` is the algebraic identity `R + N·⌊(C−R)/N⌋ ≤ C`, brute-forced over 150,000 ceilings with no counterexample; `:49-50` states the same thing twice.

---

## 4. Coverage

**Audited.** Gate-board claims A1–A6 against tree/git/evidence · the A4 execution and the full flip toolchain · schema, all 30 migrations in order, grants, RLS, indexes, transactions · every code path that can surface corpus content · deploy mechanism, Vercel state (read-only API), env, rollback, observability · all 17 API route handlers and every server-rendered page taking input, adversarially with the password gate assumed absent · the test suite and both CI jobs.

**Not audited.** Neon Auth internals (`@neondatabase/auth` 0.4.2-beta session issuance, cookie SameSite — relevant to the CSRF finding). Dependency CVEs. The verifier's strength under adversarially steered model output. The AI-contract suites (`verifier`, `teacher`, `ref-parse`, `passages-*`, `resource-textmatch*`) — a large surface deserving its own pass. A8.

**Not measurable read-only, and it matters.** No agent connected to a database. Every production claim is read from committed artifacts, the newest of which (A2) predates the flip by ~15 hours. Four findings would be settled by one read-only `app_runtime` session over `pg_class.relrowsecurity`, `pg_policies` and `information_schema.role_table_grants` — the natural companion to the A5 instrument run. No query plan was measured; M20 and H11 are predicted from index definitions and row counts, not observed.

---

## 5. Two agent CRITICALs that did not survive verification

Recorded because an audit that only reports confirmations is not measuring its own instrument.

1. **"`npm run audit` was not green at the flipped sha."** Graded CRITICAL by lens 1 on the basis that the newest *committed* CI evidence is at `1f4bf8d` with four commits after it. The live API says otherwise: the `audit` workflow ran at `664afe8` — the exact sha the flip executed at — starting 20:28:00Z and finishing **20:30:48Z, success, both jobs**, 1m43s before the flip at 20:32:31Z. The precondition was met. What is missing is the committed evidence file. **Downgraded to MEDIUM bookkeeping.** The agent disclosed this blind spot in its own "not covered"; the grade did not reflect it.
   The related point does survive: `664afe8` modified `publish-flip-verify.mjs` and `neon-connection.mjs` — the verification toolchain — five minutes before the flip used it.

2. **A3's one-leg verdict** (M4) is carried at MEDIUM here rather than the CRITICAL two lenses assigned, because last night's independent verifier reached the opposite conclusion on the same facts and neither reading has been adjudicated. The disagreement is recorded rather than resolved.

---

## 6. What is genuinely sound

Stated because a checklist of 40 defects is not a verdict on the whole system.

- **A4's six works are clean.** All carry `license: "Public Domain"` with helloao (CC PD Mark 1.0) or CrossWire provenance, real edition and year strings, no forbidden domain. The flip's in-transaction gate is the strongest thing in the repo: it imports both canonical predicates rather than re-typing them, runs after the UPDATE and before COMMIT over the **whole** published set, extends to `sections.source_url`, and refuses rather than skips on a missing column.
- **Migration 010's revoke holds end to end**, traced through all 30 migrations and confirmed against the server: `sources` and `sections` are SELECT-only for `app_runtime`; `INSERT/UPDATE/DELETE` all `no`. The A4 write genuinely required `neondb_owner`.
- **SQL injection is clean everywhere**, including the raw-string SQL in `routing.ts` — every spliced value is a module constant or an integer bounded by `\d{1,3}` and `validate()`.
- **IDOR on writes is clean** — `INSERT…SELECT…WHERE EXISTS` for ownership, plus an explicit `user_id` belt over RLS at 21 call sites.
- **The snippet XSS sink is properly escaped**; `desk.ts` allowlists kinds, regexes slugs, bounds chapters and hard-caps panes; the `?sub=` prototype-chain fix is correct and complete.
- **The `undefined`-host fix at `664afe8` works** — both logs carry the fully-qualified endpoint and the verifier now refuses to write a log it cannot attribute.
- **A2's arithmetic reconciles end to end** and its read-only rails are provable from the artifacts: all three connections asserted `transaction_read_only=on` and `current_user=app_runtime` at the server.
- **Bible translation licence purge is real and complete** — the one licence gate wired end to end works; `litv`, `mkjv`, `jubilee`, `leb` are absent from disk.
- **`apply-migration-concurrent.mjs` is genuinely good** — pre-drops INVALID leftovers, post-asserts `indisvalid AND indisready`.

---

## 7. Recommended order

1. **M1, M2, T1** — three one-line fixes, first. Two are actively misleading documents; the third is a `return` that should be `ctx.skip()` and is currently laundering a provider outage into a green.
2. **C3, C4** — guard fixes with tests; small, and they close an unattended path to the irreversible write.
3. **T2** — widen `tsconfig.cutover.json` to `scripts/**/*.mts` + `predeploy-gate.ts` and fix the three errors. This retires M4 as a type error rather than a debate, and puts 50 files under a compiler for the first time.
4. **C1** — `vercel login` / `vercel link`, then pin the project id in `deploy.sh`.
5. **C2, H4, H5, H6, H7, H8** — the licensing tranche. This is the largest piece of work and it gates the public launch, not A6 alone.
6. **C5, M19** — put the existing `register-writer` guard on the four unguarded writers.
7. **A5 may run at any time.** It is read-only and none of the above bears on it.

**A6 must not run until C1 and C2 are closed.**

---

## 8. The shape this audit keeps finding

Three of this repo's standing watchlist entries account for most of what is above, and one new one earns its place.

**"A hand-maintained set that nothing enforces"** — H8 (the drifted forbidden-domain regex on the legal rail), H15 (default privileges, no grant test), M18 (no migration ledger), T6 (the hand-maintained CI-claims list), and the `MUST_NOT_SERVE_AUTHORS` list itself, which nothing applies server-side (C2).

**"A verdict computed separately from the report of that verdict"** — M4/T2 (a green from a function given nothing to judge, which the compiler could have caught), M5 (a §4 that names a different §4), T1 (a pass that means "not measured"), T3 and T4 (greps that survive the deletion of what they check).

**"A correction that does not reach the headline"** — M1, M2, M11, M12: the flip happened and the three documents a responder actually opens still describe the world before it.

**New, and earned here: "a fix applied where the author was looking, and nowhere else."** H9 is the clearest case — the numeric-validation fix landed on `/api/search/works` on 2026-08-02, its commit message asserts the sibling route already had the check, and the actual sibling has never had it. C5 is the same shape at the infrastructure layer: `register-writer.ts:162-165` carries the correct URL-plus-label guard with a comment explaining why the label alone is insufficient, and four other destructive writers still have label-only. H10 is the shape within a single fix: integer-ness validated, magnitude not.

This entry is worth adding to `docs/THE_LOOP.md` because it is invisible to every check the repo currently runs. A test written beside a fix passes; the unfixed sibling has no test to fail. Only enumeration finds it — "every route that parses a number", "every script that deletes rows" — which is the discipline lens 4 was briefed with and which produced the licensing findings.
