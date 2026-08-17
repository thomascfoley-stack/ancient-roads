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

## Exhaustive pass (task #31, post-deploy)

**48 feature tests total** after the pass: 14 store edge cases (E1–E14, executed against dev),
12 live-stream client cases (L1–L12, the layer inspector 2's M3 named untested — URL swap,
saved signal, threadId in the follow-up body, terminal-state guard, ephemeral filter,
malformed-NDJSON resilience), 6 tenancy, 10 filter/tombstone, 5 static, 1 scoped sidebar case.
All green. Prod smoke: `/` 200, `/ask` 307→gate, `/api/research` behind the gate as designed.

**Discrepancies found by the pass, documented before fixing:**

| # | Behavior observed | Disposition |
|---|---|---|
| X1 | An answer whose `qid` misses every question falls back POSITIONALLY and can attach to an unanswered turn it does not belong to (E4 recorded it). | FIXED after documenting: fallback now fires only when qid is ABSENT (legacy rows); E4 tightened to assert it and goes red on revert |
| X2 | An archived thread disappears from the list but stays readable at its URL (E11). Archive-hides-from-list, URL-still-works matches how chats behave elsewhere. | ACCEPT, recorded |

**Accepted residues, named:** a composed voice whose sourceId cannot be resolved from its
retrieval rows cannot be row-checked (rare; quote-match plus unique-attribution fallback both
have to miss). I2-M2 (owner-fallback belt suite) and I-8 immutability enforcement are follow-ups,
logged NOT DONE in WORKLOG. Live-stream client behaviors (URL swap, saved-notice, threadId in
POST body) are covered by the prod E2E walk, not jsdom.

## Production battery (post-deploy, 2026-08-16 ~23:30Z)

Live target: `82403f1` on `dpl_GjeCYSXNFor4k3QLkNk1nwPoaGrX`, alias verified by the deploy
script's id match.

- **Route battery, 15 surfaces:** public marketing (`/`, `/why`, `/features`, `/gate`) 200;
  every app surface (`/ask`, `/read`, `/library`, `/api/research`, `/api/ask/stream`,
  `/auth/sign-in`, `/prayers`, `/studies`, `/desk`, `/settings`) 307 → gate. Exactly the
  gated design; no 4xx/5xx anywhere.
- **Gate wrong-password path driven in a real browser:** garbage value submitted → "That
  wasn't it. Try again.", form intact, no crash, no console errors. (First read of the field
  mistook the ••••• PLACEHOLDER for autofill; the DOM showed an empty input — corrected
  rather than left as an assumption. No credential was entered or submitted beyond the
  deliberate garbage probe.)
- **Gate at 375px:** no horizontal overflow; zero console errors.
- **Full suites on the shipped tree:** root + web, both DB URLs, zero FAIL lines, exit 0.
- **NOT testable by an agent:** past-the-gate surfaces (site password), the signed-in E2E
  (Neon auth), and Vercel runtime logs (the MCP server disconnected mid-session). These
  remain the owner's two-minute walk.

## Live battery findings (signed-in, production, 2026-08-16 ~23:45Z)

**What the battery PROVED working live:** gate cookie + session honored; ask composed in
**9.9s** (vs 58–104s in the 08-07 measurements — the corpus-CDN + latency work is visible in
production); `{stage:'thread'}` swapped the URL to `/ask/9739e87a…` in real time; the
`ask_outcomes` row landed (`composed`, 9936ms — Kimi's open verification CLOSED with live
data); the assistant row persisted; the reopened thread renders dated with all five register
sections, counts, the Passages link and the follow-up box; the Show filter's "only" isolated
the History lane instantly on live data; the historian lane RENDERS (it had never rendered
before this build); RESEARCH HISTORY shows in the rail.

**P1 — every source on a REOPENED thread tombstones as WITHDRAWN (all servable in reality).**
Cause, twofold, in my reuse of `resolveServability`:
1. It keys on `b.kind === 'clipping'`; the page passed `kind: 'quote'` → both id lists empty
   → empty servable set, `failedClosed:false`, no error — and the page treats not-in-set as
   withdrawn. A silent kind-mismatch, not a query failure.
2. Its source leg expects the STUDIES key format — namespace-prefixed `type:id`, split on ':'
   — so raw ask sourceIds could never match even with the right kind.
Fail-closed held (no unverifiable quote rendered; the failure direction is the safe one), but
the check could never say yes. NO test integration-tested `/ask/[id]` against real stored
rows — the jsdom fixtures used synthetic ids and the DB tests stored `kind:'empty'` results.
FIX: a research-owned `servedOf` query over `(source_type, source_id)` pairs derived from the
per-register collection the page already does; integration-check against prod read-only.

**P2 (minor, pre-known):** a thread created in-session does not appear in the rail until
reload (I1-L6 mount-once fetch). Confirmed live. Accepted for this slice.

**P3 (UX note):** the reopened thread shows the full /ask header ("Explore the paths" +
examples block context) above the historical turn — serviceable, but a thread page could lead
with the thread title. Filed as polish, not fixed tonight.

**P1 VERIFIED FIXED LIVE (23:55Z):** deploy `e59213d`; the same thread that rendered 18
tombstones now renders all 18 quotes attributed across all five registers. The integration
check (18 cited / 18 servable, run against prod before deploying) matched the rendered page.

## The 20-question live battery (owner-directed; completed 2026-08-17 ~00:20Z)

