# Launch Blockers & Decisions — 2026-08-29

Compiled for owner review. Items are marked **[DECISION]** (needs owner ruling), **[PERMISSION]** (needs credentials/access), or **[TABLED]** (parked with a recommended default).

---

## 1. SEC-1 — Public launch gating

**Status:** **RULED 2026-08-30 — waitlist-only (option C). Premise corrected 2026-08-30.**

**What was wrong with the original premise:** the claim that "an attacker who knows your email could take over your account" is GHSA-g38m, and it is **stale**. Production runs `better-auth@1.6.23` (`package.json:65`, re-verified 2026-08-23); g38m is patched ≥1.6.11 and qq9h ≥1.6.22, so neither fires. The eight remaining ignored GHSAs are provider-plugin advisories adjudicated not-in-path, or dev tooling.

**The real residual** is narrower: the "Verify at Sign-up" toggle is a Neon console setting this repo cannot observe, last attested 2026-08-08. `SECURITY.md` says in terms "Re-attest it, do not carry it forward." That console check — not the CVEs — is what should gate the public-launch call.

**Owner ruling (2026-08-30):** Keep the gate. Launch is waitlist-only: the marketing page collects emails, the owner invites readers a few at a time. No public sign-up until the Neon console toggle is re-attested.

**Owner action:** Re-attest "Verify at Sign-up" in the Neon console, then decide whether to open publicly.

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

**Status:** [FILED]
**What:** `adapter-loop.ts` reports completed works as "partial" when they use `section_embeddings` (the per-section model) instead of `embeddings` (the flat-chunk model). `openbible-topics` sat on the blocker list as "partial" when it was complete (6711 sections + 6711 section_embeddings).
**Recommendation:** The loop's completeness check should query both tables. File as a bug.

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
