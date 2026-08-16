# Research History build — documented findings before fixes (2026-08-16)

Owner directive: exhaustive testing, **document every error and UX discrepancy first, fix only
after the documentation is finished.** This is that document. Two inspector agents ran against
the uncommitted build; every "proven" below means the inspector seeded the defect, watched the
guard stay green (or go red), and restored the tree byte-identical (`cmp`-verified).

## Inspector 2 — false-confidence audit of the tests + UX conformance

### HIGH

| # | Finding | Proof |
|---|---|---|
| H1 | I-1 static guard (`no HTTP write to history`) evadable by `export const POST = …` AND by re-export `export { writeHandler as POST }` — both served by Next, both green | seeded twice, 5/5 green each |
| H2 | I-2 guard (`question before teach()`) is `indexOf` over the raw file — a comment containing `appendQuestion(` above `teach()` keeps it green while the real call sits after | seeded, 5/5 green with the real defect live |
| H3 | "bounded list" assertion vacuous: user owns 1 thread, so `length ≤ 50` cannot fail; clamp deleted entirely → still green | seeded `const capped = limit`, 5/5 green |

### MEDIUM

| # | Finding |
|---|---|
| M1 | §4.5 transcript-not-cache regex: catches `content = ${q}` (control RED) but misses `content=${q}` (no space), `lower(content) =`, `content ~`, `strpos/similarity/position`, pgvector `<->`/`<#>`; and scans ONLY research.ts — a lookup added in a route is invisible |
| M2 | The owner-fallback path (DATABASE_URL owner, BYPASSRLS — where the H1/H2 belts are the ONLY enforcement) is exercised by NO test in the tree; all tenancy suites run as app_runtime where RLS masks a dropped belt. The suite's own header records this. |
| M3 | Component test covers initialThread rendering only. Untested: the live stream state machine, thread-event URL swap, saved:false notice, threadId in follow-up POST, terminal-state guard, LANE-chunk tombstone (fixture only withdraws a voice slug), the fallback branch's filter, ephemeral-state assertion. Also untested: I-5 (a throwing publishedOf 500s /ask/[id] — no try/catch at page.tsx:37), turn immutability, THREAD_MESSAGES_MAX bound. |

### LOW

| # | Finding |
|---|---|
| L1 | Chip counts unasserted — deleting the count span keeps all 6 tests green despite the test name |
| L2 | "Show all" only-while-hidden unasserted — making it unconditional stays green |
| L3 | I-1b / teacher-import inventories keyed on literals: aliased import, wrapper, dynamic import, or `'../../research'` escape the grep |

### UX deviations from the §4.7 ruling (owner's variant A)

| # | Deviation | Disposition needed |
|---|---|---|
| D1 | Fewer than 2 registers → NO Show row at all ("one register needs no filter" was my judgment call, not the ruling) | fix to match ruling literally, or owner accepts |
| D2 | `messages.sources` stores only `{sourceId, author, work}` — §4.1 specifies the full surfaced list with register label; the filter works (reads content JSON) but the stated storage contract is unmet | align code to design |
| D3 | Hiding Commentary leaves the framing paragraph describing hidden voices | fix placement/visibility |

### Environment findings (mine, from the audit runs)

| # | Finding |
|---|---|
| E1 | `DATABASE_URL` in `web/.env.local` hijacks `seedOwnerUrl()` → 12 MIG-A failures as app_runtime hits RLS on raw inserts. FIXED pre-documentation (env var renamed APP_DATABASE_URL) because it blocked the gate itself. |
| E2 | Pre-existing order-dependent env leak: a test exports `DATABASE_URL=ep-fresh-fork…` in-process; the audit env guard later reads it as the shell's. Matches 02's finding at origin/main. NOT this build's; on the books. |

## Inspector 1 — correctness + security

Verification actually run by the inspector: tsc clean, eslint clean, all 3 new test files
executed (tenancy against real dev DB as app_runtime), RLS probed live on ep-tiny-hat, chunk
size measured (n=2000: avg 1,075 chars, max 1,200).

### HIGH

| # | Finding |
|---|---|
| I1-H1 | **Fallback turns never tombstone** — `Fallback` gets no `gone` prop; a stored fallback citing a later-quarantined work re-renders its quote forever. The §4.4 "legally irreversible" case. Client `Retrieved.metadata` doesn't even carry `work`. |
| I1-H2 | **Servability checked at wrong granularity + slug-less rows fail OPEN** — check is `sources.status='published'` per work; licensing unserve is per-row `embeddings.served` (wesley/calvin pattern: rows unserved, work stays published). And chunks with no slug can never tombstone. |

### MEDIUM

