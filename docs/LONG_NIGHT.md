# THE LONG NIGHT — 2026-07-14 → 07-15

**Anti-goal honored:** no tests generated for coverage. Every new test in this run is justified by a specific
seeded defect. **Success measure:** things believed true that are actually false. Running count at the bottom.

**Write-safety:** read-only on prod except the one authorized additive op class (`CREATE INDEX CONCURRENTLY`,
none needed this run). No corpus data mutated. Permission/DDL changes are PARKED with the exact command for the owner.

> Status: **Phase 1 complete.** Phases 2–6 below fill in as I go (pushing after each). Read the top of each
> phase for its verdict; skip to **§ NEEDS YOUR HAND** for the 10-minute actions.

---

## PHASE 1 — GROUND TRUTH: does prod agree with the docs?

Built `scripts/ground-truth.mjs` (read-only): 13 factual claims the repo makes about the running system, each
checked against production. **11 verified, 2 false, plus 2 doc-staleness findings caught alongside.**

| # | Claim | Source | Actual | ✓ |
|---|---|---|---|---|
| 1 | Teacher serves exactly 9 legal authors | routing.ts:31 | 9 | ✅ |
| 2 | Vector index is HNSW, not ivfflat | ADR-018 | hnsw present, ivfflat absent | ✅ |
| 3 | Partial legal HNSW index applied + valid (mig 012) | WORKLOG §1 | exists, indisvalid=t | ✅ |
| 4 | Partial legal FTS index exists (mig 009/011) | ROADMAP QUEUE#3 | exists | ✅ |
| **5** | **app_runtime is SELECT-only on ALL corpus tables** | ROADMAP / diagnose §9 / CLAUDE Security | **embeddings: DELETE,INSERT,SELECT,UPDATE** | ❌ |
| 6 | legalBasePool(50) returns 50 (starvation fixed) | WORKLOG §3 | 50 *(see note)* | ✅ |
| 7 | commentary_entries ~371k | ENGINEERING:18 | 371,406 | ✅ |
| 8 | commentary embeddings ~190,635 | MIGRATION_DESIGN:6 | 190,635 | ✅ |
| 9 | sources table = 2 rows (partial pilot) | MIGRATION_DESIGN:6 | 2 | ✅ |
| 10 | Barnes pilot: sections=anchors=section_embeddings | ROADMAP 07-09 | 5,510 = 5,510 = 5,510 *(was "1,300")* | ✅ |
| **11** | **Bible relational schema (translations/verses) in prod** | SCHEMA.md / ENGINEERING:18 | **no such tables — 22 static JSON dirs** | ❌ |
| 12 | App connects as app_runtime, RLS not bypassed | CLAUDE Security | app_runtime / bypass=false | ✅ |
| 13 | Gate fails closed | ROADMAP | GET / → 307 /gate · POST /api/ask → 401 | ✅ |

