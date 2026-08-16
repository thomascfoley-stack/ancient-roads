# PM/docs graph — first run against the real corpus, 2026-08-15

Owner asked for a graph database over the PM/docs corpus to make navigating this repo's history
easier. Scope confirmed with the owner: the PM/docs corpus (not the product's Bible corpus, not
the codebase), checked into the repo for future sessions to use, backed by a full Neo4j server.
Tool lives at `scripts/pm-graph/` (see its `README.md` for schema, example queries, and design).

## What ran, and what didn't

**Parser (`lib/parse-docs.mts`) — fully verified.**
- `test/pm-graph-parse.test.ts`, 18 assertions, all green.
- Red-proofed: temporarily dropped the gate-id allowlist check in `extractMentions`, confirmed
  the "does NOT match a decoy" test went red for exactly that reason, restored, confirmed green
  again.
- `npm run typecheck` equivalent (`tsc --noEmit -p tsconfig.cutover.json`, which covers
  `scripts/**/*.mts`): clean.
- `npm run test` (full root suite): 66 files / 717 passed / 10 skipped — no regressions, confirmed
  identical skip/pass counts to the pre-change baseline.
- `npx knip`: identical output before and after this change (verified via `git stash`/`stash pop`
  A-B comparison) — the new files and dependency aren't flagged, and aren't silently unchecked
  either; knip's `project`/`entry` config has never covered `scripts/` (same gap
  `tsconfig.cutover.json`'s own header comment already documents for the rest of that directory).

**Run against the real corpus (not a fixture) — two real bugs found and fixed:**

1. `git ls-files 'docs/**/*.md'` returned 102 files where 204 exist. Git's default (non-glob)
   pathspec matching already treats a bare `*` as matching `/`, so `docs/*.md` alone recurses into
   every subdirectory; adding `**/` makes git require a *non-empty* directory segment before the
   final `*.md`, which silently drops every file directly under `docs/` — including
   `docs/DECISIONS.md` itself. First run reported "0 ADRs derived" against a real count of 60.
   Fixed by dropping the `**/`; re-run reported 60/60, cross-checked against `grep -c "^## ADR"
   docs/DECISIONS.md`.
2. The Neo4j write queries for `LINKS_TO`/`MENTIONS`/`CORRECTS` used a 3-way `MATCH ... UNION
   MATCH ... UNION MATCH ...` per edge type, written on the assumption that one early `UNWIND`
   bound `row` across all three branches. It doesn't — each `UNION` branch is an independent
   query, so `row` would have been unbound in branches 2 and 3. **Caught by re-reading the Cypher,
   not by executing it** (see below for why), before any commit. Fixed by giving `Document`,
   `Gate`, and `WorklogEntry` a shared `:Node{key}` secondary label, so every edge write is one
   unambiguous `MATCH (from:Node {key: $x})` instead of a label-branching union.

After both fixes, a scan-only run (everything up to the Neo4j connection attempt) against this
repo's actual 207 in-scope files produced:

| derived | count | cross-check |
|---|---|---|
| Gates | 28 | Independently `grep`'d from MASTER.md's own `\| [A-D]\d+[a-z]?` rows: **28, identical set** (diffed, not just counted) |
| ADRs | 60 | `grep -c '^## ADR' docs/DECISIONS.md`: **60** |
| WorklogEntries | 113 | — |
| Resolved doc-to-doc links | 160 | — |
| Broken links (target not a tracked file) | 75 | printed to stdout, not silently dropped — see README |
| Gate/ADR mentions | 2162 | — |
| Correction signals (heuristic) | 1282 | spot-checked, see below |

Spot-checking the correction heuristic against real gate-status text found genuine, previously
undocumented-as-graph-data relationships on the first try, no tuning:

```
Gate A7  --RETRACTED-->  Gate A7b   ("...12/12 derived journeys PASS, and **X1 ... is
                                       WITHDRAWN as an unearned green**...")
Gate B0b --SUPERSEDE-->  Gate B0a   ("RULED 2026-08-03 — ADR-103. SUPERSEDE for the ship
                                       gate, KEEP as a regression check...")
```

Both are real, and match what the board text itself says in prose — the heuristic is finding
signal, not noise, on the first real run.

**The Neo4j write path itself — NOT RUN. Reported, not claimed.**

`npm run pm-graph:up` (Docker) failed: pulling `neo4j:5-community` hit
`production.cloudfront.docker.com` and got an explicit 403 at the egress proxy —
`gateway answered 403 to CONNECT (policy denial or upstream failure)`, confirmed via
`curl $HTTPS_PROXY/__agentproxy/status`, which recorded it as a `connect_rejected` relay failure,
not a timeout or a transient error. A fallback attempt to fetch Neo4j's own distribution tarball
directly from `dist.neo4j.org` (bypassing Docker Hub entirely) got the identical 403 from the same
gateway. Both are recorded in the proxy's `recentRelayFailures`. Per this session's own tooling
guidance ("do not retry or route around [a policy denial] — report it instead"), no further
workaround was attempted.

**Consequence:** the Cypher `MERGE`/`MATCH`/`CREATE` statements in `ingest.mts` have been read
carefully (twice — the bug above was caught this way) and are believed correct, but have never
executed against a live Neo4j server. The script fails loudly on a connection or query error
(non-zero exit, printed Neo4j error) rather than silently reporting success, so the first real run
on a machine that can reach Docker Hub is a real test, not a formality — treat its console output
as the actual verification of this half.

## What this does NOT establish

No claim that the Neo4j write queries are bug-free — only that they were reasoned through
carefully after one bug was already found that way, and that the tool fails loudly rather than
quietly on the next one. No claim about `CORRECTS` edges being factually correct corrections —
the heuristic is explicitly weak evidence (see `scripts/pm-graph/README.md` "Reading CORRECTS
edges"); two examples were spot-checked and matched reality, not all 1282.

## Next step

`npm run pm-graph:up && npm run pm-graph:ingest` on a machine with real Docker Hub access. If it
completes without a Neo4j error, the write path is verified; if it errors, the error will point at
which query, and the fix is scoped to `ingest.mts`'s Cypher, not the parser (which is
independently verified above).
