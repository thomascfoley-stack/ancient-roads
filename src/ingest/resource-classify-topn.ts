// Patristic classify — TOP-N targeted, read-only. The reliable primitive: fetch
// each high-volume work's OWN New Advent index page, follow its content links,
// and shingle-match our snippets against that specific PD work (not a whole-corpus
// crawl). Works with no PD edition (modern-only translations) → drop; works whose
// PD source isn't wired yet → needs-review; everything below the top-N → quarantine
// by default (fail-closed). Reports the ENTRY-weighted distribution. Writes nothing.
//
//   NA_CACHE=<dir> npx tsx src/ingest/resource-classify-topn.ts

import pg from 'pg';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { shingleHashSet, addShingleHashes, tallyContainment } from './resource-textmatch.js';

const BASE = 'https://www.newadvent.org/fathers';
const CACHE = process.env.NA_CACHE ?? '.newadvent-cache';
const T = 0.5;          // per-snippet shingle-containment threshold
const REPAIR_HI = 0.60; // work repairable if >= this fraction of snippets repair
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Src =
  | { t: 'na'; idx: string }                    // New Advent work-index id (seed)
  | { t: 'modern'; note: string }               // no PD translation exists → drop
  | { t: 'review'; note: string };              // PD may exist; source not wired → needs-review

// Top ~20 works by entry count (cover ~31% — the corpus is a long tail; the rest
// is quarantine-by-default). Sources: ANF/NPNF fathers → New Advent index; known
// modern-only translations → drop; PD-but-unwired (Catena/Gregory/Cyril) → review.
const TOP: Array<{ author: string; book: number; src: Src }> = [
  { author: 'Augustine of Hippo', book: 19, src: { t: 'na', idx: '1801' } },   // Expositions on Psalms (NPNF1-08)
  { author: 'John Chrysostom', book: 44, src: { t: 'na', idx: '2101' } },      // Homilies on Acts (NPNF1-11)
  { author: 'Augustine of Hippo', book: 43, src: { t: 'na', idx: '1701' } },   // Tractates on John (NPNF1-07)
  { author: 'John Chrysostom', book: 43, src: { t: 'na', idx: '2401' } },      // Homilies on John (NPNF1-14)
  { author: 'John Chrysostom', book: 40, src: { t: 'na', idx: '2001' } },      // Homilies on Matthew (NPNF1-10)
  { author: 'Thomas Aquinas', book: 40, src: { t: 'review', note: 'Catena Aurea (Matthew) — Newman 1841 PD; Gutenberg/archive source not wired' } },
  { author: 'Thomas Aquinas', book: 43, src: { t: 'review', note: 'Catena Aurea (John) — Newman 1841 PD; not wired' } },
  { author: 'Thomas Aquinas', book: 23, src: { t: 'modern', note: 'Expositio super Isaiam — modern translation only' } },
  { author: 'Bonaventure', book: 42, src: { t: 'modern', note: 'modern translation only' } },
  { author: 'Bede', book: 42, src: { t: 'modern', note: 'Gospel homilies — modern (Cistercian) translation only' } },
  { author: 'Gregory the Dialogist', book: 18, src: { t: 'review', note: 'Morals on Job — Oxford 1844 PD; archive source not wired' } },
  { author: 'Thomas Aquinas', book: 18, src: { t: 'modern', note: 'modern translation only' } },
  { author: 'Bonaventure', book: 43, src: { t: 'modern', note: 'modern translation only' } },
  { author: 'Jerome', book: 23, src: { t: 'modern', note: 'Commentary on Isaiah — modern (Scheck) translation only' } },
  { author: 'Cyril of Alexandria', book: 43, src: { t: 'review', note: 'Commentary on John — Pusey 1874 PD; archive source not wired' } },
  { author: 'Theophylact of Ohrid', book: 43, src: { t: 'modern', note: 'modern (Chrysostom Press) translation only' } },
  { author: 'Thomas Aquinas', book: 19, src: { t: 'modern', note: 'modern translation only' } },
  { author: 'Jerome', book: 40, src: { t: 'modern', note: 'Commentary on Matthew — modern translation only' } },
  { author: 'Bede', book: 20, src: { t: 'modern', note: 'modern translation only' } },
  { author: 'Theophylact of Ohrid', book: 40, src: { t: 'modern', note: 'modern translation only' } },
];

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('web/.env.local')) return undefined;
  return readFileSync('web/.env.local', 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}
const strip = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
const contentIds = (html: string): string[] => [...new Set([...html.matchAll(/(?:\.\.\/)?fathers\/(\d{5,7})\.htm/gi)].map((m) => m[1]!))];

