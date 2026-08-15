#!/usr/bin/env -S npx tsx
// Rebuilds the PM/docs graph in Neo4j from the tracked markdown corpus. Fully derived, fully
// disposable: the graph carries no state of its own, docs remain the one source of truth
// (MASTER.md bylaw 2), and re-running this after any doc change is the whole workflow — there
// is no partial-update path to keep in sync, which is deliberate (see README "Why full rebuild").
//
// Scope: CLAUDE.md, AGENTS.md, WORKLOG.md (root) + everything under docs/**/*.md. Nothing under
// web/ or src/ — this is the PM/history corpus, not the codebase.
//
// Usage:
//   npm run pm-graph:up       # starts Neo4j (scripts/pm-graph/docker-compose.yml)
//   npm run pm-graph:ingest   # this script
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';
import {
  extractAdrs,
  extractCorrections,
  extractGates,
  extractLinks,
  extractMentions,
  extractWorklogEntries,
  type DocAdr,
  type DocGate,
  type WorklogEntry,
} from './lib/parse-docs.mts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const NEO4J_URI = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'pmgraph-local-dev';

function listScopedDocs(): string[] {
  // NOTE: 'docs/*.md' is correct here, not 'docs/**/*.md'. Git's default (non-glob) pathspec
  // matching already treats a bare `*` as matching `/`, so 'docs/*.md' recurses into every
  // subdirectory on its own; adding `**/` makes git require a NON-EMPTY directory segment
  // before the final `*.md`, which silently drops every file directly under docs/ — including
  // docs/DECISIONS.md itself. First run of this script (2026-08-15) reported "0 ADRs derived"
  // against a real corpus of 60 — this is why, and it only showed up by actually running it
  // against real data, not from the unit tests (this is a git pathspec quirk, not a parser bug).
  const out = execFileSync('git', ['ls-files', 'CLAUDE.md', 'AGENTS.md', 'WORKLOG.md', 'docs/*.md'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').filter((p) => p.endsWith('.md'));
}

function gitLastCommit(path: string): { date: string | null; sha: string | null } {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%aI|%h', '--', path], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    if (!out) return { date: null, sha: null };
    const [date, sha] = out.split('|');
    return { date: date ?? null, sha: sha ?? null };
  } catch {
    return { date: null, sha: null };
  }
}

function firstHeading(text: string): string {
  const m = text.match(/^#{1,2}\s+(.+)$/m);
  return m?.[1]?.trim() ?? '(untitled)';
}

interface DocumentRow {
  path: string;
  title: string;
  lastCommitDate: string | null;
  lastCommitSha: string | null;
}

async function main() {
  console.log(`Scanning ${REPO_ROOT} ...`);
  const docPaths = listScopedDocs();
  const knownPaths = new Set(docPaths);
  console.log(`  ${docPaths.length} tracked markdown files in scope`);

  const texts = new Map<string, string>();
  for (const p of docPaths) texts.set(p, readFileSync(`${REPO_ROOT}${p}`, 'utf8'));

  const documents: DocumentRow[] = docPaths.map((p) => {
    const { date, sha } = gitLastCommit(p);
    return { path: p, title: firstHeading(texts.get(p) ?? ''), lastCommitDate: date, lastCommitSha: sha };
  });

  const masterText = texts.get('docs/pm/MASTER.md') ?? '';
  const decisionsText = texts.get('docs/DECISIONS.md') ?? '';
  const worklogText = texts.get('WORKLOG.md') ?? '';

  const gates: DocGate[] = masterText ? extractGates(masterText, 'docs/pm/MASTER.md') : [];
  const adrs: DocAdr[] = decisionsText ? extractAdrs(decisionsText, 'docs/DECISIONS.md') : [];
  const worklogEntries: WorklogEntry[] = worklogText ? extractWorklogEntries(worklogText, 'WORKLOG.md') : [];

  console.log(`  ${gates.length} gates derived from MASTER.md's own lane tables`);
  console.log(`  ${adrs.length} ADRs derived from DECISIONS.md's own headers`);
  console.log(`  ${worklogEntries.length} WORKLOG entries derived from WORKLOG.md's own headers`);

  const knownGateIds = new Set(gates.map((g) => g.id));
  const knownAdrIds = new Set(adrs.map((a) => a.id));

  // --- Document-level edges -------------------------------------------------------------
  type LinkEdge = { from: string; toPath: string; anchor: string | null; linkText: string };
  type MentionEdge = { from: string; toId: string; kind: 'gate' | 'adr' };
  type CorrectsGateEdge = { from: string; toId: string; marker: string; snippet: string };
  type CorrectsAdrEdge = { from: string; toId: string; marker: string; snippet: string };
  type CorrectsDocEdge = { from: string; toPath: string; marker: string; snippet: string };
  type BrokenLink = { from: string; rawTarget: string; linkText: string };

  const linkEdges: LinkEdge[] = [];
  const mentionEdges: MentionEdge[] = [];
  const correctsGateEdges: CorrectsGateEdge[] = [];
  const correctsAdrEdges: CorrectsAdrEdge[] = [];
  const correctsDocEdges: CorrectsDocEdge[] = [];
  const brokenLinks: BrokenLink[] = [];

  const scanChunk = (fromId: string, sourceDocPath: string, text: string) => {
    const links = extractLinks(text, sourceDocPath, knownPaths);
    for (const l of links) {
      if (l.broken) {
        brokenLinks.push({ from: fromId, rawTarget: l.rawTarget, linkText: l.linkText });
        continue;
      }
      if (l.isExternal || !l.resolvedPath) continue;
      linkEdges.push({ from: fromId, toPath: l.resolvedPath, anchor: l.anchor, linkText: l.linkText });
    }
    const mentions = extractMentions(text, knownGateIds, knownAdrIds);
    for (const m of mentions) mentionEdges.push({ from: fromId, toId: m.id, kind: m.kind });

    const linkTargets = links.filter((l) => l.resolvedPath).map((l) => l.resolvedPath as string);
    const corrections = extractCorrections(text, mentions, linkTargets);
    // Fan each correction match out to every concrete node it referenced in the same chunk —
    // a CORRECTS edge with nothing on the other end isn't queryable, so refs with no target
    // are dropped from the graph (not from the log: they're still visible in stdout below).
    for (const c of corrections) {
      for (const g of c.gateRefs) correctsGateEdges.push({ from: fromId, toId: g, marker: c.marker, snippet: c.snippet });
      for (const a of c.adrRefs) correctsAdrEdges.push({ from: fromId, toId: a, marker: c.marker, snippet: c.snippet });
      for (const p of c.linkRefs) correctsDocEdges.push({ from: fromId, toPath: p, marker: c.marker, snippet: c.snippet });
    }
  };

  for (const doc of documents) scanChunk(doc.path, doc.path, texts.get(doc.path) ?? '');
  for (const g of gates) scanChunk(g.id, 'docs/pm/MASTER.md', g.statusRaw);
  for (const e of worklogEntries) scanChunk(e.entryId, 'WORKLOG.md', e.body);

  const correctionEdgeCount = correctsGateEdges.length + correctsAdrEdges.length + correctsDocEdges.length;
  console.log(`  ${linkEdges.length} resolved doc-to-doc links, ${brokenLinks.length} broken`);
  console.log(`  ${mentionEdges.length} gate/ADR mentions`);
  console.log(`  ${correctionEdgeCount} correction signals, targeted (heuristic — read the snippet before trusting it)`);

  if (brokenLinks.length > 0) {
    console.log('\nBroken links (target not a tracked file — not silently dropped):');
    for (const b of brokenLinks) console.log(`  ${b.from} -> "${b.linkText}" (${b.rawTarget})`);
  }

  // --- Write to Neo4j --------------------------------------------------------------------
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  try {
    await driver.verifyConnectivity();
  } catch (e) {
    console.error(`\nCould not reach Neo4j at ${NEO4J_URI}. Is it running? (npm run pm-graph:up)`);
    console.error(String(e));
    await driver.close();
    process.exitCode = 1;
    return;
  }

  const session = driver.session();
  try {
    console.log('\nResetting graph (always a full rebuild — see README "Why full rebuild") ...');
    await session.run('MATCH (n) DETACH DELETE n');

    // Document/Gate/WorklogEntry all also get a secondary `:Node` label and a shared `key`
    // property (path / id / entryId respectively). Edge-writing queries below need to find
    // "whichever of the three kinds this edge originated from" from one plain string in
    // row.from — matching by one shared label+property is a single unambiguous MATCH.
    // (v1 of this used a 3-way `MATCH ... UNION MATCH ... UNION MATCH ...` per edge type,
    // relying on one early UNWIND to bind `row` across all three branches — it doesn't:
    // each UNION branch is an independent query, so `row` is unbound in branches 2 and 3.
    // Caught by re-reading the Cypher rather than by running it, since this sandbox's egress
    // policy blocks both Docker Hub and dist.neo4j.org — see the evidence note for why this
    // was never executed against a live database.)
    await session.run(
      `UNWIND $rows AS row
       MERGE (d:Document:Node {path: row.path})
       SET d.key = row.path, d.title = row.title, d.lastCommitDate = row.lastCommitDate, d.lastCommitSha = row.lastCommitSha`,
      { rows: documents },
    );

    await session.run(
      `UNWIND $rows AS row
       MERGE (g:Gate:Node {id: row.id})
       SET g.key = row.id, g.lane = row.lane, g.title = row.title, g.ownerGoRequired = row.ownerGoRequired,
           g.statusRaw = row.statusRaw, g.sourceDoc = row.sourceDoc
       WITH g, row
       MATCH (d:Document {path: row.sourceDoc})
       MERGE (d)-[:DEFINES]->(g)`,
      { rows: gates },
    );

    await session.run(
      `UNWIND $rows AS row
       MERGE (a:Adr {id: row.id})
       SET a.title = row.title, a.sourceDoc = row.sourceDoc
       WITH a, row
       MATCH (d:Document {path: row.sourceDoc})
       MERGE (d)-[:DEFINES]->(a)`,
      { rows: adrs },
    );

    await session.run(
      `UNWIND $rows AS row
       MERGE (w:WorklogEntry:Node {entryId: row.entryId})
       SET w.key = row.entryId, w.date = row.date, w.qualifier = row.qualifier, w.title = row.title, w.body = row.body
       WITH w, row
       MATCH (d:Document {path: row.sourceDoc})
       MERGE (w)-[:PART_OF]->(d)`,
      { rows: worklogEntries },
    );

    await session.run(
      `UNWIND $rows AS row
       MATCH (from:Node {key: row.from})
       MATCH (to:Document {path: row.toPath})
       MERGE (from)-[r:LINKS_TO]->(to)
       SET r.anchor = row.anchor, r.linkText = row.linkText`,
      { rows: linkEdges },
    );

    await session.run(
      `UNWIND $rows AS row
       MATCH (from:Node {key: row.from})
       WHERE row.kind = 'gate'
       MATCH (to:Gate {id: row.toId})
       MERGE (from)-[:MENTIONS]->(to)`,
      { rows: mentionEdges },
    );

    await session.run(
      `UNWIND $rows AS row
       MATCH (from:Node {key: row.from})
       WHERE row.kind = 'adr'
       MATCH (to:Adr {id: row.toId})
       MERGE (from)-[:MENTIONS]->(to)`,
      { rows: mentionEdges },
    );

    // CORRECTS: a heuristic signal (keyword co-occurring with a reference — see
    // parse-docs.mts CORRECTION_MARKERS), so every edge below carries its own marker + text
    // snippet rather than asserting the correction as fact. Query it, then read the snippet.
    await session.run(
      `UNWIND $rows AS row
       MATCH (from:Node {key: row.from})
       MATCH (from:WorklogEntry {entryId: row.from})
       WITH from, row
       MATCH (to:Gate {id: row.toId})
       CREATE (from)-[:CORRECTS {marker: row.marker, snippet: row.snippet}]->(to)`,
      { rows: correctsGateEdges },
    );

    await session.run(
      `UNWIND $rows AS row
       MATCH (from:Node {key: row.from})
       MATCH (to:Adr {id: row.toId})
       CREATE (from)-[:CORRECTS {marker: row.marker, snippet: row.snippet}]->(to)`,
      { rows: correctsAdrEdges },
    );

    await session.run(
      `UNWIND $rows AS row
       MATCH (from:Node {key: row.from})
       MATCH (to:Document {path: row.toPath})
       WHERE to.path <> from.key
       CREATE (from)-[:CORRECTS {marker: row.marker, snippet: row.snippet}]->(to)`,
      { rows: correctsDocEdges },
    );

    console.log('\nDone. Open http://localhost:7474 (user neo4j) and run a Cypher query — see scripts/pm-graph/README.md.');
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
