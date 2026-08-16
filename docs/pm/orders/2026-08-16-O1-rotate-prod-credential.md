# O-1 — Rotate the production database credential

**Filed 2026-08-16.** Board row: `docs/pm/MASTER.md` → Owner decisions → O-1.
Session type: **one agent session, owner present at a terminal and a browser.**

This is a **security remediation with a hard ordering constraint**, not a chore. Read the whole
brief before starting; step 3 is irreversible in the sense that matters (publishing the repo).

> **STATUS 2026-08-16: PRE-FLIGHT DONE · ROTATION DEFERRED TO JANUARY 2026 BY OWNER DECISION.**
> Owner: *"leave #1 alone forever, I will do it at my own discretion, we're in build mode… when we
> are done I will rotate. I will get users in January, in January I will rotate keys."* **That is a
> ruling. Do not re-raise the rotation as a blocker in any session before January** — Phases 1 and
> the §7 guard are complete; Phases 2, 3 and 4 wait on the owner and nothing else.
>
> **Read the four corrections inline below before executing, and correction 2 first.** The
> exposure is **wider than §1 states**: a second live credential, on the **dev** branch, in Neon's
> pre-`npg_` 43-character format, invisible to every `npg_`-keyed search in this document. Also
> corrected: §4's verification cannot detect a rotation, §5's `164` fires the §8 stop falsely, and
> §6's single-endpoint red-proof misses the branches forked from `production`.
>
> **Blast radius is capped by the repo being private, and by nothing else.** O-1 step 3 must not
> happen before step 1 — publishing pre-rotation publishes **two** working credentials.
>
> Session record: `WORKLOG.md` 2026-08-16 (latest) · `docs/SECURITY.md` → SEC-4 ·
> `docs/pm/MASTER.md` → O-1 · commits `5618cf6`, `0c47ef1`.

---

## 1. The finding

A live `neondb_owner` production connection string is reachable in **git history**:

```
git log --all --oneline -S'neondb_owner:npg_' --pickaxe-regex
```

Measured 2026-08-16: **5 commits, 12 diff lines.** The credential entered through evidence logs
written by `publish-flip` runs, which captured the full `CUTOVER_DATABASE_URL` in their command
echo. `bf2fbb0` ("SECURITY: redact the prod credential from six evidence logs") cleaned the
**working tree** — now 0 files — but a later redaction does not remove a secret from history.

### Scope — measured, and narrower than first stated

**Only `neondb_owner` is compromised.** Prod carries six login roles (`app_runtime`,
`authenticator`, `cloud_admin`, `neon_auth`, `neon_service`, `neondb_owner`). Two strings in
history match `app_runtime:` — they are **6 and 11 characters, non-`npg_`** (a real Neon secret
is `npg_` + 12) and live in `docs/OWNER_ACTIONS.md` and
`test/unit-ordinal-instrument-preflight.test.ts`. They are placeholders.

The first version of the board row claimed rotation "takes production down". **That is probably
wrong** and the session must settle it rather than inherit it: the app connects as
`app_runtime` (`web/src/lib/db.ts` prefers `APP_DATABASE_URL` and **refuses** to fall back to
`DATABASE_URL` in production), so a `neondb_owner` rotation should not touch serving. What it
certainly breaks is **owner tooling**: `~/.neon_prod_url`, `CUTOVER_DATABASE_URL`, migrations.

**Mitigating fact, and the reason step 3 is ordered last:** the repo is **private**. That is the
only thing currently capping blast radius.

---

## 2. What this session can and cannot do

**Cannot** (owner-only, do not attempt or ask for the values):
- Rotate the password (Neon console).
- Read or write Vercel environment variables (dashboard).
- Type any credential into a file or a prompt.

**Can, and should:**
- Derive the consumer set and verify it — never hand-type it.
- Take a pre-rotation baseline.
- Verify every consumer after rotation.
- Red-proof that the old credential is dead.
- Update the records.

---

## 3. Phase 1 — pre-flight (agent, before anything rotates)

### 3a. Derive the consumer set. Do not hand-type it.

A hand-typed "list of everywhere the credential lives" is this repo's single most frequent
defect class (MASTER.md failure-mode watchlist, artefact 1 — sixteen instances). Derive it:

```bash
grep -rhoE "(process\.env\.|env\.)[A-Z_]*DATABASE_URL[A-Z_]*" scripts src web/src db | sed -E 's/.*env\.//' | sort -u
```