### Finding P1-A ★ (security / least-privilege) — the servable corpus is writable by the app role
`app_runtime` holds **INSERT, UPDATE, DELETE** on `embeddings`. That table **is** the servable corpus:
190,635 rows, **all** `user_id IS NULL` (zero user rows), so the write grant is not a user-data necessity.
Migration `010_revoke_corpus_writes.sql` revoked writes on `commentary_entries`, `sources`, `sections` — **and
missed `embeddings`**, the one table whose contents are what the teacher retrieves and quotes. The claim "the
app connects as least-privilege / the corpus is read-only to the app" is therefore **false for the most
integrity-critical table.** **CORRECTION (Phase 3, data-layer lens caught my over-claim):** I wrote "could `DELETE FROM
embeddings` and gut retrieval" — that's wrong. RLS on `embeddings` has SELECT + INSERT policies but **no
UPDATE/DELETE policy**, so under Postgres implicit-deny a `DELETE` by `app_runtime` hits **0 rows**. The real
residual risk is narrower: the INSERT policy permits `user_id IS NULL`, so a future write path could *poison*
(insert) corpus rows, not delete them. The explicit `REVOKE` is still worth doing (belt for the RLS suspenders),
but the severity is Medium, not the near-Critical I implied. See M2. **Fix PARKED for the owner (permission write).**

### Finding P1-B (docs-vs-reality) — there is no Bible database
`docs/SCHEMA.md` presents a relational Bible schema (`translations`, `verses`, `books`, `versification_map`)
and `ENGINEERING.md:18` says "content plane shipped (22 translations … in prod)." Reality: **none of those
tables exist in prod.** Bible text is served entirely from **22 static JSON directories** in
`web/public/bible/`. The count "22" is correct; the "in a prod DB" framing is not. Low severity (the product
works), but SCHEMA.md reads as as-built and isn't.

### Finding P1-C (docs-stale) — ENGINEERING.md:18 describes a system that no longer exists
It names the retrieval blocker as "**Gospels-only embedding + dead BM25**, ~4/10 true success." All three are
stale: the legal corpus spans **65 distinct books** (not 4 Gospels), the FTS legal partial index is live and
used, and the pool-starvation recall bug is fixed. This is the single most out-of-date line in the docs.

### Finding P1-D (docs-vs-doc) — observability: one doc says "shipped," another says "zero"
`ENGINEERING.md:122` lists "**Observability = zero** — no error tracking, analytics, or alerting. Blind in
production." as an open High gap. ROADMAP says observability shipped. Reality is in between and closer to
ROADMAP: `logEvent` is real and wired into `/api/ask`, `/api/ask/stream`, `rate-limit`, and `middleware` — but
it writes to **`console.log` only** (queryable in Vercel logs; **no alerting/error-tracking sink**). So
"observability = zero" is false; "fully observable" overstates it. Both docs need one honest line.

### Methodology note (a false finding I caught before shipping it)
My first `ground-truth.mjs` reported `legalBasePool(50) → 40` and I nearly logged a regression. The bug was
**mine**: a bare `SET LOCAL hnsw.ef_search=64` on an auto-commit `pg` connection is a **no-op** (SET LOCAL is
transaction-scoped; with no open transaction it does nothing), so the query ran at the default ef=40 and
returned 40. Wrapped in `BEGIN … COMMIT` it returns **50**. This is precisely the failure mode
`legalBasePool`'s `sql.transaction()` wrapper was built to prevent — and a live demonstration of why "measure,
then name the artifact" is the rail: the instrument was broken, not the system.

---

## PHASE 2 — BREAK EVERY TEST (mutation testing)

**Verdict: no theater found in the security / integrity / guarantee / sync spine.** I seeded the real bug each
guard claims to catch, ran it, and proved it goes RED — then reverted via `git checkout` (tree verified clean
after each). **8 mutations, 8 caught.**

| # | Seeded defect | Guard test | Result |
|---|---|---|---|
| MUT-1 | gate fails **open** in prod (`gate.ts` `deny503`→`allow`) | `gate-decision.test.ts` | RED ✓ |
| MUT-2 | drop `Matthew Henry` from `PUBLISHED_WHOLE_BIBLE_AUTHORS` | `published-authors.test.ts` | RED ✓ (2 tests) |
| MUT-3 | `LEGAL_CORPUS_FILTER` drift (`John Gill`→`John Gil`) | `legal-hnsw-index-sync.test.ts` | RED ✓ |
| MUT-3b | predicate drift (stray author in the FTS predicate) | `fts-legal-index-sync.test.ts` | RED ✓ |
| MUT-4 | verifier neutered (force `ok:true`) | `verifier.test.ts` | RED ✓ (23/28) |
| MUT-5 | licensing filter admits `Tyndale Study Notes` | `licensing.test.ts` (DB, behavioral) | RED ✓ |
| MUT-6 | byte-drift a covered integrity-core file | `web-core-sync.test.ts` | RED ✓ |
| MUT-7 | raise the rate-limit cap so it never trips | `rate-limit.test.ts` | RED ✓ (2 tests) |

**Verified behavioral by inspection (not mutated):** `get-messages`/`add-message` regressions capture *bound
parameter values* and assert the caller id is bound to the `user_id` predicate — they explicitly defeat the
`WHERE user_id IS NOT NULL` decoy that the owner remembers as theater (the comment documents that exact fix).
`bible-sync.test.ts` compares whole directories via `readdirSync` (can't silently miss a duplicated file, and
the completeness check confirmed every `src/`↔`web/src/` duplicate is guarded by core-sync or bible-sync).
`tenancy.test.ts` is a real two-account RLS test (creates as A, asserts B is blocked, cleans up) — I did **not**
run it because it writes user rows to prod (write-safety; it needs the test branch that's already a pending
owner action).

### The important non-finding
**The theater the owner remembers is already gone.** The licensing test no longer asserts a constant against
itself — it runs the real `legalBasePool`/`retrieveCommentary` and MUT-5 proves a forbidden author leaks it red.
The allowlist is no longer absence-only — `published-authors.test.ts` (MUT-2) fails when an *allowed* author is
dropped. Mutation testing confirms the remediation is real, not just re-worded.

### Finding P2-A (coverage gap, not theater) — one invariant guards nothing today
`verse-keys.test.ts` is `describe.**skip**` — an **honest** RED baseline (its header says so), parked until the
biblehub corpus verse-keys are repaired. But the consequence is that the **verse-key distributional-collapse
invariant is unenforced in CI right now**: the corpus could regress on verse-key quality and no test would go
red. Same shape (documented, not hidden) as the forbidden-provenance static ratchet, which `ctx.skip()`s in CI
when the gitignored corpus is absent (enforced instead at deploy time by `predeploy-gate.ts` — see
`FALSE_CONFIDENCE_AUDIT.md`). Neither is a lie; both are holes to be aware of.

### Coverage honesty
I mutation-tested **8 of 32** files — deliberately the security, integrity, product-guarantee, sync, and
rate-limit spine, where theater would be most costly. The remaining ~24 (contract/normalize/ref-parse/verse-id/
api-error/routing-orchestration/resource-textmatch/…) got **static review only**: each imports real production
code (not a mock of itself), carries a healthy assertion count, and shows none of the tautology / self-referential
/ over-mock patterns. That is weaker evidence than a mutation, and I'm naming it as such rather than claiming the
whole suite is proven.

## PHASE 3 — PARALLEL ADVERSARIAL AUDIT (9 lenses)

9 read-only agents, non-overlapping lenses, findings-only. All 9 returned. Each produced a verified-clean and a
not-covered list (honored). I verified the top finding (C1) myself before ranking it. Deduped + severity-ranked
master list; `[lens]` names the source lens.

### CRITICAL
- **C1 [domain] — 4 copyrighted Bible translations are stored full-text and served live.** `web/public/bible/{leb,litv,mkjv,lsv}/`
  (66 books, ~12MB each) are the LEB, LITV, MKJV, LSV — which `docs/ACQUISITION_MANIFEST.md:28` **explicitly lists as
  "EXCLUDE (copyrighted)".** They're wired into the served `TRANSLATIONS` picker (`web/src/lib/bible.ts:25,29,32,35`),
  `.vercelignore:19` ships the per-book files, and **no gate scans `public/bible/`** (`predeploy-gate.ts` only checks
  `commentaries/`). **I verified it live:** prod serves `/bible/leb/gen.json` (HTTP 307 → gated-but-present, identical
  to the legit `web` control) and the file is real scripture. Root cause: `ingest-scrollmapper-bibles.ts` pulled a
  superset of the PD subset the manifest authorizes. This is the exact existential risk CLAUDE.md names ("never store
  the full text of copyrighted translations"). **Scoped mitigation:** the *teacher* path is safe — `corpus.ts` hard-gates
  cited scripture to `web` only — so this is confined to the `/read` reader. Fixed in Phase 5 (code) + owner action (purge+redeploy).
- **C2 [deps] — CI's audit gate has not run since commit `0897373`; "Audit GREEN" is false.** That commit added
  `vitest` + a test script to `web/package.json` but never regenerated `pnpm-lock.yaml`. `.github/workflows/audit.yml:18`
  runs `pnpm install --frozen-lockfile` first; **I ran it — it errors `ERR_PNPM_OUTDATED_LOCKFILE`**, so every gate
  after it (typecheck/lint/knip/`pnpm audit`/tests) has been skipped in CI on `main`. It was green *locally* only because
  `node_modules` already had vitest hoisted. Fixed in Phase 5.

### HIGH
- **H1 [attack] — `/api/gate` (the whole pre-launch wall) has no rate-limit/lockout and a non-constant-time compare**
  (`api/gate/route.ts:14-22`). The shared `SITE_PASSWORD` is brute-forceable; the team rate-limits `/api/ask` but not the
  gate protecting everything. Owner action (needs a limiter + `timingSafeEqual`).
- **H2 [ai-pipeline] — `passages_grounded` is bypassable via model-self-reported anchors** (`verifier/v1.ts:104-118`).
  The verifier checks anchors are *structurally* valid verse IDs, never that they match what the cited section discusses.
  Quote Genesis 1 verbatim, tag it with a Revelation anchor, and a Revelation `passages` block passes as "grounded" — the
  exact "doctrinal verdict via verse selection" the screen was built to stop. Static-proven at the verifier level (not
  observed from the live model). This is a gap in the mission-critical screen from the 07-13 build.
- **H3 [ai-pipeline] — `passages_grounded`'s other grounding source is a search heuristic reused as an auth boundary.**
  `teach.ts:125` feeds `resolveIntent(query).inject` (documented soft-boost, false-positive-safe, whole-chapter spans) as
  a grounding authority — any query loosely matching a pericope alias licenses displaying any verse in that span.
- **H4 [domain + ai-pipeline] — the documented "V2 classifier" does not exist; free-text I1-I6 rests on 9 blunt regexes
  with ZERO I6 (fidelity-drift) patterns.** `screens.ts:7` references a classifier that isn't in the tree. "This settles
  infant baptism" / "make Chrysostom sound furious" trip nothing. The CLAUDE.md 35/35 measures these regexes against known
  bait phrasing — not resistance to paraphrase. (`quote_verbatim` still hard-protects the `quote` field; `summary`/`framing`
  do not.)
- **H5 [ops] — the deploy gate validates 1 of 5 static corpus dirs.** `predeploy-gate.ts` checks only `commentaries/`;
  `bible/`, `lexicon/`, `original/`, `concordance/` have no check — this is *why* C1 shipped unnoticed. Live proof of the
  hole: `concordance/` has 295 files while `deploy.sh`'s own comment says 13,480.
- **H6 [ops] — Vercel Git-integration, if connected, bypasses the gate entirely.** The static corpus reaches prod only via
  the local `vercel --prod` upload; a Git-triggered build from a clean clone would deploy a content-empty app that never
  runs `predeploy-gate.ts`. Unverifiable from the repo — **owner: confirm Git-triggered production deploys are disabled.**

### MEDIUM (condensed)
- **M1 [data]** `section_anchors`/`section_embeddings`: full DML grant + **RLS not enabled at all** (migration 010 missed
  them too). 5,510 rows, no runtime code touches them today → becomes High at the ADR-010 cutover.
- **M2 [data]** — corrects my Phase 1 P1-A (below): `app_runtime`'s write grant on `embeddings` is real, but RLS has no
  UPDATE/DELETE policy → implicit-deny (a `DELETE` hits 0 rows). The real residual is the **INSERT** policy, which permits
  `user_id IS NULL` → a future writer could poison the shared corpus. Fix = explicit `REVOKE` (still worth it).
- **M3 [domain]** reader/search serve biblehub/blogspot-scraped Barnes/Wesley/Calvin that the *teacher* path excludes
  (`isPublishedCommentaryEntry` ignores `sourceUrl`; teacher requires `crosswire`). ToS-scraped aggregator text, live.
- **M4 [attack]** `/api/search/commentaries`: no auth, no rate-limit, no try/catch, no `Number.isFinite`/offset cap.
- **M5 [attack]** middleware matcher excludes by unanchored prefix → a future `/gateway` or `/api/gateway` ships ungated.
- **M6 [attack+client]** `library/commentaries` renders `ts_headline` snippets via `dangerouslySetInnerHTML` unsanitized.
- **M7 [client]** no `error.tsx`/`not-found.tsx` anywhere. **M8 [deps]** `.npmrc legacy-peer-deps=true` blanket-silences
  peer conflicts. **M9 [deps+ops]** `knip` ignores `web/**` → dead `composio.ts` (holds a live `COMPOSIO_API_KEY` ref)
  invisible. **M10 [ops]** no migration-tracking table, no rollback runbook, no CI secret-scanning. **M11 [ai-pipeline]**
  `violations[].span` ships the raw fabricated model quote in the API payload (current client ignores it).

### LOW (noted, not exhaustive)
`reading` contract block is unscreened; `MUST_NOT_SERVE_AUTHORS` is only called from tests (docs, not a live guard —
enforcement is the positive allowlist, which is sound); verse taps aren't keyboard-accessible; dead `CommentaryPanel`;
no security headers/CSP; `annotations` `verseId` unvalidated; middleware comment claims `/account` is `requireUser`-guarded
but it's client-side only; non-constant-time gate compares; stale `ROADMAP:119` (says gate fails open — it fails closed)
and `SECURITY.md:228` (says password rotation pending — it's done).

### ★ THE 9th LENS — CLAIM AUDIT (conclusions wider than the evidence)
This is the lens that has cost the project nights, and it turned up the same pattern again — **including in my own work
from earlier tonight, which I'm correcting:**
- **CA1 (critical) — the pool-starvation instrument invalidates a chain of "pool doesn't matter" conclusions.**
  `PHASE_A_DIAGNOSIS.md` ("pool sweep is FLAT → pool is not the limiter") → ADR-018/ADR-019 → the 07-10 "DILUTION MEASURED"
  entry all measured pool sweeps while the *delivered* pool was capped at ~5 by the un-owned `ef_search` GUC. A flat sweep
  on a starved instrument is indistinguishable from a real one — so "pool size is architecturally irrelevant" is **not
  supported**, and every pre-07-14 topical/epistle number rode that broken instrument. (ADR-019's "don't re-embed" may
  still be right on its *other* legs; the pool-sweep leg isn't what it was sold as.)
- **CA2 (high) — "teacher serves 9, not 6 — VERIFIED" is a presence test, not a retrieval test.** It proves all 9 authors
  have a row under the filter; it does not prove a typical query's retrieval reaches the rare voices — and it was written
  the same day pool starvation (which would starve exactly those rare voices) was known.
- **CA3 (med) — my own WORKLOG "5 docs → 50 docs" framing overstates the fix.** Production `CANDIDATE_POOL=20` and is
  unchanged; `retrieve.ts` calls `legalBasePool` with the default 20, not 50. "50" is the *test harness's* probe size. The
  accuracy table was run at the real pool=20 (so those numbers stand), but the headline number misleads. **I'll fix that caption.**
- **CA4 (med) — WORKLOG cites ADR-022; main's `DECISIONS.md` stops at ADR-020.** (Corroborated by the docs lens.) ADR-021/022
  live only on the unmerged `sec-1` branch — an architectural decision cited as authority was never recorded on `main`.
- **CA5 (low) — "post-filter starvation observed months ago" is impossible; the repo is 9 days old.**
- **Properly scoped (credit where due):** CLAUDE.md's rule-of-three faithfulness bound, the n=20/25 CIs ("unmeasurable, not
  failed"), the latency n=3 attribution (defensible given the >50× magnitude), and `FALSE_CONFIDENCE_AUDIT.md`'s honesty
  about CI skips — all checked, all correctly bounded.

### What the audit VERIFIED CLEAN (so the owner knows the covered ground)
SQL injection traced end-to-end (parameterized / integer-only verse bounds); `runAsUser` RLS + explicit `WHERE user_id`
belt-and-suspenders on all user-data paths; boot-time BYPASSRLS assertion; `/api/ask` requires auth + rate-limit + 500-char
cap; `/api/eval/bait` hard-404s in prod with `timingSafeEqual`; SSRF-safe (hardcoded DeepInfra URL); the teacher's cited
scripture is hard-gated to the `web` translation (so C1 can't reach AI answers); the teacher C1 citation loop is closed
(model can't cite outside the retrieved, already-legal set); no secret is or ever was committed (full git-history scan);
gate fails closed; LLM output renders as plain JSX (no XSS on the answer surface); GHSA-g38m independently re-confirmed OPEN.

---

## PHASE 4 — RAN THE APP (dev server, every route, 390px + desktop)

Booted the real dev server; loaded routes; drove 18 real queries end-to-end; measured payloads and console/network.

**The two numbers nobody had (measured, n=18, dev server):**
- **End-to-end `/api/ask` latency: p50 24s · p90 38s · p95 44s · max 44s · min 8s.** Dev is inflated vs prod, but this
  confirms the WORKLOG §4 story: it's **compose-bound**, and it blows the "14s = broken" bar at the median. Prod is
  somewhat faster but the LLM generation floor is the same.
- **Fallback rate: 16.7% (3/18).** Consistent with the documented ~14% (wide CI at n=18). The fallbacks were the *slowest*
  answers (37s, 44s, 28s) — the failure path is the slow path, confirmed.
- **`/read/jhn/1` ships 2.08 MB** on a single chapter view: `commentaries/jhn/1.json` **1.93 MB** (prefetched unconditionally,
  even if the study panel never opens) + `bible/web/jhn.json` 115 KB (**whole book** of John, to show one chapter) + 78 KB
  original-language. Gzip mitigates on prod, but the 1.9 MB commentary prefetch is the real weight.

**Routes:** `/`, `/ask`, `/read/[book]/[chapter]`, `/library/{commentaries,word-study,notes}`, `/gate`, `/account`, `/auth`
render live. **6 are ComingSoon dead-ends** (`/settings`, `/study/[id]`, `/chat/[id]`, `/channel/[id]`, `/library/books`,
`/library/uploads`) — and the sidebar links three of them with real-looking names (`genesis-study` channel, `Romans class`
study partner, `Settings`), so a user is invited into dead pages. **No console errors** on `/`, `/ask`, or `/read`. **No
horizontal overflow at 375px** on the reader (`scrollWidth == clientWidth == 375`); mobile bottom-nav renders correctly.

**Stale user-facing copy:** `/ask` subtitle says **"Currently answering from the Gospels"** — but the legal corpus spans
65 books (Phase 1 #13). Either the copy is stale or retrieval is silently Gospel-limited; either way the user is misinformed.

---

## PHASE 5 — SELF-HEAL · _in progress_
## PHASE 6 — SUMMARY, NUMBERS, NEEDS-YOUR-HAND · _pending_

---

## § NEEDS YOUR HAND (running — ~10 min each)

- **P2-A — the verse-key invariant is unguarded in CI** (`verse-keys.test.ts` is `describe.skip`). Not urgent,
  but decide: either finish the biblehub verse-key repair and un-skip it, or accept that verse-key regressions
  won't turn CI red until then. (No action from me — it's parked-by-design and touches corpus data.)
- **P1-A — REVOKE writes on `embeddings` (least-privilege gap).** The app role can delete the corpus. One-liner,
  but confirm no code path inserts user embeddings into this table first (I found zero user rows, didn't audit
  every writer). Proposed `db/migrations/013_revoke_embeddings_writes.sql`:
  `REVOKE INSERT, UPDATE, DELETE ON embeddings FROM app_runtime;` — run against prod after you confirm. I did
  **not** apply it (permission write, outside the additive-only rail).

## § SCOREBOARD — believed true, actually false (the night's real measure)
1. **"We never store copyrighted translations."** — **false: LEB/LITV/MKJV/LSV are stored full-text AND served live**, against the project's own EXCLUDE list (C1). *The biggest one.*
2. **"CI audit is GREEN."** — **false: CI's `pnpm install --frozen-lockfile` errors before any gate runs; it's been green only locally** (C2).
3. **"The verifier stops doctrinal verdicts via verse selection."** — **partially false: `passages_grounded` accepts self-reported anchors** (H2) and leans on a soft search heuristic (H3).
4. **"V1 + V2 classifier enforce faithfulness."** — **false: V2 doesn't exist; free-text I1-I6 is 9 regexes with no I6 patterns** (H4).
5. **"Pool size doesn't affect retrieval (sweep was flat)."** — **false: measured on a pool-starved instrument that capped delivery at ~5** (CA1).
6. **"Teacher serves 9 voices — verified."** — **overstated: a presence test, not proof retrieval reaches all 9** (CA2).
7. **"The pool fix took the retriever from 5 docs to 50."** — **my own over-claim: prod pool is 20, unchanged; 50 was the test probe** (CA3).
8. "app_runtime least-privilege / corpus read-only" — **half-true: writable grant real, but RLS blocks DELETE; INSERT-poison is the residual** (P1-A→M2).
9. "Bible content is a prod DB schema (22 translations ingested)" — **false; static JSON files** (P1-B); SCHEMA.md's ~80% of tables never built (docs lens).
10. "Retrieval blocker: Gospels-only embedding + dead BM25 (~4/10)" — **false; 65 books, FTS live, pool fixed** (P1-C).
11. "Observability = zero" — **false; logEvent wired, console-only** (P1-D).
12. "ADR-022 governs the ship decision." — **false: no ADR-021/022 exists on `main`** (CA4).
