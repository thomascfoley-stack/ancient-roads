# Remediation checklist — 2026-08-18 pre-deploy audit

> **STATUS CORRECTED 2026-08-19.** Seven of the eight HIGHs (H1–H7) were fixed the same
> night and the boxes were never ticked, so this file read as reporting eight open HIGHs.
> A later session believed it. That is the same defect as MASTER's C4 row, which named a
> CRITICAL and never recorded its closure — and cost this session a re-fix attempt on a
> defect that had been live-fixed for eleven days. **A finding recorded without its closure
> reads as open forever.** Each tick below carries the commit and the check that proves it.
> **H8 is genuinely still open**, verified against the code, not assumed.

Six parallel lenses (attack surface · data layer · licensing invariants · client · ops/gate · AI
pipeline) over the deploy candidate `6cdfb4f`, i.e. everything since the live deploy `667e571`.
Deduplicated, severity-ordered. **Nothing here has been fixed.**

## THE FINDING THAT REFRAMES THE DECISION

**Production is serving commentary search off the WIDE index right now, and I caused it.** I applied
migrations 117/118 to production *ahead of* the code that matches them. A partial index is only
usable when the query predicate implies the index predicate, and `A ∧ B` does not imply
`A ∧ B ∧ ¬veto`. Measured on dev, same query both ways:

| query filter | plan | rows from index | buffers | exec |
|---|---|---|---|---|
| new (this payload) | `idx_commentary_fts_legal` | 26,642 | 16,746 | **102 ms** |
| deployed (115-era) | `idx_commentary_fts` (94 MB, whole corpus) | 143,575 → filtered to 26,642 | 45,009 | **355 ms** |

Migration 117's own header states the rule — "the code and this migration must ship together" — and
states the failure BACKWARDS: it says deploying the code alone leaves the surface seq-scanning. The
true unsafe order is migration-first, which is what I did.

**My evidence certifies the opposite, and could not have failed.** `117-apply-2026-08-18.md` records
"planner uses the index, not a seq scan — YES". That `EXPLAIN` ran against the NEW predicate — a
query production does not run. I then repeated it as reassurance. This is the unearned-green class,
committed while auditing for it.

**No licensing exposure** — independently re-measured: `count(*) FILTER (WHERE old AND NOT new)` = 0
of 371,406. Results identical either way. This is latency and cost only, and **deploying is the
remedy**. There is currently **no valid rollback target**: no deploy in `docs/evidence/deploys/`
postdates 117/118, so `DEPLOY_PREFLIGHT.md`'s rollback rule excludes every candidate.

---

## HIGH — data egress to PostHog (blocks the deploy; NOT yet in production)

- [x] **H1. `/ingest/*` forwards `site_gate` and the Neon session cookie to PostHog.**
      **CLOSED e44ecd2 — both /ingest rewrite legs removed; only a comment names it now. Pinned by posthog-wiring.test.ts "next.config proxies NOTHING to a third party".**
      `web/next.config.ts:145`, `web/src/middleware.ts:58`, `web/src/app/api/gate/route.ts:54-60`.
      Next proxies external rewrites via `http-proxy`'s `setupOutgoing`, which does
      `Object.assign({}, req.headers)` — every header verbatim, only `host` replaced. Beacons are
      same-origin so the browser attaches cookies regardless of `HttpOnly`; `site_gate` is `path:'/'`.
      That cookie IS the bearer credential for the whole pre-launch wall. **Confirm on Vercel's edge
      before/after any fix — the proxy layer differs from the Node path that was code-proven.**
- [x] **H2. The reader's ask text leaves the browser as `$current_url`.**
      **CLOSED e44ecd2 — capture_pageview:false PLUS sanitize_properties stripping query strings off EVERY event ($current_url rides all of them, so the flag alone is necessary and not sufficient).**
      `web/src/instrumentation-client.ts:18-27`, `work-reader.tsx:341`, `verse-display.tsx:178`.
      `capture_pageview` defaults on; `$current_url` is `location.href` verbatim. The readers push
      `/ask?q=What have commentators said about "<up to 220 chars of the selected passage>"…`, and
      the pageview fires before `ask-client.tsx:283` swaps the URL. `/search` does the same via its
      GET form (`name="q"`). Directly contradicts the file's own O-2 claim at `:12-13`.
- [x] **H3. Autocapture is on; `$el_text` ships user-authored content.**
      **CLOSED e44ecd2 — autocapture:false, explicit rather than defaulted (it defaults ON).**
      Study titles (`save-to-study.tsx:396`), uploaded document titles (Lane B private corpus),
      shelved-work rows. `person_profiles:'identified_only'` does not prevent capture with a
      `distinct_id` + IP.
- [x] **H4. `maskAllInputs` masks inputs, not page text.** `instrumentation-client.ts:26`. No
      **CLOSED e44ecd2 — disable_session_recording:true. maskAllInputs was never the fix; replay records rendered page text, not just inputs.**
      `maskAllText`/`maskTextSelector`. If replay is enabled project-side, a replay of
      `/library/uploads` or a study contains the user's private uploaded text verbatim.