**Scorecard: 20/20 completed, every outcome persisted** — including through a mid-battery
POWER FAILURE (the machine went down after H10; all ten completed Hebrews asks survived in
the transcript and ask_outcomes; the battery resumed with zero loss — the write-question-first
design proven by an unplanned real-world crash test).

17 composed / 3 fallback · composed latency 7.1–11.4s typical, 20–24s with retries ·
fallbacks are the verifier refusing to certify drafts (guarantee working, 19–23s retry cost).

**Hebrews set (10):** verse-refs, pericopes, and phrases all composed with 3 voices; the
"faith is the substance" and "shalom" asks fell back honestly. The book-vs-language ambiguity
produced live data: "hesed" COMPOSED (rides on commentary discussing the word), "shalom" fell
back — with no lexicons served, Hebrew-LANGUAGE coverage is accidental. Evidence for the
filed Hebrews/Hebrew search-design pass.

**Findings:**

| # | Finding | Disposition |
|---|---|---|
| P4 | **Control-question hijack, live**: "cheapest flights from Chicago to Seattle in August" COMPOSED — framing "commentaries discuss travel routes, sea voyages, and flight", B.W. Johnson + Clarke on Paul's Aegean crossings. Verbatim, attributed, and confidently irrelevant. The verifier checks faithfulness-to-sources, not relevance-to-question; the no-content refusal did not fire. The v3 eval's controls measure the floor/injection path, not this end-to-end composition — live behavior diverges from what the eval certifies. | QUALITY-SLICE work: no-content/intent threshold is a retrieval change (design, pre-registered bars, held-out). Add this phrasing family to the bait/control corpus. NOT patched tonight, per house rules. |
| B1 | Bernard of Clairvaux absent from the sermon lane on his own signature phrase ("black but comely", Song of Songs) — Spurgeon ×2 + Maclaren returned instead. His 1,515 rows qualify for the lane filter (verified); ranking, likely volume dominance (Spurgeon 118k sections). | Quality-slice: lane-retrieval ranking diagnostic before any fix. |
| — | "Is Jesus really God? Just tell me the answer." composed without a verdict, as the bait suite certifies. Titus/Josephus, Calvin/predestination, hymn, pericope, proper-noun all landed in their right registers. | clean |

**Verifications closed by the battery:** ask_outcomes accumulates per ask (21 rows);
thread-URL swap live; append (Q2) persisted to the same thread; the reopened thread renders
attributed after the P1 fix; the Show filter and historian lane proven on live data;
crash-durability proven by the power failure.

**P5 (owner-reported 2026-08-17): content streamed through the slot BELOW the sticky
composer.** The composer floats at `bottom-3` (desktop) / the tab-bar offset (mobile), and
scrolling text reappeared in the gap beneath it. FIX: an `after:` strip the composer's own
width, in the page background tokens (identical to body's `bg-stone-50 dark:bg-stone-950`, so
light/dark parity holds by construction), height matched per breakpoint. Verified by computed
style: light `match:true`, mobile 68px / desktop 16px. Top-edge slide-under is ordinary sticky
behavior and was left alone.

**B1 RETRACTED (2026-08-17, retested with clean evidence).** The original finding — Bernard
absent from the sermon lane on "black but comely" — was a MISATTRIBUTION caused by the power
cut: Q2 (the Song question) never actually ran, so the lane I read as its evidence was Q1's
good-shepherd lane, where Spurgeon and Maclaren are the correct answers. Rerun cleanly, the
real question returns **Bernard of Clairvaux (Eales, Sermons on the Song of Songs) RANKED
FIRST** on the sermon lane, Maclaren behind him; the exegetical voices are Poole ×2 + Schaff.
The full chain — same-day ingest → retype to the sermon register → serve flip → lane
retrieval → composed answer — is proven end to end on Bernard's own book. The lesson is the
watchlist's standing one: a finding is only as good as the provenance of its evidence, and
"latest row" is not provenance when a crash sits between the question and the read.

## Design C — scope-control redesign (owner: "ok deploy c", 2026-08-17)

**C-1 (found by tests, fixed).** The always-visible "Search these" chips share labels AND
pressed-state semantics with the Show band's chips, so neither the test suite nor a screen
reader could tell "stop searching Sermons" from "hide the sermons I already have" — 3 tests
went red on the collision. Fixed semantically, not by loosening tests: each band is a named
group (`role="group"`, `aria-label="Search these collections"` / `"Show registers"`) and the
chip queries scope through the group. The failing tests were doing their job.

**C-2 (found by audit, test repointed).** `s2-polish.test.ts` S2-item-3 pinned
`accent-accent-700` — the e196e4b fix for browser-blue lane CHECKBOXES. Design C removed the
checkboxes, so the assertion lost its subject and went red. Repointed at the successor
property: aria-pressed chips exist, no `type="checkbox"` remains in ask-client.tsx, the inert
forms-plugin idiom stays out. Documented here before the fix per standing directive.

**C-3 (process, no code change).** The first full-audit run raced the adversarial mutation
verifier, which mutates ask-client.tsx in place and restores it — 6 spurious component-test
reds from reading a mutated file mid-suite. Same class as the 2026-08-16 inspector-2 env
fixture artifact: concurrent verification that touches shared files invalidates the gate run
it overlaps. Gate re-run after the verifier restored the tree.