Measured 2026-08-16 this yields **nine** names: `APP_DATABASE_URL`, `CUTOVER_DATABASE_URL`,
`DATABASE_URL`, `DATABASE_URL_APP`, `DATABASE_URL_OWNER`, `DATABASE_URL_UNPOOLED`,
`DEV_DATABASE_URL`, `FRONT_MATTER_DATABASE_URL`, `PUBLISH_FLIP_DATABASE_URL`. **Re-run it —
do not trust that count.** If it differs, the difference is the finding.

Then the file-level consumers:

```bash
grep -rlE "neon_prod_url|CUTOVER_DATABASE_URL" scripts docs/pm docs/*.md
```

### 3b. Which role does production actually connect as? — ANSWERED 2026-08-16: `app_runtime`

**RESOLVED. Do not re-ask the owner; this step is closed. Read why the first method failed —
it is the more useful half.**

The original instruction here was: have the owner read the role prefix of `DATABASE_URL`,
`APP_DATABASE_URL` and `DATABASE_URL_UNPOOLED` off the Vercel dashboard. **That is impossible.**
All three are flagged **Sensitive** in Vercel, and a Sensitive variable's value can never be
viewed again by anyone at any permission level — no reveal control, the edit panel loads empty,
history shows only "added via Vercel CLI on Jul 8". The only actions are Rotate and Delete. A
session that follows the original text either stalls or is tempted to rotate a production
variable *in order to look at it*, which is a worse outcome than the question.

**Measured instead, and the measurement is strictly better evidence.** A dashboard tells you
what is configured; `pg_stat_activity` tells you what is actually connecting:

```bash
# generate public traffic and sample the roles connecting, concurrently
( for i in $(seq 1 25); do
    curl -s -o /dev/null https://ancientpaths.app/ &
    curl -s -o /dev/null https://ancientpaths.app/gate &
    curl -s -o /dev/null https://ancientpaths.app/ask &
  done; wait ) &
for i in $(seq 1 20); do
  psql "$(cat ~/.neon_prod_url)" -X -q -t -A -c \
    "SELECT DISTINCT usename FROM pg_stat_activity WHERE datname=current_database() AND application_name <> 'psql';"
done | sort -u
```

Observed 2026-08-16 across 75 requests: **`app_runtime`, and nothing else.** No credential was
read, displayed or handled at any point.

**Consequences, all in the safe direction:**

- Serving runs least-privilege. **Rotating `neondb_owner` does not affect the app.** Proceed
  without the redeploy branch.
- RLS is **not** inert in production — the scarier branch is ruled out by observation.
- `db.ts:19-31` only checks that `APP_DATABASE_URL` is *present*, never that it holds
  `app_runtime`, so an owner string there would have been silently accepted and RLS would have
  been inert for every private row with every check green. That gap is real but **not currently
  exploited**; file it, do not fix it here.
- **Carried into Phase 2:** because these vars are Sensitive, if one ever does need updating you
  cannot verify what you are replacing — only overwrite it. Nothing needs updating today.

### 3c. Baseline (agent)

Record, so post-rotation checks compare against something:

```bash
psql "$(cat ~/.neon_prod_url)" -X -q -c "SELECT current_user, count(*) FROM sources;" 
psql "$(cat ~/.neon_prod_url)" -X -q -c "SELECT count(*) FROM schema_migrations;"
curl -s -o /dev/null -w "%{http_code}\n" https://ancientpaths.app/
```

---

## 4. Phase 2 — rotation (OWNER, console)

Neon console → project → Roles → `neondb_owner` → reset password.

Immediately, **in the same sitting**:

1. Write the new connection string to `~/.neon_prod_url`. **Do not echo it, do not paste it
   into the chat, do not commit it.** The agent must never see the value.
2. If 3b found an owner string in any Vercel var, update it there too.

Verify the file is well-formed **without revealing it**:

```bash
node -e "const u=require('fs').readFileSync(process.env.HOME+'/.neon_prod_url','utf8').trim();console.log('endpoint:',new URL(u).host.split('.')[0],'| role:',u.split('://')[1].split(':')[0],'| len_ok:',u.length>80)"
```

Expect `endpoint: ep-odd-fog-atnykudm`, `role: neondb_owner`, `len_ok: true`.

