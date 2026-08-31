# Deep-audit — 2026-08-31

**Auditors:** six fresh subagents with zero prior context, one per lens.
**Trigger:** pre-launch review before opening ancientpaths.app to the public.
**Stop condition:** any severity-high. **Two found and fixed before this report was compiled.**

---

## Severity-high (found and fixed)

### H-1 — `deploy.sh:477` — EXIT trap clobbers receipt trap

`trap 'rc=$?; write_receipt; exit $rc' EXIT` at line 427 was replaced by
`trap restore_root_directory EXIT` at line 477. Bash `trap` replaces, not chains.
Any failure after upload starts produced **no receipt** — the single most important
artifact of the irreversible operation was lost precisely on the failure paths it
was redesigned to cover.

**Fix:** one trap does both — `trap 'rc=$?; restore_root_directory; write_receipt; exit $rc' EXIT`.

### H-2 — `deploy.sh:463–474` — rootDirectory flip and restore both fail silently

Both API calls used `curl -s ... > /dev/null 2>&1 || true` with no assertion that
the flip took or the restore worked. A failed flip deploys mis-rooted; a failed
restore leaves the project at `rootDirectory: null` indefinitely, breaking every
subsequent GitHub-triggered build with no signal.

**Fix:** `get_root_directory()` GET-before/after assertion on both flip and restore.
Flip must end at `null` (hard stop if not); restore must end at `'web'` (loud warning
if not). All 59 deploy.sh gates pass.

---

## Severity-medium (by lens)

### Attack surface
- **Orphan blobs from presign-then-vanish uploads** — a caller can presign → PUT → never call
  upload-complete. Bytes stored, no row, nothing sweeps them. Bounded by per-user rate limits
  (~2.5 GB/day/allowed user) but no signal and no cleanup. Needs a Blob lifecycle rule or sweeper.
- **Declared-size vs actual-bytes quota gap at presign** — `checkUploadQuota` runs against
  client-declared `size`, not actual bytes. A caller can declare `size: 1` and PUT 25 MB.
  Enforcement depends on the real-size check in upload-complete. Matters when the owner
  allowlist lifts at SEC-1.
- **CSRF floor substring match** — `includes('application/json')` accepts `text/plain; x=application/json`.
  Real-world exploitability is low (SameSite=Lax is the browser default), but the cookie's
  SameSite posture is unaudited — the exact assumption this floor exists to not lean on.
- **Auth/gate limiter fail-open** — only as good as the alerting on `rate_limit_fail_open`.
  Verify an alert exists.

### Data layer
- **Auth tables carry no RLS with full DML granted to `app_runtime`** — `auth_sessions.token`
  and `auth_accounts.password` are reachable by `app_runtime` with no database-enforced
  confinement. The stated protection is "no application query path reads these tables,"
  asserted by an invariant test rather than enforced by the database. The weakest point in
  the data layer. Worth a pre-launch second look confirming the invariant test covers every
  module that can execute SQL.
- **Non-prod silently runs with RLS inert** — outside production, `db.ts` falls back to
  `DATABASE_URL` (BYPASSRLS owner). Any query path that forgets `runAsUser` leaks cross-tenant
  in dev/staging without erroring.
- **ENABLE-not-FORCE asymmetry on older user tables** — the FORCE hardening in migration 122
  covers only the five 100-block user-corpus tables. The ~16 older user tables keep the owner
  exemption. Runtime impact today is nil, but the posture is inconsistent.

### AI pipeline
- **Fallback response leaks unverified model output to the client** — `teach.ts:358` returns
  `kind: 'fallback'` with `violations: lastViolations`; `route.ts:91` spreads the whole result
  into the JSON response. Verifier violations include `span: block.quote` — the model's
  *rejected*, non-verbatim quote — unbounded. Breaks the "verifier-passed text only" guarantee.
  Fix: strip `span`/model-authored fields from the client response.
- **Lane relevance floor missing (B031, already filed)** — `retrieveRegisterLane`/`retrieveSongVerse`
  fall through to an unconstrained global top-3 by cosine with no score threshold. A question
  with no on-topic sermons/hymns still gets three labeled results presented as pertinent.

### Domain invariants
- **Stale-GET race on chapter switch** (`use-annotation-writes.ts:111-139`) — the annotations
  `fetch` has no `AbortController` and no staleness guard. Switch chapters quickly and the
  previous chapter's slower response can resolve after the new chapter's, overwriting
  `highlights`/`notes`/`bookmarks` with the wrong chapter's data.
