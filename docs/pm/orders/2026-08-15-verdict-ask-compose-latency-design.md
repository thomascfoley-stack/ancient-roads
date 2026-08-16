OUTCOME: **DIRECTION APPROVED. SCOPE REJECTED AS WRITTEN, AND RESCOPED DOWN.** The design doc's factual spine was re-verified and holds — every code claim it makes is true at the cited lines, and every number it quotes matches the measurement JSON when recomputed. Its reasoning against a blind parallel race is sound and I am adopting it. **But the doc asks to fund the wrong-sized thing.** It requests a slice to "read ~100–200 rejected-attempt samples"; the verifier already computes that exact payload on every rejected attempt in production today, and `teach.ts` discards all but the first check's *name* one line later. The diagnostic is a persistence change, not a research slice. **And the doc's own central table is written in adjectives where the counts were sitting in the file it cites** — with a stated denominator no cell actually counts, and a bundling that hides the second-strongest signal in the data.

# Verdict — `docs/ASK_COMPOSE_LATENCY_DESIGN.md`

**Filed 2026-08-15.** Lane D, gate D4. Subject: the design doc at `16d9431`, written against the
25-question production measurement at `docs/evidence/ask-latency/prod-25-measurement-2026-08-15.md`.

---

## 0. Seat check

I did not write the design doc, the measurement harness, or the 25-question run. I am ruling on
another session's work from its committed artifacts and from the tree. Bylaw 4 is satisfied for
this verdict. It is **not** satisfied for the design doc's own self-correction — that doc corrects
a claim the same session made an hour earlier, which is a good habit but is not independent review,
and is why this verdict exists.

## 1. What I re-verified, and what held

Every load-bearing factual claim in the doc was re-executed against the tree, not read:

| Claim | Verdict |
|---|---|
| `MAX_RETRIES = 2`, retry cap already shipped | **TRUE**, `web/src/lib/teacher/teach-budget.ts:7` exactly as cited |
| A `retrieved` event carries sources the moment retrieval finishes | **TRUE**, `web/src/lib/teacher/teach.ts:78` (type) and `:181` (emit) |
| The client renders sources mid-wait, "Reading these while I compose" | **TRUE**, `web/src/components/ask-client.tsx:466-477` as cited |
| p50 10.5s / compose 74.4% / retrieve 2.7s | **TRUE**, matches the evidence `.md` |
| 13/25 needed ≥1 retry; 4/25 fell back | **TRUE**, recomputed from the JSON: `attempts>1` = 13, `kind!='composed'` = 4 |
| 9 of 13 retried questions eventually composed | **TRUE** — see finding 3 on what it does and does not mean |

**The correction the doc leads with is real and I am ratifying it.** Streaming sources early is
shipped, in production, end to end. The 2026-08-15 evidence file still says the opposite — "the
unbuilt half is **streaming sources early**" (`prod-25-measurement-2026-08-15.md:27-29`) — and
that line is now known-false. It is the sentence a future reader meets first, so per the
watchlist's third shape (*put the correction where the reader meets the wrong version*), it must be
corrected in place, not only in the design doc. **Filed as a condition below.**

## 2. Finding 1 — the failure-code table is prose where the numbers existed (SIGNIFICANT)

The doc's central empirical table, the one motivating the entire recommendation, reads:

| check that rejected an attempt | count across all 25 asks' rejected attempts |
|---|---|
| `quote_verbatim` | most common |
| `schema` | present |
| `passages_grounded` / `diversity_voices` | present |

Three things are wrong with it, and the data to fix all three was in the file the doc cites.

**(a) Every cell is an adjective where a count was available.** The JSON carries a `firstCheck`
field on all 13 retried rows. Recomputed:

| check | count | share of the 13 |
|---|---|---|
| `quote_verbatim` | **5** | 38% |
| `passages_grounded` | **4** | 31% |
| `schema` | **3** | 23% |
| `diversity_voices` | **1** | 8% |

