# Counterfactual v2 — RESULT

Run 2026-08-15, dev (`ep-tiny-hat`) + live DeepInfra, against the
[pre-registration](counterfactual-v2-PRE-REGISTRATION.md) committed before the numbers existed.
195 units (13 questions × 15 reps), ~460 compose calls.

## Primary result — NULL, as pre-registered

| | |
|---|---|
| units run | 195 |
| attempt-0 **rejected** (usable pairs) | **84** |
| attempt-0 passed outright (no comparison possible) | 111 |
| informed retry (feedback appended) recovered | **34 / 84** (40.5%) |
| uninformed re-roll (no feedback) recovered | **26 / 84** (31.0%) |

Paired (McNemar exact), which is the correct test since both arms share the same attempt-0
rejection:

| | |
|---|---|
| informed-only recoveries | 17 |
| uninformed-only recoveries | 9 |
| discordant pairs | 26 |
| **exact two-sided p** | **0.1686 — not significant** |

**Pre-registered reading, applied without amendment: NULL. Undetermined at large-effect power.**
A moderate or small effect is **not** excluded. Per the pre-registration, **no step-2 or step-3
design may cite either arm as support.**

**What can honestly be said:** the direction favours feedback (17 vs 9 discordant, ~1.9:1) and the
raw gap is ~9.5 points. That is *suggestive and unproven* — exactly the state the design doc
claimed to have resolved. Reaching significance at this effect size would need roughly 3–4× this
run (~290 pairs, ~670 units); that is a budget decision, not something to slide in.

**So the design doc's rejection of a blind parallel race remains withdrawn.** It is neither
confirmed nor refuted. It stays out of any argument until someone pays for the larger run.

## Secondary result — DECISIVE, and it changes how step 2 must count

**8 of 9 questions with repeated rejections drew MORE THAN ONE first-check across repetitions.**

| question | codes drawn across reps |
|---|---|
| What happens in the Sermon on the Mount? | `passages_grounded`, `schema`, `json_parse`, `quote_verbatim` |
| What does Scripture teach about prayer? | `anchor_offbase`, `passages_grounded`, `quote_verbatim` |
| What does Song of Solomon 4:14 mean? | `passages_grounded`, `anchor_offbase`, `schema` |
| What is the argument of Romans 5? | `quote_verbatim`, `schema`, `anchor_offbase` |
| Explain Romans 8:28 | `diversity_voices`, `schema` |
| What does Ephesians 2:8-9 teach? | `passages_grounded`, `diversity_voices` |
| Who was Josephus? | `quote_verbatim`, `schema` |
| What does Hebrews 11 teach about faith? | `schema`, `quote_verbatim` |

A question does not *have* a failure mode. It has a distribution over failure modes. **Any
diagnostic that codes a question once and treats that as the reason is coding noise** — which is
what the design doc's proposed "read 100–200 samples" would have produced without this constraint.

## The verdict's central caution, now demonstrated rather than argued

The verdict warned that `quote_verbatim` 5 vs `passages_grounded` 4 at n=13 "establishes no
ordering". At n=84 the ordering **below the leader completely reshuffled**:

| check | n=13 (design doc) | n=84 (this run) |
|---|---|---|
| `quote_verbatim` | **5** (#1) | **29** (#1, 34.5%) |
| `passages_grounded` | 4 (#2) | 12 (**#4**, 14.3%) |
| `schema` | 3 (#3) | 22 (**#2**, 26.2%) |
| `diversity_voices` | 1 (#4) | 13 (**#3**, 15.5%) |
| `anchor_offbase` | — (absent) | 7 (8.3%) |
| `json_parse` | — (absent) | 1 (1.2%) |

`passages_grounded` fell from #2 to #4; `schema` rose from #3 to #2; two codes absent at n=13
appeared at all. **A fix scoped by the n=13 table would have targeted the wrong thing.** The
leader held, but nothing beneath it did — and even the leader's margin (29 vs 22) is not large
relative to this n.

## Cost, recorded honestly

~460 compose calls to reach a null. That is the price of the design doc's unmeasured claim, and it
is cheaper than a prompt fix built on it would have been.