| # | Finding |
|---|---|
| I1-M1 | `getThread` pairs answers positionally — a second-tab re-ask during a 60-100s in-flight ask interleaves Q1,Q2,A1,A2 → A1 renders under Q2 (misattributed), A2 dropped. `appendQuestion` discards the RETURNING id it already has. |
| I1-M2 | `LIMIT 200 ASC` keeps the OLDEST 200 — newest turns silently vanish on reload. chat.ts's audited DESC+before shape existed and was not reused. |
| I1-M3 | Tenancy suite cleanup is a proven no-op — bare `getDb()` as app_runtime without the GUC sees 0 rows; `.catch(()=>{})` hides it; every run leaks fixtures into dev. |
| I1-M4 | `GET /api/research/[id]` has zero consumers and returns raw StoredAnswer JSON with no servability — a §4.4 bypass surface for any future consumer. Bylaw 3: delete. |
| I1-M5 | I-8 (immutability) claimed by the slice, enforced by nothing — and two comments mislabel the `saved` signal as I-8, so a reader believes it covered. |
| I1-M6 | I-5 fail-closed not as designed: `publishedOf` throw → whole-page 500, not tombstones; one refactor from fail-open with nothing going red. |

### LOW

I1-L1 static I-1 regex bypass (duplicate of I2-H1) · I1-L2 thread-create is two transactions,
can orphan an empty chat · I1-L3 ~20-30KB/answer, 50-turn thread ≈ 1.2-1.5MB RSC payload —
fine now, M2 first · I1-L4 `appendQuestion` doesn't bump `updated_at`; `appendAnswer`'s UPDATE
lacks the persona belt · I1-L5 filter: no stale closure (the useCallback is inert, not wrong);
everything-hidden line shows while framing+Passages still render; Commentary count includes
tombstoned voices · I1-L6 sidebar: not n+1; expired gate cookie → JSON parse throw → honest
error line (pre-existing pattern).

### Conformance + security summary

Covered with executed checks: I-1, I-2, I-6 (strongest in the slice), I-7, §4.5, I-4 partial.
Claimed-not-covered: I-8, I-5. Correctly deferred: I-9/R2 (S0.3), S4. §4.6 deviations: full
surfaced list stored but never rendered; resume-last-thread not built; `messages.sources`
diverges from §4.1's stated contents. **DoD: this slice is Partial until the browser pass on a
rendered signed-in page** (jsdom does not substitute). Security: no SQLi (parameterized incl.
ANY()), no XSS, auth correct on all new surfaces, forged threadId traced end-to-end (no
cross-tenant write, no ownership oracle), no rate limit on new GETs (cheap indexed reads,
acceptable).

## Fix log (2026-08-16, after documentation completed)

| Finding | Fix | Proof |
|---|---|---|
| I1-H1 | `Fallback` gained `gone`; retrieval rows tombstone by sourceId | new jsdom case written against the pre-fix build, watched RED, green after |
| I1-H2 | Servability now PER ROW via the shared `resolveServability` (embeddings.served, provenance-checked, failedClosed→all withdrawn); voices tombstone via `resolveVoiceSourceId`; lane chunks by sourceId | jsdom cases; module already red-proofed by the studies slice |
| I1-M1 | `qid` stored in `StoredAnswer`; `getThread` pairs by question-message id, positional only as pre-qid fallback | tenancy fixture stores qid |
| I1-M2 | Thread read is DESC LIMIT then reverse — truncation drops the OLDEST | code + comment |
| I1-M3 | Cleanup through `runAsUser`; the bound test's 55 fixtures verified deleted | suite re-run |
| I1-M4 | `/api/research/[id]` DELETED (bylaw 3); static test asserts exactly one research route | test red on a second route |
| I1-M5 | I-8 mislabels corrected in both files; immutability logged NOT DONE in WORKLOG | grep 0 hits |
| I1-M6 | `resolveServability` fails CLOSED (empty servable set) — page renders tombstones, never 500s on resolution error, never fails open | module semantics + page comment |
| I1-L2 | `createThreadWithQuestion` — one CTE statement, cannot orphan | code |
| I1-L4 | `appendQuestion` bumps `updated_at`; both UPDATEs carry the persona belt | code |
| I2-H1 | I-1 regex → any export line naming a write verb, comments stripped | re-proved vs BOTH evasions (const + re-export), red each |
| I2-H2 | I-2 strips comments, matches the call forms | mechanism shared with I2-M1 re-proof |
| I2-H3 | Bound test seeds 55 real threads, asserts exactly 50 | executed vs dev, green; v1 vacuity documented |
| I2-M1 | Content-lookup regexes widened (no-space, lower(), ~, pgvector ops, strpos/similarity/position), scan repo-wide with anti-vacuity floor | re-proved vs `content=${q}` in a ROUTE file, red |
| I2-L1 | Chip counts asserted per chip | count-span deletion would now go red |
| I2-L2 | "Show all" only-while-hidden asserted both directions | test |
| I2-L3 | Inventories keyed on module specifier `lib/research`, not function names | test |
| D1 | Single-register suppression REMOVED — every register that returned rows gets its chip, always | jsdom case (fallback turn, one register) |
| D2 | `messages.sources` now stores the FULL surfaced list with register labels (retrieval + all four lanes) | code |
| D3 | Framing and Passages hide with Commentary | jsdom case |

**Accepted residues, named:** a composed voice whose sourceId cannot be resolved from its
retrieval rows cannot be row-checked (rare; quote-match plus unique-attribution fallback both
have to miss). I2-M2 (owner-fallback belt suite) and I-8 immutability enforcement are follow-ups,
logged NOT DONE in WORKLOG. Live-stream client behaviors (URL swap, saved-notice, threadId in
POST body) are covered by the prod E2E walk, not jsdom.
