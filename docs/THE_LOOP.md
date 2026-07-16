# THE LOOP — how work passes a check here (2026-07-15)

**The one principle, above all others:**

> **The verifier is the bottleneck. No unit of work is "done" without a check that could have failed.**

A green check is a *claim*, not a proof, until you have seen it fail on a broken input. Everything below is a
way of making the check real. If you internalize one sentence from this repo, it is the one above.

This doc is the **standing index**. The four skills are the deep procedures — they are not competitors to this
page, and this page does not repeat them:

| you are about to… | read |
|---|---|
| touch retrieval / an eval / the corpus / a number | `quality-slice` |
| trust (or write) a test / a green gate | `false-confidence-audit` |
| answer "find the bugs / is this safe" / pre-deploy / post-run | `deep-audit` |
| run a bulk/overnight job, or review one | `overnight-run` |

---

## Why this doc exists (the fragmentation it removes — §4 audit)

The same meta-principle was stated **four different ways in four places**, in four vocabularies:

- `quality-slice`: *"A green check is not proof. Run the query, read the diff, seed a bad row."*
- `false-confidence-audit`: *"A green `npm run audit` is a claim, not a proof."*
- `CLAUDE.md` value #1: *"Verify, don't assume. A green check is not proof."*
- the DoD lines: *"'it typechecks' is not 'it runs'."*

Related-but-scattered rules multiply the problem: *design-before-code* (quality-slice step 8 **and** CLAUDE
value #2), *prove-deep-before-wide* (quality-slice step 9 **and** CLAUDE value #3), *fixer≠verifier* (deep-audit
**and** overnight-run), *held-out discipline* (quality-slice step 4 **and** CLAUDE axis 2), *load-the-page*
(quality-slice rail **and** the DoD). An agent reading one doc doesn't know it's a facet of a rule stated
canonically elsewhere — so it follows the nearest phrasing and misses the gate. **That fragmentation is itself
a slop risk.** This page is the canonical statement; the skills keep the domain-specific procedure.

---

## The loop — the pass every unit of work makes

1. **Frame the check first.** Before building, name the check that will tell you it worked — and how that check
   *could fail*. If you can't name a falsifiable check, you're not doing engineering, you're doing vibes.
2. **Do the work** — smallest honest slice (prove deep before wide).
3. **Run the check on a broken input.** Seed the bug, move the predicate, feed the wrong file — watch it go
   **red**. A check you never saw fail is not a check.
4. **Fix / revert, watch it go green.** Now the check tracks the code.
5. **State the result no wider than the evidence** — the artifact you measured, the n, the bound. Record it in
   `WORKLOG.md`; don't leave it in chat.
6. **STOP at the definition of done.** An open loop with no check is where slop enters. Name the stop.

---

## The eight rules — each earned by a specific scar (cite the scar, or cut the rule)

Every rule here cost this project a real failure. That's the bar: no rule survives without a scar.

1. **Name the artifact before you trust a number.** *Scar:* four retrieval diagnoses in a row were wrong the
   same way — "truncation eats the argument" measured `embeddings.content` (the STORED column), but the embedder
   reads a *different variable*, so the stored text was never what got embedded. A night lost to a proxy.
2. **Look at the data before you park.** *Scar:* two nights of content lost because an agent verified "is this
   Ryle-on-John?" by grepping for a string (false positive) — it was **Ryle-on-John vs Ryle-on-Luke**, two
   Gospels, each title page saying so in the first 800 characters. A number is not evidence until you've read
   the input that produced it.
3. **Kill the broken instrument before you report.** *Scar:* the pool "50→5" starvation, and **three** broken
   Spurgeon Slice-0 reads killed before trusting the number (NaN ground truth; 3-word shingles matching 2,552
   verses/sermon; KJV/WEB translation mismatch). If the instrument looks broken, it is — fix the instrument
   before you believe its output.
4. **Seeded-bug proof — no fix ships without a test proven red on the bug.** *Scar:* the license-gate
   ack-override (a denied work could ship if listed in `LICENSE_ACK`) — **every existing test passed**. Only a
   test seeded against that exact bug, watched red then green, proves the fix.
