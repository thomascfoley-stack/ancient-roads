# Design brief

Working title: theology study app — "What others have said"

A subscription Bible study product intended to replace Logos: an LLM study
tool that never interprets scripture. It reports what others have said, with
resolvable citations ("here's what Chrysostom said, four other voices, across
two traditions"), points to passages and reading, and suggests prayer. No
advice beyond that. Target: web, mobile, iPad; millions of users; limited free
plan. Horizon: 1-2 years, solo non-developer founder building agentically on
all-new personal infrastructure.

## Decisions of record

1. **The guarantee is architectural, not trained.** "Never interprets" cannot
   live in model weights. It lives in retrieval over a curated corpus, a
   constrained JSON output contract, and a verifier that rejects violations
   before render. The corpus lives in the database, not the weights.
2. **Open weights, self-controlled.** No OpenAI/Anthropic in the product:
   sovereignty (no lab can move the product's behavior under us), privacy
   posture, and TOS (their outputs can't train a competing model). Launch
   generation on Qwen3 32B via DeepInfra (primary, $0.08/$0.28 per Mtok,
   version pinning) with Nebius Token Factory as failover (verified July
   2026; Fireworks and Together no longer serve Qwen3 dense serverless).
   Distill to a small model after ~50k real transcripts. Embeddings: bge-m3.
   Synthetic data only from permissively licensed models. Provider-side
   retention terms are a tiebreaker, not a gate (decided 2026-07-05).
3. **Slack-shaped workspace: channels = studies, teachers = @mentions.** A
   channel is a persistent study topic ("#self-control"); teachers
   (@historian, @greek-tutor, @study-guide) are personas invoked in any
   study: same base model, different system prompt + retrieval filter +
   contract config. Teachers are config rows, not models. DMs = quick
   one-off questions.
4. **Two screen formats, no tabs.** Study mode: three-pane workspace (studies
   rail, chat, reader panel); every verse reference in chat is a link that
   populates the reader panel in place. Read mode: the word takes the full
   canvas, study chrome disappears, exit returns to the study where you left
   off. Search is the third top-level mode. This replaces Logos tab
   management.
5. **Model-swap architecture.** One internal gateway, zero direct provider
   calls; a model registry table (candidate / canary / active / retired) and
   per-teacher model mapping; eval-gated promotion with canary traffic and
   verifier rejection rate as the live health metric. Swapping a model is an
   UPDATE, not a deploy.
6. **The fat head is curated.** The top ~200 struggles (alcohol, anxiety,
   grief...) get precomputed, human-reviewed topical guides served from
   cache. Unit economics and editorial control on the most sensitive
   queries; live generation is for the long tail.
7. **User uploads are a separate feature behind a wall.** Curated corpus
   (shared, reviewed, guaranteed) vs user library (private PDFs/DOCX/EPUB,
   owner-only RLS, never shared, never in guides, never trained on). Upload
   citations pass identical verifier checks but render badged "from your
   library": no borrowed authority.
8. **Tradition diversity is a metadata query.** Every source is tagged
   tradition + era; the "5 voices, 2+ traditions" rule is enforced by the
   contract and satisfied by a join, not a model.

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js on Vercel |
| Mobile / iPad | Expo (React Native), offline reading required |
| Database / auth / RLS | Supabase (Postgres 16, pgvector, storage) |
| Model serving | DeepInfra (primary) + Nebius (failover), pinned open weights; self-host vLLM only when the bill justifies it |
| Retrieval | BM25 (tsvector) + pgvector HNSW + reranker; exact verse-reference parse bypasses search |
| Payments | Stripe (web) + RevenueCat (App Store / Play) |
| Upload parsing | Small dedicated worker (Fly.io or Modal) polling pgmq; Docling/marker for PDF, mammoth for DOCX |
| Fine-tuning (phase 4) | LoRA via Axolotl/Unsloth, DPO from eval preferences, on Modal/RunPod |

## Roadmap

- **Months 1-3, prove the bones.** Ingest public domain corpus with verse-ID
  anchoring and tradition metadata; RAG pipeline with output contract +
  verifier; eval harness (build this first); scrappy web prototype with ~20
  real users.
- **Months 4-8, web product.** Supabase auth + RLS, Stripe, top-200 topical
  guides, study memory, Greek/Hebrew word study. Free: N queries/month + full
  Bible reading. Paid: unlimited study, memory, original languages.
- **Months 9-14, mobile.** Expo app with offline reading, RevenueCat, reading
  plans. Start licensing conversations (ESV/NIV, modern commentaries) with
  usage data in hand. Security contractor review before public launch.
- **Months 15-24, scale and economics.** Fine-tune and distill to the small
  model; first modern translation license; infra hardening; church/group
  plans as the acquisition channel.
