# Plan — next steps, for Claude review before any code changes

**Current live:** `76c73be` on ancientpaths.app. The direct-to-Blob upload slice is
sound: auth, CSRF, tenancy, separate rate-limit budgets, quota pre-flight plus real
enforcement, blob cleanup on every failure path including 429. 25 MB uploads work,
verified at 6 MB end-to-end.

**Pushed but not deployed:** `f867a97` — the api-error.ts regression Claude found.

---

## 1. Revert the api-error.ts regression (small, zero risk)

**What:** `f867a97` imported `next/server` into `api-error.ts` and switched the return
to `NextResponse`, contradicting the module's own header ("Uses the global Web Response,
NOT NextResponse — so this stays framework-free and unit-testable outside Next").

**Fix:** Revert `api-error.ts` and `csrf-floor.ts` to `Response`. Drop
`: Promise<NextResponse>` from the two new routes. The codebase convention is no return
annotation on route handlers (`messages/route.ts`, `studies/route.ts`, etc. are all
`export async function POST(req: NextRequest)` with inferred types).

**Cost:** Nothing. `f867a97` is not deployed.

---

## 2. RLS under Neon Auth — prove it or hold invitations (blocking)

**What:** MASTER.md C5 — RLS under Neon Auth is unproven. Two accounts, an hour.
This is the only item where being wrong is unrecoverable.

**Fix:**
- Create two test accounts on the dev branch.
- Verify `runAsUser` scoping: account A cannot read account B's documents, notes,
  highlights, bookmarks, prayers, or studies.
- Verify the four user-corpus tables (documents, sections, embeddings, anchors)
  enforce per-user RLS through the API, not just by convention.
- Verify the annotations API enforces per-user RLS.

**Owner action:** None. I can run this with the existing dev credentials.

---

## 3. Verify at Sign-up in the Neon console (blocking, two minutes)

**What:** SEC-1 rests on this toggle. Last attested 2026-08-08, three weeks stale.
`SECURITY.md` says "Re-attest it, do not carry it forward."

**Fix:** Owner checks the Neon console → Auth → Email → "Verify at Sign-up" is ON.
Screenshot or paste the toggle state into `LAUNCH_BLOCKERS.md`.

**Owner action:** Two minutes in the Neon dashboard.

---

## 4. Test coverage for the live upload path (follow-up, not blocking)

**What:** The quota, rate-limit, and SEC-1 gate suites still guard the old
`/api/user-corpus/upload` route. The new two-call flow (upload-url → PUT →
upload-complete) has no test coverage for these guards.

**Fix:**
- `upload-quota.test.ts`: add a suite for the pre-flight `checkUploadQuota` in
  upload-url and the real enforcement in upload-complete.
- `upload-rate-limit.test.ts`: add a suite for both buckets (`corpus-upload:*` and
  `corpus-complete:*`).
- `sec1-upload-gate.test.ts`: add a suite for the SEC-1 gate on the new routes.

**Cost:** ~100 lines of test code. Not blocking — the guards are in place and the
old suites still pass against the old route.

---

## 5. File, don't fix (two items)

### 5a. Flaky licensing invariant

`test/invariants/licensing.test.ts` timed out twice on 2026-08-30 and was dismissed
as flaky. Claude is right: a flaky licensing gate is how a real licensing failure
gets missed. File as a ticket: the test needs a timeout budget review and possibly
a dedicated DB endpoint or fixture to avoid the shared dev-branch contention.

### 5b. Adapter-loop checks `embeddings` instead of `section_embeddings`

`adapter-loop.ts` reports completed works as "partial" when they use
`section_embeddings` (the per-section model) instead of `embeddings` (the flat-chunk
model). `openbible-topics` sat on the blocker list as "partial" when it was complete.
File as a bug: the loop's completeness check should query both tables.

---

## 6. Remaining corpus work (tabled, not blocking)

- `spurgeon-treasury` — archive.org has the text. Needs a new adapter profile.
- `vincent-word-studies` — archive.org has the text. Needs a new adapter profile.
- Both are the tail, not the body. 800/890 works are complete.

---

## Proposed order

1. **Revert api-error.ts regression** — commit + push only, no deploy needed.
2. **RLS proof** — I run it against dev, report back.
3. **Verify at Sign-up** — owner checks console, records result.
4. **Deploy** — if RLS and Verify at Sign-up both pass, deploy through the fixed path.
5. **Test coverage for new upload routes** — follow-up PR.
6. **File the two items** — tickets for the owner backlog.

**Claude: does this order and scope look right?**
