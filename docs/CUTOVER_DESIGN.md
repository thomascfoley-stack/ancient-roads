# Prod cutover — design of record (the Part 5 script, before it is built)

**Status: DESIGN ONLY. No script exists yet and nothing here runs.** The cutover is gated behind
(a) the ship-committee GO, (b) a working prod credential (`OWNER_ACTIONS.md` §7 — currently STALE),
and (c) Kimi's read-only prod-branch census, which settles build-vs-repair. This doc captures the
requirements so they are not lost between now and the build. It is the spec the Part 5 script must
satisfy; the owner approves the plan before it is written, and again before the first prod write.

## The shape (from the work order Part 5)

ONE resumable script, not a manual runbook. Every step: **PRECONDITION assert → action →
POSTCONDITION assert → checkpoint.** Hard abort on any failed assertion, printing the failing step
and its stated rollback. Idempotent + resumable — re-running after a failure skips completed steps.
Prints a dry-run plan first. Two owner gates only: before the FIRST prod write, and before
`deploy.sh`. Everything between runs unattended.

## STEP ZERO — prod-credential preflight (NEW, 2026-07-20)

**Why it exists.** A stale prod password (§7) means the script, as the work order first drew it,
would fail auth at E1 *after* some migrations had already applied — a half-applied cutover, the
exact failure the chunked design exists to prevent. STEP ZERO converts "dies mid-migration" into
"refuses to start."

**The blind spot it closes.** `scripts/ingest-preflight.mjs` asserts you are **NOT** on prod (aborts
if `ep-odd-fog` appears anywhere). Nothing asserts you **CAN reach** prod when you intend to. This is
the inverse guard.

**Assertions, all before any write:**
1. Connect with the prod credential.
2. `current_user` is the expected owner role (migrations run as owner, not `app_runtime`).
3. The endpoint host contains `ep-odd-fog` — this IS the prod branch, not dev or a stale copy.
4. WRITE capability proven by a no-op: `BEGIN; CREATE TEMP TABLE _cutover_preflight(x int); ROLLBACK;`
   — a real write that leaves nothing behind. A read-only or lapsed credential fails here.
5. ABORT with a clear message if any assertion fails. Do not proceed to E1.

## Working assumption: the cutover is a BUILD, not a repair (confirm via census)

Prod never received the register ingest — that ran dev-only. So prod most likely has **zero sections
corpus** and **none of the 947 non-authorial rows** suppressed on dev today. Kimi's one-query census
(`SELECT metadata->>'work', count(*) … GROUP BY 1`) confirms it. Until it reports, design for BUILD:

- **E2/E4 build the corpus against a live prod DB from scratch** — they do not repair existing rows.
- **Every "assert counts match dev" step RE-MEASURES prod's actual flat pool at runtime.** Do NOT
  hardcode dev counts into prod assertions. Two reasons: (1) prod's flat pool is a different
  population; (2) the dev baseline itself moved by ~1,040 rows after today's suppressions, so any
  figure captured before 2026-07-20 is already stale. The assertion is "prod's rebuilt sections
  equal prod's own flat-pool count for that work," never "prod equals a literal from a doc."

## The suppression lesson, carried from ADR-029 addendum 2

Any step that removes rows across BOTH stores (`sections` and the flat `embeddings`) must express its
target in **each store's own key** and assert **1:1 per work** afterward. On dev, an ordinal range
that was correct for `sections` matched the wrong rows in the flat store (chunked sections spend
multiple ordinals per source section) — it cost 3 rows of real Tennyson verse before the 1:1 check
caught it. The prod script inherits that check as a postcondition, not a hope.

## Steps (per the work order, to be built against this spec)

- **E0** — prod-credential preflight (above). STOP-on-fail.
- **E1** — migrations 016–030 in order; assert each index `indisvalid=t` before proceeding.
- **E2** — register-label prod's flat embeddings (dev got this from the 33-work sweep; prod never
  has). Assert label coverage against prod's own re-measured shape.
- **E3** — forbidden-provenance cleanup on prod; assert the ratchet reads 0 after.
- **E4** — slice works into sections on prod, reusing vectors 1:1; assert per-register counts against
  prod's own flat pool.
- **E5** — `deploy.sh` (clean-tree → licensing ratchet → build → `vercel --prod`).
- **E6** — smoke + regression gate.

## Regression gates — after EVERY chunk, not just at the end

`/ask` still answers with ≥2 distinct voices on a known-good query; Bible reader renders + tap-verse
opens commentaries; existing highlights/notes load AND write (E1 changes the annotation schema;
`upsertNote` hard-depends on 025); register wall holds. Any pre-existing surface regresses → ABORT
and roll back that chunk; do not fix forward mid-cutover.
