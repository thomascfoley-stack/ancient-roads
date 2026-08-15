# Execution plan: Corpus CDN (piece 1) + /ask latency (piece 2)

**Filed 2026-08-13. Owner direction:** "create a very detailed plan to avoid slop and code that
won't work, lets loop back to test and fix, and test. not ask for permissions and ensure it all
works." Both pieces authorized for autonomous execution end-to-end, INCLUDING deploys.

**The one standing boundary that survives any blanket authorization** (AGENTS.md rule 7, not
mine to waive): a write to the production DATABASE still takes the owner's word, every time.
Neither piece needs one — piece 1 is files/env/deploys, piece 2 is code + measurement — so the
boundary should never come up; if a step turns out to need it, that step STOPS and says so.

**Sequencing gate:** Kimi's ingestion run is in flight in this working tree. **Phase 0 blocks
everything**: no writes until the owner says the run is done AND the incoming-session handoff
check passes (`git status` clean or explained, `git log` read, no foreign locks). One agent per
tree is the rule that has burned this repo before; it is not waived by urgency.

**The anti-slop loop, applied to every slice below** (THE_LOOP, stated once here, assumed
everywhere): name the falsifiable check FIRST → build the smallest slice → run the check and
WATCH IT FAIL on a broken input → fix → watch it pass → full `npm run audit` at every commit
point → record in WORKLOG with a NOT DONE section. A slice with no check that could fail does
not merge.

---

## Phase 1 — Corpus CDN (design: `docs/CORPUS_CDN_DESIGN.md`, approved by the owner's "go")

### A1. Sync script `scripts/corpus-blob-sync.mjs`
- Walks `web/public/{bible,commentaries,original}`; uploads to the existing public Blob store,
  identical paths; `--dry-run` DEFAULT, `--execute` uploads; concurrency 16; per-file retry ×3;
  hash-skip against the previous manifest; per-dir `cacheControlMaxAge` (bible/original 30d,
  commentaries **1h** — the quarantine backstop); writes
  `docs/evidence/corpus-cdn/sync-manifest-<ts>.json` (path → sha256 → url).
- **Check (watch it fail):** doctor one local file after a sync → re-run dry-run → it MUST
  report exactly that file as changed; a dry-run that reports "clean" here is the red-proof
  failing, stop and fix.

### A2. Parity invariant
- Amend `web/test/invariants/fetched-assets-actually-ship.test.ts`: fetched paths must exist in
  git AND, when a manifest exists, hash-match it. Add `scripts/corpus-cdn-parity.mjs`
  (sample N=200 files, byte-compare git vs fetched-from-Blob URL).
- **Check:** point the test at a doctored manifest (wrong hash) → RED; restore → GREEN. Run the
  parity script against the real store post-sync; any mismatch is a stop.

### A3. Quarantine weld (the licensing sentence)
- `quarantine-served-corpus.ts` gains a final step: sync the touched paths (or exit nonzero
  telling the operator the quarantine is NOT COMPLETE). Runbook updated in the same commit.
- **Check:** run the quarantine tool against a scratch copy with the Blob env pointed at a
  throwaway prefix → verify the synced file changed remotely; then sever the sync (env unset)
  → the tool must FAIL LOUDLY, not report success.

### A4. Rewrites, env-gated
- `next.config` `rewrites()` beforeFiles: `/bible|commentaries|original/:path*` →
  `${CORPUS_CDN_BASE}/…` only when the env is set. Unset env = today's behavior, byte-for-byte.
- **Check:** local dev with env set against the real store → reader loads a chapter; with env
  unset → still loads (local files). Both watched in the browser via the dev harness flow.

### A5. First sync + flip
- `--execute` full sync (~25k files; the slow one). Parity script (A2) green. Set
  `CORPUS_CDN_BASE` via `vercel env add`. Deploy. Verify prod serves Blob (headers + sampled
  byte-compare through the site path). Owner (or harness) clicks the reader once.
- **Rollback at any point: unset the env var, redeploy.** Files are still in the bundle at this
  step, so even the rewrite failing loses nothing.

### A6. The payoff
- `.vercelignore` the three dirs; deploy; **measure and record upload size/time against
  tonight's ~358MB baseline** — the number IS the acceptance test. WORKLOG + evidence.

## Phase 2 — /ask latency: instrument first, decide from numbers (piece 2)

### B1. Stage timers
- A timing wrapper through the teach pipeline: gate/rate-limit, embed, vector search,
  inject/floor/diversity, rerank, compose (per attempt), verify (per attempt), retry count,
  total; plus a cold-start marker (module-init timestamp vs request time). Emitted as ONE
  structured log line per ask (rides the existing ask-outcome logging; no new storage, no
  schema, nothing on the request path but two `Date.now()` calls per stage).
- **Check:** a seeded fake pipeline with known stage durations must reproduce them in the log
  line ±10ms; a stage that throws must still emit (timings on the error path are the point).

### B2. The measurement run
- N=10 real asks through the LIVE loop (the eval-harness path — same mechanism the
  interpretation_bait suite uses), mixed query types: 4 verse-ref, 3 topical, 3 pericope.
  Cold and warm. Results to `docs/evidence/ask-latency/run-<date>.md` as a per-stage table.

### B3. Pre-registered decision rules — written NOW, before the numbers exist (the no-slop move:
the data cannot be argued into a preferred conclusion)
- compose+verify ≥ 60% of total → priority 1 = stream sources immediately + cap verify retries
  at 2 (UX change, no retrieval change).
- rerank ≥ 15s at p50 → priority 2 = skip rerank for verse-ref intents (exact anchors need no
  semantic reordering). **This IS a retrieval change → the held-out accuracy diagnostic re-runs
  before it ships, per CLAUDE.md. No exceptions.**
- provider variance (p95/p50 ≥ 3× on any DeepInfra stage, or any 429) → priority = D5b
  failover build (already ruled).
- cold start ≥ 5s of total → warmer/fluid-compute config change.
- Anything not triggered by a rule → NOT built. The menu is closed.

### B4. Fixes
- Only the triggered items, each as its own slice with its own check, accuracy-gated where
  retrieval-touching. Report the before/after stage table as the acceptance evidence.

## Definition of done, both pieces
Deploys measured fast (A6 number recorded); reader verified in a browser post-flip; parity and
quarantine welds red-proofed; latency table published with triggered decisions listed and
untriggered ones explicitly NOT built; audit green throughout; WORKLOG entries with NOT DONE
sections; every red-proof log under `docs/evidence/`.

## Explicitly out of scope
Graph databases (no measured need; ruled again 2026-08-13); moving corpus into Neon; caching
composed ANSWERS (forbidden by the accuracy-bar rule regardless of latency); any prod DB write.