> **THAT CHECK CANNOT DETECT A ROTATION — corrected 2026-08-16, after it was run against an
> UNROTATED file and printed exactly the expected line.** `len_ok` is `length > 80`, true of the
> old string and the new one alike; endpoint and role are unchanged by a password reset. All three
> fields are identical before and after, so the check confirms only that the file parses. Use this
> instead — same three fields plus one that can go red:
>
> ```bash
> node -e "const fs=require('fs'),os=require('os'),cp=require('child_process');const h=cp.execSync(\"git log --all -p --format= --unified=0 | grep -ohE 'neondb_owner:npg_[A-Za-z0-9]{12}@' | sort -u\",{shell:'/bin/bash',maxBuffer:1<<28}).toString().trim().split('\n').filter(Boolean).map(s=>s.slice(13,-1));const u=fs.readFileSync(os.homedir()+'/.neon_prod_url','utf8').trim(),p=new URL(u);console.log('endpoint:',p.host.split('.')[0],'| role:',p.username,'| len_ok:',u.length>80,'| STILL_THE_LEAKED_ONE:',h.includes(p.password))"
> ```
>
> Expect `STILL_THE_LEAKED_ONE: false`. It was **watched printing `true`** on 2026-08-16, so the
> red state is already banked — this is a check known to be capable of failing, not merely
> asserted to be.

---

## 5. Phase 3 — verify the new credential (agent)

```bash
psql "$(cat ~/.neon_prod_url)" -X -q -c "SELECT current_user, count(*) FROM sources;"
```

Must return `neondb_owner` and **173** — measured 2026-08-16, which is 164 published + 7 staged
+ 2 quarantined. **This line said `164` and would have fired the §8 stop condition falsely:**
164 is the *published* subset, not `count(*)`. Corrected after taking the baseline. Re-derive
rather than trusting either number if the corpus has moved since.

Then prove the *app* is unaffected — it uses its own credential:

```bash
curl -s -o /dev/null -w "/ -> %{http_code}\n"    https://ancientpaths.app/
curl -s -o /dev/null -w "/ask -> %{http_code}\n" https://ancientpaths.app/ask
```

Expect `200` and `307` (the `/gate` redirect — SEC-1's gate is still up; that is correct, not a
failure). Then confirm no new runtime errors via the Vercel MCP `get_runtime_errors` for the
project, `since: 1h`.

---

## 6. Phase 4 — red-proof: the OLD credential must be DEAD

**A rotation nobody watched fail proves nothing** (THE_LOOP §4). The old secret is in git
history, so the proof is available — but the agent must not handle it. **The owner runs this**,
from their own shell. No substitution by hand is needed; the shell supplies the string and never
displays it.

> **THE CONTROL LEG IS ALREADY BANKED — 2026-08-16, before any rotation.** The command below was
> run against `ep-odd-fog` and **CONNECTED** (`?column? 1`). That was not a failure: it is the
> green-before half of the pair, and it is what makes the eventual `refused` mean something. A
> post-rotation refusal on its own is weak — a typo in the pickaxe, a network fault or a wrong
> host all produce "refused" too. Now they cannot, because the byte-identical command connected.
> It also upgrades the finding from *"identical to the configured value"* to *"authenticates
> against production."*

> **ONE ENDPOINT IS NOT ENOUGH — added 2026-08-16.** The project has **8 branches, 3 cut directly
> from `production`**. A Neon branch clones `pg_authid`, so it keeps the parent's role passwords
> from the moment it was cut, and a later reset on the parent **does not propagate**.
> `pre-cutover-ep-odd-fog-atnykudm-20260729164220` → **`ep-delicate-bonus-atpq28cq`** was cut
> 2026-07-29 and is a full production snapshot; if it carries the same password, rotating
> `production` alone leaves the leaked credential working against production data. Owner ruled
> **test first** (2026-08-16). Sweep all 7 reachable endpoints:

```bash
OLD="$(git log --all -p --format= -S'neondb_owner:npg_' --pickaxe-regex \
  | grep -ohE 'postgresql://neondb_owner:npg_[A-Za-z0-9]{12}@' | head -1)"
for H in ep-odd-fog-atnykudm ep-delicate-bonus-atpq28cq ep-tiny-hat-atdgpisx \
         ep-tiny-bonus-at3izo3y ep-holy-rice-athhpp5z ep-misty-firefly-atz9pgg1 \
         ep-snowy-bird-atmdsv3g; do
  printf '%-28s ' "$H"
  psql "${OLD}${H}.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require" \
    -X -q -t -c "SELECT 'CONNECTED';" 2>&1 | head -1
done
```

