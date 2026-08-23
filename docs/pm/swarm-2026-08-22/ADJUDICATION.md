# ADJUDICATION — duplicated batch-A workstreams (orchestrator, 2026-08-23)

**Why this exists.** The three quota-killed batch-A agents were resumed with prompts that
referenced their original batch context; each completed **all six** items on its own branch
instead of only its own. Result: four branches carry overlapping implementations of
W-SEC-CURSOR, W-SEC-CCEL, W-L2TOGGLE, W-UX1, W-UX2VERIFY, W-T3:

- `swarm/W-SEC-CURSOR-sections-cursor` @ `bad9875` — ONE monolithic commit for all six items
- `swarm/W-UX1-ux1-desk-bible` @ `ad416c6` — per-item commits
- `swarm/W-T3-cursor-ccel-ux` @ `3e42f04` — per-item commits
- plus the first-run single-purpose branches: `swarm/W-SEC-CCEL-ccel-provenance` @ `f98494a`,
  `swarm/W-UX2VERIFY-ux2-browser-verify` @ `01c45ad`, `swarm/W-L2TOGGLE-plan-toggle` @ `9b0e12d`

Wave 8 merges the canonical choice per item, by cherry-pick where noted. The orchestrator
read every candidate diff. Process lesson (for A-batch prompts): a resumed agent's "original
brief" contained the whole batch template; resume prompts must name the SINGLE item and
forbid the rest.

## W-SEC-CURSOR — canonical: cherry-pick `6983321` (from `swarm/W-T3-cursor-ccel-ux`)

All three implementations are the same correct one-clause fix (bound `after` at int4 max →
400, verified: `sections.ordinal` is INT, migration 006). `6983321` is a clean single-purpose
commit with live red (NeonDbError int4 overflow), green (7/7), and a seeded red-proof; its
test extends the existing malformed-params case in `work-reader.test.ts` (smallest diff).
`0209bbe` (agent-22) is equivalent and would also serve; `bad9875`'s copy is inseparable from
its monolith. DROP: `0209bbe`, the `bad9875` cursor hunk.

## W-L2TOGGLE — canonical: merge `swarm/W-L2TOGGLE-plan-toggle` @ `9b0e12d` (whole branch)

Single-purpose branch; most thorough evidence: dedicated 146-line suite
(`plan-day-toggle-optimistic.test.tsx`), optimistic paint via absolute `completed` value
(avoids flip-races), `busyDay` lock, dual-theme class assertion (the A7b lesson), four
red-proofs incl. three seeded. DROP: `4cd4ae4` (agent-22), `25fdc9c`+`59a8937` (agent-24) —
both correct in kind; one merge is enough. Verifier (Wave 7) re-executes from the canonical
branch only. Known benign race (rapid toggles on different days flicker until re-sync; final
state always server-truth) is recorded in its item file.

## W-UX2VERIFY — canonical: merge `swarm/W-UX2VERIFY-ux2-browser-verify` @ `01c45ad` (whole branch)

Single-purpose; zero-dependency CDP harness (`scripts/ux2-verify.cdp.mjs`) asserting the
explainer at two widths with seeded red-transcript, plus a pristine-base proof that the
thayers audit red is not its work. The duplicated screenshot-only evidences in the other
branches are DROP (redundant, harmless).

## W-UX1 — ALREADY-DONE at base; NOTHING merges

Verified by the orchestrator: `5760eec` (2026-08-02, "Desk panes navigate themselves; the
Bible can be added") shipped BookPicker pick mode + the desk add-rail book button + the
empty-state "Open the Bible" button, browser-verified at the time — exactly the brief's
"smallest UI using the EXISTING `kind:'scripture'` machinery". Two workstreams independently
reached the same verdict with guard tests green (9/9) and screenshots. DROP: `bad9875`'s UX-1
implementation (redundant second mechanism). MASTER.md's UX-1 row is updated to closed.

## W-T3 — ALREADY-DONE (code) + NOT RUN (device); NOTHING merges

Three consistent verdicts: the guard (`t1-t3-first-run.test.ts`) exists and runs in audit
(6/6 and 10/10 across two readings); the device leg is hardware-bound by the spec.
**Housekeeping MOOT with a caution:** `docs/pm/UX_REMEDIATION_ROADMAP.md` EXISTS at base and
MASTER.md's pointer is LIVE — the order doc's "no separate ROADMAP file" claim was the error
(fixed in the order at `c8a9c14`). **`bad9875`'s MASTER.md "pointer correction" hunk is a
falsehood and must NOT merge** — it rewrote a live pointer.

## W-SEC-CURSOR test-location footnote

If Wave 8's merge of `6983321` conflicts with `work-reader.test.ts` changes from another
branch, fall back to `0209bbe` (tests live in `api-hardening.test.ts` instead).

## W-SEC-CCEL — HELD-FOR-OWNER (the order's ambiguity stop, exercised)

Four materially divergent remedies, no evident single intent in the WORKLOG entry:

| candidate | remedy | branch/commit |
|---|---|---|
| A | Derive host from `sources.provenance->>'url'` → `(crosswire.org)`; host fail-closed null | `f98494a` |
| B | Derive from `sources.provenance->>'edition'` | `cba1bcc` (in `ad416c6`) |
| C | Derive host (`ccel.org`), export through forbidden-provenance.mjs + `.d.mts` twins | `13e676d` (in `3e42f04`) |
| D | DELETE the tag — argues piping provenance to the client violates GO_LIVE A5 ("attribute to the author, never a host") | `bad9875` hunk |

D's policy citation conflicts with A–C's shared premise (that selecting `provenance->>'url'`
server-side is lawful); one of those readings is wrong and it is an owner-rulable policy
question, not an engineering one. The defect itself is small (a false ` (CCEL)` suffix on
copied citations for the one CrossWire historian). All four implementations are preserved on
their pushed branches; the owner picks or rules. Documented in SECURITY.md SEC-5's trail and
the owner-return packet.

## Net merge list for Wave 8 (batch-A items)

1. `swarm/W-L2TOGGLE-plan-toggle` @ `9b0e12d` (whole)
2. `swarm/W-UX2VERIFY-ux2-browser-verify` @ `01c45ad` (whole)
3. cherry-pick `6983321` (W-SEC-CURSOR)
4. NOTHING for W-UX1, W-T3 (ALREADY-DONE), W-SEC-CCEL (HELD-FOR-OWNER)
5. `bad9875` merges nothing; the branch is retained on origin as evidence for the W-SEC-CCEL
   deletion candidate only.
