# PM/docs graph

A Neo4j graph over this repo's PM/history corpus — `docs/**/*.md`, `WORKLOG.md`, `AGENTS.md`,
`CLAUDE.md` — so questions like "what corrected this gate", "what does this order cite", or
"what still points at a stale claim" are a query instead of grep-and-scroll. It exists because
this repo's own culture (MASTER.md's bylaws, the failure-mode watchlist, `docs/THE_LOOP.md`)
already treats staleness, broken citations and silent corrections as the main recurring defect
class — this tool makes that structure queryable instead of something you reconstruct by eye
every session.

**It is not a source of truth.** The markdown files are (MASTER.md bylaw 2: "the docs are the
source of truth"). This graph is a fully derived, fully disposable view of them — delete it and
`npm run pm-graph:ingest` rebuilds it from scratch in seconds. Never hand-edit the graph; edit the
docs and re-ingest.

## Quick start

```sh
npm run pm-graph:up       # starts Neo4j via Docker (scripts/pm-graph/docker-compose.yml)
npm run pm-graph:ingest   # parses the docs corpus and (re)writes the graph
```

Then open <http://localhost:7474> (user `neo4j`, password `pmgraph-local-dev` unless you set
`NEO4J_PASSWORD` before `pm-graph:up` — set it before both `up` and `ingest` if you do, they must
agree) and run Cypher, or point any Cypher client / driver at `bolt://localhost:7687`.

`npm run pm-graph:down` stops it. The graph's data lives in a Docker volume, not in this repo.

## Schema

**Nodes**

| Label | Key property | Derived from |
|---|---|---|
| `Document` | `path` | Every tracked file in scope. `title` = first `#`/`##` heading; `lastCommitDate`/`lastCommitSha` = `git log -1` on that path. |
| `Gate` | `id` (e.g. `A9`, `D4`) | `docs/pm/MASTER.md`'s own `## Lane X` sections and their `\| # \| Gate \| Status \|` tables — **never hand-typed**, see "Why derive, not hand-type" below. Carries `lane`, `title`, `ownerGoRequired` (the ⚑ marker), and the full `statusRaw` cell text. |
| `Adr` | `id` (e.g. `ADR-102`) | `docs/DECISIONS.md`'s own `## ADR-NNN — Title` headers. |
| `WorklogEntry` | `entryId` (e.g. `2026-08-15#2`) | `WORKLOG.md`'s own `## YYYY-MM-DD (qualifier) — Title` headers. Multiple same-day entries get `#1`, `#2`, ... in document order. |

`Document`, `Gate`, and `WorklogEntry` also carry a secondary `:Node` label and a shared `key`
property (= their natural id above) — every place in the graph that can be the *source* of a
citation is addressable the same way, which is what keeps the write queries in `ingest.mts` to one
plain `MATCH (from:Node {key: $x})` instead of branching per type. `Adr` never originates an edge
in this schema (nothing here mines ADR bodies for their own citations yet — see "Known gaps"), so
it doesn't need the shared label.

**Relationships**

| Type | Meaning |
|---|---|
| `(:Document)-[:DEFINES]->(:Gate\|:Adr)` | This document is where that gate/ADR is declared. |
| `(:WorklogEntry)-[:PART_OF]->(:Document)` | Always points at the `WORKLOG.md` Document node. |
| `(:Node)-[:LINKS_TO {anchor, linkText}]->(:Document)` | A markdown `[text](path)` link that resolved to a tracked file. |
| `(:Node)-[:MENTIONS]->(:Gate\|:Adr)` | Free-text mention of a known gate/ADR id — matched against the id set *derived* from the tables above, not a hand-typed list (see below). |
| `(:Node)-[:CORRECTS {marker, snippet}]->(:Gate\|:Adr\|:Document)` | **Heuristic, not fact.** A fixed keyword (`CORRECTED`, `RETRACTED`, `WITHDRAWN`, `SUPERSEDED`, ...) co-occurring with a reference in the same chunk of text. Every edge carries the matched keyword and a ~120-char snippet so you can judge it yourself — see "Reading CORRECTS edges" below. |

