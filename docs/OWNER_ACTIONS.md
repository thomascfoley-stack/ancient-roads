# OWNER ACTIONS — the things only you can do (2026-07-14)

Everything on the fix list except the passages deploy (done) and this document is blocked behind items here.
Nothing below was executed by the agent: §1 needs CLIs/credentials it does not have; §2 must not be sent by an
agent; §3 is your ruling, not an agent's.

---

## §0 — ★ BEFORE you turn Vercel Deployment Protection OFF — the corpus-exposure check

Turning off Deployment Protection removes the SSO layer, leaving the `SITE_PASSWORD` middleware as the
**only** lock on the copyrighted corpus (`public/bible`, `public/commentaries`). The allowlist logic is proven
locally (`web/test/middleware-gate.test.ts`, red-first) — but **middleware can behave differently deployed**, so
confirm it on the real deployment. **If any GATED path below returns `200`, the corpus is public — STOP.**

The corpus must never be publicly reachable *during* the check. Two safe ways:

- **Preferred — bypass token (corpus stays protected while you test):** Vercel → Settings → Deployment
  Protection → *Protection Bypass for Automation* → generate a secret, then send it as a header so your curl
  passes the SSO layer and hits the app middleware, while the public still can't:
  ```bash
  BASE=https://ancient-paths.vercel.app        # your prod URL
  BYPASS=<paste the automation-bypass secret>
  H=(-H "x-vercel-protection-bypass: $BYPASS" -H "x-vercel-set-bypass-cookie: false")
  ```
- **Fallback — flip → verify → re-enable if bad:** turn protection off, run the checks IMMEDIATELY, and if any
  gated path is `200`, turn protection **back on at once**. (Omit the `H=(...)` header below.)

```bash
echo "PUBLIC — expect 200:"
for p in / /about ; do printf "%s  %s\n" "$(curl -s "${H[@]}" -o /dev/null -w '%{http_code}' "$BASE$p")" "$p"; done

echo "GATED — expect 307 → /gate (a 200 here = CORPUS EXPOSED, do not flip):"
for p in /commentaries/ /bible/kjv/jhn.json /read/jhn/1 /library/notes /home /settings /ask /api/ask ; do
  code=$(curl -s "${H[@]}" -o /dev/null -w '%{http_code}' "$BASE$p")
  loc=$(curl -s "${H[@]}" -o /dev/null -D - "$BASE$p" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
  printf "%s  %-28s  %s\n" "$code" "${loc:-<no-redirect>}" "$p"
done
```

Green = every PUBLIC row `200` and every GATED row `307` with a `/gate` Location. Only then flip protection off
for real. (This whole gate exists because a wrong allowlist + this one config click = public copyright exposure.)

---

## §1 — NEON BRANCHES (the bottleneck) — HANDED BACK: `neonctl` and `gh` are not installed on this machine

The agent checked `neonctl --version` and `gh auth status`: **both "command not found"**, and there is **no
`NEON_API_KEY` / `GH_TOKEN` in `web/.env.local`** to authenticate non-interactively. Per your rule it stopped
rather than guess at credentials. Run this yourself (≈20 min):

