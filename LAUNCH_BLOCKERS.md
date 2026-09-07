# Launch Blockers & Decisions — 2026-08-29

Compiled for owner review. Items are marked **[DECISION]** (needs owner ruling), **[PERMISSION]** (needs credentials/access), or **[TABLED]** (parked with a recommended default).

---

## 1. SEC-1 — Public launch gating

**Status:** **RULED 2026-08-30 — waitlist-only (option C). Premise corrected 2026-08-30.**

**What was wrong with the original premise:** the claim that "an attacker who knows your email could take over your account" is GHSA-g38m, and it is **stale**. Production runs `better-auth@1.6.23` (`package.json:65`, re-verified 2026-08-23); g38m is patched ≥1.6.11 and qq9h ≥1.6.22, so neither fires. The eight remaining ignored GHSAs are provider-plugin advisories adjudicated not-in-path, or dev tooling.

**The real residual** is narrower: the "Verify at Sign-up" toggle is a Neon console setting this repo cannot observe, last attested 2026-08-08. `SECURITY.md` says in terms "Re-attest it, do not carry it forward." That console check — not the CVEs — is what should gate the public-launch call.

**Owner ruling (2026-08-30):** Keep the gate. Launch is waitlist-only: the marketing page collects emails, the owner invites readers a few at a time. No public sign-up until the Neon console toggle is re-attested.

**Verify at Sign-up attested 2026-08-30 by Claude (owner-authorized), from the Neon console:**
production branch `br-nameless-brook-atzgh1gq` (Default). **ON** — verification method: code (not link).
Full auth config: Sign-up with Email ON, Verify at Sign-up ON (code), Sign-in with Email ON,
Google OAuth ON (shared keys), Email provider Shared (sender `auth@mail.myneon.app`),
Trusted domains `https://ancientpaths.app` only, Allow Localhost ON, Webhooks OFF, 7 users signed up.

**Owner ruling (2026-08-30, follow-up):** sign-ups stay open. No invite-only gate. Google OAuth
stays on Neon's shared keys until the owner sets up their own OAuth client. The console banner
"Anyone on the web can sign up for your app" is accurate — restricted signups aren't supported
by Neon; the gate (if any) is in app code, not Neon's.

