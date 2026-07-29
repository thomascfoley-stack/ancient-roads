# PHASE A CLOSE — the license gate + the retrieval numbers, 2026-07-14

**Is Phase A closed? → YES**, on this evidence: the three **hard gates** (verse-ref, pericope, proper-noun) hold
with **no regression**, re-measured on the shipped **un-starved** retrieval path (`pool=20, ef=64`). Topical and
epistle HIT@2 are **diagnostic only** — unmeasurable at n=20/25 (CIs span 85), explicitly not a gate per ADR-022.
Separately, the deploy is now **permitted by a gate that reads a per-work license record**, and the open verifier
hole (soft-boost as an authorization boundary) is closed and proven.

---

## TRACK 1 — THE LICENSE GATE

### §1 The map (before): three mechanisms, none read a license
| mechanism | file:line | what it keyed on |
|---|---|---|
| translation blocklist | `scripts/predeploy-gate.ts` + `web/test/helpers/corpus-scan.ts` (old `FORBIDDEN_TRANSLATION_DIRS`) | a hardcoded **denylist** of ids |
| forbidden-provenance ratchet | `src/ingest/license-manifest.ts:29` `FORBIDDEN_PROVENANCE_DOMAINS` | source **domain** (biblehub/studylight/…) |
| published-author allowlist | `web/src/lib/legal-corpus.ts:57` `isPublishedCommentaryEntry` | an author **allowlist** |

None consulted a license. A translation with no entry in any list simply slipped through — which is how four
copyrighted translations shipped (LONG_NIGHT C1).

### §2 The record (after): `web/src/lib/licensing.ts`
Per-work `{ license, commercial_use: allow|deny|conditional, source, verified_on, attribution? }` for all 22
translations + the 9 served commentary authors. Owner rulings + the verified facts:

| work | license | commercial_use | note |
|---|---|---|---|
| LITV, MKJV | copyright (Green's) | **deny** | files removed |
| LSV | CC BY-SA | **allow** | kept; attribution wired into the reader |
| LEB | Logos/Lexham permissive | **conditional** | blocked until `LICENSE_ACK=leb`; files removed for now |
| **jubilee (Jubilee Bible 2000)** | unknown | **deny** | **NEW finding** — appears © Life Sentence Publishing; owner didn't name it; blocked + removed pending verification |
| web, bsb, kjv, asv, ylt, darby, bbe, geneva, tyndale, webster, nheb, akjv, rotherham, rwebster, ukjv, noyes, anderson (17) | Public Domain | **allow** | pre-1929 / PD dedications (Tyndale = the 1526 translation, NOT the © Study Notes) |
| Gill, JFB, Clarke, Henry, Barnes(+"Barnes' Notes"), Wesley, Calvin, Augustine, Chrysostom (9) | Public Domain | **allow** | commentary license basis, recorded + CI-asserted |

### §3 The gate reads the record — proven both directions
`predeploy-gate.ts` now calls `blockedBibleTranslations()` (`corpus-scan.ts`), which reads the record
block-by-default: **allow** ships; **conditional** ships only if its id is in `LICENSE_ACK`; **deny / unknown /
no-record** block. Proof: the gate listed exactly `{jubilee, leb, litv, mkjv}` as blocked with LSV permitted;
`LICENSE_ACK=leb` unblocked LEB; after removing the 4 blocked dirs (47MB) the gate is **green** on the remaining
18. Unit tests (`translation-licensing.test.ts`, `bible-translation-gate.test.ts`) prove allow/deny/unknown/
conditional±ack; seeded-bug RED when a deny id enters the picker. **Removed files are gitignored → reversible via
re-ingest (`ingest-scrollmapper-bibles.ts`), not git.**

### §4 The gate is blind to UGC, by construction (`gate-ugc-blindness.test.ts`)
- **No gate module** imports the DB handle or a blob store, or calls `runAsUser`/`getDb` — verified by grep and a
  red-proven test (adding a `getDb` import to the gate turns the invariant red). The gate reads only `web/public/`
  files + the committed baseline JSON.
- **Scan locations are corpus-only:** a UGC-looking dir dropped into `public/bible/` is license-checked as a
  corpus work (blocked, no record) — never read as user data. UGC (uploads) lives in Vercel Blob + user tables,
  structurally elsewhere.
- **Isolation invariant:** the served embeddings SQL filters `user_id IS NULL` (3× in `routing.ts`); prod fact —
  0 of 190,635 embedding rows have `user_id IS NOT NULL`, so no user row can be served as corpus.

---

## TRACK 2 — CLOSE PHASE A ON REAL NUMBERS

### §5 Re-measured on the shipped path (artifact named per line)
`corpus=legal(shared) pool=20 ef=64 cap=2`, frozen **v3** held-out, read-only through `lib/teacher/routing.ts`:

| category | n | HIT@1 | HIT@2 | role |
|---|---|---|---|---|
| verse-ref | 40 | 95% | 98% | **hard gate** |
| pericope | 15 | 87% | 100% | **hard gate** |
| proper-noun | 10 | 80% | 90% | **hard gate** |
| epistle | 25 | 72% | 88% | diagnostic |
| topical | 20 | 35% | 70% | diagnostic |
| control | 10 | clean 10/10 | hijacks=0 | guard |

### §6 Hard-gate verdict → Phase A CLOSES
> ⚠️ **HISTORICAL — do not quote these as current (annotated 2026-07-19, ADR-028).** The proper-noun
> **80/90** below is the **v3 set on the pre-option-(c) config**. The shipped config now measures
> proper-noun **60/100** on frozen **v4**. The two are NOT comparable (different frozen sets,
> different configs, both n=10), and neither supersedes the other by date alone — but **v4 is the
> current figure because it measures what ships.** Quoting 80/90 as today's proper-noun number is
> the falsified premise ADR-028 exists to prevent. Per ADR-028 the 60 is an **accepted limitation
> for gated beta and BLOCKING for public launch**, pending a re-measure at larger n.

- **verse-ref 95/98, pericope 87/100, proper-noun 80/90** — all hold vs the last recorded hard-gate figures
  (proper-noun H1 even improved 70→80 on the un-starved pool). **No hard gate regressed.** Per ADR-022 the hard
  gates are the close condition; they hold → **Phase A closes.**
- **Diagnostic (not a gate):** epistle H2 88% (22/25), 95% CI ≈ **[70, 96]**; topical H2 70% (14/20), 95% CI ≈
  **[48, 86]**. Both intervals span 85, so neither is measurably at/below the old 85 target — **unmeasurable at
  these n**, not failed. The honest next step for these two is a larger v4 (n≈100/stratum) or a label-free gate
  (≥2 distinct grounded voices), not a verdict off n=20.
- **★ Do NOT read topical as "improved."** It wasn't. **70 is the true number**; the 75 we carried was the
  5-doc artifact (the reranker had almost no pool to choose from). Filling the pool to 20 dropped the honest read
  to 70. The pool fix **helped epistle (84→88)** and **slightly lowered the honest topical read (75→70)** — that's
  what the fix surfaced, not a gain. The headline is that we now know what topical actually is, and that the
  **hard gates held on real numbers** — which is the close.

### §7 The verifier hole is closed (byte-synced src↔web; proof)
`passages_grounded` grounded a passage on (voice anchors) **OR** `resolveIntent(query).inject`. The inject range
is a soft-boost retrieval heuristic (false-positive-safe, whole-chapter) — using it as an *authorization*
boundary let a query that merely name-matched a pericope license any verse in that span. **Removed** `queryRanges`
from the grounding set + the `RetrievalContext` field + both call sites, so grounding is now **only
source-grounded anchors** (which, since last night's `anchor_offbase`, must intersect their own cited section).
**Proof** (`test/passages-grounding.test.ts`): a passage the query named but no source anchors now **fails
closed**; seeded-bug — re-admit a non-anchor grounding source → the reject test goes RED. **`interpretation_bait`
live re-run (real `teach()`→verify, 35 cases): 35/35 = 100%, 0 breaches, 33 composed / 2 fallback — HOLDS at prior.**
Stricter grounding didn't cost faithfulness, as expected.

### §8 Provisional records superseded
ADR-018 upgraded provisional→**SUPERSEDED** (old topical 75/epistle 84 replaced by the re-measured numbers, kept
for history); `PHASE_A_DIAGNOSIS.md` stamped SUPERSEDED. **Drift test** (`legal-hnsw-index-sync`) green; **recall
probe** (`legalBasePool(50)`=50) confirmed in the §9 audit.

---

## §9 DEPLOY + STATUS
- `npm run audit` → **AUDIT PASSED — all gates green** (typecheck ×3, lint ×2, knip, deps [infra-tolerant C3],
  205 tests incl. the DB recall probe + licensing invariants, Gate B license fail-closed).
- **Drift test** `legal-hnsw-index-sync` green · **recall probe** `legalBasePool(50)=50` green (in the audit).
- **Deploy: LIVE** (commit `8279b29`, `readyState: READY`). The first attempt's `next build` failed on a
  `/account/[path]` prerender ("Cannot find module") — a `.next` collision because a dev server was running during
  the build; a clean rebuild (dev server stopped, `.next` cleared) succeeded. Not a code defect.
- **Live checks:** site still gated (`GET / → 307 /gate`); upload dropped to **161 MB** (−47 MB = the 4 removed
  translations, so the copyrighted files are absent from the deployed bundle — a direct prod HTTP check can't
  distinguish present/absent because the middleware gates all `/bible/*` for anon). On a fresh local dev server:
  the picker offers **LSV** and NOT jubilee/mkjv/leb/litv, and LSV renders its **CC BY-SA attribution** footer;
  no console errors.
- **Gate at deploy:** `✓ Every translation dir present has a shipping license record` (DEPLOYING=1 hard-gate passed).
