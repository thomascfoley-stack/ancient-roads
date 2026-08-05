# HANDOFF — get My Works (sermon upload + search) actually usable

Paste the block under "THE PROMPT" into a fresh session. Everything above it is context for you.

---

## What this feature is

`docs/pm/orders/2026-08-03-lane-b-slice1-uploader.md` names it exactly:

> **Lane B, Slice 1: the sermon uploader + the three searches + the tradition-gap join**

There is **no "sermon builder"** anywhere in the repo. The only "builder" is the *plan builder*
(`/plans`, study plans, a different Lane A feature). The user-facing name is **My Works** at
`/library/uploads`; the order forbids calling it "Sermons".

## State, measured 2026-08-05

- Branch `feat/lane-b-slice1-uploader` @ `cb18357`, **0 behind main, 45 ahead, NOT merged**.
- Live deployment `dpl_8WkTHr23pyHAFWzTgjQFM2g3Fhww`, aliased to `ancientpaths.app`.
- Migrations **100-104 applied to production** (`ep-odd-fog`) and recorded in `schema_migrations`.
- SEC-1 closed: `@neondatabase/auth` removed, Better Auth 1.6.26 self-hosted, email/password only.
- ~~Uploads switched ON: `MULTI_USER_UPLOADS = true` + `USER_CORPUS_MULTI_USER=true` in Vercel.~~
  **HALF FALSE, corrected 2026-08-05.** `MULTI_USER_UPLOADS = true` was committed, but
  `USER_CORPUS_MULTI_USER` **did not exist in Vercel production** — `vercel env ls production`
  listed no such row. So `uploadDenial` fail-closed on an empty allowlist and every signed-in user
  got a 403 and "Uploads are not available on this account yet." **This line is why the feature
  read as shipped while being dark**, and it is the shape to distrust: an env var recorded as set
  because the command exited 0. `vercel env add` ignores piped stdin; only `--value` writes.
  Now genuinely set, and driven in a browser.
- `RESEND_API_KEY` / `MAIL_FROM` set, but `MAIL_FROM=onboarding@resend.dev` only reaches the
  account owner. Password reset is therefore broken for everyone else. DNS records to fix it are in
  `docs/evidence/resend-dns-records.txt`; the deploy token is refused (`permission_denied`) so a
  human with domain rights must add them.

**Verified working through the API on production** (signup 200, upload 201, indexed `ready`, text
search 1 hit, passage search 1 anchor, tradition-gap 14 voices, delete cascade clean).

**The owner reports it does not work in the browser.** Treat the API evidence as insufficient: it
was gathered by calling endpoints directly, which cannot detect an unreachable or unusable UI.

## What went wrong, so it is not repeated

1. **My Works had no sidebar link.** It was reachable only from the `/library` index page, so it was
   live and invisible. Fixed at `e7ad76d`, but this is the shape of the bug to look for.
2. **Verification was done by URL and API, never by navigating the app.** A check that types the
   address it wants can never find a navigation defect. `THE_LOOP.md` §6 calls this unearned green.
3. **Signed-out state was a dead end** (heading + one sentence, no sign-in link), and
   `if (!r.ok) return;` left the page on "Loading…" forever for any non-401. Both fixed at
   `cb18357`; both had been live and unnoticed.
4. Time was spent on Resend/password-reset that the owner had not asked for.

## Read these, in this order

| Doc | Why |
|---|---|
| `CLAUDE.md`, `AGENTS.md` | standing rules; loaded automatically |
| `docs/pm/orders/2026-08-03-lane-b-slice1-uploader.md` | **the order.** 179 lines. Scope, naming, the three searches, the five things that ruin it |
| `docs/UPLOADER_DESIGN.md` | 372 lines. §4 the SEC-1 gate, §8 acceptance checks A1-A10 |
| `docs/SERMON_SEARCH_DESIGN.md` | 278 lines. The two spines, per-user vectors |
| `docs/SLICE_1_DATA_MODEL.md` | 123 lines. The four user tables |
| `docs/pm/MASTER.md` | the gate board; Lane B rows B0-B5 |
| `WORKLOG.md` (top entries) | 2026-08-05 entries cover everything above |
| `docs/DECISIONS.md` | ADR-100 to ADR-105 are this slice |

## The code

```
web/src/app/library/uploads/page.tsx          the page
web/src/components/my-works.tsx               the whole UI (upload, status, search, voices)
web/src/components/sidebar.tsx                the nav link (added late)
web/src/app/api/user-corpus/upload/route.ts   POST, multipart
web/src/app/api/user-corpus/documents/route.ts        list + queue depth
web/src/app/api/user-corpus/documents/[id]/route.ts   GET / POST retry / DELETE
web/src/app/api/user-corpus/documents/[id]/voices/route.ts   tradition-gap join
web/src/app/api/user-corpus/search/route.ts   q= text, ref= passage
web/src/lib/user-corpus/*                     sniff, parse, chunk, anchor, embed, queue, search
web/src/lib/user-corpus/access.ts             MULTI_USER_UPLOADS + owner allowlist
```

---

## THE PROMPT

```
Read CLAUDE.md and AGENTS.md first, then these, and do not characterise a document you have
not opened:

  docs/pm/orders/2026-08-03-lane-b-slice1-uploader.md   <- the order, start here
  docs/UPLOADER_DESIGN.md                               <- §4 gate, §8 acceptance A1-A10
  docs/SERMON_SEARCH_DESIGN.md
  docs/SLICE_1_DATA_MODEL.md
  docs/pm/orders/2026-08-05-handoff-my-works.md         <- state and known defects
  WORKLOG.md (2026-08-05 entries only)

The feature is "My Works" at /library/uploads: upload a sermon, search your own sermons, and
see which voices from the corpus speak on the passages you anchored. It is deployed to
ancientpaths.app and the API works, but the owner says it does not work in the browser.

YOUR JOB: make it usable by a real person, and prove it the way a real person would.

Rules for this task, because they were broken last time:

1. DO NOT verify by calling APIs or typing URLs. Drive the deployed site in a browser:
   land on the home page, find My Works using only what is on screen, sign in, upload a real
   file with the file picker, read the status, run both searches, open the tradition panel.
   If you cannot find it without knowing the URL, that IS the bug.
2. Test at 390px as well as desktop. Report what you SAW, with screenshots.
3. Loop tightly: one change -> deploy -> drive it in the browser -> report. Never batch.
4. Write as little code as possible. No new test files, no new docs, no refactors, no scope
   the owner did not ask for. Deleting is allowed; adding needs a reason.
5. Do not touch auth, Resend, email, DNS, or the tradition-gap internals unless a defect you
   observed in the browser leads there.
6. Production DB and deploys: deploy with `PREDEPLOY_DB_URL="$(cat ~/.neon_prod_url)" ./deploy.sh`
   from this worktree. Migrations 100-104 are already applied to prod; do not re-run them.
7. When you find a defect, say what you saw, what you changed, and what you saw after. No
   summaries of work not yet verified in a browser.

Start by opening https://ancientpaths.app in a browser as a signed-out visitor and telling me,
step by step, what a new user has to do to upload a sermon, and where that path breaks.
```