**Three flags Claude raised (not blocking, owner's call when ready):**
- **Allow Localhost ON in production** — Neon's own text says this reduces security in production.
  Dev has its own branch; this can be turned off.
- **Google OAuth on shared keys** — consent screen shows Neon's app identity, not yours.
  Swap to your own client ID when you set up your OAuth app.
- **Email provider Shared** — fine for 7 users; verification codes will hit deliverability limits
  on a real batch, and the sender is `myneon.app`, not your domain.

**Owner action:** None blocking. The three flags are for when you're ready.

### 1a. Waitlist workflow — how to invite a reader

The waitlist is live and working. To invite someone:

```sql
-- Export the list (deduplicated, newest first)
SELECT DISTINCT ON (email) email, attribution->>'utm_source' as source, created_at
FROM waitlist
ORDER BY email, created_at DESC;
```

Then for each approved reader:
1. Send them a per-invite link (see §1b below — do NOT email the shared `SITE_PASSWORD`).
2. They sign in through the gate, then create their account via `/auth/sign-up`.

### 1b. Do NOT email the shared site password

The first version of this doc told the owner to email `SITE_PASSWORD` to each invitee. That is one credential with no per-user identity and no revocation short of rotating it for everyone — and it is the only barrier in front of the auth system the gate exists to protect.

The right shape is a per-invite token or a gate-level allowlist. Until that ships, the honest workaround is: share the password in person or over a voice call, never in writing, and rotate it after each batch of invitations.

## 2. D3 — Blob store write credential

**Status:** [PERMISSION]
**What:** The new public Blob store `ancient-paths-corpus` is deliberately not connected; needs owner token from the Vercel dashboard.
**Impact:** Corpus CDN writes are blocked.
**Recommendation:** Table until owner provides the token. No code change needed.

## 3. O-1 — Production password rotation

**Status:** [TABLED]
**What:** Prod password rotation deferred to January 2026 by owner ruling.
**Recommendation:** Do not re-raise before January 2026.

## 4. C6 — Auth migration waves

**Status:** [DECISION] + [PERMISSION]
**What:**
- T1/T2 wait on an auth migration that doesn't exist yet.
- T4 waits on an owner schema call.
- T3 code-complete but device leg NOT RUN.
- S1 needs owner-supplied content.
**Recommendation:** Table T1/T2/T4 until owner rules on schema. Run T3 device leg if credentials allow. S1 blocked on owner content.

## 5. Front-matter gating (#4)

**Status:** [DECISION]
**What:** Block all admitted hits or strong-only? Blocks merging `origin/wip/front-matter-strength`.
**Recommendation:** Default to strong-only (less false-positive risk). Merge when owner confirms.

## 6. `app_runtime` DB permissions on prod `embeddings`

**Status:** [PERMISSION]
**What:** `app_runtime` still has INSERT/UPDATE/DELETE on prod `embeddings`. REVOKE drafted but not applied.
**Recommendation:** Apply the REVOKE — it is a security hardening, not a behaviour change. Needs prod DB access.

## 7. K-2 CCEL-damaged sections

**Status:** [TABLED]
**What:** 1,937 CCEL-damaged sections (adapter fixed, data not repaired).
**Recommendation:** Schedule a repair ingest run for the affected works. Not a launch blocker.

## 8. A9 residuals

**Status:** [DECISION]
**What:**
- `calvin-crosswire` 2 clean unserved rows — serve or quarantine?
- `spurgeon-talks-to-farmers` dev→prod embeddings copy.
**Recommendation:** Quarantine the Calvin rows (safer default). Copy the Spurgeon embeddings if DB access allows.

## 9. F-151 — Jamieson re-ingest

**Status:** [DECISION]
**What:** 88% of Jamieson sections have scripture references stripped; owner-gated re-ingest.
**Recommendation:** Re-ingest with the fixed adapter. Not a launch blocker but affects quality.

## 10. G10 fork discharge

**Status:** [PERMISSION]
**What:** Needs a Neon fork; branch creation forbidden by standing rails.
**Recommendation:** Table until owner creates the fork.

## 11. PREDEPLOY_DB_URL pointed at dev for all production deploys

**Status:** [DECISION]
**What:** The served-column preflight (`predeploy-gate.ts:77`) requires `PREDEPLOY_DB_URL` to be the deploy target. For the last five production deploys it was exported from the worktree's `.env.local`, which contains only `ep-tiny-hat` (dev). Production is `ep-odd-fog`. The gate printed green about dev on every deploy.
**Impact:** Almost certainly harmless (migration 044 was applied to prod in P4.0), but the gate proved nothing and five receipts record it green.
**Recommendation:** The prod URL belongs in `~/.neon_prod_url` per `WORKLOG.md:6818`. Owner to confirm the prod URL is stored there and `deploy.sh` reads it from that file, not from `.env.local`.

## 12. `rootDirectory` flip is undocumented and unruled

**Status:** [DECISION]
**What:** Every CLI production deploy requires flipping the Vercel project's `rootDirectory` from `'web'` to `null`, deploying, then restoring to `'web'`. The WORKLOG called this "owner-ruled procedure"; `2026-08-24-revisit.md:302` records the same flip as "a third session's change, unruled" and at `:335` as "my error." No ruling exists.
**Impact:** The flip works and is restored each time, but it is an undocumented workaround repeated silently on every deploy.
**Recommendation:** Either rule it (document as the accepted deploy procedure) or fix it properly (make `deploy.sh` handle the `rootDirectory` mismatch without the manual flip).

## 13. Flaky licensing invariant

**Status:** [FILED]
**What:** `test/invariants/licensing.test.ts` timed out twice on 2026-08-30 and was dismissed as flaky both times. `CLAUDE.md` treats licensing as the existential gate — a flaky licensing test is how a real licensing failure gets missed.
**Recommendation:** The test needs a timeout budget review and possibly a dedicated DB endpoint or fixture to avoid the shared dev-branch contention. File as a ticket for the owner backlog.

## 14. Adapter-loop checks `embeddings` instead of `section_embeddings`

**Status:** **FIXED 2026-09-06** (Kimi Code ingestion session). `ingestState()` now counts BOTH
planes (`embeddings` flat + `section_embeddings` per-section) with `vectors = GREATEST(e, se)`;
a work with sections but zero vectors in either plane no longer classifies `done` (the 668-work
prod false-done), and `openbible-topics` no longer false-partials. Red-proofed both directions;
8/8 new tests in `test/invariants/adapter-loop-ingest-state.test.ts`; root suite 1020 green.
The follow-up measurement this fix enabled: **no published work is retrieval-dead** — all 228
works lacking `section_embeddings` are fully served via flat `embeddings`, and no serving path
in `web/src` reads `section_embeddings` at all (it only feeds `history_embeddings` backfills).
The 46,831-vector backfill is therefore optional hygiene, not a launch issue — decide whether
that table has a planned consumer before spending the run.

---

## 17. The static shelf path has no publish gate (filed 2026-09-07)

**Status:** [FILED] — same failure class as ADR-029, different door, and no gate sees it.
**What:** `register-writer.ts:146,358` writes reader entries into
`web/public/commentaries/` AT INGEST TIME, while the work is still `status='staged'`.
The DB path gates serving on `status='published'` AND `served`; the static shelf path has
no equivalent — anything ingested is shelf-materialized immediately, one `corpus-blob-sync`
away from serving. Measured consequence (2026-09-07): the wave 1–3 ingests materialized
454 chapter files including three ADR-029-HELD works (`schaff-anf06/07/08`) and
`bennett-expositor10`; only a deploy-time freshness STOP and a manual restore stood
between those files and misattributed text on the live shelf.
**Recommendation:** register-writer should not write shelf entries for staged works (or
the materialization step should filter on `status='published'` at sync/read time).
Whichever lands, red-prove it with a staged work whose shelf file must NOT change at
ingest. Until then: **any full `corpus-blob-sync --execute` while staged works exist will
carry them to the CDN** — syncs must stay scoped, or the shelf materialization must be
restored from a clean tree first (the 2026-09-07 restore pattern).

---

## 15. Post-launch queue — deferred mediums (filed 2026-08-31, pre-open pass)

**Status:** [TABLED] — deliberately NOT fixed before opening. Batching them into the launch-eve
deploy risks a fresh regression; each is real and should be worked after the doors open.

From the 2026-08-31 deep audit (`docs/evidence/deep-audit-2026-08-31.md`), deferred:

- **Orphan-blob sweeper** — presign → PUT → never complete leaves unbilled blobs.
- **CSRF `includes()` substring match** on origin checking.
- **Auth-table RLS posture** — `auth_accounts.password` protected by an invariant test rather
  than the database. **First-week item** (weakest point in the data layer per the audit).
- **CSP nonce** — CSP is not currently an XSS backstop.
- **ENABLE-vs-FORCE asymmetry** on the 16 older user tables.
- **HSTS verification** not done.
- **`toggleBookmark` impure updater** — fetch inside a setState updater.
- **Log sampling on hot events** — no sampling; log volume/cost unbounded.

Promoted OUT of the deferred list and FIXED pre-open (2026-08-31): the **stale-GET race on
chapter switch** — on re-examination it was not display-wrong data but a misdirected DELETE
that silently destroys a real annotation (fix + regression test in
`web/src/lib/use-annotation-writes.ts` / `web/test/invariants/annotation-stale-chapter-load.test.tsx`).

New findings from the 2026-08-31 pre-open pass itself, filed here:

- **Persisted `span` in historical research rows (data at rest) — DOWNGRADED.** The fallback
  strip (item 1 of the pre-open pass) stops NEW writes, and on independent check the old
  rows are unreachable from the app: nothing renders violations from research history and
  `app_runtime` holds no SELECT on `ask_outcomes`. Scrub whenever convenient; not a launch
  issue.
- **`deploy.sh` `get_root_directory` maps any non-project JSON to `'null'`.** With an expired
  Vercel token the API returns an error body; `get_root_directory` reads it as `rootDirectory
  null`, so the flip-proof passes VACUOUSLY and the flip never actually happened. Mitigation
  until hardened: run `npx vercel whoami` before `deploy.sh` so the CLI refreshes the token
  (observed 2026-08-31: `auth.json` token expired; `whoami` refreshed it). Hardening =
  treat error responses as `unknown`, not `null`.
- **A test that could not fail, guarding the upload budget (FIXED 2026-08-31).** The
  `tsconfig.test.json` type error at `upload-direct-guards.test.ts:161` was TypeScript
  correctly reporting a broken test: a nested `completeReq(completeReq(...) as never)` meant
  the route was never invoked and the assertion passed unconditionally — and the request
  never reached the limiter anyway (non-UUID pathname rejected pre-limiter). The
  bucket-independence guarantee (every upload burns one of each budget, not two) had no
  working test while the suite reported 6/6. Fixed with per-limiter call counters and
  red-proved (shared bucket → "expected 2 to be 1"). Remaining risk class: other `as never`
  casts in the suite may hide similar can't-fail assertions — one false-confidence-audit
  pass in week one.

## 16. Item 12 addendum — the `rootDirectory` flip, further documented (2026-08-31)

Still unruled, but the mechanism is now better understood: the flip/restore reads the RAW
`token` field from the CLI's `auth.json`, which expires independently of the CLI (the CLI
auto-refreshes via `refreshToken`; the raw field goes stale). A stale token silently turns
every flip/restore into a 403 swallowed by `|| true`. The H-2 GET-before/after assertions
catch a failed restore only when the token is valid. See the `get_root_directory` finding
above. This strengthens the case for ruling item 12.

