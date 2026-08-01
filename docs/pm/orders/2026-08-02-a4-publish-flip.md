OUTCOME: **A4 EXECUTED 2026-08-01 20:32:31Z.** Six works flipped `staged -> published` on production `ep-odd-fog-atnykudm` by the owner at a terminal, gate held, delta clean. Filed retroactively on 2026-08-02 because bylaw 1 says a decision that exists only in a chat window does not exist — and until this file, A4's only record was a commit message an agent wrote. Four §3 preconditions were unticked at execution time; two remain open and are named below rather than quietly closed.

# A4 — the publish flip. Record of authorisation and execution.

**Filed retroactively 2026-08-02**, per `docs/pm/MASTER.md` bylaw 1 and `docs/DECISIONS.md`
ADR-042 ruling 2 ("the go must name the endpoint, the script, and the occasion"). The 2026-08-02
deep audit found A4 had no order file at all (finding M3) while A2 had one. This closes that.

This document does not authorise anything. It records an authorisation that was given verbally
and an execution that already happened, so that the repo carries what the bylaw requires.

---

## 1. The go, as given

| | |
|---|---|
| **Endpoint** | `ep-odd-fog-atnykudm` (production), declared exactly via `PUBLISH_EXPECT_HOST` |
| **Script** | `scripts/publish-flip.mjs --slugs=docs/evidence/work-order-v2-stage2/flip-slugs.json` |
| **Occasion** | Gate A4, once, on 2026-08-01, following A3's adjudication |
| **Given by** | The owner, in session, after being shown the corrected command and the before-log |
| **Executed by** | The owner, at their own terminal, typing `publish` at the gate |

The credential (`CUTOVER_DATABASE_URL`, `neondb_owner`) was minted by the owner in their own
shell and never handled by an agent, never written to disk, never printed.

## 2. What was flipped

Six works, exactly the set A3 adjudicated:

`adam-clarke` · `calvin-crosswire` · `jfb` · `john-gill` · `matthew-henry` · `wesley-crosswire`

`barnes-notes` was deliberately **not** flipped: A3 held it back on 0 admitted rows under
`LEGAL_CORPUS_FILTER`, and its manifest records biblehub provenance (ADR-008 forbidden
aggregator). It remains `staged`.

## 3. What the run reported

```
role         neondb_owner (asserted at the server)
snapshot     flip-pre-snapshot-2026-08-01T20-32-31-268Z.json (7 rows, written before COMMIT)
eligible     6 of 6 are 'staged'
OK — gate held. 6 row(s) staged -> published.
```

The §4 before/after diff, re-run from the committed files, contains exactly four hunks: the six
slug lines moving `staged -> published`, `(none published)` -> `commentary: 6`, and totals
`staged=7 published=0` -> `staged=1 published=6`. `sources=7` and `sections=72863` identical on
both sides; every per-work section count identical.

**Evidence:** `docs/evidence/work-order-v2-stage2/flip-before.log`, `flip-after.log`,
`flip-pre-snapshot-2026-08-01T20-32-31-268Z.json`. CI `audit` + `db-invariants` were green at
`664afe8`, the sha the flip ran at, finishing 20:30:48Z — 1m43s before execution.

## 4. The first attempt refused, and that was the gate working

`STOP: not confirmed. Nothing was written.` The owner pasted the flip command and the follow-on
verify command together; the owner gate's `readline` consumed the second command's text as its
confirmation line, which is not the word `publish`, so it refused. `ownerGate()` runs before
`BEGIN` (`publish-flip.mjs:149-150`), so no transaction existed and there was nothing to roll
back. Production was re-verified untouched before the second attempt.

Recorded because the deep audit correctly noted (finding 18, lens 2) that this failed safe only
because the pasted text did not happen to *be* the confirmation word. In the other paste order
the gate would have confirmed on input the operator never intended as an answer. That is a real
defect in the gate, tracked in the audit checklist, not a success story.

## 5. Preconditions that were open at execution time

`docs/evidence/work-order-v2-stage2/PUBLISH_FLIP.md` §3 carried six unticked boxes. Four were
open when the flip ran. Stated plainly rather than back-dated:

| precondition | status |
|---|---|
| Owner go naming endpoint, script, occasion | **Given verbally; not in the repo until this file.** |
| `npm run audit` green at the exact sha | **Met** — CI green at `664afe8`, 1m43s prior. Committed evidence lands with this order. |
| Restore point captured **before** the flip, id written into §5 | **NOT MET. Still open.** §5 still reads "There is no id here because nothing has been run." Neon branch creation is forbidden by the standing rails, and the existing rollback branch `br-late-recipe-atxl68sh` was measured `protected: false` 36 minutes before the flip. |
| Nobody else working the tree | Not formally checked; no evidence of concurrent work. |
| G10 discharged on a rehearsal fork (ADR-043 wants it BEFORE the flip) | **NOT MET, knowingly.** Forks are forbidden; the departure is disclosed in `MASTER.md` A5, `PUBLISH_FLIP.md` §3 and the A3 record. It is now a fact rather than a plan, and the A6 go must accept it by name. |
| Human read of a flipped work in the reader (§4) | **NOT MET.** Cannot run until A6 deploys the reader. |

## 6. Reversal

```
node scripts/publish-flip.mjs --slugs=docs/evidence/work-order-v2-stage2/flip-slugs.json --reverse
```

Two limits the deep audit established, both real:

- It is the exact inverse of the **slug list**, not of the executed flip. It never reads the
  snapshot. Any listed slug that was already `published` beforehand would be un-published. Exact
  for this run only because all seven rows were `staged` — a property of the data, not the tool.
- The full-corpus legality gate runs in **both** directions, so one unrelated illegal published
  row makes `--reverse` roll back and exit 1 — the rollback refuses in exactly the corpus state
  where an emergency withdrawal is most likely.

There is no second rollback path for the database. Both limits are tracked in
`docs/pm/orders/2026-08-02-deep-audit-a1-a6.md` (M6, M7).

## 7. Blast radius

**Nothing a visitor sees changed.** The live deployment is `24677ba` (2026-07-19), which
predates the library, the work reader and cross-corpus search. The flip is what makes A5
non-vacuous and what A6's deploy will light up. The ask pipeline is untouched: retrieval runs
over `embeddings` through `LEGAL_CORPUS_FILTER` and consults `sources.status` nowhere.

What the flip **did** open, once A6 deploys: full-text search over 71,563 sections gated on
`status='published'` alone. The deep audit's licensing lens found that gate is not sufficient on
its own (findings H4–H8) — that work is outstanding and blocks the public launch, not this gate.
