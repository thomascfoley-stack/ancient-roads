// Provenance re-source — TEXT-MATCH PROBE (RESOURCING_PLAN §3/§8).
//
//   npx tsx src/ingest/resource-match-probe.ts [--commentary=adam-clarke] [--author='Adam Clarke']
//
// For a permitted structured PD source (bible.helloao.org), fetch a sample of a
// commentary and compare, per verse, to OUR stored text (embeddings.content).
// A normalized token-overlap >= THRESHOLD means the vector's text is the same PD
// work obtained legitimately → provenance-repair ($0, keep the vector). Below it
// → the edition differs → re-embed. This probe measures that split on real data
// (a sample) so the re-source cost is sized before building the full pipeline.

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { BOOKS } from '../bible/books.js';

const API = 'https://bible.helloao.org/api';
const THRESHOLD = 0.9; // token-set Jaccard at/above this = same text (repair)

// (slug, chapter) sample — a spread across OT/NT, poetry/prose/epistle.
const SAMPLE: Array<[string, number]> = [
  ['gen', 1], ['gen', 3], ['psa', 23], ['psa', 119], ['isa', 53],
  ['jhn', 1], ['jhn', 3], ['rom', 1], ['rom', 3], ['rom', 8],
];

const SLUG_TO_BOOK_NUM: Record<string, number> = {};
for (const [i, b] of BOOKS.entries()) SLUG_TO_BOOK_NUM[b.slug] = i + 1;

// helloao book id -> our slug (superset of both id casings helloao uses).
const HELLOAO_BOOK_MAP: Record<string, string> = {
  GEN: 'gen', PSA: 'psa', ISA: 'isa', JHN: 'jhn', ROM: 'rom',
  Gen: 'gen', Ps: 'psa', Isa: 'isa', John: 'jhn', Rom: 'rom',
};

interface HelloaoBook { id: string; numberOfChapters: number; firstChapterNumber: number }
interface HelloaoVerse { type?: string; number?: number; content?: Array<string | { text?: string }> }

function argValue(flag: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
}
function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  return text.startsWith('<') ? null : JSON.parse(text);
}

function tokens(s: string): Set<string> {
  const norm = s.toLowerCase()
    .replace(/&#x?[0-9a-f]+;/gi, ' ')  // strip numeric HTML entities
    .replace(/<[^>]+>/g, ' ')          // strip tags
    .replace(/[^a-z0-9]+/g, ' ')       // fold punctuation
    .trim();
  return new Set(norm ? norm.split(/\s+/) : []);
}
function overlap(a: Set<string>, b: Set<string>): { jac: number; contain: number } {
  if (a.size === 0 && b.size === 0) return { jac: 1, contain: 1 };
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const jac = inter / (a.size + b.size - inter);
  // containment = fraction of the SHORTER text found in the longer. High jac-low,
  // high-contain ⇒ same text, one side truncated (still a $0 repair).
  const contain = inter / Math.max(1, Math.min(a.size, b.size));
  return { jac, contain };
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

async function main() {
  const commentaryId = argValue('--commentary') ?? 'adam-clarke';
  const author = argValue('--author') ?? 'Adam Clarke';
  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('DATABASE_URL required');

  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Our stored text per verseId (chunks concatenated in order).
  const { rows } = await client.query<{ vid: number; txt: string }>(
    `SELECT (metadata->>'verseId')::int AS vid, string_agg(content, ' ' ORDER BY chunk_index) AS txt
       FROM embeddings
      WHERE user_id IS NULL AND source_type='commentary' AND metadata->>'author' = $1
      GROUP BY 1`,
    [author],
  );
  await client.end();
  const ours = new Map<number, Set<string>>(rows.map((r) => [r.vid, tokens(r.txt)]));

  const books = (await fetchJson(`${API}/c/${commentaryId}/books.json`) as { books: HelloaoBook[] } | null)?.books ?? [];
  const idForSlug = new Map<string, string>();
  for (const b of books) { const slug = HELLOAO_BOOK_MAP[b.id]; if (slug) idForSlug.set(slug, b.id); }

  let match = 0, differ = 0, truncated = 0, helloaoOnly = 0, compared = 0;
  console.log('='.repeat(70));
  console.log(`TEXT-MATCH PROBE — ${author} vs helloao/${commentaryId} (Jaccard ≥ ${THRESHOLD})`);
  console.log('='.repeat(70));

  for (const [slug, ch] of SAMPLE) {
    const bookId = idForSlug.get(slug);
    const bookNum = SLUG_TO_BOOK_NUM[slug];
    if (!bookId || !bookNum) { console.log(`  ${slug} ${ch}: (not in helloao ${commentaryId})`); continue; }
    const data = await fetchJson(`${API}/c/${commentaryId}/${bookId}/${ch}.json`) as { chapter?: { content?: HelloaoVerse[] } } | null;
    const hv = data?.chapter?.content ? versesOf(data.chapter.content) : [];
    let m = 0, d = 0;
    for (const { verse, text } of hv) {
      const vid = bookNum * 1_000_000 + ch * 1000 + verse;
      const our = ours.get(vid);
      if (!our) { helloaoOnly++; continue; }
      compared++;
      const { jac, contain } = overlap(our, tokens(text));
      if (jac >= THRESHOLD) { match++; m++; }
      else if (contain >= THRESHOLD) { truncated++; }  // same text, one side truncated → still $0 repair
      else { differ++; d++; }
    }
    console.log(`  ${slug} ${ch}: ${hv.length} helloao verses — match ${m}, differ ${d}`);
  }

  console.log('\n' + '-'.repeat(70));
  const repair = match + truncated;
  console.log(`Compared (verse present in both): ${compared}`);
  console.log(`  MATCH     (Jaccard ≥${THRESHOLD}):              ${match}`);
  console.log(`  TRUNCATED (Jaccard <${THRESHOLD}, contain ≥${THRESHOLD}): ${truncated}  (same text, one side cut)`);
  console.log(`  → $0 PROVENANCE-REPAIR (match+truncated):    ${repair}  (${compared ? (100 * repair / compared).toFixed(1) : '0'}%)`);
  console.log(`  DIFFER (genuine, → re-embed):                ${differ}  (${compared ? (100 * differ / compared).toFixed(1) : '0'}%)`);
  console.log(`  (helloao verses with no stored match: ${helloaoOnly})`);
  console.log('\nInterpretation: match+truncated ⇒ $0 provenance-repair (keep vectors); DIFFER sizes the');
  console.log('re-embed. Truncation is repairable (same PD text). Sampled — full per-work runs come next.');
}

main().catch((e) => { console.error(e); process.exit(1); });