**(b) The column header names a denominator that no cell counts.** It says "count across all 25
asks' **rejected attempts**". There were **23 rejected attempts** (arithmetic over the JSON:
`attempts-1` for composed rows, `attempts` for fallbacks). The instrument captured **13** codes —
`teach.ts:218` writes `if (!firstCheck) firstCheck = …`, i.e. **one code per question, from the
first rejected attempt only**. So 10 rejected attempts have no recorded code at all, and the
header promises a population the instrument cannot see. That is this repo's own recurring shape:
an instrument's blind spot written down as a property of the thing it could not see.

**(c) The bundling hides the second-strongest signal.** Grouping `passages_grounded` with
`diversity_voices` as one "present" row buries the fact that `passages_grounded` alone is 4 —
one behind the leader — and that it is the **most common cause among questions that eventually
SUCCEEDED** (4 of the 9). Split by outcome:

- **Recovered after retry (9):** `passages_grounded` 4 · `quote_verbatim` 3 · `schema` 2
- **Fell back (4):** `quote_verbatim` 2 · `schema` 1 · `diversity_voices` 1

A diagnostic scoped by the doc's prose — which names "`quote_verbatim` and `schema` rejections" as
what to go read — would under-weight the single largest driver of recoverable retries.

## 3. Finding 2 — 5 versus 4 on n=13 does not establish an ordering

"`quote_verbatim` is most common" is true of this sample and is **not a fact you can steer a fix
by**. Five against four, on thirteen observations, is a margin well inside noise. This repo already
carries the standing caution in `CLAUDE.md` §2 — point estimates whose intervals straddle their
bars are "clears", not "proven above" — and it applies with more force here, at n=13, than it does
at the n=90 it was written for. Any fix proposed as "targets the most common failure" is, on this
evidence, targeting a coin flip between two codes.

## 4. Finding 3 — 9/13 is arithmetic, not an observation, and the doc slightly overstates it

The doc says the 9/13 recovery rate means the violation-feedback loop "is doing real, measurable
work". Two corrections:

**It is derived, not measured.** A fallback by definition exhausts all three attempts, so all 4
fallbacks are necessarily inside the 13-retried set; 13 − 4 = 9 follows arithmetically from two
numbers already reported. It is correct, but it is not a second, independent piece of evidence.

**It measures that retries succeed, not that feedback is why.** No counterfactual was run. An
uninformed re-roll of the same prompt might succeed at a similar rate — sampling variance alone
would recover some fraction of these. The doc's own "what this rules out" section is honest that
the race needs this comparison before it can be judged; the phrase "doing real, measurable work"
in the section above it is stronger than the evidence, and should be softened to "retries mostly
succeed; whether the feedback causes that is unmeasured."

**This is cheaply decidable and I am ordering it**, because it is the one experiment that closes
the doc's largest open question. Re-run the same 13 questions with the violation feedback
suppressed — identical prompt, no `--- PREVIOUS ATTEMPT REJECTED ---` block — and compare
attempt-1 success. That is ~13 compose calls against a dev DB, not a slice. If uninformed retries
recover at a comparable rate, the parallel race the doc rules out comes back on the table and the
latency tail has a cheap structural fix. If they do not, the doc's rejection of the race is
converted from an argument into a measurement, which is what this repo requires anyway.

## 5. Finding 4 — the reason the requested scope is rejected: the payload already exists

The doc asks the PM to fund "read ~100–200 rejected-attempt samples, failure-code them, propose a
specific fix", framed as "real work, not a quick patch".

**The samples do not exist to be read.** Nothing in the tree persists a rejected attempt's body,
and the harness that produced the 25-run stores durations plus one check name per question. Taken
at face value the ask is therefore *build the capture, run 100–200 fresh asks, then read them* —
materially more than the doc's framing suggests, and the doc does not say the capture is missing.

**But the capture is nearly free, because the verifier already produces it.**
`web/src/verifier/types.ts:59-64`:

```ts
export interface Violation {
  check: string;      // e.g. 'schema', 'quote_verbatim', 'screen:I3'
  blockIndex?: number;
  message: string;
  span?: string;
}
```

