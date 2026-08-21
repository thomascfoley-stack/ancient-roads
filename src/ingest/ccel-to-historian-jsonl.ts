// CCEL ThML → historian JSONL — the ingestion bridge (historian plan Phase 1).
//
//   npx tsx src/ingest/ccel-to-historian-jsonl.ts --slug=bede-history [--print=N] [--out=path]
//
// PRODUCES the exact node contract ingest-historian.ts consumes: one JSON line per leaf division,
// `{ path: string[], content: string }`, where path is the div-title chain ("Book I" → "Chap. II
// …"). Chunking, EMBED_MAX, verbatim periods, anchors, licensing gates all stay the INGESTER's
// job — this file grows no second mechanism (HISTORY_RETRIEVAL_DESIGN §6 note).
//
// REUSES adapter-ccel's fetch/cache/ThML-guard and its markup stripper — a second fetcher or a
// second stripper is how two copies drift.
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fetchCcelXml, thmlText } from './adapter-ccel.js';
import { expandCcelIdPattern } from './source-artifact-urls.mjs';

const arg = (n: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`${n}=`))?.slice(n.length + 1);

const slug = arg('--slug');
const printN = Number(arg('--print') ?? 0);

interface Node { path: string[]; content: string }

/** Walk numbered ThML divs maintaining the title stack. A div's OWN content is the segment
 *  between its open tag and the next div-open of any depth; parents typically hold only an
 *  h-tag, which strips to noise and is dropped by the length floor. */
export function xmlToNodes(xml: string): Node[] {
  const opens = [...xml.matchAll(/<div([1-4])\b([^>]*)>/gi)];
  const nodes: Node[] = [];
  const stack: string[] = [];
  for (let i = 0; i < opens.length; i += 1) {
    const depth = Number(opens[i]![1]);
    const title = /title="([^"]*)"/.exec(opens[i]![2] ?? '')?.[1]?.trim() || `(untitled ${depth})`;
    stack.length = depth - 1;          // pop to the parent level
    stack.push(title);
    const from = opens[i]!.index! + opens[i]![0].length;
    const to = i + 1 < opens.length ? opens[i + 1]!.index! : xml.length;
    const content = thmlText(xml.slice(from, to)).trim();
    if (content.length >= 200) nodes.push({ path: [...stack], content });
  }
  return nodes;
}

async function main(): Promise<void> {
  if (!slug) { console.error('usage: ccel-to-historian-jsonl.ts --slug=<manifest slug> [--print=N] [--out=path]'); process.exit(2); }
  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) { console.error(`STOP: ${slug} has no manifest entry.`); process.exit(2); }
  // The ingester re-checks all of this fail-closed; checking here too just fails FASTER.
  if (entry.source_type !== 'historian') { console.error(`STOP: ${slug} is source_type=${String(entry.source_type)}, not historian.`); process.exit(2); }
  const acquire = (entry.provenance as { acquire?: { ccel_ids?: string[] } } | undefined)?.acquire;
  // expandCcelIdPattern is a RANGE expander that returns [] for a plain id (its own header:
  // "a pattern that expanded to nothing") — plain ids pass through, patterns expand.
  const ids = (acquire?.ccel_ids ?? []).flatMap((p) =>
    /\{\d+\.\.\d+\}/.test(p) ? expandCcelIdPattern(p) : [p]);
  if (!ids.length) { console.error(`STOP: ${slug} has no ccel_ids.`); process.exit(2); }

  const nodes: Node[] = [];
  for (const id of ids) {
    const xml = await fetchCcelXml(id);
    if (!xml) { console.error(`STOP: ${id} fetch failed or is not ThML. Nothing written.`); process.exit(2); }
    nodes.push(...xmlToNodes(xml));
  }
  if (nodes.length < 3) { console.error(`STOP: only ${nodes.length} node(s) — refusing to emit a blob (MIN_UNITS discipline).`); process.exit(2); }

  if (printN > 0) {
    for (const n of nodes.slice(0, printN)) {
      console.log(`── ${n.path.join(' — ')}`);
      console.log(`   ${n.content.slice(0, 220).replace(/\s+/g, ' ')}…\n`);
    }
  }
  const out = arg('--out') ?? `data/raw/historians/${slug}.jsonl`;
  mkdirSync('data/raw/historians', { recursive: true });
  writeFileSync(out, `${nodes.map((n) => JSON.stringify(n)).join('\n')}\n`);
  const chars = nodes.reduce((a, n) => a + n.content.length, 0);
  console.log(`${slug}: ${nodes.length} node(s), ${(chars / 1024).toFixed(0)} KB text, max path depth ${Math.max(...nodes.map((n) => n.path.length))} -> ${out}`);
}

// Run only when executed directly — importing xmlToNodes must never trigger the CLI (the
// adjudicator imports this module and hit the usage/exit on import; a library with top-level
// side effects is not a library).
if (process.argv[1]?.endsWith('ccel-to-historian-jsonl.ts')) void main();
