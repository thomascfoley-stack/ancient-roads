# Research threads can be deleted — and why that amends I-1

**Filed:** 2026-08-17 · **Lane:** C · **Status:** built, on `fix/q1-signed-out-state`, not deployed
**Prompted by:** [`AUTHENTICATED_QA_REPORT.md`](../../evidence/qa-fleet-2026-08-16/AUTHENTICATED_QA_REPORT.md)'s
outstanding action item — nine QA-generated threads on the owner's real account with no way to
remove them.

This is short because the change is small. It exists because the change touches a **hardened
product invariant**, and CLAUDE.md requires the argument to be written down before the code, not
after.

## The problem

Every `/ask` submission persists a research thread (UX-4, working as designed). Nothing could
remove one: no control in the sidebar, none on the thread page, and no endpoint — the QA pass
tried `DELETE /api/research/{id}` and `DELETE /api/ask/{id}` and got 404 from both. The same pass
found the identical shape on highlights, Studies and bookmarks. **Four features that create and
never delete.**

## What I-1 actually forbids

`research-history-static.test.ts` I-1 forbade every write verb under `/api/research`, in any
export form, hardened against three proven evasions after an adversarial inspection. Its reason is
stated precisely in the test:

> a client that could write history rows could store text that later re-renders as Ancient Paths
> output, attributed, in the product's typography

**That is a claim about originating content.** It is the right rule and it still binds
POST/PUT/PATCH everywhere under `/api/research`.

A DELETE cannot originate content. It removes rows; it never authors one. No text can enter the
assistant-attributed render path through it. The assistant row is still written in exactly one
place — inside `/api/ask/stream`, from the object `teach()` returned — and that is untouched.

So the amendment is narrow, and deliberately per-route rather than global:

| Route | GET | DELETE | POST/PUT/PATCH |
|---|---|---|---|
| `/api/research` (list) | required | **forbidden** | forbidden |
| `/api/research/[id]` | **forbidden** | required | forbidden |

**The `[id]` route must not export GET, and that is now pinned.** An `/api/research/[id]` route
existed once and was deleted (I1-M4) because it returned stored answers with no servability data —
a §4.4 bypass, where a quote whose source has since been unserved would render anyway. Re-adding a
GET reintroduces exactly that. The old invariant had no reason to pin its absence; this one does.

Red-proofed three ways: a GET on `[id]` → red; a POST on `[id]` → red; a DELETE on the list route
→ red. Restored → green.

## Design decisions worth stating

**Hard delete, not `is_archived = true`.** The column exists and `listThreads` already honours it,
so a soft delete would have been one word. It would also make "delete" a lie — the reader's
question text would still be on the account after the product said it was gone. The action item
that prompted this is about rows on a real account; hiding them does not discharge it.

**Idempotent: always 204.** Not 404-vs-204. Two reasons, the second stronger: it is what DELETE
means (re-issuing must not start failing), and it leaves **no existence oracle** — a 404/204 split
would answer "does this id exist and is it mine?" for any id a caller tried. `getThread` already
collapses absent and not-owned; this collapses one case further, and can, because the caller has
nothing to render either way. It also avoided adding a `NOT_FOUND` code to the API error contract.

**Messages are deleted explicitly, though `messages.chat_id` is `ON DELETE CASCADE`.** A
referential action runs as the table owner and bypasses RLS, so leaning on it would make a
constraint this module does not own the only thing standing between a thread's turns and deletion.

**The messages delete carries an `EXISTS` persona fence, and it is load-bearing.** `chats` holds
more than research threads. Without it, calling with the id of a non-research chat the caller owns
would empty its messages while the chat row survived the persona fence — a thread with no turns
and no error. Caught while writing the first version of this function, not by a test.

**No migration.** `chats`/`messages` are in `db/schema.sql` and predate migration 032's narrowing
of the default privileges, so migration 001's `GRANT … DELETE ON ALL TABLES` covers them. This is
the C3 failure mode (`plan_days` UPDATE, `plans` DELETE) checked for and found absent — not
assumed.

## A defect this surfaced in a different guard

`routeSpendsMoney` in `test/helpers/routes.ts` matched source text **without stripping comments**,
so a route that merely NAMED `teach()` in prose was classified as a money-spender and then failed
the wallet invariant for not calling a rate limiter it has no reason to call. The new DELETE route
did exactly that, in a comment explaining where the assistant row *is* written.

Fixed by stripping comments first — the same lesson `research-history-static.test.ts` had already
learned from the other direction. The pressure the bug created is the wrong way round: it teaches
people to reword an accurate comment to appease a test. Red-proofed: a real ungated `teach()` call
still fails.

## Not done

- **The other three delete gaps stay open**: highlights (removal exists in the study panel's
  `clear` control but not in the selection popover where the highlight was created — a
  discoverability defect, not a missing capability), Studies (`DELETE /api/studies/[id]` exists,
  no UI), bookmarks (annotations DELETE exists, no UI). All three are UI work over working
  plumbing, which is a different and smaller slice than this one was.
- **Nothing is deployed, and the nine threads are still on the account.** Removing them is the
  owner's action once this ships.