- **`toggleBookmark` fires `fetch` inside a `setBookmarks` updater** — the file itself states
  the purity rule at line 231-234 and then breaks it. React may re-invoke updaters → duplicate
  POST/DELETE. Mitigated by server idempotency for bookmarks specifically.
- **Published-author boundary on commentary is client-side only** (`bible.ts:129-135`) — the
  static files hold the whole ingested corpus including filtered entries, publicly fetchable.
  If any filtered entry is ever license-restricted rather than merely unverified, this is not
  an enforcement point.

### Client
- **CSP is not an XSS backstop** — `script-src 'self' 'unsafe-inline' <posthog-assets>`.
  The file states this itself as a deliberate compromise for the inline theme script and
  App Router streaming bootstrap. The entire XSS defence rests on React escaping and
  `sanitizeSnippet`. A nonce/hash-based policy is the known follow-up.
- **HSTS not verified** — `Strict-Transport-Security` is absent from the header set in
  `next.config.ts`. Vercel sets it automatically on custom domains at the platform layer,
  but it's not verifiable from the config file.

### Ops and cost
- **Malformed env disables every limiter silently** — all caps are `Number(process.env.X ?? default)`.
  A typo'd value parses to `NaN`; `count > NaN` is always false, so the limiter passes everything.
  A `Number.isFinite` assert at module load would fail loud at boot.
- **Fixed-window boundary doubling** — burst of 2× limit at window edges. Known fixed-window
  property; acceptable for cost caps.
- **Hour cap contradicts minute cap** — `publicReadThrottle` overrides only `perMin`; the hour
  check still uses `GATE_LIMIT_PER_HOUR` (default 60/hour). A reader gets "120/min" but is
  hard-capped at 60/hour.
- **No global ceiling on public search** — unlike `/api/ask` (which has `ask:global:day`),
  public search has per-IP caps only. A distributed botnet is unbounded fleet-wide, and the
  only backstop (the limiter) fails open on the same DB being flooded.
- **No sampling on hot events** — `rate_limit_hit` logs one line per refused request. An active
  flood against public routes produces a log line per request, running up Vercel log-drain volume.
- **Alerting is assumed, not wired** — nothing in-repo defines an alert on `rate_limit_fail_closed`,
  `rate_limit_fail_open`, or the global-cap hit. If no drain query/alert exists in the Vercel
  dashboard, the fail-open breadcrumbs are write-only.
- **Preflight DB target is whatever the URL says** — the `embeddings.served` check reads
  `PREDEPLOY_DB_URL` or `~/.neon_prod_url` and asserts the column on whatever host that URL
  points at. No assertion the host is the production endpoint. A stale or dev URL yields an
  unearned green.

---

## What passes clean

- **Auth:** credential handling, OAuth callback validation, account-existence-oracle narrowing.
- **Cross-user authorization:** pathname shape regex, RLS on 30 tables, tenancy checks on both
  upload routes.
- **SQL injection:** every statement is a parameterized tagged template.
- **Quota:** enforcement is in-transaction under a per-user advisory lock. The TOCTOU and
  dedupe races are genuinely closed.
- **Licensing:** fail-closed and structurally enforced at retrieval, composition, and
  render-recall layers. Published-only re-assertion, serve-time provenance check, servability
  re-check on personal search, fail-closed tombstones.
- **Blob privacy:** private-by-construction, pathname-not-URL persistence, refusal to run
  tokenless, 403 on unauthenticated GET.
- **Clickjacking:** closed two ways (`frame-ancestors 'none'` + `X-Frame-Options: DENY`).
- **Rate limiting on spend:** fail-closed on the paid endpoints, minute-before-day ordering,
  zero-row guard.
- **Deploy gates:** clean-tree ×2, ancestry gate, pinned CLI, target/env assertions, identity
  verification, licensing ratchet, corpus identity/hash, served-asset completeness.

---

## Recommended before public launch

1. ~~Fix H-1 and H-2 in deploy.sh~~ — **done, all 59 gates pass.**
2. Strip `span`/model-authored fields from the fallback client response (AI pipeline).
3. Add a `Number.isFinite` assert on all env-parsed rate limits (ops-and-cost).
4. Verify alerting exists on `rate_limit_fail_open` and `rate_limit_fail_closed` (ops-and-cost).
5. Confirm the auth tables invariant test covers every module that can execute SQL (data layer).
6. Add a Blob lifecycle rule or sweeper for abandoned uploads (attack surface).
7. Reconcile the 120/min vs 60/hour public-read mismatch (ops-and-cost).
8. Consider a nonce-based CSP (client, follow-up).