```bash
# 0. Install + authenticate
brew install gh                      # or your package manager
npm i -g neonctl                     # or: brew install neonctl
neonctl auth                         # opens a browser
gh auth login                        # choose GitHub.com, HTTPS

# 1. Find the project, then create two branches off main (prod)
neonctl projects list                # note the project id
PROJECT=<project-id>
neonctl branches create --project-id $PROJECT --name dev  --parent main
neonctl branches create --project-id $PROJECT --name test --parent main

# 2. ★ ROTATE app_runtime's PASSWORD ON EACH BRANCH (branch only — main is untouched).
#    Neon copies roles + password HASH into a child branch, so a leaked branch string is a prod-role
#    credential at a different host. Rotate so the branch password != prod's.
#    (verify exact syntax with `neonctl roles --help`; the reliable fallback is SQL as the branch OWNER:)
OWNER_DEV=$(neonctl connection-string dev  --project-id $PROJECT --role-name neondb_owner)
OWNER_TEST=$(neonctl connection-string test --project-id $PROJECT --role-name neondb_owner)
NEWPW_DEV=$(openssl rand -base64 24); NEWPW_TEST=$(openssl rand -base64 24)
psql "$OWNER_DEV"  -c "ALTER ROLE app_runtime WITH PASSWORD '$NEWPW_DEV';"
psql "$OWNER_TEST" -c "ALTER ROLE app_runtime WITH PASSWORD '$NEWPW_TEST';"

# 3. Capture the app_runtime connection strings (POOLED) into a file — DO NOT paste them into chat/logs.
#    After a rotate, neonctl's cached string is stale; rebuild it with the new password, or read it from Neon.
{ echo "DEV  app_runtime: <dev pooled string with $NEWPW_DEV>";
  echo "TEST app_runtime: <test pooled string with $NEWPW_TEST>"; } > ~/neon-branch-creds.txt   # gitignored location

# 4. Set the CI secret to the TEST app_runtime string (NOT neondb_owner — owner has BYPASSRLS and the
#    tenancy test would pass vacuously).
gh secret set APP_DATABASE_URL_TEST --body "<test app_runtime pooled string>"
```