5. **Held-out discipline — freeze + hash before measuring, never tune to the test, ship on a fresh vN.** *Scar:*
   "topical 75" was a 5-doc-pool artifact carried as a real number; filling the pool surfaced the true 70.
6. **Fixer ≠ verifier — an agent may not certify its own output.** *Scar:* the self-heal phases fix mechanically,
   but a *fresh* agent (`deep-audit`) audits; an author reviewing its own work sees what it meant, not what it
   wrote.
7. **State conclusions no wider than the evidence.** *Scar:* `interpretation_bait` 35/35 is a **~92% lower
   bound**, not the ≥99% a 35-case fixture was claimed to support — ≥99% needs ~300 clean cases. The claim audit
   exists because docs kept asserting numbers the evidence couldn't carry.
8. **A STOP rule on every open loop.** *Scar:* the challenge → flip-hypothesis → repeat loop that burned owner
   time. "Improve this" pointed at an open loop, with no check and no stop, is the slop machine — by name. Every
   work order ends with a definition of done.

---

## §6 — Gate vs suggestion (move as many to gate as possible; be honest where you can't)

**The meta-principle is already a hard gate.** "A check that could fail" is enforced by dozens of them:

- **`npm run audit` / CI** (`scripts/audit.sh`, `.github/workflows/audit.yml`): typecheck ×3 · lint ×2 · knip ·
  deps-audit (CVEs) · tests+coverage · Layer-1 invariants (`qa`) · Gate B license.
- **pre-commit** (`.githooks/pre-commit`): eslint --fix · **src↔web byte-sync guards** · **forbidden-provenance
  ratchet**.

Of the eight named rules, here is the honest classification — what is mechanically enforced vs what is
irreducibly judgment:

| # | rule | status | enforced by |
|---|---|---|---|
| — | **meta: a check that could fail** | **GATE** | the whole audit.sh + pre-commit + CI stack above |
| 4 | seeded-bug proof | **PARTIAL GATE** | not mechanizable per-fix, but `false-confidence-audit` is the standing pass that hunts unearned green; invariant + sync tests are red-provable by construction |
| 5 | held-out freeze | **GATE (new, this task)** | `test/heldout-frozen-hash.test.ts` — frozen v3 set drift → red in the audit (proven red-first) |
| — | test the real code path (no lookalike) | **GATE** | pre-commit `src↔web` byte-sync (`web-core-sync` + `bible-sync`) |
| — | licensing fails closed | **GATE** | Gate B (`check-licenses.ts`) + provenance ratchet + license invariants + the marketing-flip allowlist test (`middleware-gate.test.ts`) |
| 1 | name the artifact | **SUGGESTION** | judgment — you cannot gate "is this the variable the code reads"; caught by review + `quality-slice` |
| 2 | look at the data before parking | **SUGGESTION** | judgment — you cannot gate "did you read the first 800 chars" |
| 3 | kill the broken instrument | **SUGGESTION** | judgment — pre-registered bars help, but "the instrument is lying" is a read, not a check |
| 6 | fixer ≠ verifier | **PROCESS** | not CI-gateable; enforced by `deep-audit`/`overnight-run` using **fresh** agents |
| 7 | conclusions no wider than evidence | **SUGGESTION** | judgment — the claim audit is a habit, not a lint |
| 8 | STOP rule on every open loop | **PROCESS** | enforced by the work-order format (`overnight-run` decision-lock; every prompt ends with a definition of done) |
| — | load the page at 390px + desktop | **SUGGESTION** | the browser is manual; a required DoD line, not a CI check |
| — | committed ≠ live | **SUGGESTION** | you cannot gate "did you verify it in the environment it protects" |

**The lesson, stated plainly:** the rules that *can* be mechanized already are, and this task moved one more
(held-out freeze) from discipline to gate. The rest — *name the artifact, look at the data, kill the instrument,
fixer≠verifier, conclusions-no-wider, STOP* — are irreducibly judgment or process. You cannot gate "did you
think." For those, the enforcement is the skill + a fresh reviewer, and pretending otherwise would be its own
slop. **The honest posture: gate what's mechanizable, name the scar for what isn't, and never let an open loop
ship without a stop.**
