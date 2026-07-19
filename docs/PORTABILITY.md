# PORTABILITY — running this repo from a non-Claude agent (Kimi, etc.)

> **Landed 2026-07-19 (Item 1 first act).** The adapter that lets a non-Claude orchestrator run [`BUILD_MODEL.md`](BUILD_MODEL.md) + [`CLAUDE.md`](../CLAUDE.md) faithfully.

`BUILD_MODEL.md` is the operating model and it is model-agnostic. But Claude Code gives Claude two things another runtime doesn't get for free: it **auto-loads `CLAUDE.md`** every turn, and it can **invoke** slash-commands and skills. A different agent (Kimi and its swarm) gets neither automatically. This doc is the translation layer. Read it first, then operate along `BUILD_MODEL.md`.

## 1. Load these before doing anything (nothing auto-loads)

The rules are not injected for you — you must read them:
- [`CLAUDE.md`](../CLAUDE.md) — the standing law (the product guarantee, coding standards, the gate, the Never list).
- [`docs/THE_LOOP.md`](THE_LOOP.md) — the thesis: the verifier is the bottleneck; no work is done without a check that could have failed.
- [`docs/BUILD_MODEL.md`](BUILD_MODEL.md) — how builds run (loop, lanes, swarm-inside-slice, §0 single orchestrator).
- [`docs/STATE_OF_TRUTH.md`](STATE_OF_TRUTH.md) — the current verified state; trust it for facts over any older doc.
- [`docs/DECISIONS.md`](DECISIONS.md) — the ADR log; don't re-litigate settled calls.
- The relevant skill file(s) for what you're doing (see §2).

## 2. Dialect map — commands and skills you can't "invoke," only read

Claude's slash-commands and skills are plain markdown. You can't call them; you **read them and follow them**:

**Note the two different things both spelled "audit"** — they are NOT the same, and the loop uses both:

| Claude does | You do |
|---|---|
| `npm run audit` (the **gate**) | run `npm run audit` (or `corepack pnpm run audit`) — the mechanical gate `scripts/audit.sh`: typecheck/lint/knip/tests/qa/license. This is BUILD_MODEL §1.3. |
| `/audit` (the **slash-command**) | read `.claude/commands/audit.md` and **perform that adversarial slop-review yourself** — a SEPARATE artifact from the gate above. This is BUILD_MODEL §1.4 (fresh agent ≠ author). Don't collapse the two into "run the gate twice." |
| `/security` | read `.claude/commands/security.md` and perform that review yourself |
| invoke `deep-audit` skill | read `.claude/skills/deep-audit/SKILL.md` and run it as a checklist: 4–8 fresh agents, non-overlapping lenses, none auditing own output, one deduped severity-ordered report |
| invoke `quality-slice` | read `.claude/skills/quality-slice/SKILL.md` — the retrieval/eval methodology (diagnose-before-fix, held-out discipline, freeze+hash, ship on a fresh vN) |
| invoke `false-confidence-audit` | read `.claude/skills/false-confidence-audit/SKILL.md` — the "is this green earned" pass |
| invoke `overnight-run` | read `.claude/skills/overnight-run/SKILL.md` — the bulk/long-run procedure (Item 2 of the work order is exactly this domain) |

Reading a skill and *claiming* you ran it without doing the work is the exact false-confidence THE_LOOP forbids. If you didn't do the procedure, say so.

## 3. Toolchain — the traps that silently break the gate

- **Install with pnpm, not npm.** The lockfile is `pnpm-lock.yaml`. Use `corepack pnpm install` — a plain `npm install` produces a different tree. You do **not** need a `pnpm` binary on PATH and you do **not** need `corepack enable` (which fails without sudo on a stock Mac) — `corepack pnpm …` works directly.
- **Running the gate: `npm run audit` is the canonical spelling.** `npm run audit` and `corepack pnpm run audit` both execute `scripts/audit.sh`, which calls `corepack pnpm` internally — so the runner spelling doesn't matter for the gate. CLAUDE.md/BUILD_MODEL say `npm run audit`; use that.
- **Install wires the safety hooks.** `corepack pnpm install` runs the `prepare` script, which sets `git config core.hooksPath .githooks` — that's what activates the pre-commit byte-sync guards and the forbidden-provenance ratchet. Skip install, skip the guards.
- **`pnpm run audit` ≠ `pnpm audit`.** The first is the repo's gate; the second is pnpm's own CVE command. The audit script warns about this itself.
- **Migrations are owner-run.** Author the SQL + its red-first test; do not apply migrations to a shared DB on your own authority (see §5).

