# Remediation checklist — overnight cold audit (2026-07-24)

6 fresh lenses (none audited its own output) + an adversarial-verify pass on every HIGH.
**61 verified-clean, 36 not-covered, 18 findings.** Two HIGH survived refutation. Severity-
ordered; deduplicated. Prod was never touched. "Fixed" = landed tonight with a red-first test.

## FIXED tonight (mechanical, red-first, committed 6371c11)

- [x] **[HIGH] catalog-search XSS** (`catalog-search.tsx:107`) — rendered the raw ts_headline
  snippet via `dangerouslySetInnerHTML` while the identical sink in `library/passages`
  sanitized it (copy-drift). Extracted `sanitizeSnippet` to `web/src/lib/snippet.ts`, applied
  in BOTH sinks. Red-first: `snippet-sanitize.test.ts` neutralizes an injected `<img onerror>`/
  `<script>`, preserves only real `<mark>`. **Adversarially CONFIRMED before fixing.**
- [x] **[MED] coverage-floor false-cover on verseEnd≤0** (`routing.ts:298`, my B2 code) —
  `min(verseId,verseEnd)` pulled the low end to 0, covering any lower asked chapter. Anchor
  `lo` on `verseId`. Red-first: buggy `min()` fails the new `verseEnd≤0` case.
- [x] **[HIGH→doc] STATE_OF_TRUTH §2 stale/mislabeled** — added a correction: §2 reads DEV (not
  prod, despite the header), and commentary is now 5 works / 84,292 sections. Full re-verify
  still owed (below).

## ESCALATE — do NOT auto-fix (owner call / integrity core / architecture)

- [ ] **[MED] verifier ≥2-voices counts SECTIONS, not AUTHORS** (`v1.ts:292`) — hazard-6
  asymmetry: `/ask` diversity floor counts distinct sections while Today counts authors. This is
  the **verifier (integrity core); never auto-touch (§3.3)**. Owner decides: add a distinct-author
  count to the `/ask` floor, or document that `/ask` intentionally differs. NOTE: fail-closed
  today (a single author's two sections could satisfy the floor — a *faithfulness* softness, not a
  leak).
- [ ] **[MED] LEGAL_CORPUS_FILTER has no register fence** (`routing.ts:120`, hazard 5) — the
  exegetical vector pool excludes sermon/theology/song **by author-provenance coincidence**, not
  by a structural fence. Add an explicit lane/song exclusion mirroring `EXEGETICAL_FTS_EXCLUSION`.
  Architectural; verify no current leak first (the wall held in tonight's v4 controls).

## OWNER / FOLLOW-UP (real, but not mechanical or out of tonight's lane)

- [ ] **[HIGH] STATE_OF_TRUTH §2 full re-verify** — re-run `ground-truth.mjs`, rewrite §2, stop
  marking rows ✅ until re-measured. (Correction note landed tonight; full rewrite owed.)
- [ ] **[MED] work.ts unbounded reader-TOC read** (`work.ts:94-100`) — publishing whole-Bible
  commentaries (gill 1,169 units) newly triggers an unbounded TOC read. Page the TOC (keyset) or
  return a bounded unit-level TOC. CLAUDE.md forbids unbounded reads — do before this data ships.
- [ ] **[MED] CCEL ThML markup renders as junk** (`work-section.tsx:99`) — data fix at ingest
  (strip residual ThML), not render; add a "no tags in published body" corpus invariant.
- [ ] **[MED] CI runs ZERO DB invariants** until `APP_DATABASE_URL_TEST` — already the tracked
  owner item (create the Neon TEST branch + secret). RLS/tenancy/licensing CI-unverified until then.
- [ ] **[MED] ground-truth.mjs claims prod, reads dev** — relabel its header + the §2 method line
  (or repoint at `.env.prod` if prod was intended).

## LOW (hardening; batch when convenient)

- [ ] annotations route bare-catch returns 401 for any error (masks schema failures; fail-closed).
- [ ] publish-works.mjs re-inlines ALLOWED/FORBIDDEN literals + lacks the L5 must-not-serve check
  (adversarially DOWNGRADED: the real Gate B ran post-publish and passed; gill/jfb/clarke are not
  must-not-serve). Harden: gate on `check-licenses` exit before the flip.
- [ ] sweep-composite-defect is head/tail-only (blind to mid-body foreign-author). Known + logged;
  the 3 published works are sequential verse-keyed modules (Gen1→Rev22), low mid-body risk. Add a
  stratified-sample pass for CCEL/Gutenberg works before publishing any of those.
- [ ] migrate-sections-slice lacks the ≥20-char junk floor register-writer enforces.
- [ ] CI warning denominator stale ("177" → 193).
- [ ] prod-census.cjs orphaned by tonight's repoint (reads the now-dev root `.env.local`; make it
  read `.env.prod` or an explicit `--env-file`, keep the ep-odd-fog assertion). Fail-closed.
- [ ] root `.env.local` `NEON_AUTH_*` URLs still point at the prod host (ingest does no auth; repoint
  or drop).
- [ ] a few pre-existing write-capable ingest scripts lack the paired host guard (no NEW bypass).

## Coverage (what the audit checked and found CORRECT — proves it looked)

61 verified-clean, incl.: **NOBYPASSRLS is enforced not just granted** (app_runtime rolbypassrls=f,
member of no role); **platform corpus (user_id IS NULL) is unwritable by app_runtime** (022 WITH
CHECK, probed with forced rollback: INSERT/UPDATE/DELETE all denied); policy predicates correct on
all 7 user tables; **no owner connection on any request path** (runtimeUrl fails hard in prod if
APP_DATABASE_URL unset; boot canary wired via instrumentation); corpus tables SELECT-only; migration
030 tightening live; B2 coverage floor otherwise correct; the register wall held in the v4 controls.

## Not covered (36 items — the honest gaps)

Top ones: **PROD RLS enforcement not observed** (only dev reachable; architecturally guarded, but
CLAUDE.md's two-account prod check still owed); library write functions (setShelf/saveReadingProgress)
not yet route-wired, so their write-path authz is unexercised; no two-real-user behavioral cross-read
test (dev has ~5 highlights); the teacher hybrid_search RLS path; auth-table RLS call sites.
