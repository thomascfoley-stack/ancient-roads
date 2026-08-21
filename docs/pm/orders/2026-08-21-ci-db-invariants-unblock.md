# Order — make `db-invariants` mean something again

**Filed 2026-08-21. Owner-executed in a browser; the code half is agent work.**

`db-invariants` has been RED on every run for weeks and nobody decided that. It is not
five broken invariants — it is five checks that **cannot execute**, four for want of data
and one for want of secrets. A gate that cannot go green is worse than no gate: it trains
everyone to ship through red, and this branch has now been deployed six times that way.

Two independent instruments agree on the diagnosis (CI logs read by the Lane-A session;
local runs against the dev database by this one). Verbatim CI failure reasons:

| Suite | Why it fails |
|---|---|
| `history-scope-db` | "no served anchored entities — cannot exercise the scope; **NOT a pass**" |
| `register-wall-surfaces` ×2 | "catalog \"devotionals\" must have works to fence" |
| `licensing` | "teacher must serve all 9 voices; MISSING: Jamieson (JFB)" |
| `plan-tenancy` | "seed plan refused: The corpus has no commentary coverage on this passage yet" |
| `neon-auth-live` | `REQUIRE_SECRETS:` missing `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` |

Measured locally against dev, where the data exists: `plan-tenancy` **6/6 pass**,
`licensing` **6/6 pass**, `register-wall-surfaces` **6/6 pass**. The properties are true.
The CI database cannot see them.

**The tests are the best-written thing in this job — do not touch them.** Each refuses to
pass vacuously; `history-scope-db` says "NOT a pass" in its own assertion text. The
configuration is what is wrong.

---

## Part 1 — the four data-starved suites (agent work, not browser)

**Root cause, and it dates the rot precisely:** `.github/workflows/audit.yml:128` sets
`PARENT_BRANCH: ci-test-20260729` — a branch cut **2026-07-29**. Essentially every served
row in this product landed in August: the topical publish (08-03), the P4.n batches, the
28-work history corpus (08-21), `gill-song`, `barnes-crosswire-nt`. CI has been asserting
properties of a served corpus against a snapshot taken before that corpus existed.

**Recommended fix: repoint `PARENT_BRANCH` at `dev` (`ep-tiny-hat`).** One line.

Why dev and not a purpose-seeded branch: a frozen seeded branch is *how you get another
`ci-test-20260729`* — it goes stale silently and nothing tells you. Dev is the only
candidate empirically confirmed green (the three suites above, run there today), it stays
current for free, and its drift runs mostly in the safe direction — these suites need
served corpus to EXIST, and dev's grows. The drift that would redden them is a withdrawal
(an unpublish or quarantine), which is exactly what a gate should shout about.

Honest cost: dev gets reset (the 08-10 reset destroyed the P4.n payload). When that
happens the gate reddens loudly for everyone — which beats silent and false. And this is
only safe **because** of the ephemeral-branch work: each run gets a throwaway copy that is
deleted at the end, so CI never mutates dev. That precondition did not exist last week.

**Do not skip this check after flipping it:** the ephemeral branch gets a NEW endpoint id
every run, and the seed guard in `web/test/helpers/env.ts` allowlists endpoints **by id**
(`DEV_ENDPOINTS`, or an exact `SEED_TEST_ENDPOINT` declaration). Confirm the four
seed-requiring suites actually EXECUTE afterward rather than newly skipping — otherwise
five failures become four silent no-ops, which is worse than today.

---

## Part 2 — `neon-auth-live` (browser work: Neon console + GitHub)

No parent change reaches this one. It needs two secrets.

### The hard constraint, read this first

**Do NOT use the production Neon Auth values.**

`web/test/invariants/neon-auth-live.test.ts` **signs up a real user** against whichever
Neon Auth instance the vars point at, and deliberately has **no cleanup** — its own words:
*"No afterAll delete: Neon's server client here has no admin/delete-by-email call that
doesn't require the caller's own session"* and *"this must never point at production."*

Wire production credentials into CI and **every run permanently creates an undeletable
`neonauth-live-<stamp>@example.invalid` user in the live auth system.** They are
timestamp-unique so nothing collides — they just accumulate forever.

So this needs a **non-production Neon Auth instance**, and its credentials.

### What already exists (verified 2026-08-21, do not re-derive)

- Vercel project `home-network-hardening/web` holds `NEON_AUTH_BASE_URL`,
  `NEON_AUTH_COOKIE_SECRET` and `NEON_AUTH_JWKS_URL`, all **Production**, all **Encrypted /
  Sensitive → cannot be read back**, not even by `vercel env pull`. The Neon console is the
  only source. (This is the same wall the O-1 audit hit; see MASTER → O-1 correction 3.)
