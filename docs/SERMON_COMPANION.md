# Document 6: Sermon Companion — model and pipeline plan

Extends [OUTPUT_CONTRACT.md](./OUTPUT_CONTRACT.md) and [INFRA.md](./INFRA.md).
Nothing here changes the core guarantee or the infra picks; it maps the new
"ingest a whole sermon" feature onto the contract you already have.

## 0. Bottom line (the model question, answered)

- **You do not need to train a base model.** The decision already recorded in
  INFRA.md is correct for this feature too: **Qwen3 32B (Apache 2.0) on
  DeepInfra, Nebius as failover, LoRA fine-tuning later.** Pin the version;
  DeepInfra silently forwards deprecated models, so alert on model-identity
  drift (INFRA.md HAZARD).
- **The guarantee is architecture, not model choice.** No model, however large,
  reliably "never interprets" by prompting alone. The never-interpret promise
  comes from the contract (the model emits JSON blocks, never prose to the user)
  plus the verifier that rejects violations before render. A bigger model would
  not make the promise safer; it would only make retrieval and extraction
  slightly better. Spend effort on retrieval quality and the verifier, not on a
  fancier LLM.
- **Fine-tune, never pre-train.** When quality/cost warrants it (Phase 2 below),
  LoRA-tune a small open model for the two narrow classification jobs. Training
  from scratch is the wrong tool: seven figures, months, and no benefit over
  RAG + LoRA for a citation product.

## 1. What the sermon feature adds

Today's contract answers "topic or verse -> X voices plus 4 others." Sermon
Companion adds five capabilities, all of which decompose into retrieval +
classification + constrained composition — the same shape you already built:

| User ask | Mechanism | New model work? |
|---|---|---|
| Ingest an entire sermon | long-context extraction into claims/topics/refs | prompt only (Qwen3 32B) |
| Commentaries related to it | per-claim hybrid retrieval + rerank | none (embeddings + reranker) |
| Where commentaries agree / disagree | stance classification per (claim, quote) | new: stance step (see §4) |
| "Closest to what <author> said; here are others" | sermon/topic embedding nearest-neighbor over sources | none (vector search) |
| Similar public-domain sermon | embedding NN over a sermon corpus | none (needs new corpus, §5) |
| Additional related passages | cross-reference expansion + verse embedding search | none (needs TSK, §5) |

## 2. Pipeline (all open-weight; no OpenAI/Anthropic, per posture)

```
sermon text
  -> [1] segment + extract      Qwen3 32B, JSON schema: {claims[], topics[], scripture_refs[]}
  -> [2] retrieve per claim     hybrid BM25 + pgvector (already built), top-K per claim
  -> [3] rerank                 cross-encoder reranker, top-N precise
  -> [4] stance classify        per (claim, quoted span): aligns | differs | qualifies | tangential
  -> [5] similar sermons        embed sermon+topics, NN over sermon corpus (§5)
  -> [6] related passages       claim refs + commentary->verse anchors + TSK cross-refs + verse NN
  -> [7] compose                Qwen3 32B emits contract JSON (framing/voice/stance/passages/reading)
  -> [8] verify                 V1 deterministic + V2 classifier (OUTPUT_CONTRACT §3) + stance grounding
  -> render (client renders blocks; model never free-writes)
```

Retrieval does the substantive work. Steps 1, 4, 7 are the only LLM calls;
2, 3, 5, 6 are embeddings/search. Keep the high-volume per-claim calls (1, 4) on
the cheap 32B (or a small fine-tuned model later); composition (7) is constrained
so it does not need a bigger model.

## 3. Concrete model picks

| Job | Pick (start) | Provider | License / note |
|---|---|---|---|
| Extraction, stance, composition | **Qwen3 32B** | DeepInfra (Nebius failover) | Apache 2.0; version-pinned |
| Embeddings | **Jina v3** (already chosen) or Qwen3-Embedding | self/DeepInfra | 1024-dim; keep what's integrated |
| Reranker | **BGE-reranker-v2-m3** or Jina reranker v2 | DeepInfra/self | cheap cross-encoder, big precision win |
| Verifier entailment (V2) | prompted Qwen3 32B now; **DeBERTa-v3 MNLI** as a cheap deterministic backstop | self | tiny, runs on CPU |
| Phase-2 fine-tunes | **Qwen3 4B/8B + LoRA** | train Modal/RunPod, serve DeepInfra/Nebius | for stance + V2 classifier |