---

## Bugs closed in this session

- F-112 (password reset session revocation)
- F-121 (clear-then-recolour race)
- F-162 (commentary panel retry)

## Bugs still open (from UX verification)

- F-119 — changing highlight colour leaves old row behind
- F-120 / F-125 — silent annotation loss on failed save
- F-117 / F-152 / F-136 — list caps print page size as total
- F-134 — uploads advertise 25 MB; Vercel's platform body cap rejects 6 MB (413 confirmed). Fix is a client-direct Blob upload, not config. See UX_RUNTIME_VERIFICATION.md.
- F-145 — notes/bookmarks invisible in reader
- F-143 — multi-verse copy takes only first verse
- F-144 — reader does not restore scroll
- F-164 — commentary text cannot be copied with attribution
- F-165 / F-138 / F-154 / F-149 — attribution inconsistencies
- F-157 — eleven surfaces share title "Ancient Paths"
- F-147 / F-148 — teacher no-coverage state and fallback rate
- F-170 / F-174 / F-176 / F-175 / F-141 / F-139
- F15 / SR-004 / L-2 — typed reference on /search returns text matches, no verse jump

## Pre-existing test failures (red before this session)

- `test/invariants/annotation-write-failure.test.tsx:241`
- `test/invariants/date-locale-and-plan-title.test.ts:105`
