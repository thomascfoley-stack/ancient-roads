# Document 4: Fresh infrastructure checklist

Everything net-new, zero overlap with composio.dev or any existing personal
project accounts. Create a dedicated email first; every account below hangs
off it.

## Identity and code

- [ ] Project email (e.g. Google Workspace or Fastmail on the project domain;
      bootstrap with a plain Gmail if the domain isn't picked yet)
- [ ] Domain (registrar: Cloudflare, at-cost renewals) + Cloudflare account
      for DNS
- [ ] GitHub org (not personal account) - repos, CI via Actions
- [ ] 1Password or Bitwarden vault dedicated to this project - every
      credential below goes in at creation time, no exceptions

## Core stack

- [x] Supabase org + project (Postgres, auth, RLS, pgvector, storage).
      Free tier for dev; Pro ($25/mo) before real users for backups + PITR.
      Verified 2026-07: auth is $0.00325/MAU past 100k (1M MAU = $2.9k/mo,
      an order of magnitude cheaper than Clerk); plan on Large compute
      ($110/mo, 8 GB) as the floor once the embedded corpus ships — the HNSW
      index must fit in RAM; XL ($210/mo) is comfortable. PITR is a separate
      add-on ($100/mo for 7-day). GOTCHA: Storage objects (user PDF uploads)
      are NOT in database backups or PITR — schedule a separate
      export/replication for the storage bucket, plus a weekly off-platform
      pg_dump
- [x] Vercel account (web app). Hobby for dev, Pro before launch
- [ ] Expo account + EAS (mobile builds) - needed at mobile phase, not before

## Models

Verified 2026-07: Fireworks and Together both dropped Qwen3 dense from
serverless, and Together's serverless LoRA story is gone from current docs.
The budget providers now fit the requirements (version pinning, future LoRA
hosting, per-token, no GPU ops) better than the premium pair.

- [ ] DeepInfra (primary): Qwen3 32B serverless at $0.08/$0.28 per Mtok,
      cheapest tracked; explicit version pinning via MODEL:VERSION; LoRA
      adapters served per-token at base+50%. HAZARD: deprecated models are
      silently auto-forwarded to a replacement — always pin the version and
      alert on model-identity drift in responses
- [ ] Nebius Token Factory (secondary/failover): Qwen3 32B $0.10/$0.30;
      cleanest upload-your-own-LoRA per-token hosting (~10 adapter slots on
      Starter). Dual-sourcing matters because providers are pruning older
      dense models industry-wide with 1-2 week notices
- [ ] Hugging Face: NOT needed at launch (Qwen3 is Apache 2.0, ungated).
      Create free account at fine-tune phase: gated licenses (Llama) and the
      standard LoRA-adapter handoff to providers both go through HF repos
- [ ] Later, fine-tune phase: Modal or RunPod for training runs

## Money

- [ ] Business entity decision BEFORE Apple/Stripe signup: sole prop vs LLC.
      Fact to know: Apple's App Store listing shows the legal entity name;
      individual accounts show your personal name publicly. LLC also
      simplifies Stripe, licensing contracts with publishers, and any future
      hire. If LLC: form it first, then EIN, then business bank account,
      then everything below uses the entity
- [ ] Stripe (web subscriptions)
- [ ] Apple Developer Program ($99/yr) - enrollment can take days-weeks for
      an entity; start early in the mobile phase
- [ ] Google Play Console ($25 once)
- [ ] RevenueCat (wraps both stores + Stripe entitlement sync)

## Observability (launch phase, not day one)

- [ ] Sentry (errors, web + mobile)
- [ ] PostHog (product analytics; self-hostable later if the privacy
      posture warrants it)
- [ ] Axiom or Betterstack (logs)

## Explicitly not needed

- No OpenAI or Anthropic accounts for the product (TOS + privacy posture;
  see OUTPUT_CONTRACT.md on synthetic data)
- No AWS/GCP until self-hosting GPUs is justified by the serving bill
- No Redis/queue until a concrete feature needs it (Supabase covers cron
  via pg_cron and queues via pgmq well past MVP)

## Beta posture (first 3-4 months, decided 2026-07-05)

Run everything on the lowest tier; nothing below requires re-platforming to
scale, only plan/compute upgrades.

| Service | Beta tier | Cost | Upgrade trigger |
|---|---|---|---|
| Supabase | Free -> Pro at corpus ingestion | $0 -> $25/mo | Free tier's 500 MB DB dies the day embeddings land; Pro (8 GB) carries a subset corpus on Micro compute. Large (~$110/mo) only when full corpus retrieval feels slow |
| Vercel | Hobby | $0 | Pro ($20/mo) when charging money (Hobby is non-commercial) |
| DeepInfra | Pay-as-you-go | ~$5-20/mo | Nothing to upgrade; a beta of 20-50 users at Qwen3 32B prices is pocket change (~$0.0005 per teacher response) |
| Nebius | Create account, wire as failover | $0 idle | Matters at public launch, not beta |
| Domain | - | ~$10/yr | - |
| PITR add-on | Skip; Pro daily backups + weekly pg_dump | $0 | First paying users |
| Sentry/PostHog | Free tiers | $0 | Public launch |
| Entity/Stripe/Apple/Play/RevenueCat/Expo | Not yet | $0 | First revenue / mobile phase |

Beta total: roughly $35-55/mo once corpus ingestion starts, ~$10/mo before.

Beta-specific corpus note: ingest in the doc order (Bibles + STEPBible first)
and stay on a subset (through Matthew Henry) until Pro compute is upgraded;
the full 300-600k-section corpus wants Large compute.

## Order of operations

1. Email -> password vault -> domain -> GitHub org
2. Supabase + Vercel (dev tiers) - start building same day
3. DeepInfra (+ Nebius as failover) - first retrieval + generation loop
4. Entity -> Stripe (first paying web users)
5. Apple/Play/RevenueCat/Expo (mobile phase)
6. Sentry/PostHog (pre-launch)
