# OWNER ACTIONS — the things only you can do (2026-07-14)

Everything on the fix list except the passages deploy (done) and this document is blocked behind items here.
Nothing below was executed by the agent: §1 needs CLIs/credentials it does not have; §2 must not be sent by an
agent; §3 is your ruling, not an agent's.

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

**Prove CI runs the invariants:** after the secret is set, push any commit. The audit's `requireDbInCi()` will
find `APP_DATABASE_URL_TEST` and the DB tests go from **skipped → `tenancy 3 passed` / `licensing 5 passed`**.
If either still says *skipped*, the URL never reached the process. Then seed a bug (strip the ownership
predicate from `getMessages`), push, watch CI go **red**, revert. A green test that passes on broken code is
worse than no test.

---

## §2 — TWO EMAILS (drafts — DO NOT let an agent send these)

### (a) To Neon support — the SEC-1 interim-close question
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