Broken links (a markdown link whose target isn't a tracked file) are **not** written into the
graph — there's nothing on the other end for an edge to point at — but `ingest.mts` prints every
one to stdout rather than silently dropping them, because a silently-dropped broken link is
exactly the kind of unearned-green this repo's watchlist warns about. Read the ingest output, or
redirect it, if you want the list.

## Why derive, not hand-type

MASTER.md's own failure-mode watchlist names "a hand-maintained expected set that nothing
enforces" as the single most repeated defect class in this repo — at last count, at least eleven
separate instances, several introduced by the very tranche meant to fix the class before them. A
graph tool that shipped its own hand-typed list of gate IDs or ADR numbers would just be the next
instance wearing a database. So every id set this tool matches against — `knownGateIds`,
`knownAdrIds`, `knownPaths` — is computed from the document that owns it, every run, and nothing
here has ever been asked to stay in sync with MASTER.md by hand. If MASTER.md gains a Lane E
tomorrow, the next `pm-graph:ingest` picks it up with no code change.

## Reading CORRECTS edges

The correction signal is deliberately weak evidence, not a claim. It fires when one of a small,
editable keyword list (`CORRECTION_MARKERS` in `lib/parse-docs.mts`) appears in the same chunk of
text as a reference to a gate, ADR, or linked document. It will miss corrections phrased without
one of those words, and it can occasionally fire on a keyword used in an unrelated sense. Treat a
`CORRECTS` edge as "worth reading the snippet on", not as "X is known to have corrected Y" — the
snippet is on the edge precisely so you don't have to take the edge's word for it. Real example
from this repo's own corpus (2026-08-15 ingest run):

```
(Gate A7)-[:CORRECTS {marker: "RETRACTED"}]->(Gate A7b)
  snippet: "**DONE 2026-08-02, with one check RETRACTED.** 12/12 derived journeys PASS,
            and **X1 ("no console error"..."
```

which is exactly A7's real, documented retraction of its own X1 check in favor of A7b's findings —
the heuristic found a genuine relationship on the first real run, on real data, with no tuning.

## Example queries

```cypher
// What corrected gate D4, and what did the correction say?
MATCH (from)-[c:CORRECTS]->(g:Gate {id: 'D4'})
RETURN from.key AS from, c.marker, c.snippet
ORDER BY from;

// Every WORKLOG entry that touched gate D4, most recent first.
MATCH (w:WorklogEntry)-[:MENTIONS]->(g:Gate {id: 'D4'})
RETURN w.date, w.qualifier, w.title
ORDER BY w.date DESC, w.entryId DESC;

// Everything that cites MASTER.md but hasn't been touched since MASTER.md's own last commit —
// the "went 57 commits stale" problem this repo has hit more than once, as a query.
MATCH (d:Document)-[:LINKS_TO]->(master:Document {path: 'docs/pm/MASTER.md'})
WHERE d.lastCommitDate < master.lastCommitDate
RETURN d.path, d.lastCommitDate, master.lastCommitDate
ORDER BY d.lastCommitDate ASC;

// Every open gate still needing an owner go (⚑), across every lane.
MATCH (g:Gate {ownerGoRequired: true})
RETURN g.lane, g.id, g.title, g.statusRaw
ORDER BY g.lane, g.id;

// The citation chain leading to a specific order doc.
MATCH (from)-[:LINKS_TO]->(target:Document {path: 'docs/pm/orders/2026-08-15-verdict-ask-compose-latency-design.md'})
RETURN from.key AS citedBy;
```

## Why full rebuild (no incremental update)

Every `pm-graph:ingest` run wipes the whole graph (`MATCH (n) DETACH DELETE n`) before rewriting
it. Docs change by hand, in small numbers, rarely more than once a session — a few hundred files
parse and load in well under a second, so there is no performance reason to diff. The alternative
(incremental `MERGE`-only writes, never deleting stale edges) would let a `LINKS_TO` or `CORRECTS`
edge outlive the sentence that produced it after someone edits or deletes a link — silently
recreating the exact "stale pointer no one notices" problem this tool exists to surface. Least
code (bylaw 3): full rebuild is simpler and cannot go stale.

## Known gaps (v1, not fixed here)

- ADR bodies aren't scanned for their own citations — only `DECISIONS.md`'s document-level scan
  covers text inside an ADR entry, so `ADR-110`'s own outbound links/mentions aren't as granular
  as a Gate's or WorklogEntry's. Same fix shape as Gates (extract per-ADR-body chunks) if it turns
  out to matter.
- `CORRECTS` only finds the *first* occurrence of each marker per chunk (`String.indexOf`, not a
  global scan) — a chunk that says "RETRACTED" twice about two different things only surfaces the
  first. Chunks here are already fairly small (a gate's status cell, one WORKLOG entry), so this
  mostly affects the coarser whole-document-level scan, which is redundant with the finer per-gate
  and per-entry scans anyway.
- `UX_REMEDIATION.md`'s own block ids (`S1`, `T1`, `X2`, ...) aren't derived or matched — they're
  a different namespace from MASTER.md's lane gates, deliberately out of scope for v1 rather than
  half-covered.

## Verification status (2026-08-15)

The parser (`lib/parse-docs.mts`) is unit-tested (`test/pm-graph-parse.test.ts`, 18 assertions)
and was red-proofed: a deliberately reintroduced bug (dropping the gate-id allowlist check) was
confirmed to fail the "decoy" test before the fix was restored. It was then run against this
repo's real corpus (207 files) and correctly derived 28 gates and 60 ADRs, independently
cross-checked against a plain `grep` count of the same files (exact match on both).

Two real bugs were caught this way, neither by the unit tests: `git ls-files 'docs/**/*.md'`
silently excludes files directly under `docs/` (a git pathspec quirk — `**/` requires a non-empty
directory segment; `docs/*.md` alone already recurses under git's default wildcard matching,
since a bare `*` matches `/`) — first run reported 0 ADRs, the fix is in `listScopedDocs()`'s
comment. And the first version of the Neo4j write queries used a 3-way `MATCH ... UNION MATCH ...
UNION MATCH ...` per edge type on the assumption that one early `UNWIND` bound `row` across all
three branches — it doesn't; each `UNION` branch is an independent query. Caught by re-reading the
Cypher, not by running it (see below), and fixed by giving `Document`/`Gate`/`WorklogEntry` a
shared `:Node{key}` label so every edge write is one unambiguous `MATCH`.

**The Neo4j write path itself has not been run against a live database in this environment.**
This sandbox's egress policy denies both `production.cloudfront.docker.com` (Docker Hub's blob
CDN — the `docker compose pull` in `pm-graph:up`) and `dist.neo4j.org` (Neo4j's own binary
distribution, tried as a fallback) with an explicit 403 at the proxy level — confirmed via
`curl $HTTPS_PROXY/__agentproxy/status`, not a transient failure. Per this session's own tooling
guidance, a policy denial is reported, not retried or routed around. **Run `npm run pm-graph:up &&
npm run pm-graph:ingest` on a machine that can reach Docker Hub — most likely the first real test
of the write queries** — and treat the first run's console output (node/edge counts, any Neo4j
error) as the actual verification. If anything in the write queries is wrong, it will fail loudly
(the script exits non-zero on a Neo4j error) rather than silently producing an empty graph.
