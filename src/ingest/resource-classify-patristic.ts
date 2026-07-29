// Patristic classify — READ-ONLY measurement. Builds the PD ANF/NPNF corpus from
// the cached New Advent pages (newadvent-crawl.ts), then, per patristic work
// (author × book), measures what fraction of its verse-snippets appear verbatim
// (shingle-containment) in the PD corpus. Buckets each work:
//   repairable   — most snippets ARE the PD text     (>= REPAIR_HI)
//   quarantine   — text is NOT the PD edition (drop)  (<  DROP_LO)
//   needs-review — partial / uncertain                (in between)
// Reports the distribution + corpus-shape tally (works + ENTRY counts). Writes
// NOTHING (no quarantine/repair/publish) — just the numbers.
//
//   NA_CACHE=<dir> npx tsx src/ingest/resource-classify-patristic.ts

import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { shingleHashSet, addShingleHashes, containment } from './resource-textmatch.js';

const CACHE = process.env.NA_CACHE ?? '.newadvent-cache';
const T = 0.5;          // per-snippet shingle-containment threshold
const REPAIR_HI = 0.60; // work-level: >= this fraction of snippets repair → repairable
const DROP_LO = 0.15;   // work-level: < this → quarantine (not the PD text)

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('web/.env.local')) return undefined;
  return readFileSync('web/.env.local', 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

interface Work { author: string; book: number; entries: number; snippets: Array<Set<number>> }

async function main() {
  if (!existsSync(CACHE)) throw new Error(`corpus cache ${CACHE} not found — run newadvent-crawl.ts first`);
  const files = readdirSync(CACHE).filter((f) => f.endsWith('.txt'));
  const corpus = new Set<number>();
  for (const f of files) addShingleHashes(corpus, readFileSync(join(CACHE, f), 'utf-8'));
  console.log(`corpus: ${files.length} pages, ${corpus.size.toLocaleString()} unique 4-gram hashes\n`);

  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows } = await client.query<{ author: string; book: number; txt: string; n: string }>(
    `SELECT author, book, string_agg(body, ' ' ORDER BY entry_index) AS txt, count(*)::text AS n
       FROM commentary_entries
      WHERE source_url ~* 'historicalchristian' AND length(body) >= 100
      GROUP BY author, book, chapter, verse_start`,
  );
  await client.end();

  const works = new Map<string, Work>();
  for (const r of rows) {
    const key = `${r.author}|||${r.book}`;
    let w = works.get(key);
    if (!w) { w = { author: r.author, book: r.book, entries: 0, snippets: [] }; works.set(key, w); }
    w.entries += Number(r.n);
    w.snippets.push(shingleHashSet(r.txt));
  }

  const buckets = { repairable: { works: 0, entries: 0 }, 'needs-review': { works: 0, entries: 0 }, quarantine: { works: 0, entries: 0 } };
  const rowsOut: Array<{ author: string; book: number; entries: number; pct: number; bucket: string }> = [];
  for (const w of works.values()) {
    let repair = 0, total = 0;
    for (const snip of w.snippets) { if (snip.size < 8) continue; total++; if (containment(snip, corpus) >= T) repair++; }
    const pct = total ? repair / total : 0;
    const bucket = pct >= REPAIR_HI ? 'repairable' : pct < DROP_LO ? 'quarantine' : 'needs-review';
    buckets[bucket].works++; buckets[bucket].entries += w.entries;
    rowsOut.push({ author: w.author, book: w.book, entries: w.entries, pct: Math.round(pct * 100), bucket });
  }

  const totWorks = works.size;
  const totEntries = rowsOut.reduce((a, r) => a + r.entries, 0);
  console.log('='.repeat(78));
  console.log(`PATRISTIC CLASSIFY — ${totWorks} works (author×book), ${totEntries.toLocaleString()} entries`);
  console.log(`thresholds: snippet≥${T} shingle-containment; work repairable≥${REPAIR_HI * 100}%, quarantine<${DROP_LO * 100}%`);
  console.log('='.repeat(78));
  for (const [b, v] of Object.entries(buckets)) {
    console.log(`  ${b.padEnd(13)} ${String(v.works).padStart(4)} works   ${v.entries.toLocaleString().padStart(8)} entries   (${(100 * v.entries / totEntries).toFixed(1)}%)`);
  }

  console.log('\nTop works by entries in each bucket:');
  for (const b of ['repairable', 'needs-review', 'quarantine'] as const) {
    console.log(`\n  [${b}]`);
    rowsOut.filter((r) => r.bucket === b).sort((a, z) => z.entries - a.entries).slice(0, 10)
      .forEach((r) => console.log(`    ${String(r.entries).padStart(5)}  ${r.pct}%  ${r.author} (bk${r.book})`));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