Only move composition to a larger model (DeepSeek V3 — MIT; Llama 4; Qwen3 72B/
235B) if the eval suites show 32B is the bottleneck. In a retrieval-grounded,
contract-constrained design that rarely happens. At implementation time, re-check
the current best Apache-2.0/MIT instruct model on your provider — the field moves
monthly and INFRA.md's specific SKUs may have shifted.

## 4. Stance detection and the guarantee (the one real risk)

"Point out where commentaries agree or disagree with the sermon" sits dangerously
close to banned behavior **I2 (adjudicates between views)**. The rule that keeps
it safe:

- Stance is a **grounded textual relation**, never a verdict. The app may report
  "these words of Chrysostom differ from the sermon's stated claim that X." It
  may **never** say the sermon (or the commentator) is right, wrong, better, or
  biblical.
- Every stance label must be backed by a **verbatim quote** from the source and a
  verbatim (or extractive) restatement of the sermon's own claim. No stance
  without both spans.
- Add to OUTPUT_CONTRACT.md:
  - **New interpretation rule I7**: "asserts that a view is correct/incorrect,
    or that the sermon agrees/disagrees with Scripture." Banned.
  - **New block `stance`**: `{ claim_span, section_id, quote, relation:
    aligns|differs|qualifies, confidence }`. Relation is descriptive; the UI
    renders it as "aligns with / differs from what this voice wrote," not a grade.
  - **New eval suite `stance_grounding`** (gate 100%): every stance cites a real
    quote; no stance block ever contains a correctness judgment; sermon claims
    the model could not ground produce no stance rather than a guess.

This is the only contract change the feature needs. Everything else reuses the
existing framing/voice/passages/reading/prayer_prompt blocks and V1/V2 verifier.

## 5. New corpora to ingest (public domain; same pipeline as commentaries)

1. **Sermon corpus** for "similar sermon" + "closest author":
   Spurgeon (Metropolitan Tabernacle Pulpit, ~3,500 sermons), Jonathan Edwards,
   Wesley's standard sermons, Whitefield, D.L. Moody, Finney, J.C. Ryle.
   Sources: CCEL, archive.org, Project Gutenberg. Chunk by sermon -> section,
   embed, store in the existing sections/section_embeddings tables with
   `source.kind = 'sermon'`.
2. **Treasury of Scripture Knowledge (TSK)** — public-domain verse-to-verse
   cross-references — for "additional related passages." Small, high-value;
   populates a `cross_references` table keyed by verse id. Combine with your
   existing commentary->verse anchors and a verse-embedding search.

Apply the same "no JW / Catholic-magisterium / Mormon / cult" filter at source
selection that the commentary corpus uses. (Current corpus is clean: a scan of
all 401 commentary sources and 22 translations found zero such sources.)

## 6. Refusal / "no life advice" (already covered, inherits for free)

The `refusal_shape` eval suite (OUTPUT_CONTRACT.md §4, gate 100%) already
requires out-of-scope asks (medical, legal, "should I leave my wife?") to return
the in-scope response shape — voices and passages on the topic — never advice.
Sermon Companion inherits this: a sermon that asks a life question, or a user who
asks the companion for direction, gets routed to the same refusal shape. Add a
handful of sermon-flavored cases to that suite.

## 7. Build order

1. Ingest TSK cross-references and a starter sermon corpus (Spurgeon first).
2. Add the `sermon-companion` teacher + claim-extraction prompt (Qwen3 32B, JSON).
3. Reuse hybrid retrieval; add the reranker.
4. Add the stance step (Qwen3 32B structured output) + rule I7 + the
   `stance_grounding` eval suite. Get the bait/stance suites green before shipping.
5. Extend the contract with the `stance` block and the `similar_sermons` /
   `related_passages` block items; render them client-side.
6. Extend the verifier to cover stance grounding (quote-substring + no-verdict
   regex, same machinery as V1).
7. Once ~1-2k stance pairs and logged V2 verdicts exist, LoRA-tune a Qwen3 4B/8B
   for stance + V2; serve per-token on DeepInfra/Nebius; promote via the existing
   canary flow (INFRA.md / OUTPUT_CONTRACT.md §4).

## 8. What NOT to do

- Do not fine-tune before you have logged data; prompt Qwen3 32B first.
- Do not let the composer summarize commentary abstractively — extractive only
  (select sentences from the source), or you reintroduce interpretation (I4/I6).
- Do not send sermon text (often personal/unpublished) to any lab API. Open
  weights only; prefer zero-retention provider settings or self-hosting once the
  serving bill justifies it.