## 4. Env — what silently no-ops without secrets (mark UNVERIFIED, not PASSED)

Much of the code needs env that isn't in git. Without it, whole checks execute **zero assertions and still exit green** — the false-green trap:
- `DATABASE_URL` / `APP_DATABASE_URL` — the DB-backed invariant tests (verse-key distribution, licensing DB check, RLS two-account tenancy) `skipIf` no DB. Green without a DB means **not run**, not **passed**.
- `DEEPINFRA_API_KEY` — embeddings + rerank; the eval harness and anything on the retrieval path can't run without it.
- `SITE_PASSWORD`, `EVAL_HARNESS_SECRET`, the gate/ask rate-limit vars — gate + eval endpoints.
- Others the code reads: `DATABASE_URL_UNPOOLED` (ingest), `APP_DATABASE_URL_TEST` (the CI db-invariants job — STATE_OF_TRUTH §7's own false-green case), `NEON_AUTH_*`, `LICENSE_ACK` (predeploy gate), `NEXT_PUBLIC_SITE_URL`.
- **Authoritative list, don't maintain a competing one here:** `web/.env.local` (+ root `.env.local`) is the source of truth; the Item-1 env-reference table, once written, is its documented form.

Rule: if you couldn't run a check because a secret was absent, report it **UNVERIFIED**. Never state a DB/AI/eval result you didn't actually execute.

## 5. Repo-shape facts — deliberate, do NOT flag as bugs

These look wrong to a fresh auditor and are not. Flagging them is noise:
- **The corpus is gitignored.** `web/public/commentaries/`, `web/public/bible/`, etc. are not in git and reach prod **only** via `deploy.sh`'s working-tree upload (`vercel --prod --archive=tgz`). A git/CI build ships code without the corpus — that's why prod's git connection is **off by design**.
- **Two Vercel projects, one is real.** Real prod = the `web` project → ancientpaths.app, git-disconnected. The misspelled stray is dead. **Committed ≠ live** — verify in the environment a change protects.
- **Owner-accepted content.** The tree contains copyrighted-author entries and other raw sample data on a **private, gated, single-user pre-launch** tree. The owner has explicitly accepted this as content / gate-and-search test data. **Do not treat it as a fire, do not remove it, do not re-raise it as a licensing risk.** Gating is a future feature, not a present emergency.
- Static/aspirational docs may lag reality — trust `STATE_OF_TRUTH.md` and `DECISIONS.md`, not the Supabase-era files.

## 6. The handoff protocol (§0 of BUILD_MODEL, restated for you)

**One orchestrator owns the tree at a time.** Before you touch anything:
1. Confirm the outgoing orchestrator handed off cleanly: it stated `main` is at `<sha>`, working tree clean, and which branch/phase any in-flight build sits on.
2. **Verify it yourself** — `git status` (clean), `git log --oneline -3` (matches the stated sha), the migration list, the branch topology. Never assume "the merge is done."
3. Only then begin. While you hold the tree, no other agent writes to it; reads (audits, syntheses) may run in parallel.
4. When you stop, hand back the same way: sha, clean tree, branch/phase state, and the escalation ledger of any owner-decision items you hit.

> **Stale worktrees:** a prior runtime may leave worktrees registered (e.g. under `/private/tmp/…`) that read like active lanes but aren't. Confirm liveness before treating any as a lane; prune dead ones with `git worktree prune`.

## 7. Your runtime — how the model's abstractions map to your swarm

BUILD_MODEL is model-agnostic and can't know your mechanics; pin them here:
- **Subagents have a ~30-min wall-clock timeout and are resumable with context intact.** Size a coder slice to ≲25 min of work, or checkpoint-and-resume it. Per-work ingestion agents are the right granularity (aligns with ADR-012's idempotent-batch rule).
- **Fan-out = AgentSwarm, up to 128 items, ramp capped by `KIMI_CODE_AGENT_SWARM_MAX_CONCURRENCY`.** BUILD_MODEL §3's "5–8 concurrent, sized to the verifier and quota" is directly expressible — set the cap; do not run 128 wide.
- Worktrees, fresh-agent audits, and owner gates are all executable as written.

---

*This doc plus `BUILD_MODEL.md` plus `CLAUDE.md` is the full operating context. One canonical playbook, one thin adapter — no forked rulebook.*