- GitHub Actions secrets on this repo are exactly four: `APP_DATABASE_URL_TEST`,
  `DEEPINFRA_API_KEY`, `INGEST_DEV_DATABASE_URL`, `NEON_API_KEY`. **No `NEON_AUTH_*`.**
- `NEON_AUTH_JWKS_URL` is referenced **nowhere** in the codebase (grepped `web/src` and
  `src`). It is dead. Do not carry it forward.
- Production Neon project id: `spring-heart-74819093`.

### Task A — a non-production Neon Auth instance

Goal: a Neon Auth instance that is **not** the one serving `ancientpaths.app`, from which
a base URL and a cookie secret can be obtained.

**This is deliberately not written as a click path.** The Neon console's Neon Auth setup
was last touched on 2026-08-08 during the C5 cutover and the UI is not documented here;
inventing steps for an agent to follow is how this goes wrong. Investigate the console and
report what the options actually are before changing anything. Specifically establish:

1. Can Neon Auth be enabled on a **second, non-production project** (or a dev branch) in
   this account, separate from `spring-heart-74819093`?
2. Where is that instance's **base URL** displayed?
3. Is the **cookie secret** issued by Neon, or is it a value we generate ourselves? (In
   `web/src/lib/auth/neon-auth.ts` it is passed as `cookies: { secret }` to
   `createNeonAuth` — the app only ever reads it from env, so either is possible.)
4. **Trusted domains.** The C5 cutover recorded this as a fourth console action that is
   easy to miss: with the trusted-domains list empty, every OAuth redirect is blocked with
   *no signal visible to the repo, the SDK types, or the deploy gate*. It cost a debugging
   cycle once. If the new instance needs it, set it.

**Change nothing on the production instance.** Read-only there.

### Task B — add two GitHub Actions secrets

Repo: `thomascfoley-stack/ancient-roads` → Settings → Secrets and variables → Actions.

| Secret name | Value |
|---|---|
| `NEON_AUTH_BASE_URL` | base URL of the **non-production** instance from Task A |
| `NEON_AUTH_COOKIE_SECRET` | cookie secret of that same instance |

Names must match exactly — `web/src/lib/auth/neon-auth.ts:21-22` reads
`process.env.NEON_AUTH_BASE_URL` and `process.env.NEON_AUTH_COOKIE_SECRET`.

**Secret handling, non-negotiable:** carry each value from the Neon console **directly
into the GitHub secret field**. Do not paste it into a chat message, a terminal, a file, a
commit, or a summary. Do not echo it back for confirmation. GitHub masks Actions secrets in
logs; nothing else here does. `gh secret set NEON_AUTH_BASE_URL` prompts without echoing and
is a fine alternative to the web UI.

### Task C — workflow wiring (agent work, one line each)

The secrets do not reach the tests on their own. Add both to the `DB-backed invariants
(real DB)` step's `env:` block in `.github/workflows/audit.yml` (~line 331), beside
`DEEPINFRA_API_KEY`:

```yaml
          NEON_AUTH_BASE_URL: ${{ secrets.NEON_AUTH_BASE_URL }}
          NEON_AUTH_COOKIE_SECRET: ${{ secrets.NEON_AUTH_COOKIE_SECRET }}
```

Note the existing comment in that block: several vars deliberately arrive via `GITHUB_ENV`
rather than step-level `env:`, because *"an unset `${{ secrets.X }}` renders as an EMPTY
STRING and would shadow the real value."* That hazard does not apply to these two — nothing
else sets them — but do not "tidy" the others into the same block.

---

## Acceptance — how we know it worked

1. `db-invariants` job conclusion is **success** on a fresh run.
2. The four data suites **executed** — not skipped. Check the run log for
   `plan-tenancy`, `licensing`, `register-wall-surfaces` ×2 reporting passes, and for the
   absence of any new `⚠ NOT RUN` line naming them (see Part 1's endpoint-allowlist trap).
3. `neon-auth-live` **executed** — it should report 3 passing tests, not
   `REQUIRE_SECRETS:`.
4. The ephemeral branch was **deleted** at the end of the run (the cleanup step already
   works; confirm it still does).
5. No new user appears in the **production** auth system. If one does, Task A pointed at
   prod — stop and revert the secrets immediately.

## Not covered

- Whether a second Neon Auth instance is even offered on this Neon plan. If it is not, the
  honest fallback is to change `neon-auth-live`'s requirement `kind` from `secret` to
  `artifact` in its `announceSkip` call, so CI reports **NOT RUN** loudly instead of FAIL —
  a deliberate, recorded downgrade rather than a permanently red job. That is an owner call
  and should be recorded in `docs/DECISIONS.md` if taken.
- The 12-char password minimum and reset-revokes-sessions, recorded at C5 as unenforceable
  in Neon's config. Unchanged by this work.
