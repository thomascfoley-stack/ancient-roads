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

- [ ] Supabase org + project (Postgres, auth, RLS, pgvector, storage).
      Free tier for dev; Pro ($25/mo) before real users for backups + PITR
- [ ] Vercel account (web app). Hobby for dev, Pro before launch
- [ ] Expo account + EAS (mobile builds) - needed at mobile phase, not before

## Models

- [ ] Fireworks AI or Together AI (serving pinned open weights; both offer
      no-retention terms - get it in writing on the plan you pick)
- [ ] Hugging Face account (weights, datasets)
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

## Order of operations

1. Email -> password vault -> domain -> GitHub org
2. Supabase + Vercel (dev tiers) - start building same day
3. Fireworks/Together + HF - first retrieval + generation loop
4. Entity -> Stripe (first paying web users)
5. Apple/Play/RevenueCat/Expo (mobile phase)
6. Sentry/PostHog (pre-launch)
