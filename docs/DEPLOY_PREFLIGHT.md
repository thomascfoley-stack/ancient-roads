# Deploy preflight — ordered sequence before `./deploy.sh`

Non-git uploads, rollback semantics, post-deploy checks. Complements `docs/DEPLOYMENT.md` and
`docs/RECOVERY.md` §2 (frontend-only rollback).

## Ordered sequence

1. **Clean tree** — `git status` clean; no uncommitted corpus or env files.
2. **Branch / SHA pinned** — record commit in `WORKLOG.md` before deploy.
3. **Corpus on disk** — `web/public/commentaries` present; forbidden-provenance count = 0.
4. **`DEPLOYING=1 npx tsx scripts/predeploy-gate.ts`** — corpus identity ratchet, verse-key gate, licensing.
5. **Non-git uploads** — Vercel env vars (`DATABASE_URL`, `APP_DATABASE_URL`) verified in dashboard; static corpus ~380 MB uploaded with deploy bundle (not in git).
6. **`./deploy.sh`** — local build + `vercel --prod` from `web/` (only authorized prod deploy path).
7. **Post-deploy G4 check (manual)** — if schema post-025: confirm note/highlight write path on deployed build (G4 window may be OPEN until code matches schema — see STATE_OF_TRUTH §2b).
8. **Post-deploy G7 check (optional)** — `CUTOVER_ASK_URL` + session cookie; known-good query returns `kind='composed'` with ≥2 voices.

## Rollback semantics

- **Vercel Instant Rollback** — restores frontend bundle only; same `DATABASE_URL`; does **not** undo migrations or DB content. See RECOVERY.md §2 honest note (pre-cutover bundle vs post-031 schema).
- **Database** — not rolled back by deploy; use RECOVERY.md §1 snapshot path (owner call).

## What this is not

- Not a substitute for cutover gate G1–G10 during E0–E6.
- Not authorization for prod DB writes or publish flip.
