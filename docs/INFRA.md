# Document 4: Fresh infrastructure checklist

> **⛔ SUPERSEDED (2026-07-19).** Supabase-era infrastructure plan — the system runs on Neon + Vercel; see `docs/DEPLOYMENT.md` and `docs/STATE_OF_TRUTH.md`. Kept for history; do not build from this.

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

---

# Live topology + cutover decision tree (Session 1, 2026-07-27)

Read-only diagnosis before the Part 5 cutover build. Method: `scripts/prod-census.cjs`
evidence (2026-07-23), `scripts/ground-truth.mjs --env=dev`, direct read-only SQL on dev,
`vercel projects ls`, git history. **No prod write. No prod read this session — see BLOCKER 1.**

## Neon topology

| endpoint | role | state (2026-07-27) | consumers |
|---|---|---|---|
| `ep-odd-fog-atnykudm` | **production** | last verified read 2026-07-23 (census). Pre-migration-016. | Vercel project `web` (ancientpaths.app); `NEON_AUTH_*` in `web/.env.local` |
| `ep-tiny-hat-atdgpisx` | **dev** | live, 420,974 platform rows, 296,019 with work key, migrations 016-030 applied | `web/.env.local` `DATABASE_URL(_UNPOOLED)`; ingest scripts |
| `ep-wispy-violet-atiddys9` | census-clone (fork of prod, 2026-07-24 rehearsal) | **STILL ALIVE and authenticating** — it did *not* auto-delete | `.env.prod` (currently pointed here) |

**Corpus gap that motivates the cutover** — prod 190,635 flat embeddings, **100% with NO work
key** (register ingest never ran), sections = Barnes pilot only (2 sources / 5,510 sections).
Dev carries 35 works across registers: prose 290,796 (20 works, incl. spurgeon-sermons 118,371),
poetry 3,533 (10 works), hymn 1,690 (5 works). **None of it is in prod.**

## BLOCKER 1 — no working prod credential (cutover cannot start)

`.env.prod` points at the **census clone**, not prod (WORKLOG 2026-07-24 flagged the swap-back as
pending and it never happened). The only `ep-odd-fog` credential recoverable on this machine (from
the pre-sanitization `.env.prod.example`) **fails password authentication**, and its `NEON_BRANCH`
said `census-clone`, so it was never a live prod credential in the first place.

- *Rival explanation ruled out:* not a network/SSL fault — the same probe against
  `ep-wispy-violet` with the same client authenticates and passes a temp-table write probe.
- **Action: owner refreshes the prod `neondb_owner` credential (`OWNER_ACTIONS.md` §7) and points
  `.env.prod` back at `ep-odd-fog`.** This is the decision-tree row "prod credential stale ->
  cutover cannot start". E0 would catch it, but catching it at E0 wastes Session 2.

## Vercel

| project | production URL | git-connected? | notes |
|---|---|---|---|
| `web` | **ancientpaths.app** (the real site) | not shown by `vercel project inspect` — **UNRESOLVED** | CLI-deployed; last deploy of record `24677ba` (2026-07-18) |
| `theology-study-app` | `theology-study-app-home-network-hardening.vercel.app` | **UNRESOLVED** | `24677ba` disconnected the misspelled stray project |
| `project-nl2ey` | none (22d idle) | — | unrelated |

**Not verified this session:** whether either project can still deploy on push, and which Neon
branch each environment's `DATABASE_URL` points at. `vercel project inspect` does not print git
linkage, and reading Vercel env values would mean pulling prod secrets to disk. **Do not treat the
"two deploy paths" row as cleared** — it is unmeasured, not clean.

## The two checks that change the plan (1c)

**1c-1 — is forbidden provenance inside the served pool? PARTIALLY, bounded ≤7,019 of 71,884.**
Prod's 71,884 forbidden rows (56,177 `historicalchristian.faith` + 15,707 `biblehub.com`,
studylight 0) break down by author (rehearsal log, prod fork). Against `LEGAL_CORPUS_FILTER`:

- The four **unconstrained** authors (John Gill, JFB, Adam Clarke, Matthew Henry) have **ZERO**
  forbidden rows. Corroborated end-to-end: E6 smoke on the fork reports Gill = 28,843, *identical*
  to the pre-E3 census. The bulk of the served pool is untouched by E3.
- `work IN SERVED_PROSE_WORKS` matches **0 rows on prod** (100% NULL work key).
- Barnes/Wesley/Calvin require `sourceUrl ILIKE '%crosswire%'`, which biblehub/HCF rows fail **by
  construction** — not served. (Note the forbidden list's string is `Barnes' Notes`, which the
  filter's `Albert Barnes` never matches either way.)
- **The only served overlap is the two book-scoped legs:** John Chrysostom (4,464 forbidden rows,
  served only in books 40/43/44) and Augustine of Hippo (2,555, served only in 19/43). Upper bound
  **7,019 rows = 9.8%** of the forbidden set; the true figure is lower and needs one prod query.
- *Correction:* the E3 `REFUSE (coverage gap)` in the rehearsal is **not** evidence that forbidden
  rows are served. It was a **guard defect** — NULL `sourceUrl` was miscounted as unclean — fixed
  same day ("NULL sourceUrl = clean; post-delete per-cell invariant"). Do not cite it as proof.

**1c-2 — was v4 measured on an already-cleaned dev corpus? YES, confirmed by commit ordering.**

| time (2026-07-18) | commit | event |
|---|---|---|
| 17:26:25 | `daa7b15` | B2 widened to all forbidden domains -> 0/0 across served stores |
| 17:40:08 | `45b5bab` | 15,537 biblehub embeddings rows removed, ratchet 0/0 |
| 18:30:03 | `a070e1e` | honest v3 re-baseline **"on cleaned dev DB"** (its own words) |
| 18:34:55 | `a9dac8c` | v4 minted + FROZEN (`90de5dc3`) |
| 18:39:46 | `f2b5297` | v4 run once |

Cleanup precedes the v4 mint by ~1 hour. Dev measured **0 biblehub / 0 studylight / 0 HCF** today.
**Therefore E3 does not touch the v4 numbers, and no v5 is owed on account of E3.** The workorder's
"if served -> v5 owed" conditional is defeated here: v4 was never measured against those rows,
because it was measured on dev, and dev was already clean. E3 moves prod *toward* the measured
configuration, not away from it.

**Owner call this still leaves:** E3 removes up to 7,019 rows that prod serves *today*, so the
live corpus changes for real users. That is a licensing-positive change (the rows are
forbidden-provenance) and the clean re-ingest replaces those voices from NPNF/CCEL, but the
timeline call — cutover now vs. re-source first — is the owner's.

## Findings noted, deliberately not acted on

- **Dev drift:** `app_runtime` holds `INSERT/UPDATE/DELETE` on `embeddings` on dev, against the
  documented SELECT-only claim (`ground-truth.mjs --env=dev` row 5). Dev correctness is not this
  session's job. Do not "fix" it on prod by reflex — the prod grant is a separate owner item.
- **`ground-truth.mjs` fixed this session:** it hardcoded `web/.env.local` (dev) while its header
  claimed prod truth. It now requires `--env=dev|prod`, prints the host before any check, and
  aborts on an endpoint/env mismatch. Proven red-first: `--env=prod` currently aborts because
  `.env.prod` points at the clone.
