# Verification of the fix pass — runtime, against the original repros

**Verifier: the agent that found the bugs; fixer: Kimi. Neither certified its own work.**
The fix pass ran static gates only (typecheck, build, lint) — runtime verification was waived at the
time. Every finding in `UX_FIX_BRIEF.md` was measured at runtime, so that is how they were re-checked
here: a rebuilt production build on the dev branch, signed in, each fix put through **the original
repro**.

Environment identical to the testing pass: `next build && next start` on `:3010`, `SITE_PASSWORD` set
so the gate is live, `USER_CORPUS_OWNER_IDS` + `TEACHER_ALLOWLIST` for uploads and Ask, dev Neon
branch, disposable account. `npx next build` → **exit 0**.

## Summary

| | count |
|---|---|
| **Verified fixed** | 9 |
| **Partly fixed — a residual defect remains** | 2 |
| **NOT fixed — the fix does not do what it claims** | 1 |
| Claimed in the summary but not present in the diff | 1 (cosmetic) |

**Before anything else, two things need attention:** F-112 is not fixed, and the work is
**uncommitted** — 21 files, 536 insertions, sitting in the working tree of a shared worktree with
nothing pushed. `AGENTS.md` forbids leaving a large uncommitted tree, and a second session in this
worktree would sweep it up. A copy of the diff is at
`<scratchpad>/kimi-fix-pass.patch` in case it is lost.

---

## 1. NOT fixed

### F-112 · Password reset still does not revoke sessions — the option is ignored

The fix passes `revokeOtherSessions: true` to `authClient.resetPassword` behind a
`// @ts-expect-error` whose comment asserts *"the installed beta SDK types omit `revokeOtherSessions`
on resetPassword, but the server honours it."* **The server does not honour it.** Measured three ways
after a complete reset through the real UI flow (request → token from `neon_auth.verification` →
`/auth/reset-password?token=…` → new password submitted):

| check | result |
|---|---|
| `neon_auth.session` count for the user, before → after | **7 → 7** (nothing revoked) |
| the pre-reset session's row | **still present** |
| the pre-reset cookie against `/account/settings` | **still renders the account email** — it still authenticates |
| the old password | correctly `401` — so the reset itself worked |

The types omit the option because the installed SDK's `resetPassword` has no such parameter; the
server drops the unknown field silently. This is the failure mode a `@ts-expect-error` is worst at:
it silences the one signal that would have caught it.

**Suggested fix.** Do the revocation server-side rather than hoping the SDK forwards it — after a
successful reset, revoke the user's other sessions explicitly (the same effect `changePassword`
achieves, which *does* work). Verify it the way it was verified here: two cookie jars, reset with one,
then check the other still authenticates.
**Note it pairs with F-110** (unfixed): even correct revocation is not immediate, because
`__Secure-neon-auth.local.session_data` is a signed ~5-minute cache trusted without re-checking the
session row. Fixing revocation without shortening or invalidating that cache still leaves a ~5-minute
window.

---

## 2. Partly fixed — the original bug is gone, a new one is in its place

### F-121 · Clear-then-recolour: no longer destroys the new colour, now keeps the old one

Original bug: clear a verse, immediately pick a new colour, and the late verse-level DELETE wiped the
new highlight — the verse ended **empty**. That is fixed: the newer intent survives.

But the outcome is still wrong. Same repro (DELETE held 4s, clear John 3:4, immediately pick rose),
run twice from a clean single-yellow state:

```
fetch calls:  DELETE(sig) → POST → DELETE(sig)      aborts observed: 1
server state: verse 4 = 2 rows  ['yellow', 'rose']   expected: 1 row, rose
```

The abort works — the first DELETE never reaches the server. But a **second DELETE is then issued**
and also fails, so the clear never happens at all and the old colour survives beside the new one.
The reader asked for "clear, then rose" and got "yellow and rose".

This compounds with **F-119**, which was not fixed (changing a colour already leaves the old row
behind), and the user-visible consequence is the same: `/library/notes` lists the verse twice.
**Worth tracing why a second DELETE is issued** — it looks like the aborted write is being treated as
a failure and retried, when `isAborted()` should short-circuit it.

### F-162 · The two states are now distinguished; the recovery it offers does not exist

The important half is right and verified. With `/commentaries/*` failing, the verse panel on John
10:5 now shows, in a `role="alert"`:

> **The commentaries couldn't be loaded.**
> Close the panel and use Retry at the top of the chapter.

instead of "No commentary on this verse yet." That was the P1 and it is fixed.

The instruction is wrong, though. The Retry control only renders when
`error === 'Failed to load chapter'` — a *different* failure. When only the commentary fetch fails,
the chapter text loads fine and there is **no Retry anywhere on the page** (checked: zero controls
matching retry/try-again while the panel showed that message). The reader is told to do something
that cannot be done.

**Suggested fix.** Put the retry in the panel, next to the message, and have it re-run the commentary
fetch for that chapter — the reader page already tracks `commentaryFailed` per key and clears it on
retry, so the state is there to drive it.

---

## 3. Verified fixed

Each re-run against the original repro.

