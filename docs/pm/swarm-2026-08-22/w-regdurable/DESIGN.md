# W-REGDURABLE — Register flip durability: design

**Origin.** WORKLOG 2026-08-19 (P4.n Phase B), NOT-DONE: *"sermon and theology are unflipped,
and want a durability story better than a 7-hour transaction before they run."* Measured there:
`served=true` is the most expensive write this schema allows (six indexes carry `served` in
their predicate, so no HOT update; every row re-enters an 8 GB HNSW graph over Neon's network
pageserver) at a measured 20–36 rows/sec — sermon ≈ 4.5 h, theology ≈ 7.5 h, and three
single-transaction runs already died mid-flight leaving nothing written.

## Mechanism (reused, not new)

The durability story already exists in the repo, twice: `scripts/serve-batched.mjs`
(committed) and the 2026-08-22 detached `register='prose'→'lexicon'` relabel (WORKLOG
2026-08-22 close-out). Both use the same idiom, and this item reuses it verbatim:

1. **2,000-row batches, each a single autocommit statement.** No explicit transaction, nothing
   long-lived. An interruption costs at most the one in-flight batch, and Postgres statement
   atomicity rolls even that back.
2. **The database is the resumable state.** The idempotence predicate `served IS NOT TRUE` is
   the checkpoint: a re-run picks up exactly the rows not yet flipped. No state table, no
   checkpoint file — the relabel's own receipt was "re-run the same command; the final
   group-by is the receipt". A parallel state store would be a second source of truth that can
   disagree with the first.
3. **Dry-run by default; `--apply` to write.** Default mode prints the full plan (per-work
   todo counts, preflight verdicts) and stops before any write.
4. **Dev-guarded exactly like the suppression scripts**
   (`src/ingest/dev-only-target.mjs:assertDevOnlyTarget`): requires `NEON_BRANCH=dev|test`
   AND a host whose first label is `ep-tiny-hat`/`ep-holy-rice` (or localhost, which exists
   for the local red-proof). The label alone is self-attested; the URL alone is spoofable;
   both together refuse a production URL with a stale `NEON_BRANCH=dev`. Prod is unreachable
   through this tool — the prod run goes through the owner packet.

## Selection: by `source_type`, not by the register label

The flip targets the rows of **published works whose `sources.source_type` is `sermon` or
`theology`** — deliberately NOT `metadata->>'register' IN ('sermon','theology')`. The register
label is write-only and has already moved once (the 08-22 prose→lexicon relabel); on dev
today there are **zero** rows carrying `register='sermon'/'theology'` — the same content
carries `register='prose'` (the prose-register convention). `source_type` + `status` is the
stable join key on both environments. Only `status='published'` works are eligible: a
served-but-unpublished work is a bug and this tool must not be able to create one (staged
npnf201/202/203 and the staged sermon/theology works are excluded and reported, not touched).

## Preflight (all legality gates BEFORE the first write)

Batched commits mean there is no "roll it all back", so every legality question is answered
first, importing the same lists `publish-flip`/`serve-batched` use, never re-typed:
`isAllowedLicense` (`src/ingest/allowed-licenses.mjs`), `forbiddenProvenanceDomain`
(`src/ingest/forbidden-provenance.mjs`), `isMustNotServe` (`scripts/lib/served-corpus-authors.mjs`).
Any trip → STOP, nothing written. Client options copy the observed-hang idiom from
`register-label-embeddings.mjs` (`keepAlive`, `query_timeout`/`statement_timeout`,
`application_name`) — a blackholed socket must fail, not hang.

## Failure semantics

- Kill between batches: committed batches stand; re-run resumes; an interruption costs ≤1 batch.
- Kill mid-statement: the server aborts and rolls back that statement; resume re-attempts it.
- Re-run after completion: todo = 0, "already fully served", exit 0 — no double-application,
  because the predicate excludes already-served rows and each batch's `rowCount` counts only
  rows actually moved.

## What this item does NOT do

No prod anything (order §1.1): the prod flip is a packet entry for the owner, run with this
same tool pointed at prod through the owner's own gate. No new framework, state table,
migration, or config knob.
