// Provenance-repair the helloao PD commentaries (Gill, JFB, Clarke, Matthew
// Henry) — the 62,708-entry no-provenance bucket (RESOURCING_PLAN §8). FULL
// per-work verification (all books, not a sample): fetch every helloao chapter,
// compare per verse to our stored text, and classify. Then write a clean config
// entry per work with helloao PD provenance + a forward-compatible rebuild recipe
// (so a future full-text rebuild is a clean re-fetch) + the truncation stats.
//
//   npx tsx src/ingest/resource-repair-helloao.ts
//
// $0: keeps the existing (some truncated) text + vectors; records provenance and
// verifies the text IS helloao's PD text. Does NOT re-embed or rebuild — that is
// a separate later phase gated on the eval. No publish (works stay for scale-up).

import pg from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import {
  HELLOAO_API, HELLOAO_BOOK_MAP, SLUG_TO_BOOK_NUM, chapterEndpoint, rebuildRecipe, HELLOAO_PD_WORKS,
  type HelloaoWork,
} from './helloao-source.js';

const THRESHOLD = 0.9;
const CONCURRENCY = 8;
const MANIFEST = 'ingest/sources.config.json';

interface HelloaoVerse { type?: string; number?: number; content?: Array<string | { text?: string }> }
interface HelloaoBook { id: string; numberOfChapters: number; firstChapterNumber: number }

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('web/.env.local')) return undefined;
  return readFileSync('web/.env.local', 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}
async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const t = await res.text();
    return t.startsWith('<') ? null : JSON.parse(t);
  } catch { return null; }
}
function tokens(s: string): Set<string> {
  const n = s.toLowerCase().replace(/&#x?[0-9a-f]+;/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  return new Set(n ? n.split(/\s+/) : []);
}
function classify(our: Set<string>, their: Set<string>): 'match' | 'truncated' | 'differ' {
  let inter = 0;
  for (const x of our) if (their.has(x)) inter++;
  const jac = inter / (our.size + their.size - inter || 1);
  if (jac >= THRESHOLD) return 'match';
  const contain = inter / Math.max(1, Math.min(our.size, their.size));
  return contain >= THRESHOLD ? 'truncated' : 'differ';
}
function versesOf(content: HelloaoVerse[]): Array<{ verse: number; text: string }> {
  const out: Array<{ verse: number; text: string }> = [];
  for (const item of content) {
    if (item.type === 'verse' && item.number && item.content) {
      const parts = item.content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join(' ').trim();
      if (parts.length > 10) out.push({ verse: item.number, text: parts });
    }
  }
  return out;
}
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { await fn(items[i++]!); } }));
}

interface Stats { compared: number; match: number; truncated: number; differ: number; helloaoOnly: number }

async function verifyWork(client: pg.Client, w: HelloaoWork): Promise<Stats> {
  const { rows } = await client.query<{ vid: number; txt: string }>(
    `SELECT book*1000000 + chapter*1000 + verse_start AS vid, string_agg(body, ' ' ORDER BY entry_index) AS txt
       FROM commentary_entries WHERE author = $1 AND length(body) >= 100 GROUP BY 1`,
    [w.dataAuthor],
  );
  const ours = new Map<number, Set<string>>(rows.map((r) => [r.vid, tokens(r.txt)]));

  const booksData = await fetchJson(`${HELLOAO_API}/c/${w.commentaryId}/books.json`) as { books: HelloaoBook[] } | null;
  const jobs: Array<{ url: string; bookNum: number; ch: number }> = [];
  for (const b of booksData?.books ?? []) {
    const slug = HELLOAO_BOOK_MAP[b.id];
    const bookNum = slug ? SLUG_TO_BOOK_NUM[slug] : undefined;
    if (!bookNum) continue;
    for (let ch = b.firstChapterNumber; ch <= b.numberOfChapters; ch++) jobs.push({ url: chapterEndpoint(w.commentaryId, b.id, ch), bookNum, ch });
  }

  const s: Stats = { compared: 0, match: 0, truncated: 0, differ: 0, helloaoOnly: 0 };
  await pool(jobs, CONCURRENCY, async (job) => {
    const data = await fetchJson(job.url) as { chapter?: { content?: HelloaoVerse[] } } | null;
    if (!data?.chapter?.content) return;
    for (const { verse, text } of versesOf(data.chapter.content)) {
      const our = ours.get(job.bookNum * 1_000_000 + job.ch * 1000 + verse);
      if (!our) { s.helloaoOnly++; continue; }
      s.compared++;
      s[classify(our, tokens(text))]++;
    }
  });
  return s;
}

async function main() {
  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf-8')) as Record<string, unknown>[] : [];
  const byId = new Map(manifest.map((e) => [e.id as string, e]));

  console.log('='.repeat(72));
  console.log('PROVENANCE-REPAIR — helloao PD commentaries (full per-work verification)');
  console.log('='.repeat(72));

  try {
    for (const w of HELLOAO_PD_WORKS) {
      process.stdout.write(`\n${w.author} (${w.commentaryId}) … `);
      const s = await verifyWork(client, w);
      const repair = s.match + s.truncated;
      const repairPct = s.compared ? (100 * repair / s.compared) : 0;
      console.log(`compared ${s.compared}: repair ${repair} (${repairPct.toFixed(1)}%) [match ${s.match} + trunc ${s.truncated}], genuine-differ ${s.differ}, helloao-only ${s.helloaoOnly}`);

      byId.set(w.slug, {
        id: w.slug, slug: w.slug, title: w.title, author: w.author,
        year_written: w.year, source_type: 'commentary', tradition: w.tradition, era: w.era,
        license: w.license,
        provenance: {
          url: `${HELLOAO_API}/c/${w.commentaryId}`,
          edition: `${w.title} (helloao ${w.commentaryId}, CC Public Domain Mark 1.0)`,
          year: w.year,
          license_ref: 'CC Public Domain Mark 1.0',
          rebuild: rebuildRecipe(w.commentaryId),
          text_match: {
            verses_compared: s.compared, repair, repair_pct: Number(repairPct.toFixed(2)),
            match: s.match, truncated: s.truncated, genuine_differ: s.differ,
            note: 'truncated = same PD text, our stored copy cut short (vector kept as-is; full text via rebuild recipe)',
          },
        },
        backfill: { match_author: w.dataAuthor },
      });
    }
  } finally {
    await client.end();
  }

  const out = [...byId.values()];
  writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + '\n');
  console.log(`\n✓ wrote ${MANIFEST} (${out.length} sources).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