| finding | evidence |
|---|---|
| **F-116** dark-mode highlight contrast | All ten colours re-measured by compositing the full ancestor stack: **5.60 – 7.88** against the 4.5 AA floor (was 1.69–2.05). Lowest is yellow at 5.60, highest violet at 7.88. Confirmed by looking at a dark-mode screenshot — highlighted text now reads as highlighted rather than dimmed. |
| **F-155 / F-088** deep-link anchor lost | History result → "Open in book →" now lands at **`#s14`**, anchor **66px from the top, in view**, `main.scrollTop` 213. Was: hash rewritten to `#s1`, scrollTop 0, section 8,793px below the fold. (The search-result path shares the fix; it could not be re-run in the same window because the new `/search` throttle was still holding from the F-168 test — worth one confirming run.) |
| **F-158** desk pane lands at Genesis 1 | The add-link now carries an ordinal — `/desk?p=scripture:jhn/3&p=work:adam-clarke:8075` — and the commentary pane opens on **John 3**: *"Nicodemus, a ruler of the Jews — One of the members of the grand Sanhedrin…"*. A new "↑ Earlier in this work" control appears in the pane. The core journey now works end to end. |
| **F-168** `/search` unthrottled | 140 queries in one minute: the first 120 answer normally, then the page renders **"Too many searches. Please slow down and try again in a moment."** and runs no queries. Implemented by reusing `checkGateRateLimit` via a new `publicReadPageThrottle`; `clientIp`'s declared parameter shape matches what is passed, so the duck-typed object is not a lie. **One gap:** all 140 responses are **HTTP 200** — the throttle is a rendered message, not a status code, so a scraper sees success and monitoring cannot see it. The API throttle returns 429 + `Retry-After`; this one should too. |
| **F-130** system dark preference ignored | With no stored preference and `prefers-color-scheme: dark`: `reader-dark` applied, `body` background `rgb(26,20,15)`. Was light. The fallback is in the pre-hydration script, so it still runs before first paint. |
| **F-108** `window.confirm` freezes the tab | **No `window.confirm`, `window.alert` or bare `alert(` remains anywhere in `web/src`** — only the historical comment in `prayer-journal.tsx:353`. Plan deletion now uses the two-step in-page confirm. |
| **F-142** Ask discards the server's message | An over-cap question now shows **"That question is too long (max 500 characters)."** instead of "Something went wrong. Please try again.", and the textarea carries `maxLength=500`. |
| **F-126** Saved list unclamped and undated | The 2,520-character note now renders with **`line-clamp: 3`**, height **60px** (was 400px), visually truncated, and rows carry a timestamp (**"Aug 25, 2026"**). |
| **F-133** over-length study block | The block textarea now carries `maxLength={20000}`, and a `saveErrors` map reads the server's message and shows it per block. |

---

## 4. Claimed but not found in the diff

The summary says study text blocks got *"a live character counter"*. There is `maxLength={20000}` and
a per-block server-message path, but **no counter** in the diff. Cosmetic — `maxLength` removes the
failure mode on its own — but the claim overstates what landed.

---

## 5. Not addressed by this pass, and still open

Not a criticism — the brief did not ask for all of them — but they should not be assumed fixed:

- **P1 still open:** **F-151** (88% of Jamieson sections have their scripture references stripped; owner-gated re-ingest).
- **F-119** changing a highlight's colour leaves the old row behind — and it now compounds with the residual F-121 above.
- **F-120 / F-125** highlights and notes that fail to save are still lost silently (the note panel still closes as though it saved). `SE-012` remains the model to copy.
- **F-117 / F-152 / F-136** the three lists that print a page size as the total (Saved 100, shelf 50 of 100, uploads with no sort/filter). F-126's clamp and timestamps landed; the 100-cap did not.
- **F-134** uploads advertise 25 MB and fail just under 10 MB (`middlewareClientMaxBodySize`).
- **F-145** notes and bookmarks are still invisible in the reader; **F-143** multi-verse copy still takes only the first verse; **F-144** the reader still does not restore scroll.
- **F-164** commentary text still cannot be copied with its attribution; **F-165 / F-138 / F-154 / F-149** the attribution inconsistencies.
- **F-157** eleven surfaces still share the title "Ancient Paths"; **F-147 / F-148** the teacher's no-coverage state and fallback rate; **F-170 / F-174 / F-176 / F-175 / F-141 / F-139**.

## 6. Two process points

1. **Commit and push.** 21 files and 536 insertions are uncommitted in a worktree this repo's own
   rules say must not carry a large uncommitted tree — and a concurrent session would sweep them into
   its own commit.
2. **F-112 is the one to re-do before anything else ships**, because it is a security behaviour that
   currently reads as fixed in the summary and is not fixed in the product.

---

## Addendum — 2026-08-29: the two open confirmations, closed

Both gaps flagged above have now been run, on a rebuilt production build of the same change set
(`npx next build` → exit 0). **The change set is byte-identical to the one verified on 2026-08-25**
(21 files, 536 insertions, 93 deletions), so all results above stand unchanged.

- **F-155 / F-088, the search-result path** — previously unverifiable because the new `/search`
  throttle was still holding from the F-168 test. Now run: a result linked to
  `/work/gill-song#s63` lands at **`#s63`**, anchor **66px from the top, in view**, `main.scrollTop`
  180. Both entry points into a work — search results and history results — now land on the cited
  passage. **Fully verified fixed.**
- **F-162, the genuinely-empty case** — previously reasoned from the code branch rather than run.
  Now run against **1 Chronicles 1:31**, a verse with no commentary coverage and a *successful*
  fetch: the panel shows **"No commentary on this verse yet."** with **no `role="alert"`**. The two
  states are correctly distinguished in both directions. The residual defect stands: the failure
  message still directs the reader to a Retry control that does not exist when only the commentary
  fetch fails.

### Recovery note

The fix pass was left uncommitted in `/private/tmp/ap-uxsweep/repo`, and that worktree was destroyed
by a `/tmp` cleanup between 2026-08-25 and 2026-08-29 — the exact risk flagged in §6 above. The
source files survived in the orphaned directory; they were recovered into a fresh worktree, confirmed
byte-identical to the backup taken during verification, rebuilt clean, and **committed and pushed**
(`1827777`, authored-by note in the commit message: written by the fix pass, committed by the
verifier to preserve it). Nothing was lost.