**★ VERIFY (don't assume) against the TEST branch** — `licensing.test.ts` `beforeAll` hard-asserts the last two,
and will die without them:
```sql
-- connect: psql "<test app_runtime string>"
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = current_user;      -- app_runtime / f
\dp commentary_entries                                                        -- app_runtime => SELECT only (migration 010 carried over)
SELECT count(*) FROM pg_policies WHERE schemaname='public';                   -- RLS policies present (> 0)
SELECT count(*) FROM embeddings WHERE user_id IS NULL AND source_type='commentary';  -- ≈ 190,635
SELECT count(*) FROM commentary_entries WHERE author = 'Tyndale Study Notes'; -- > 0
```

**Split `.env.local` (it points at PROD):** repoint `web/.env.local` at the **dev** app_runtime string; move the
prod strings to `web/.env.prod` (gitignored); add a guard so no default script reaches prod without an explicit
typed opt-in (~17 scripts hand-roll a reader of `web/.env.local` — that one file is the switch). *This is a code
change; the agent left it for after the branch exists so the repoint has a real target — flag it to whichever
session owns the env/scripts and it's a single focused change.*

**CI no longer red-spams you while this is pending (2026-07-15, owner-approved).** `.github/workflows/audit.yml`
is split into two jobs so the endless "all jobs have failed" emails stop without going dishonestly silent-green:
- **`audit`** — every non-DB gate (typecheck ×3, lint ×2, knip, deps-audit, tests+coverage, Gate B). The
  licensing + tenancy suites **skip** here (`requireDbInCi()` only throws under `REQUIRE_DB=1`, which this job
  does not set). Verified green under CI conditions with no DB. **Goes green on every push.**
- **`db-invariants`** — runs `licensing.test.ts` + `tenancy.test.ts` against the real TEST branch, `REQUIRE_DB=1`.
  Until `APP_DATABASE_URL_TEST` is set, a guard step short-circuits: the job is **green but every real step is
  skipped**, and a loud **`::warning:: DB invariants NOT RUN`** annotation records the gap. This is the honest,
  *visible* placeholder — a pending job with a warning, not an ignored perpetual failure. If the secret is set
  but empty/wrong, `REQUIRE_DB=1` makes the job go **red** (verified: the command exits 1 with the misconfig error).

**Prove CI runs the invariants:** after the secret is set, push any commit. The **`db-invariants`** job stops
short-circuiting and runs them for real — the warning disappears and you see **`tenancy 3 passed` / `licensing
5 passed`**. If it still shows the warning, the secret never reached the job. Then seed a bug (strip the ownership
predicate from `getMessages`), push, watch **`db-invariants`** go **red**, revert. A green test that passes on
broken code is worse than no test.

---

## §2 — TWO EMAILS (drafts — DO NOT let an agent send these)

### (a) To Neon support — the SEC-1 interim-close question
**★ Send this FIRST.** It is the cheapest move on the whole board: a written "yes, we run ≥ 1.6.11 and verify
before linking" collapses SEC-1 from a *migration* into a *non-event*, and unblocks real-user launch without
touching code. Ask before you plan the migration.

> Subject: Neon Auth — what better-auth version does the hosted auth server run?
>
> Hi — we use Neon Auth (`@neondatabase/auth`) in production. The bundled SDK pins `better-auth@1.4.18`, which
> is affected by **GHSA-g38m-r43w-p2q7 / CVE-2026-53516** (OAuth auto-link to an unverified pre-registered
> email → account takeover), patched in **better-auth ≥ 1.6.11**.
>
> Because the OAuth-callback linking runs on your hosted auth server, not in our app: **what better-auth version
> is your hosted Neon Auth server running, and does it reject implicit OAuth linking when the local
> `emailVerified` flag is false?** A written "yes, ≥ 1.6.11 and verified-before-link" would let us treat the
> runtime risk as closed while we migrate off the beta SDK. Thank you.

### (b) To CCEL (ccel.org) — commercial-use permission for their PD commentary texts
> Subject: Permission to use public-domain commentary texts commercially
>
> Hello — I'm building a Bible-study reference app that quotes historic commentators verbatim, with attribution.
> Your site notes that permission is needed to republish or use the texts commercially. I'd like written
> permission to use the **public-domain** works you host — specifically, to start, **Alexander Maclaren's
> *Expositions of Holy Scripture*** (and, if permitted, other pre-1929 public-domain commentaries in your
> collection). The texts would be displayed verbatim and attributed to the author and to CCEL as the source.
> Could you confirm whether this is permitted, and on what terms? Thank you.

---

## §3 — AUTHOR TRIAGE, made rulable (your decision — the agent did NOT rule)

`docs/AUTHOR_TRIAGE.md` (owned by the reader-regen session) has the full list. This is the same 401 sources
grouped into five buckets so you can rule in ~20 minutes: **one yes/no per bucket**, not 401 names. Measured
2026-07-14 from `web/public/commentaries/_manifest.json` + per-entry `sourceUrl`.

| bucket | what | who (by entry volume) | your ruling |
|---|---|---|---|
| **(a) Copyrighted — NEVER ship** (legal, not a judgment call) | year ≥ 1929, still in copyright | **Tyndale Study Notes** (15,161) · CS Lewis + "Screwtape" (1,172) · Douglas Wilson (16) · JRR Tolkien (11) | remove from corpus — ☐ confirm |
| **(b) Forbidden provenance — must RE-SOURCE before serving** (PD text, unlawful/ToS source) | scraped from biblehub / studylight / historicalchristian.faith | **biblehub (~205k):** Geneva 31,096 · Poole 31,080 · Cambridge 26,666 · Pulpit 25,796 · Barnes' 21,036 · Wesley 18,184 · Benson 15,363 · B.W. Johnson · Bengel · Calvin · Scofield · Darby · MacLaren · Lange. **historicalchristian.faith (~58k):** Aquinas · Chrysostom · Augustine · Bede · Theophylact · Jerome · Bonaventure · Tertullian · Origen · Cyril · Oecumenius · Ambrose · … | approve re-source from CCEL/New Advent/Wikisource — ☐ yes / ☐ no |
| **(c) PD + clean provenance — PROMOTE on your word** | pre-1929, lawful source (SWORD/CrossWire etc.) | the 9 already served (Gill, JFB, Clarke, Henry, Barnes/Wesley/Calvin-crosswire, Augustine/Chrysostom-scoped). **The big unlock overlaps (b):** Poole/Geneva/Cambridge/Pulpit/Bengel are PD — one yes + re-source triples the reader corpus | promote which? — ☐ per author |
| **(d) Heretical / apocryphal / satirical — YOUR call; if served, MARK it** | orthodoxy is your ruling, not an agent's | Origen (condemned 553) · Pelagius (condemned 431) · "CS Lewis via Screwtape (a devil)" (also (a)) · Book of Enoch · Jubilees · Sibylline Oracles · Heracleon (gnostic) · Gospel of the Hebrews · the `Pseudo-*` pseudepigrapha | serve? and how labelled — ☐ your call |
| **(e) Second-hand catena — YOUR call** | "X (as quoted by Aquinas/Origen/Eusebius…)" — **not the father's own words** | **74 sources / 9,368 entries.** e.g. "Augustine (as quoted by Aquinas, AD 1274)" 1,336 · "Bede (as quoted by Aquinas)" 1,235 · "Theophylact (as quoted by Aquinas)" 930 | serve as catena, drop, or mark — ☐ your call |

Notes: buckets overlap (a copyrighted work can also be satirical; a PD author can be forbidden-provenance) — the
table assigns each its **most binding** constraint. (a) and (b) are not really "calls" (copyright and
provenance are hard requirements); (c)/(d)/(e) are yours. The reader's runtime filter already hides everything
not explicitly published, so nothing here is *served* today — this is about what the regenerated corpus should
*contain*.

---

## §4 — /api/ask is COMPOSE-bound (~16s, up to 36s) — the real latency wall (your call: touches compose/faithfulness)

The pool fix is **live** and adds no latency (retrieval ~0.27s; the old 12–14s `iterative_scan` blowup is gone).
But I measured end-to-end per your "a correct answer at 14s is a broken product" bar and the wall is the **compose
LLM**, not retrieval (evidence: `WORKLOG.md` §4, `scratchpad/latency-decomp.txt`):

- Raw compose (Qwen3.5-35B-A3B, `max_tokens=6000`, temp 0.3) = **16.5s** for a 3330-token answer, **36.3s** at the
  6000-token cap — generation-bound (~5ms/token), so **prod is the same floor** (it's DeepInfra's compute, not our build).
- `teach()` re-composes on verifier rejection (`MAX_RETRIES=2` → up to **3** attempts) → a contested answer is
  2–3× compose (~32–108s) before fallback.
- Mitigant already shipped: retrieved sources render at ~1s, so the screen isn't blank — but the **answer** is over bar.

**This is NOT the pool fix's doing** (pre-existing) and I did **not** change it — compose is integrity-adjacent
(faithfulness). Levers, each needing a bait + accuracy re-run before shipping — **which do you want?**
| lever | effect | cost/risk |
|---|---|---|
| **token streaming** (emit tokens, not just STAGES) | perceived latency drops to first-token (~2–3s); wall-clock unchanged | no model change; UI + a streaming verify story (can't verify mid-stream — verify still gates the final) |
| **tighter `max_tokens` / length-capped contract** | caps the 36s tail; may truncate long multi-voice answers | re-run bait — truncation must not drop attribution/quotes |
| **faster compose model** | lower floor across the board | re-run bait **and** accuracy — a weaker model may interpret or mis-quote |
| accept it | — | product feels slow; "14s = broken" stands |

---

## §5 — PHASE A CLOSE / license gate (2026-07-14) — facts + your calls

**Done tonight (no action needed):** license-record gate shipped (`web/src/lib/licensing.ts`); LITV/MKJV/LEB/
jubilee files removed (gate now permits the deploy); LSV kept with attribution; verifier soft-boost hole closed;
Phase A closed on the hard gates. See `docs/PHASE_A_CLOSE.md`.

**Your calls / facts:**
- **LEB (conditional).** To serve the Lexham English Bible: re-ingest it (`ingest-scrollmapper-bibles.ts`) and set
  `LICENSE_ACK=leb` in the Vercel env. The reader already shows its required Logos attribution automatically. Left
  blocked by default tonight — not a Phase A blocker.
- **UNKNOWN list (verify or leave removed):** **jubilee (Jubilee Bible 2000)** — I could not verify a PD/permissive
  license; it appears © Life Sentence Publishing, so it's recorded `unknown` → blocked → removed. If you have a
  license basis, add an `allow` record + re-ingest; otherwise it stays out. (No other served work is unknown.)
- **Removed translation files are gitignored** → reversible via **re-ingest**, not `git checkout` (they were never
  in git). LITV/MKJV are copyright — do not restore.
- **C3 — CLOSED (2026-07-14).** The pnpm bump does NOT fix it: pnpm 9, 10, and 11 all POST to npm's retired legacy
  audit endpoint (410) — verified. So instead the deps gate now queries the endpoint npm mandates, npm's **bulk
  advisory endpoint**, directly (`scripts/deps-audit.mjs`, wired into `audit.sh`; the fail-open wrapper is deleted).
  Real high/critical advisories fail the build again (seeded-bug proven), honoring the same `ignoreGhsas` list.
  No owner action needed. (If pnpm later ships bulk-endpoint support, `pnpm audit` can replace the script.)
- **Still open from prior nights:** SEC-1 (GHSA-g38m migration), the M1/M2 REVOKEs (`section_anchors`/
  `section_embeddings` have no RLS; `embeddings` write grant), H4 (the "V2 classifier" the docs reference doesn't
  exist), and doc reconciliation (SCHEMA.md Supabase, OUTPUT_CONTRACT eval counts). See `docs/LONG_NIGHT.md`.

---

## §6 — SERMON SEARCH: the translation-indexing decision (your call — facts only)

Slice 0's uncited-quote channel finds a passage by matching a 6-word verbatim run of the user's prose against a
Bible index. A verbatim run does not survive a translation swap, so **which translation(s) you index determines
who the feature works for.** Measured on held-out Spurgeon (`docs/SERMON_SEARCH_DESIGN.md`):

- **The spread is the single biggest lever.** Same sermons: **WEB index → 65%** recall · **KJV index → 90–93%**.
  25+ points, purely from matching the translation the author quotes.
- **Multi-index barely helps *on this set*** (KJV+WEB+ASV+BBE+YLT → 95%, +1 sermon) — because Spurgeon quotes KJV,
  so adding others only catches edge cases. **The multi-translation *benefit is for users who quote a different
  translation* and cannot be shown on a mono-translation (KJV) source** — it needs a real multi-translation test set.
- **Cost of indexing more translations:** more verbatim collisions → precision pressure → the K threshold has to
  rise to hold precision (Slice 0 already needs K≥2–3).

**The fork (yours):**
1. **Index all PD translations we hold** (KJV, WEB, ASV, YLT, Darby, Geneva, …) and match against the union.
   Covers anyone quoting a public-domain translation. Costs index size + precision pressure.
2. **Accept the channel degrades** for users who quote a translation we don't hold.

**The hard limit that makes this a who-are-we-building-for decision, not a config choice:** M.Div students and
contemporary pastors overwhelmingly quote **ESV / NIV / NASB / CSB / NLT** — which are copyrighted and **cannot be
stored** (the whole Track 1 licensing gate). So "index all PD translations" **structurally cannot cover
modern-translation preachers.** For them the uncited-quote channel drops toward zero and they depend entirely on
the **semantic channel** (spine 2), whose recall for that population is unmeasured. Net: this feature is strongest
for KJV/PD-quoting (Reformed, traditional) users and weakest for modern-translation users. Which audience the
product serves is above the agent's call — it's yours.

---

## §1b — CI does not run the reader/annotation DB invariants (measured, 2026-07-19)

**Status: OPEN. Two owner-only steps; neither can be done from an agent session.**

### What is actually true today

The web suite *does* run in CI — `scripts/audit.sh:30` invokes the `qa` gate
(`vitest run --config web/vitest.config.ts`), which the `audit` job runs. What does **not** run
is every test that needs a database. Measured by moving `web/.env.local` aside and running the
suite under CI conditions:

```
Test Files  25 passed | 10 skipped (35)
Tests      108 passed | 69 skipped (177)      ← 39% of the web suite
```

The 69 skipped tests are exactly the ones that matter most for a licensing/tenancy story: the
published-status boundary, the register wall against real data, RLS tenancy on all five new user
tables, the annotation schema, keyset paging, and `sections.unit_ordinal`.

The separate `db-invariants` job is not a substitute: it targets **two** files
(`licensing`, `tenancy`) and short-circuits to green-with-a-warning while the
`APP_DATABASE_URL_TEST` secret is unset — which it is.

### Why this was worse than a coverage gap

Two suites — `annotations-polymorphic` and `sections-unit-ordinal` — carried headers dated
2026-07-19 asserting that CI ran them for real. Commit `f229a93` parked the workflow edit for
lack of the `workflow` token scope, so the *documentation* half landed and the *enforcement* half
did not. Those headers are now corrected, and
`test/invariants/ci-claims-match-reality.test.ts` (root suite → genuinely runs in CI) fails if
anyone re-introduces a claim the workflow does not back. Proven red-first by seeding the false
claim and watching it fail.

### Step 1 — add the repo secret (owner)

Per §1 above: a Neon **test branch** app_runtime connection string, never prod.

```
gh secret set APP_DATABASE_URL_TEST --body "<test app_runtime pooled string>"
```

### Step 2 — widen the `db-invariants` targets (needs `workflow` token scope)

The `ancient-roads` token lacks the `workflow` scope, so a push touching
`.github/workflows/**` is rejected — this is the same block that produced the false claims.
The prepared patch is committed at **`docs/evidence/part2/audit.yml.proposed`**; it changes one
line, expanding the target list from 2 files to 13 (all verified to exist):

```
licensing · tenancy · library-published-boundary · register-wall-surfaces · search-sections
sections-unit-ordinal · annotations-polymorphic · annotation-rls-tenancy · annotation-tables
annotation-exact-substring · highlight-tenancy · work-reader · verse-keys
```

Apply it with a token that has `workflow` scope (or via the GitHub web editor):

```
cp docs/evidence/part2/audit.yml.proposed .github/workflows/audit.yml
git add .github/workflows/audit.yml && git commit -m "CI: run the reader/annotation DB invariants"
git push
```

### Verify it actually took (do not assume)

After both steps, push any commit and check the `db-invariants` job: the
`DB invariants NOT RUN` warning must disappear and the run must report the expanded file list.
Then seed a bug — drop `AND s.status = 'published'` from a catalog query in `web/src/lib/catalog.ts`
— and confirm `library-published-boundary` goes **red** in CI. A gate you have not watched fail
is not a gate.

---

## §7 — ★ PROD DB CREDENTIAL — RESOLVED 2026-07-23 (was STALE, found 2026-07-20)

**Status: RESOLVED. The owner refreshed the `neondb_owner` credential in root `.env.local`; the
read-only census then connected as `neondb_owner` against `ep-odd-fog` with a non-zero positive
control (John Gill = 28,843 rows). STEP ZERO's write-capability assertion is expected to pass at
cutover time. The tension noted in "What you do" step 3 still stands — a working prod owner string
in the root env file re-arms what `ingest-preflight` rejects, so keep it there only for the cutover
window. The census results are recorded in `docs/CUTOVER_DESIGN.md` §Census and
`docs/evidence/census/prod-census-2026-07-23.txt`.**

### The finding (historical — kept for the STEP ZERO rationale)

A read-only prod census attempt failed at connect. The `neondb_owner` password in the root
`/Users/tfoley/theology-study-app/.env.local` (prod, `ep-odd-fog-atnykudm`) is **rejected**:
`password authentication failed for user 'neondb_owner'`. Both `DATABASE_URL` (pooled) and
`DATABASE_URL_UNPOOLED` fail identically.

**Verified it is the credential, not the harness, by control:** the *same code* connecting to the
DEV branch (`ep-tiny-hat`) succeeds as `neondb_owner`. Dev connects, prod rejects the password —
so the prod `neondb_owner` password was rotated at Neon since that env file was written. **Zero
rows were read; the read-only transaction never opened.**

### Why this is a CUTOVER finding, not just a census one

The Part 5 cutover script connects to prod at **E1** to run migrations 016–030, then again at
E2/E4 to build the corpus. As things stand it would **fail auth at 2am, mid-run, after E1 had
already applied some migrations** — the half-applied cutover the whole chunked design exists to
prevent, triggered by a stale password nobody knew was stale. `deploy.sh` needs a working prod
credential too.

### The blind spot this exposes

`scripts/ingest-preflight.mjs` asserts you are **NOT** on prod (it aborts if `ep-odd-fog` appears
anywhere). **Nothing asserts you CAN reach prod when you intend to.** The Part 5 script closes this
with a STEP ZERO prod-credential preflight (connect → assert `current_user` → assert endpoint =
`ep-odd-fog` → assert WRITE capability via `BEGIN; <no-op write>; ROLLBACK;` → ABORT before
touching anything if any assertion fails). That turns "dies mid-migration" into "refuses to start".

### What you do

1. In the Neon console (or `neonctl`), get the current `neondb_owner` connection strings for the
   **production** branch (`ep-odd-fog-atnykudm`), pooled and unpooled.
2. Update the root `.env.local` `DATABASE_URL` / `DATABASE_URL_UNPOOLED` with them — **do not paste
   them into the chat.** Then tell the agent it's refreshed.
3. Note the tension with §0-class safety: a working prod owner string in the root env file re-arms
   exactly what `ingest-preflight` is built to reject. Keep it there only for the cutover window, or
   store it where the gates do not scan and pass it to the Part 5 script explicitly.

### Verify (do not assume)

After refreshing, the agent re-runs the read-only census (`BEGIN; SET TRANSACTION READ ONLY; …;
ROLLBACK`) and confirms `current_user` + a non-zero positive control (John Gill rows). If that
returns rows, the credential is good and the cutover's STEP ZERO will pass.

---

## §1c — CI: two secrets, one allowlist, and a trigger that misses every feature branch (2026-07-29)

**Report only. I changed no workflow file — CI policy is yours.** Three separate things stop CI
being evidence today. They compound: fixing any one alone still leaves the checks not running.

### (a) THE TRIGGER — tonight's branch ran NO workflow at all

`.github/workflows/audit.yml` fires on `push: branches: [main]` and `pull_request`. A push to
`claude/adoring-babbage-7ac774` matches neither, so **zero workflow runs existed for five commits**
until a PR was opened by hand. Any future work on a feature branch has the identical blind spot:
the gate is silent, and silence is easy to read as green.

Two fixes, both yours to pick:

| option | effect | cost |
|---|---|---|
| `push:` with no `branches:` filter | every push to every branch is gated, PR or not | more Actions minutes; runs on WIP commits |
| require a PR for all work (keep the trigger as-is) | gate is enforced at the point that matters | depends on the discipline never lapsing — which is what failed tonight |

I'd take the first: it does not depend on anyone remembering. But it is a policy call about
minutes and noise, so it is yours.

### (b) THE SECRETS — exact names and jobs

| secret name | job that needs it | what it unblocks | set today? |
|---|---|---|---|
| `APP_DATABASE_URL_TEST` | `db-invariants` | the DB-backed invariants (already wired: the guard step reads it and `REQUIRE_DB: '1'` makes a missing URL a hard failure) | **NO** |
| `DEEPINFRA_API_KEY` | `db-invariants` | `section-vector-pairing` — the content↔vector mispairing check | **NO — referenced by no job at all** |

`APP_DATABASE_URL_TEST` must be the **app_runtime connection string of a Neon TEST branch, never
prod** — the tenancy suite writes rows.

### (c) THE ALLOWLIST — the part that makes (b) insufficient on its own

`db-invariants` does not run the suite; it runs an **explicit list of 13 test files**. Both checks
added tonight are absent from it:

- `web/test/invariants/register-end-to-end.test.ts` — the five per-register reader checks
- `web/test/invariants/section-vector-pairing.test.ts` — the mispairing class nothing else catches

So setting both secrets and changing nothing else leaves both new checks **not running**, silently
by omission rather than by configuration. The allowlist needs those two paths appended, and
`DEEPINFRA_API_KEY` added to that step's `env:`.

A standing hazard worth naming beyond this fix: an explicit file list means every future invariant
is opt-in to CI, and forgetting to add one is invisible. A glob over `test/invariants/` would fail
closed instead. That is a workflow change and therefore yours.

### (d) The stale number in the workflow's own warning

The `db-invariants` guard prints "Measured: 75 of 200 web tests do not execute without it." The
current figure, measured 2026-07-29 by moving `web/.env.local` aside and unsetting the key, is
**75 of 200** — and 14 suites now announce themselves via `helpers/loud-skip.ts`, so the annotation
is no longer the only signal.

---

## §1d — better-auth GHSA-qq9h-g4jm-xgf3: fixed what I could, escalating what I can't (2026-07-29)

CI's `deps` gate failed on **two** high advisories. One is fixed; one is yours.

### FIXED — postcss GHSA-r28c-9q8g-f849 (path traversal, source-map auto-loading)

The `pnpm.overrides` entry was `postcss: ^8.5.12`, resolving to **8.5.16**; the advisory covers
`<=8.5.17`. Bumped the override to `^8.5.22` → resolves **8.5.24**. In-range patch bump, no major.
Full local audit after it: typecheck ×3 ✓ · lint ×2 ✓ · knip ✓ · tests+coverage ✓ · qa ✓ ·
residue ✓ · Gate B ✓.

### ESCALATED — better-auth GHSA-qq9h-g4jm-xgf3 (account takeover, magic-link / email-OTP)

`better-auth@1.4.18` is **not a direct dependency** — it is pinned transitively by
`@neondatabase/auth@0.4.2-beta`. Three findings, all measured rather than assumed:

1. **An override does not work.** I tried `better-auth: ^1.6.22`. It resolves (1.6.25) but **breaks
   the build**: `src/app/layout.tsx` fails `tsc --noEmit` with TS2322 — `@neondatabase/auth` expects
   the 1.4.18 client shape and 1.6.25 drops/moves `updateSession`. Also four unmet peers
   (`@better-auth/core`, `better-call`, `@better-auth/utils`, `@better-fetch/fetch`). This confirms
   the existing `auditConfig` note ("override breaks the build") — it is now verified, not folklore.
   **Reverted.**
2. **It appears NOT to be in-path.** The advisory is specific to **magic-link and email-OTP sign-in**.
   A repo-wide grep for `magic.?link | emailOTP | email-otp | sendVerificationOTP | oneTimeToken`
   across `web/src` and `src` returns **zero hits**. If those flows are genuinely unused, exposure is
   latent rather than live — but that is a security judgement about the auth surface, not a grep
   result, so I am not converting it into an acceptance.
3. **I did not add it to `ignoreGhsas`.** That list's own header says the sibling account-takeover
   advisory GHSA-g38m-r43w-p2q7 is "a tracked LAUNCH BLOCKER, **not accepted**". Accepting a second
   account-takeover advisory from the same pinned package is a security decision with the same shape,
   and it is yours.

**Your options, in the order I'd rank them:**

| # | action | effect |
|---|---|---|
| 1 | wait for `@neondatabase/auth` to ship a build pinning better-auth ≥1.6.22 | the only fix that removes the vulnerability; blocks on their release |
| 2 | confirm magic-link/email-OTP are unused and unreachable, then add GHSA-qq9h-g4jm-xgf3 to `ignoreGhsas` with that justification in `docs/SECURITY.md` | unblocks CI now; accepts a latent advisory, consistent only if finding 2 is confirmed at the auth-config level |
| 3 | drop `@neondatabase/auth` for a directly-managed better-auth | removes the pin entirely; a real auth migration |

Until one is chosen, **`deps` stays red and the gate stays honest.** I would rather hand you a red
gate with one named, understood advisory than a green one bought by an acceptance I made for you.
