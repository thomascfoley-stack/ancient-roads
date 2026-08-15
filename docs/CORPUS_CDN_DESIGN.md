# CORPUS CDN — the static corpus leaves the deploy bundle

**Status:** DESIGN, awaiting owner go. Filed 2026-08-13 against `feat/study-docs-p2` @ `dd1915c`.
**Owner direction:** "do a deep design on all of the angles, lets plan this out so we can do this tonight."

> **MEASURED** = read out of the tree/deploy tonight. Everything else says what it is.

## 1. The problem, measured

`web/public` holds **1.1 GB across ~25,000 files** that ship inside every deployment:

| dir | size | files | what |
|---|---|---|---|
| `commentaries/` | 848M | 1,213 | commentary JSON + `_manifest.json` |
| `bible/` | 198M | 22,590 | 18 translations × per-chapter JSON |
| `original/` | 45M | 1,189 | interlinear Gk/Heb |
| `marketing/`, `concordance/`, `lexicon/`, `devotional/`, icons | ~15M | ~40 | small; NOT in scope |

Tonight's deploys each spent minutes in `Uploading … 358.2MB` (Vercel dedupes unchanged
files; a fresh deployment or wide churn re-uploads far more). P4.n queues **669 more works**.
This grows monotonically, slows every deploy, and walks toward platform size ceilings.

## 2. The reader map, measured — why this is NOT just a hosting swap

**Runtime readers (must keep working, unchanged URLs preferred):**
`lib/bible.ts` (`fetch('/bible/{tr}/{slug}.json')`), `lib/original.ts`, the reader page,
`today-view`, `work-beside-tradition`, the marketing verse panel.

**Ingest WRITERS (write into these dirs):** `ingest-commentaries`, `merge-commentaries`,
`build-commentary-manifest`, `ingest-original`, `ingest-strongs`, `build-concordance`,
`ingest-biblehub` — and **`quarantine-served-corpus.ts`, which EDITS static files to unserve
content**. That last one is a licensing rail.

**Gates and tests that read these files from DISK:** `served-assets-count.test.ts` (ratchet),
`quarantine-served-corpus.test.ts`, `health-corpus-identity`, `licensing.test`,
`verse-keys`, `static-forbidden-provenance.json` (baseline),
**`fetched-assets-actually-ship.test.ts`** (asserts every fetched path exists in the bundle —
it exists to catch exactly the class of change we are about to make), `predeploy-gate.ts`.

**Consequence:** the files must STAY IN GIT at `web/public` — every licensing gate, ratchet,
quarantine tool, and ingest writer then continues working bit-for-bit unchanged. What changes
is only (a) what the DEPLOY uploads and (b) where PRODUCTION serves the bytes from. That
forces one new invariant into existence: **git ↔ CDN parity** (§5), because the gates certify
the git copies and users must receive exactly what the gates certified.

## 3. Options considered

1. **Move the corpus into Neon** — wrong tool: per-chapter DB reads replace free CDN cache
   hits; a large ingest project; nothing tonight needs it. Rejected.
2. **A second host (R2/Pages/S3)** — new vendor, new auth, new failure mode; Vercel Blob is
   already wired (`BLOB_READ_WRITE_TOKEN`, the uploads store). Rejected for tonight.
3. **Proxy route handler** (`/bible/* →` function that fetches Blob) — adds a function
   invocation + cold start to every asset fetch. Rejected.
4. **CHOSEN: Vercel Blob (public store) + `next.config` rewrites + `.vercelignore`.**
   Files sync to Blob mirroring their exact paths; env-gated rewrites map `/bible/:path*`,
   `/commentaries/:path*`, `/original/:path*` to the Blob base URL (rewrites are edge-level,
   no function); `.vercelignore` stops shipping the three dirs. Client code: **zero changes**
   (every `fetch('/bible/…')` keeps its URL). Gates: **zero changes** (git copies remain).

## 4. Design

### 4.1 Sync script — `scripts/corpus-blob-sync.mjs`
- Walks `web/public/{bible,commentaries,original}`; uploads to the existing public Blob store
  at identical paths (`addRandomSuffix: false`, overwrite allowed).