- [x] **H5. `/ingest/*` is an open, unauthenticated, unthrottled reverse proxy, and turns CSP
      **CLOSED e44ecd2 — the proxy is gone and the gate matcher no longer exempts anything; posthog-wiring.test.ts asserts /ingest/e/ IS gated.**
      `connect-src 'self'` into an exfiltration channel.** `script-src` is `'unsafe-inline'` with
      live `dangerouslySetInnerHTML` sinks; injected script can POST `document.cookie` to `/ingest/`
      under an attacker's own API key and read it on their dashboard. Also billable relay abuse.

## HIGH — licensing veto coverage (mine; incomplete)

- [x] **H6. The deploy-gate matcher never got the name-prefix rule.** I synced the *list* in
      **CLOSED e44ecd2 — scripts/lib/served-corpus-authors.mjs carries the name-prefix rule, not just the synced list.**
      `scripts/lib/served-corpus-authors.mjs` and left `isMustNotServe()` behind. Measured:
      `CS Lewis  (via the character Screwtape, a devil)` (70 rows) and `Pseudo-Origen  (as quoted by
      Aquinas, AD 1274)` (12 rows) are blocked by the shipped TS and **invisible to the gate copy**.
      `test/invariants/served-corpus-authors.test.ts:40-42` compares only the two arrays, never the
      two matchers — weaker than the property it names.
- [x] **H7. The veto reaches only the FTS surface.** `servability.ts:85-92` and
      **CLOSED e44ecd2 — servability.ts and studies.ts both AND in the veto, via bound array params (NOT sql.unsafe, which does not exist at runtime despite the .d.ts).**
      `studies.ts:545-551` gate on `status='published'` + provenance only, so a stored study clipping
      of a vetoed author keeps rendering, and a new one can still be created. The embeddings leg
      rides `e.served`, a materialised column no TS edit changes.

## HIGH — pipeline (pre-existing, ships with this payload)

- [ ] **H8. `violations[].span` reaches the response body and is persisted.** `teach.ts:322` →
      `ask/route.ts:69` / `stream/route.ts:86,126-135`. `verifier/v1.ts:85` sets `span` to the
      model's *fabricated* quote. `teach.ts:56-59` claims the sink is "never a response body".
- [ ] **H9. Upstream error bodies are interpolated verbatim and unbounded into the next compose
      prompt.** `deepinfra.ts:77` → `teach.ts:282-284`. Prompt-injection channel from a non-user
      source; the 300-char cap applies only to the logging copy, so a large body is re-sent up to
      three times per request.
- [ ] **H10. No register lane has a relevance floor.** `routing.ts:404-409` is a bare global KNN
      `LIMIT 3`. The historian lane is 92.4% unanchored, so most asks render three arbitrary quotes
      under "Historical background". Filed as B031, unfixed.

## HIGH — client

- [ ] **H11. The mobile Save-to-study picker opens off the bottom of the screen.**
      `selection-popover.tsx:437-441`. Measured at 390×844: picker bottom 946 (102px below the
      viewport), "New study" fully offscreen and untappable, nothing scrolls to it. The comment at
      `:434-436` asserts the opposite. Worse by ~34px on a notched device.

## MEDIUM

- [ ] M1. `apply-migration-concurrent.mjs:118-133` post-asserts the index **name**, not its
      predicate; a VALID-but-stale `_vN` is silently promoted and reported green.
- [ ] M2. Nothing anywhere compares the **live** index predicate to the constant — both guards read
      the tree against itself. `grep -rl 'indpred\|pg_get_expr' web/test test` → nothing.
- [ ] M3. `fts-legal-index-sync.test.ts:15` strips whitespace *inside SQL string literals*, so
      `' of '`→`'of'` and `'CS Lewis %'`→`'CSLewis%'` stay green. Red-proofed. False parity.
- [ ] M4. The veto is case- and punctuation-exact: `C.S. Lewis`, `Lewis, CS` (an attested convention
      in this corpus), `CS  Lewis`, `The Tyndale Study Notes`, curly-apostrophe `Jerome’s`, and
      case variants all pass both guards.
- [ ] M5. TS and SQL disagree on whitespace shapes (leading space, tab, NBSP): TS blocks, SQL passes.
- [ ] M6. `PUT /api/work/[slug]/shelf:56-69` parses an unauthenticated body before `requireUser`;
      every sibling does auth first. Discloses the enum to anonymous callers.
- [ ] M7. The progress route's "no rate limit needed" argument reasons about stored rows, not
      request cost (3 round trips against the DB `/api/ask` depends on).
- [ ] M8. `isPublishedCommentaryEntry` declares `sourceUrl` and never reads it; four callers believe
      it is checked.
- [ ] M9. No `sections`-side read path carries the author veto — only `status='published'`. A bare
      `UPDATE sources SET status='published' WHERE slug='origen-commentary'` exposes it everywhere.