async function pageText(id: string): Promise<string> {
  const cf = join(CACHE, `${id}.txt`);
  if (existsSync(cf)) return readFileSync(cf, 'utf-8');
  await sleep(150);
  const res = await fetch(`${BASE}/${id}.htm`, { headers: { 'User-Agent': 'ancient-paths-provenance-verifier/1.0' } });
  if (!res.ok) return '';
  const txt = strip(await res.text());
  writeFileSync(cf, txt);
  return txt;
}

// Fetch a work's PD text: its index page + every content page it links to.
async function fetchWorkCorpus(idx: string): Promise<Set<number>> {
  const indexHtml = await (async () => {
    const cf = join(CACHE, `${idx}.html`);
    if (existsSync(cf)) return readFileSync(cf, 'utf-8');
    await sleep(150);
    const res = await fetch(`${BASE}/${idx}.htm`, { headers: { 'User-Agent': 'ancient-paths-provenance-verifier/1.0' } });
    const h = res.ok ? await res.text() : '';
    writeFileSync(cf, h);
    return h;
  })();
  const ids = contentIds(indexHtml);
  const corpus = new Set<number>();
  for (const id of ids) addShingleHashes(corpus, await pageText(id));
  return corpus;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const totalEntries = Number((await client.query(
    `SELECT count(*) n FROM commentary_entries WHERE source_url ~* 'historicalchristian' AND length(body) >= 100`)).rows[0].n);

  const dist = { repairable: 0, drop: 0, 'needs-review': 0 };
  const perWork: Array<{ w: string; entries: number; pct: number | null; bucket: string; note?: string }> = [];
  let topEntries = 0;

  console.log('='.repeat(80));
  console.log(`PATRISTIC TOP-N TARGETED CLASSIFY (read-only) — ${TOP.length} works; per-snippet≥${T}, work-repairable≥${REPAIR_HI * 100}%`);
  console.log('='.repeat(80));

  for (const t of TOP) {
    const { rows } = await client.query<{ txt: string; n: string }>(
      `SELECT string_agg(body, ' ' ORDER BY entry_index) AS txt, count(*)::text AS n
         FROM commentary_entries
        WHERE source_url ~* 'historicalchristian' AND author = $1 AND book = $2 AND length(body) >= 100
        GROUP BY chapter, verse_start`, [t.author, t.book]);
    const entries = rows.reduce((a, r) => a + Number(r.n), 0);
    topEntries += entries;
    const wlabel = `${t.author} (bk${t.book})`;

    if (t.src.t === 'modern') {
      dist.drop += entries;
      perWork.push({ w: wlabel, entries, pct: 0, bucket: 'drop', note: t.src.note });
      console.log(`  DROP        ${String(entries).padStart(5)}  ${wlabel}  — ${t.src.note}`);
    } else if (t.src.t === 'review') {
      dist['needs-review'] += entries;
      perWork.push({ w: wlabel, entries, pct: null, bucket: 'needs-review', note: t.src.note });
      console.log(`  NEEDS-REVIEW${String(entries).padStart(5)}  ${wlabel}  — ${t.src.note}`);
    } else {
      const corpus = await fetchWorkCorpus(t.src.idx);
      const snippets = rows.map((r) => shingleHashSet(r.txt));
      const stats = tallyContainment(snippets, corpus, T);
      const pct = stats.total ? Math.round(100 * stats.repair / stats.total) : 0;
      const bucket = pct >= REPAIR_HI * 100 ? 'repairable' : pct < 15 ? 'drop' : 'needs-review';
      dist[bucket as keyof typeof dist] += entries;
      perWork.push({ w: wlabel, entries, pct, bucket });
      console.log(`  ${bucket.toUpperCase().padEnd(11)} ${String(entries).padStart(5)}  ${pct}%  ${wlabel}  (corpus ${corpus.size.toLocaleString()} 4-grams)`);
    }
  }
  await client.end();

  const tail = totalEntries - topEntries;
  console.log('\n' + '='.repeat(80));
  console.log('ENTRY-WEIGHTED DISTRIBUTION (of all 62,444 patristic entries)');
  console.log('='.repeat(80));
  const pctOf = (n: number) => `${(100 * n / totalEntries).toFixed(1)}%`;
  console.log(`  repairable (verified PD text)        ${String(dist.repairable).padStart(6)}  ${pctOf(dist.repairable)}`);
  console.log(`  drop (modern-only / not the PD text) ${String(dist.drop).padStart(6)}  ${pctOf(dist.drop)}`);
  console.log(`  needs-review (PD source not wired)   ${String(dist['needs-review']).padStart(6)}  ${pctOf(dist['needs-review'])}`);
  console.log(`  quarantine-by-default (long tail)    ${String(tail).padStart(6)}  ${pctOf(tail)}`);
  console.log(`  ${'-'.repeat(50)}`);
  console.log(`  top-${TOP.length} covered                        ${String(topEntries).padStart(6)}  ${pctOf(topEntries)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