**Expected after rotation: authentication failure on `ep-odd-fog`.** Any endpoint that still
CONNECTS needs its own reset — the finding is not closed until every one refuses.

Report to the agent only the outcome per host (`refused` / `connected`), never the string.

---

## 7. Phase 5 — records (agent)

1. `WORKLOG.md` — new entry: what rotated, what was verified, the red-proof outcome, and a
   NOT DONE section if anything is outstanding.
2. `docs/pm/MASTER.md` — mark **O-1 done**, dated, with the red-proof outcome. Leave steps 2
   and 3 (blob token, branch protection) open.
3. `docs/SECURITY.md` — record the class, not just the incident: **evidence logs must never
   capture a full connection string.** `publish-flip` already redacts its own banner
   (`target … (credentials redacted)`); what leaked was the shell command echo written by the
   `expect`/`tee` wrapper in `scripts/land-wave.sh`. Name that as the mechanism.
4. Commit with a `Model:` trailer. **Never commit the credential** — ~~the pre-commit hook does
   not scan for secrets, so this is discipline, not mechanism~~ **it is mechanism as of
   2026-08-16, see below.**

### ~~Worth proposing, not required~~ — BUILT 2026-08-16

The proposal was a pre-commit check refusing any staged file matching
`postgresql://[a-z_]+:[^@]{8,}@`. **Built, and deliberately not in that form**, because that
pattern reproduces the defect it exists to catch:

- **`{8,}` is a threshold that encodes an expectation.** An identical `{8,}` in this session's own
  tree sweep hid a real match — `docs/evidence/hygiene-2026-07-29/loud-skip-app-url.log`. The
  floor shipped is `{12,}`, anchored to the conventional minimum for a generated secret rather
  than to what makes today's tree pass, and its limit is written down.
- **A pre-commit hook is a pre-FILTER, not a gate.** `--no-verify` bypasses it and it only exists
  where `package.json`'s `prepare` has run. `scripts/audit.sh` and `.github/workflows/audit.yml`
  were grepped: **zero** credential legs. So the check also ships as
  `test/invariants/no-committed-credentials.test.ts`, which the existing `test/**/*.test.ts` glob
  puts inside `npm run audit` and CI with no config change.

Two legs, **different in kind**, which is the whole lesson of the incident: format-keyed
repo-wide for `npg_`, and **format-agnostic** under `docs/evidence/` — the leg `bf2fbb0` lacked.

Red-proofed, both layers, each case watched: seeded `npg_` → RED/REFUSED · seeded 43-char
non-`npg_` → RED/REFUSED · exactly 12 chars → RED/REFUSED · **11 chars → passes**, the stated
limit watched rather than merely written. Red-proofing found **two defects in the check itself**,
neither visible by reading — it was vacuously green (a JS regex handed to `git grep -E` matched 0
lines), and it then surfaced a third connection string nothing else had seen. Both recorded in
`docs/SECURITY.md` → SEC-4 and commit `0c47ef1`.

---

## 8. Stop conditions

Stop and report rather than improvising if:

- ~~3b finds an owner string in a Vercel var~~ — **CLOSED 2026-08-16: measured `app_runtime`.**
  If a later re-measurement ever shows a different role connecting, that is a stop.
- Any step tempts you to **rotate or delete a Vercel variable in order to read it.** Sensitive
  variables cannot be read; that is the platform working, not an obstacle to route around.
- Phase 3 returns a different `current_user`, or a `sources` count that is not **173** without an
  explanation in `WORKLOG.md`. (**Was `164` and would have fired falsely** — that is the published
  subset, not `count(*)`. Baseline 2026-08-16: 173 = 164 published + 7 staged + 2 quarantined.)
- The Phase 4 red-proof **connects** — **on any of the 7 endpoints, not just `ep-odd-fog`.**
- `ancientpaths.app` returns 5xx at any point.
- Anything tempts you to write a credential into a file, a commit, or the chat. There is no
  version of this task that requires it.

## 9. Explicitly out of scope

Blob-store token (O-1 step 2), branch protection / public repo (O-1 step 3 — **must not happen
in this session**; it is gated on this one completing), SEC-1, and history rewriting. Rotation
makes the historical secret inert; `git filter-repo` is a much larger operation and is not
required.
