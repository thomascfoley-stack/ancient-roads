# Claude Code prompts — Ancient Paths remediation

Setup: put `UX_REMEDIATION.md` at `docs/UX_REMEDIATION.md` and append `CLAUDE.snippet.md`
to your `CLAUDE.md`. Then use the prompts below in order.

---

## Session 1 — Recon only (paste this first)

```
Read docs/UX_REMEDIATION.md end to end, then read section 0 again before you touch anything.

This session has exactly one job: complete block R0 (Repo reconnaissance, section 3). Nothing else.

R0 exists because this spec was written from OUTSIDE the codebase — from a live walkthrough of
the running app and a UX audit deck, with no repository access. Several blocks assert that
something already exists and can be reused: a skeleton loader component, a book display-name
map, an Ask failure-state component, an account record that already persists notes. Those are
inferences, not facts. Your job is to confirm or kill each one.

Do:
- Fill in every row of the R0 table with a real file path, or an explicit "does not exist".
- For each "does not exist", flag the dependent block in section 8 (Backlog) with a revised
  estimate, per R0's exit test.
- Write your findings into R0's Findings log in the doc itself.
- Update the status board in section 1.

Do not:
- Do not change any product code. R0 ships no behaviour change — that is in its exit test.
- Do not start any fix block, even if a fix looks trivial while you are reading.
- Do not skip rows that seem unimportant. Later waves' effort estimates depend on them.

Report back with:
1. The completed R0 table.
2. Which "reuse the existing X" claims turned out to be FALSE. This is the most important
   output — each one means a later block needs rescoping.
3. Anything the spec asserts about this codebase that is simply wrong in a way that changes
   the plan.
4. Which block you recommend running next, and why.

Then stop and wait. Do not proceed to Wave 1.
```

---

## Session 2 — INSTR (the block that decides sequencing)

```
Read docs/UX_REMEDIATION.md section 0 and the INSTR block (section 4).

Complete INSTR only. It ships no user-visible change — that is in its exit test.

Pay particular attention to the sequencing question inside INSTR's exit test. Reading the
actual HTTP status on the failing plan-progress write decides whether the auth migration has
to precede L2 or not. Do not guess it; read it and write the answer into the Findings log.

For the Ask failure: capture which of the two documented failure modes actually fires, and at
which of the three stages the request dies. Both were observed by different reviewers, so
either answer is plausible — I need the one that is true for this build.

If Sentry is already in place, route the four capture points through it instead of console.
If it is not, use console plus a saved HAR and do not wait for Sentry — INSTR is scoped to
hours precisely so that Wave 1 does not queue behind tooling setup.

Report the four captured failures, the sequencing answer, and stop.
```

---

## Per-block prompt (use for every fix block)

```
Work block <BLOCK-ID> from docs/UX_REMEDIATION.md. That block only.

Follow section 0's loop:
1. Write the exit test as a runnable check BEFORE touching product code.
2. Make only the changes in "Minimal change".
3. Run the test. If it fails, change the fix — never the test.
4. Verify in the real UI.
5. Run the exit tests of any block sharing the same surface.
6. Commit on branch fix/<BLOCK-ID> and update the status board in section 1.

Obey the block's "Do NOT" list literally. Those are guardrails, not suggestions — a change
that violates one gets reverted even if it works.

Stop and report instead of pushing through if:
- the minimal change needs more than ~3 files or ~50 lines
- a "reuse the existing X" instruction turns out to be false
- the fix requires a route, schema, or API contract change
- the real root cause differs materially from the block's hypothesis

Only tick AGENT checkboxes yourself. BROWSER needs a rendered page. HUMAN and DEVICE need a
person — list those for me rather than marking them.

Anything you discover that needs more than the stated minimal change goes to section 8
(Backlog) with a reason. Not into this branch.
```

---

## Wave-close prompt

```
Wave <N> blocks are all marked done in docs/UX_REMEDIATION.md. Audit that claim before we move on.

For each block in the wave:
- Re-read its exit test as written in the doc and confirm each AGENT check genuinely passes now,
  on a fresh account rather than a dev account with accumulated state.
- Diff the exit tests against git history. If any test was edited after the block started, flag
  it — constraint C1 says the fix changes, never the test.
- List every HUMAN and DEVICE check still outstanding, and say plainly whether the wave is
  closeable without them.

Then check the two end-to-end loops in section 9 regardless of which wave this is:
- Ask a question. Confirm it ends in either an answer or an honest error with a working retry,
  and that the question is never lost.
- Build a plan, mark a reading, hard-reload, confirm the progress persisted.

Report what is genuinely done, what is claimed but not verified, and what is blocked. Do not
start the next wave.
```

---

## If the agent starts over-building

```
Stop. Re-read constraint C7 in section 0 of docs/UX_REMEDIATION.md.

You are outside the "Minimal change" scope for this block. Revert to the last commit, and
report what the minimal change was and why it did not close the finding. Do not expand scope
to force the fix through — that decision is mine, not yours.
```