- [ ] M10. `study-library-panel.tsx:129` sends the raw FTS query as `matchHint`; `indexOf` fails on
      multi-word/stemmed matches, so B030 silently does nothing there. `row.snippet` is the right hint.
- [ ] M11. Save-to-shelf renders ABSENT on a failed read (`work-header.tsx:41-43,67`), while
      `/library/books` instructs the reader to press it.
- [ ] M12. `deps-audit.mjs` queries the **alias** `web-vitals-soft-navs`, so `web-vitals@6.0.0` is
      never checked for advisories.
- [ ] M13. Nothing at deploy time asserts `NEXT_PUBLIC_POSTHOG_KEY`; it is build-time inlined, so
      setting it after the deploy does nothing.
- [ ] M14. `skipTrailingSlashRedirect: true` is global, added for PostHog; `isPublicPath` is
      exact-match, so `/about/` may now 307 to `/gate`. **Needs a browser check.**
- [ ] M15. The O-2 ruling this payload cites does not exist in the repo (bylaw 1).
- [ ] M16. Three catches in `retrieve.ts` (`:211-213`, `:87-89`, `:129-131`) swallow reranker and
      lane failures with no log — a reranker down for a week is invisible.
- [ ] M17. `selectVoices` compares raw tradition strings, so the diversity swap no-ops on the
      `Patristic`/`patristic` case pairs; the gate's own guard then never evaluates.
- [ ] M18. The picker's error text is ~1.9:1 contrast — `SAVE_ON_PILL`'s descendant selector leaks
      into the panel.
- [ ] M19. Picker dialog has no focus management; Escape destroys the whole popover and the selection.

## LOW

- [ ] L1. 117/118 have no rollback artifact; a rollback re-creates the index mismatch permanently
      with every check green.
- [ ] L2. `trimBlock`'s boolean is discarded; a failed trim is reported as success.
- [ ] L3. `/library/books` has no pagination and silently truncates at 50.
- [ ] L4. The gate token is an unsalted single-round SHA-256 of a known-prefix string, 30-day bearer.
- [ ] L5. Middleware matcher prefix bypasses: `/gateway`, `/gates/*`, `/icons*` are unanchored.
- [ ] L6. `my exit test` `toContain("'CS Lewis'")` is satisfied by the name appearing anywhere,
      including in the allowlist; the "veto subtracts nothing" proof omits the book-scoped authors.
- [ ] L7. `WORKLOG.md` still says migration 117 is "NOT APPLIED"; it is live on dev and prod.
- [ ] L8. Migration 118 has no evidence file; its prod apply exists only in a commit message.
- [ ] L9. `MASTER.md:6-8` names `7f62991` as live; `667e571` superseded it. Ledger says "nothing
      deployed"; `667e571` is deployed.
- [ ] L10. `ask_outcomes` has an insert-only RLS policy with a NULL qual while `app_runtime` holds
      SELECT — any read path returns zero rows.
- [ ] L11. Restored `/ask/[id]` threads always display "0 traditions".
- [ ] L12. Stale comment in `stream/route.ts:51` says the limiter "fails open"; it fails closed.
- [ ] L13. Selection-popover touch targets are 24–28px (pre-existing).
- [ ] L14. `role="dialog"` nested inside `role="toolbar"`.
- [ ] L15. `probeSectionClipFailure` is a corpus-existence oracle for arbitrary section ids.

---

## COVERAGE

**Audited:** all 15 changed source files + 2 migrations; the three routes already live but never
audited (`progress`, `shelf`, `/library/books`) and `lib/library.ts`; the site gate and PostHog
wiring; the licensing predicate across every read path over `commentary_entries`/`sections`; RLS,
grants and indexes on the touched user tables, verified against live catalogs; the teacher pipeline
end to end for verifier escape.

**NOT audited — the honest gaps:**
- **No production database read** by any lens (bylaw 7). Every DB number is from dev `ep-tiny-hat`.
  The prod-side confirmation of the index finding is one `EXPLAIN` at the owner terminal.
- **Vercel edge behaviour** for H1 (cookie forwarding on external rewrites) and M14 (trailing-slash
  ordering) — code-proven for the Node path only; both need a live curl/browser check.
- **Whether PostHog session replay is enabled project-side**, and whether `NEXT_PUBLIC_POSTHOG_KEY`
  is set in Vercel — owner-side, unreadable from here.
- **The static corpus itself** (`web/public/commentaries/`) is gitignored and absent from this tree,
  so H6's row counts come from `commentary_entries`, not the files that would ship. The decisive
  check is running `scanServedCorpusAuthors` on the operator's real directory after patching.
- **Whether `quarantine-served-corpus.ts` has been re-run since the ruling** — not determinable here.
- **Two-account RLS** was not exercised; C5's "RLS under Neon ids is unproven" still stands.
- **No live request** to any environment; no timing measured on production.
- The client 390px numbers come from a geometric replica in headless Chrome, not the real build.
