# Launch Blockers & Decisions — 2026-08-29

Compiled for owner review. Items are marked **[DECISION]** (needs owner ruling), **[PERMISSION]** (needs credentials/access), or **[TABLED]** (parked with a recommended default).

---

## 1. SEC-1 — Public launch is blocked by Neon Auth CVEs

**Status:** **RULED 2026-08-30 — waitlist-only (option C).**
**What:** The site-password gate stays up until the `@neondatabase/auth` / better-auth CVEs resolve. This IS the public-launch decision.
**Impact:** Nothing reaches `/api/ask` while gated; Phase-D training data is blocked.
**Owner ruling:** Keep the gate. Launch is waitlist-only: the marketing page collects emails, the owner invites readers a few at a time. No public sign-up until the CVEs patch.
**Owner action:** Export waitlist emails and send invitations manually (see §1a below).

### 1a. Waitlist workflow — how to invite a reader

The waitlist is live and working. To invite someone:

```sql
-- Export the list (deduplicated, newest first)
SELECT DISTINCT ON (email) email, attribution->>'utm_source' as source, created_at
FROM waitlist
ORDER BY email, created_at DESC;
```

Then for each approved reader:
1. Send them the site password (`SITE_PASSWORD` in Vercel env) and the URL `https://ancientpaths.app`.
2. They sign in through the gate, then create their account via `/auth/sign-up`.

No code change needed — the flow works today.

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

---

## Bugs closed in this session

- F-112 (password reset session revocation)
- F-121 (clear-then-recolour race)
- F-162 (commentary panel retry)

## Bugs still open (from UX verification)

- F-119 — changing highlight colour leaves old row behind
- F-120 / F-125 — silent annotation loss on failed save
- F-117 / F-152 / F-136 — list caps print page size as total
- F-134 — uploads advertise 25 MB, fail at ~10 MB
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
