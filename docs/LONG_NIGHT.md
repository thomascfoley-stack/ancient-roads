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
integrity-critical table.** A SQL-injection or app compromise could `DELETE FROM embeddings` and silently gut
retrieval. **Fix is a one-line REVOKE (migration 013), but it's a permission write and could break a code path
that INSERTs user embeddings — PARKED for the owner with the exact command in § NEEDS YOUR HAND (verified: zero
user rows today, but I did not audit every write path).**

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

## PHASE 3 — PARALLEL ADVERSARIAL AUDIT · _pending_
## PHASE 4 — RUN THE APP · _pending_
## PHASE 5 — SELF-HEAL · _pending_
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

## § SCOREBOARD — believed true, actually false
1. "app_runtime is least-privilege / corpus read-only to the app" — **false for `embeddings`** (P1-A).
2. "Bible content is a prod DB schema (22 translations ingested)" — **false; static JSON files** (P1-B).
3. "Retrieval blocker: Gospels-only embedding + dead BM25 (~4/10)" — **false; 65 books, FTS live, pool fixed** (P1-C).
4. "Observability = zero, blind in production" — **false; logEvent wired (console-only)** (P1-D).