Every rejected attempt in production **right now** produces a full `Violation[]` — the check, a
message, and the offending span. `teach.ts` binds it to `lastViolations`, feeds it into the retry
prompt, and then keeps exactly one derived scalar from it: `firstViolationCheck(lastViolations)`.
The `message` and `span` — precisely the "what does a `quote_verbatim` rejection actually look
like" the doc wants to go study — are computed, used once, and dropped.

So the correct first step is not a research slice. It is: **stop discarding it.** Persist the full
violation set per rejected attempt through the existing `web/src/lib/ask-outcome-log.ts` path, and
the 100–200 sample the doc wants accumulates from real traffic at zero marginal cost, with real
questions instead of a synthetic list.

## 6. Ruling

**APPROVED**, and adopted as this lane's position:

- The correction at the top of the doc. Streaming is shipped; nobody builds it again.
- Diagnose before fix. No compose-prompt change is funded until the failure codes are counted.
- The rejection of a **blind** parallel race on the evidence available today — upgraded from
  argument to measurement by the §4 experiment.

**NOT APPROVED as scoped:** "read ~100–200 rejected-attempt samples" as a funded slice. Rejected
because it is the wrong size, not because it is the wrong idea.

**ORDERED instead — three steps, in order, none of them large:**

1. **Persist the violations.** Extend the outcome log to record the full `Violation[]` per rejected
   attempt (check · message · span), not just the first check's name. Conditions in §7.
2. **Count, then re-file the table.** Once real traffic has accumulated a sample, failure-code it
   with **counts and a denominator that matches what the instrument records**. The §2 table above
   is the interim honest version and supersedes the doc's; the doc's table is withdrawn.
3. **Only then design the fix.** A prompt change, a retrieval-context change, or a contract change
   is a separate proposal, written against counts.

**ALSO ORDERED, and independent of all three:** the §4 feedback counterfactual. 13 questions,
feedback suppressed, dev DB. It is the highest information-per-token item on this page.

**HELD, not killed:** hedging attempt 0. The doc is right that it addresses a minority of the tail.
It stays on the shelf, unfunded, until step 2 says whether a slow first attempt or a wrong first
attempt dominates.

## 7. Conditions

- **The stale sentence gets corrected in place.** `prod-25-measurement-2026-08-15.md:27-29` still
  names streaming sources as "the unbuilt half". Correct it in that file. A reader meeting it there
  has no reason to open the design doc.
- **`span` is corpus text and model output — bound it and check it before it is logged.** The
  corpus is public-domain or permissively licensed, so quoting a span is not a licensing breach,
  but this is a new persisted field carrying passage text plus the user's question. Cap its length,
  confirm against `docs/SECURITY.md` that the sink is server-only, and never let a secret or a
  connection string reach it. Licensing fails closed: if the span's provenance cannot be
  established for a given row, do not persist the span for that row.
- **Step 1 touches the compose path, so the gate applies.** Per the Definition of Done,
  `interpretation_bait` runs clean through the **live** loop before it ships. A persistence-only
  change should not move model output at all — which makes it a cheap gate run, not an excuse to
  skip one. If step 3 later changes the prompt or retrieval context, the held-out accuracy
  diagnostic re-runs, pre-registered, no tuning to the test.
- **No new dependency, and no change to the verifier's rule set** in any of the three steps. If a
  fix appears to need one, that is a new proposal, not an expansion of this one.

## 8. Process notes, filed because they are the kind that recur

- **The design doc was pushed to `main`, not to the session's designated branch**
  (`claude/streaming-compose-latency-ybm8w3`). `origin/main` contains `16d9431`. No harm done —
  it is a docs-only commit and its content is sound — but `main` is unprotected here (the watchlist
  already records `required_status_checks` as empty), so "nothing merges red" is discipline, not
  mechanism, and the discipline is what slipped.
- **No `WORKLOG.md` entry was written for the design doc.** The working protocol in `CLAUDE.md`
  requires one after any unit of work. Corrected by this session's entry.
