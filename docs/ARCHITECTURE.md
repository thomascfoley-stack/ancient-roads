# Document 8: System architecture (the whole picture)

Consolidates [INFRA.md](./INFRA.md), [OUTPUT_CONTRACT.md](./OUTPUT_CONTRACT.md),
and [SERMON_COMPANION.md](./SERMON_COMPANION.md) into one system view: what runs
where, which model does which job, and how training works.

## Three planes

The app is three separable planes. Keeping them separate is the architecture.

1. **Content plane — static, read-only, no model.** Bibles (22), commentaries
   (401 sources / 371k entries), interlinear (Greek/Hebrew per verse), lexicon
   (Strong's). Served as static JSON off Vercel's CDN. Fast, cheap, cacheable,
   no compute. *Already built.*
2. **User plane — private, per-account.** Highlights, notes, favorites, upload
   metadata in **Neon Postgres** (RLS by `app.current_user_id`); uploaded files
   in **Vercel Blob**. *Highlights/notes built; favorites/uploads designed
   (USER_DATA.md).*
3. **Intelligence plane — the AI.** Retrieval + generation + verifier. Serverless
   open-weight inference. **Never interprets** — it retrieves real texts and
   composes them under the JSON contract, gated by the verifier. The model is
   infrastructure, not an oracle. *To build (this is the current phase.)*

## Services (the stack)

| Layer | Service | Role | Notes |
|---|---|---|---|
| Host + CDN | **Vercel Pro** | Next.js app, static content, edge | commercial tier; turn off Deployment Protection to go public |
| Relational + vector DB | **Neon Postgres + pgvector** | user data + retrieval index (HNSW) | one store; needs Large compute (~$110/mo) once the full embedding index must sit in RAM |
| Auth | **Neon Auth** | Google/GitHub login, JWT → RLS | set env in Vercel to activate |
| File storage | **Vercel Blob** | user PDF/EPUB uploads | metadata row in Neon `user_library` |
| LLM inference | **DeepInfra (primary) + Nebius (failover)** | open-weight per-token serving + LoRA hosting | version-pin; alert on model-identity drift |
| Embeddings | **DeepInfra-hosted embedder** (or self-host) | corpus + query vectors | open model only |
| Reranker | **BGE-reranker-v2-m3** | precision after vector recall | DeepInfra or self |
| Fine-tune (training) | **Fireworks managed LoRA** *or* **Modal/RunPod GPU** | one-time adapter training | serve the result on DeepInfra/Nebius |
| Observability (later) | Sentry, PostHog | errors, product analytics | launch phase |

**Hard rule: zero OpenAI/Anthropic models anywhere** — generation, embeddings,
reranking, verifier, and even eval synthetic-data generation. Open weights only.
"OpenAI-compatible API" means only the request/response JSON shape, not their
models.

## Models (which model for which job)

Verified current as of July 2026; re-check at build time — the field moves monthly.

| Job | Model | License | Why |
|---|---|---|---|
| **Generation / extraction / composition** (the brain) | **Qwen3.6-35B-A3B-Instruct** | Apache 2.0 | MoE (~3B active) = cheap + fast, strong tool/JSON, long context. Primary. |
| Composition upgrade (only if evals demand) | DeepSeek V4 / Qwen3.5-397B-A17B | MIT / Apache | bigger, pricier; rarely needed in a retrieval-grounded design |
| **High-volume classifier tier** (stance, per-claim extraction) | **Granite 4.0 (3–8B)** or Qwen3.5-small | Apache | tuned for reliable structured JSON; cheap enough to call many times per sermon |
| **Embeddings** | Qwen3-Embedding or BGE-M3 (or keep Jina v3) | open | 1024-dim; retrieval quality > model size |
| **Reranker** | BGE-reranker-v2-m3 | open | cross-encoder; biggest precision win per dollar |
| **Fine-tuned classifiers** (Phase D) | LoRA on Granite 4.0 3–8B | Apache | verifier-V2 + stance, from your logged data |

## Training: "train / untrain with weights"

The mental model: **you never touch the base model's weights.** The base
(Qwen3.6 / Granite) is frozen. You attach a small **LoRA adapter** — a few MB of
extra weights that ride on top.

- **Phase 1 — no training at all.** Prompt + RAG + contract + verifier on the
  stock model. Prove the product. Most of the value is here.
- **Phase 2 — LoRA, and only for two narrow jobs**, once you have logged data
  (~1–2k examples): (a) **contract adherence / "cite, never opine"**, and
  (b) **stance** (agree/disagree). Two techniques:
  - **SFT** on your own good examples (teach the format).
  - **DPO** on *pairs* — a good citation-only answer vs. a lab-style
    editorializing one — to steer the model **away from** the "give my own
    helpful take" grain. This is the closest thing to "untraining" a behavior:
    you push the probability mass off the unwanted habit without retraining from
    scratch.
- **"Untrain" is free because LoRA is modular and reversible.** Detach the
  adapter → you're back to the base. Version adapters, A/B them, canary-promote
  (OUTPUT_CONTRACT.md §4), roll back instantly. Nothing is destructive.
- **Where:** train the adapter on **Fireworks managed SFT/DPO** (zero GPU ops) or
  a rented **Modal/RunPod** GPU; **serve** it per-token on **DeepInfra/Nebius**.
- **Never pre-train from scratch** — seven figures, months, no benefit over
  RAG + LoRA for a citation product.

## Request lifecycle (a sermon upload)

```
sermon text
  → extract claims/topics/refs        (Qwen3.6, JSON)
  → retrieve per claim                (pgvector + BM25 hybrid over the corpus)
  → rerank                            (BGE-reranker-v2-m3)
  → classify stance vs each source    (Granite 3–8B: aligns/differs/qualifies)
  → find similar sermons + passages   (vector NN over sermon corpus + TSK cross-refs)
  → compose under the JSON contract   (Qwen3.6 emits blocks, never prose)
  → verify                            (V1 deterministic + V2 classifier + stance grounding)
  → render                            (client renders blocks; model never free-writes)
```

Retrieval does the substantive work. Only the extract / stance / compose steps
touch an LLM. The verifier is the only thing standing between generation and the
user.

## Cost posture (beta)

At beta volume this is pocket change: ~$0.0005 per composed response on Qwen3.6,
plus Neon/Vercel base tiers. The expensive line item is Neon Large compute
(~$110/mo) when the full embedding index must live in RAM — defer until retrieval
feels slow. See INFRA.md for the tier-by-tier table.

## Build order (intelligence plane)

1. **Retrieval** — embed the corpus into Neon pgvector, wire hybrid BM25+vector
   + reranker. (No new account needed to prototype with an open embedder.)
2. **Contract + V1 verifier** — already scaffolded in `src/contract`, `src/verifier`.
3. **First teacher prompt** → Qwen3.6 → contract JSON → verifier → render; iterate
   until the `interpretation_bait` eval suite passes.
4. **Sermon companion** — ingest sermon corpus + TSK; add stance step + `stance`
   block + `stance_grounding` evals (SERMON_COMPANION.md).
5. **Phase-D LoRA** — fine-tune the two classifiers from logged data; serve the
   adapter on DeepInfra/Nebius; promote via canary.

The only thing that needs your accounts/keys is step 3 onward (a DeepInfra key +
an embeddings key). Everything before that is code.