- **Hash-skip:** lists remote (or reads the prior manifest), uploads only changed files —
  re-runs cost seconds, not an hour.
- **Dry-run default** (house pattern); `--execute` uploads; concurrency-capped; per-file retry.
- Emits `docs/evidence/corpus-cdn/sync-manifest-<date>.json`: path → sha256 → blob URL. The
  manifest is the parity artifact.
- **Cache TTL is a licensing decision, per directory:** `bible/` and `original/` are stable PD
  text → long TTL (`cacheControlMaxAge` 30 days). `commentaries/` **can be quarantined** →
  TTL **1 hour**, so an unserve propagates within the hour even if a step is missed; the
  quarantine runbook (§4.4) makes propagation immediate anyway.

### 4.2 Rewrites — env-gated, one code path
`next.config` `rewrites()` (beforeFiles): when `CORPUS_CDN_BASE` is set, `/bible/:path*` →
`${CORPUS_CDN_BASE}/bible/:path*` (same for commentaries, original). Unset → no rewrites →
local `public/` serves as today. So: **prod flips by setting one env var; dev keeps local
files with zero network dependency; rollback is unsetting the var.** The honest tradeoff —
dev serves local while prod serves CDN — is bridged by the parity invariant, not by hope.
The `/gate` middleware runs before rewrites, so the site password still fronts these paths;
the raw Blob URLs are public, which is acceptable and stated: every byte in these dirs is
Gate-B-verified PD/permissive text (the licensing gates run on exactly these files).

### 4.3 The parity invariant (new, replaces one test's old claim)
- `fetched-assets-actually-ship.test.ts` currently pins "fetched paths exist in the BUNDLE."
  That claim becomes false by design. It is **amended, not deleted**, to pin the new truth:
  every fetched path exists in git AND (when a sync manifest is present) appears in the
  manifest with a matching hash. Watched red first by pointing it at a doctored manifest.
- `predeploy-gate` gains a freshness leg: refuse deploy if git corpus files are newer than
  the last sync manifest (drift = the gates certified bytes users won't receive).

### 4.4 Licensing angle — the load-bearing one
`quarantine-served-corpus.ts` unserves content by EDITING static files. With CDN serving,
**a quarantine is not complete until the sync runs** — otherwise the CDN keeps serving the
old bytes (licensing fails OPEN). Therefore: the quarantine tool gains a final step that runs
the sync for touched paths (or refuses to report success without it), the runbook says so,
and the 1-hour commentary TTL bounds the worst case of a missed step. This is the design's
most important sentence.

### 4.5 Failure modes
- **Blob outage:** reader fetches 404/fail → existing degrade paths (`lexicon-404-degrade`
  is already tested); rollback = unset `CORPUS_CDN_BASE`, redeploy (functions again serve
  local copies — which still exist in git and, until step B, in the bundle).
- **Partial sync:** manifest + parity test surface it; sync is idempotent, re-run.
- **Cost:** ~1.1 GB storage ≈ pennies/month; bandwidth comparable to today's static serving.

## 5. Tonight's rollout — two steps, each reversible

**Step A (no behavior change until the env flips):**
1. Land: sync script, rewrites (env-gated), amended parity test (watched red on a doctored
   manifest first), predeploy freshness leg. Audit green.
2. Run sync `--execute` (~25k files, first run is the slow one). Verify parity: sampled
   hash-compare of N=200 files, git vs fetched-from-Blob. Evidence committed.
3. Set `CORPUS_CDN_BASE` in Vercel; deploy; verify prod serves Blob (response headers +
   sampled byte-compare via the site path); owner clicks through the reader once.
   **Rollback at any point: unset the env var.**

**Step B (the payoff):** add `.vercelignore` for the three dirs; deploy. This deploy and
every one after uploads code only (~MBs). Rollback: delete the `.vercelignore` lines.

**Out of scope tonight:** marketing/concordance/devotional/lexicon (~15M — not worth the
motion); moving anything into Neon; any reader code changes.

## 6. Done means
Deploy time measured before/after (we hold tonight's "before"); parity evidence committed;
quarantine runbook amended; audit green; WORKLOG with NOT DONE section; the reader loaded in
a real browser (the owner's click or the harness) after the flip.
