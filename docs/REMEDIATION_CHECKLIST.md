# Master Remediation Checklist — 2026-07-11

Produced by a four-way parallel audit (HTTP surface / teacher pipeline / data+licensing / docs-vs-code) against the actual tree. **Nothing here is fixed yet.** Owner directs which to execute.

## CONTEXT — corrected (read first)

**There are no users. The site is gated. Owner is the only tester.** Earlier drafts of this doc treated the licensing exposure as an active emergency. It isn't — actual exposure right now is ~zero. What follows is re-prioritised accordingly.

**And the goal is MORE content, not less.** The ~392 unserved sources are **not illegal — they are unproven.** Most are public-domain works with broken provenance (paperwork, not copyright). Gutting the corpus would be the wrong fix. **The P0 job is recovering and growing content, legally.** See **`docs/CONTENT_RECOVERY_PIPELINE.md`**.

---

## P0 — CONTENT: recover + grow the corpus (nothing works without content)

- [ ] **P0.1 — Resolve the CCEL fork (owner).** ADR-008 flags CCEL as "commercially restricted." Its texts are PD; its *terms* may not permit bulk use. **CCEL is the single highest-leverage source** (Spurgeon's 3,560 sermons, Pulpit, Poole, Bengel, MacLaren, the Puritans, ANF/NPNF, Torrey, Nave). This one decision shapes the whole pipeline — if CCEL is out, those works fall back to archive.org OCR (harder, lossier). **Verify the actual terms.**

- [ ] **P0.2 — Build the source adapters** (the leverage: ~6 adapters unlock hundreds of works). Priority order: **CrossWire/SWORD (libsword)** — explicit per-module PD licences, unlocks Barnes/Calvin/Wesley/Geneva/RWP/TSK/Scofield/Darby → then **CCEL** (pending P0.1) or **archive.org** fallback → then **Gutenberg** (Josephus/Whiston, Philo/Yonge). helloao and New Advent adapters already exist.

- [ ] **P0.3 — Run the harness across the ~392 unproven works.** Auto-classify each: provenance-repair ($0, keep vectors) / re-ingest from the PD edition / quarantine (no PD edition exists). Stage everything; **publish is a hard human gate** via the digest. Expected: **9 → 30–50+ verified authors.**

- [ ] **P0.4 — GROWTH: ingest the sermon corpus.** Spurgeon (~3,560), Wesley, Whitefield, Edwards, Luther (**Lenker 1905–09** — the modern Fortress/Concordia edition is copyrighted). **Verbatim, attributed, provenance-proven. Never paraphrased, never summarised.** Then historians (Josephus/Whiston, Eusebius, Edersheim) and tradition-diversity (Catena Aurea / Newman 1841).

- [ ] **P0.5 — Re-measure after every corpus change.** More voices should *raise* the ≥2-voices guarantee — that is the entire point. Record the number.

**Acceptance for any published work: licence record + provenance record (permitted source, translator, edition year) + text-match proof + coverage gap = 0 + human approval.** Anything short → staged or quarantined. **Quarantine, never delete.**

---

## P1 — Licensing hygiene (fix before ANY user touches it — not urgent today)

Owner call: the genuinely-copyrighted content (Tyndale Study Notes, modern patristic translations) can **stay in the app for now** — it's already there, no sense redoing work, and with no users behind a gate the exposure is nil. But it must be **flagged and un-servable before a single real user arrives.** Do not delete it; quarantine-flag it.

- [ ] **P1.1 — Mark the genuinely-copyrighted bucket `quarantined` in data** (Tyndale, Theophylact, Bonaventure, Oecumenius, Origen-on-John, Jerome's prophets, Aquinas-Larcher). Flag, don't delete.
- [ ] **P1.2 — Repair the `historicalchristian.faith` provenance** on the ~4,174 Augustine/Chrysostom rows in the *served* set (text is PD-verified vs New Advent; the record cites a forbidden aggregator). Re-point the provenance to New Advent.
- [ ] **P1.3 — Reconcile the licensing boundary.** `ingest/sources.config.json` (5 works, Barnes quarantined) vs `LEGAL_CORPUS_FILTER` (9 authors, Barnes included) **disagree**; Wesley/Calvin/Chrysostom/Augustine have **no licence record at all**. Move the boundary from a hardcoded code string into the `sources.status='published'` column (`006`) — the architecture `MIGRATION_DESIGN.md` always intended. Collapse the **three** different provenance checks (routing `ILIKE '%crosswire%'` / license-manifest hostname / ingest-harness `.includes`) into one.
- [ ] **P1.4 — One legal accessor for every read path.** Today the filter is applied on exactly one of four paths. Before any user: the teacher, the search endpoint (`/api/search/commentaries`), and the reader (`web/public/commentaries/*.json`) must all go through the same published-set accessor.

---

## HIGH — Security / authorization

- [x] **H1 — `getMessages` relies solely on RLS, no explicit `user_id` filter.** `web/src/lib/chat.ts:89-108` filters only by `channel_id`/`chat_id`. Every other user-scoped query carries an explicit `user_id` belt; `db.ts` promises the explicit filter isolates "even when RLS is inert" (the `DATABASE_URL` owner fallback) — false for messages. On that fallback, a guessed channel/chat id returns another user's messages. Add `AND user_id = ...`.

- [x] **H2 — `addMessage` IDOR write.** `web/src/lib/chat.ts:112-126` does not verify the target `channelId`/`chatId` belongs to the caller before insert. RLS-on-read hides it today; combined with H1's inert-RLS fallback it's a cross-tenant write. Validate ownership before insert.

- [ ] **H3 — `app_runtime` has INSERT/UPDATE/DELETE on the corpus + license tables.** `db/migrations/001…:49-54` `ALTER DEFAULT PRIVILEGES … GRANT SELECT,INSERT,UPDATE,DELETE` covers all future tables; later SELECT-only grants (003, 006) don't revoke it (Postgres grants are additive). The runtime role can mutate the licensed corpus and the `sources` license registry. Not least-privilege. Verify with `\dp` on prod and REVOKE.

- [x] **H4 — Rate limiter charges the daily quota for requests it refuses.** `web/src/lib/rate-limit.ts:44-58` bumps BOTH `ask:min` and `ask:day` before checking either. A per-minute-limited burst (double-click, retry loop) still consumes daily slots → a user can be locked out for 24h by traffic that was never served. Check the minute bucket first; only bump the day bucket for requests you'll serve.

- [ ] **H5 — The eval that produces the accuracy numbers measures a different corpus AND pipeline than production.** `web/src/scripts/eval-routing.mts:22-26` and `eval-failure-codes.mts:17-21` hardcode their own `PUBLISHABLE` constant that **omits the crosswire (Barnes/Wesley/Calvin) clause** of the real `LEGAL_CORPUS_FILTER`, and skip the production diversity/backfill/`selectDiverse` stages — while `eval-routing.mts:3-5` claims to be "the SHARED production path." (Note: `eval-heldout.mts` DOES import the real filter — so the v3 held-out gate is sound; these two diagnostic evals are not.) Any number cited from these two is not the shipped pipeline.

- [ ] **H6 — The legal boundary is a hardcoded code string, not data, and it's author-name-based.** `routing.ts:30-33`: no `sources.status` column is consulted on any live path; Gill/JFB/Clarke/Henry admitted purely by author name with no provenance predicate (H2-data) — any row of those names scraped from a forbidden domain passes; `ILIKE '%crosswire%'` (H3-data) is a fragile substring vs the real hostname check in `license-manifest.ts`. The manifest (`ingest/sources.config.json`, 5 works, Barnes quarantined) and the filter (9 authors) disagree; `check-licenses.ts` validates only the manifest, so CI guards nothing users actually read.

---

## HIGH — External blockers (not code; owner/roadmap)

- [ ] **B1 — SEC-1: auth library pins 2 critical + 7 high CVEs, account-management UI broken.** Gated "public launch"; with no beta it gates everything. `docs/SECURITY.md`, `docs/AUTH_MIGRATION_SPIKE.md`.
- [ ] **B2 — DeepInfra spend cap (owner dashboard action).** The only real backstop against a runaway bill; the rate limiter is a courtesy brake. ~$100–150/mo, alert at 50%.
- [ ] **B3 — Observability emits to nowhere.** Events log to stdout; no Sentry/PostHog DSN, no alerting a human can be paged on. Required before real traffic.

---

## MEDIUM

- [ ] **M1 — Stored-XSS sink.** `web/src/app/library/commentaries/page.tsx:121` renders `ts_headline` output via `dangerouslySetInnerHTML`; the surrounding scraped body text is not HTML-escaped. A `<script>`/`<img onerror>` in a scraped body executes. Escape/sanitize before render.
- [ ] **M2 — Frozen held-out sets are not hash-verified at runtime.** v2/v3 hashes live in WORKLOG prose; no script/test computes+asserts the hash before a run. A silent mutation would run and report a number with no tripwire. Add a fail-closed pre-run hash assert.
- [ ] **M3 — The legal filter and the two new routes have ZERO automated test coverage; `web/` has no test runner in CI at all.** `test/routing-orchestration.test.ts` tests only pure helpers; nothing tests `LEGAL_CORPUS_FILTER`, the SQL builders, or `/api/eval/bait`. A one-char edit to the licensing filter passes `npm run audit`. Add web tests + a "non-legal author is excluded" regression test; wire `web/` into CI.
- [x] **M4 — `/api/eval/bait` has no rate limit and no length cap, and calls the paid `teach()`.** `web/src/app/api/eval/bait/route.ts`. Secret-gated + middleware-gated today, but the middleware comment says the gate comes off at launch → a public LLM endpoint behind one static bearer token. Add `requireUser`/rate-limit, or hard `NODE_ENV !== 'production'` guard.
- [ ] **M5 — `rejectUnauthorized: false` on every DB connection (13+ sites).** `src/retrieval/store.ts:45,74`, `db/apply-migration.mjs:23`, ingest scripts. TLS certs never verified. CLAUDE.md's pre-signup gate explicitly lists this as a blocker.
- [ ] **M6 — Raw upstream error text goes into logs.** `api/ask` + `ask/stream` do `logEvent('error',{message:(e as Error).message})`; deepinfra/embeddings throw with `res.text()` appended. Client envelope is clean; logs are not — against "secrets never logged."
- [ ] **M7 — `verifyV1` is not wrapped in try/catch in `teach.ts:159`.** A verifier throw becomes a 500 instead of the specified "fall back to raw retrieval." Still fail-closed for faithfulness (no unverified text), but not the graceful degradation CLAUDE.md specifies.
- [x] **M8 — `api_rate_limit` has no sweep job.** Migration 008 promises a periodic delete of expired windows; no code implements it → unbounded table growth. Add the sweep.
- [ ] **M9 — No migration ledger; migrations not transaction-wrapped.** `db/apply-migration.mjs:26` runs the whole file in one `query()` with no BEGIN/COMMIT and no `schema_migrations` table. No programmatic way to verify prod == repo. Idempotent `IF NOT EXISTS` mitigates re-apply only.

---

## MEDIUM — Docs assert false/stale things (dangerous because they're the source of truth)

- [ ] **D1 — CLAUDE.md "Retrieval accuracy is now 10/10 … not retrieval" is stale** and auto-loads every session; contradicted by 70/64 everywhere. Correct it to the real state (retrieval is the limiter).
- [ ] **D2 — WORKORDER_PHASE_B "prod serves ONLY the legal corpus? YES"** is false (C1/C2). Correct the claim to "teacher path only."
- [ ] **D3 — MIGRATION_DESIGN.md header "DESIGN ONLY — no code until approved"** but it shipped (006 applied, harness staging Barnes + Matthew Henry). Reconcile.
- [ ] **D4 — ROADMAP top block stale** ("gate fails OPEN ← NEXT", "legal filter is eval-only") — both fixed post-write; ROADMAP is the designated status source of truth.
- [ ] **D5 — SEC-2 marked "Done"** in ROADMAP but SECURITY.md says the two-account in-browser isolation check is still pending. Run it or downgrade the status.
- [x] **D6 — Pre-signup gate list stale** (rate-limit + bait now done); design-doc schema mismatch (`(user_id, window_start)` vs as-built `(user_id, bucket, window_start)`); shipped copy references a "beta" you say doesn't exist (`api-error.ts` RATE_LIMIT_DAY message).

---

## LOW / latent

- [ ] **L1 — Integers interpolated into SQL** in `routing.ts` (`injectionSql`, `diversityBackfillSql`) with no `Number.isInteger` guard. Safe today (typed, internal); defense-in-depth.
- [ ] **L2 — `/api/gate` password compare is not constant-time** (`!==`); timing side-channel on the shared gate password. (`eval/bait` correctly uses `timingSafeEqual`.)
- [ ] **L3 — `embeddings.ts` `hybridSearch` / `src/teacher/run.ts` / `src/retrieval/store.ts`** query the corpus with no legal filter. Currently unreferenced by any web route (latent), but each would reintroduce C1/C2 if wired up.
- [ ] **L4 — `reading.note` (schema-permitted) is not screened by the verifier** (`v1.ts` screens framing/prayer/voice only). Latent: the UI doesn't render `reading.note` today. If it ever does, it's an interpretation-leak path.
- [ ] **L5 — `ingest-harness.ts` uses a third, weaker `.includes()` provenance check** — three different implementations of "is this a forbidden aggregator" (harness / license-manifest hostname / routing ILIKE). Consolidate to one.

---

## STRATEGIC — Phase A retrieval (the 85/85 objective)

- [ ] **S1 — Item 3 (doctrine→passage routing) as designed would produce a FAKE number.** Torrey's/Nave's and the WSC/Heidelberg eval labels are the **same Reformed proof-text tradition** — not independent. A router built from Torrey's, graded on WSC labels, clears 85% by tradition-correlation, not retrieval quality. Fix: the query→topic matcher must be **semantic** (not keyword lookup), validated on **paraphrased doctrine queries that never name the doctrine** ("can a believer fall away?" not "perseverance"), with the router's fire-rate on paraphrases reported separately. Without that guard, do not build it.
- [ ] **S2 — Item 2 (per-passage cap) is genuine and shipped well.** Epistle 64→84 out-of-sample, zero regression, real voices surfaced. No action; recorded as the one clean win.

---

## Verified clean (so we know the coverage was real)

Auth+rate-limit on `/api/ask` + `/api/ask/stream` (both `requireUser` → `checkAskRateLimit` before spend); the fail-closed site gate + its unit tests; the API error envelope (no internals to clients); SQL parameterization on all user-facing queries; the verifier fail-closed core (compose/parse/verify failures all route to fallback; snap-to-source can't manufacture a pass; attribution can't be fabricated); `MAX_RETRIES=2` bounded cost; the bait harness genuinely drives the real `teach()`; RLS enabled on all user-data tables; integrity-core + bible sync guards byte-identical; secrets only in Authorization headers, never in prompts. The **v3 held-out gate itself is sound** (imports the real filter, hash currently matches).

---

## Suggested execution order (owner decides)

1. **C1 + C2** — stop serving the unfiltered scrape on the reader + search (the existential exposure, and it's the main surface).
2. **C3 + H6** — settle the licensing boundary: repair the historicalchristian.faith provenance, reconcile manifest↔filter, move the boundary into a data `status` column with a test.
3. **H1–H4** — the authz + rate-limit correctness bugs.
4. **M3** — wire `web/` into CI + a legal-filter regression test, so #1–#2 can't silently regress.
5. Then the rest by severity; docs (D1–D6) reconciled as their code items land.

Nothing here is started. Tell me which line(s) to take and I'll execute against this doc.
