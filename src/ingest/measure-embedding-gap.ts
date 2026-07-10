// Read-only diagnostic: measure the embedding-coverage gap against the real
// schema (commentary_entries → synthesized source_id → embeddings), and bucket
// the missing set by body length as a first-pass proxy for token size.
//
//   npx tsx src/ingest/measure-embedding-gap.ts
//
// Ground truth = Neon, queried directly. No writes.

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';

const BOOK_SLUGS: Record<number, string> = {
  1:'gen',2:'exo',3:'lev',4:'num',5:'deu',6:'jos',7:'jdg',8:'rut',9:'1sa',10:'2sa',
  11:'1ki',12:'2ki',13:'1ch',14:'2ch',15:'ezr',16:'neh',17:'est',18:'job',19:'psa',
  20:'pro',21:'ecc',22:'sng',23:'isa',24:'jer',25:'lam',26:'ezk',27:'dan',28:'hos',
  29:'jol',30:'amo',31:'oba',32:'jon',33:'mic',34:'nam',35:'hab',36:'zep',37:'hag',
  38:'zec',39:'mal',40:'mat',41:'mrk',42:'luk',43:'jhn',44:'act',45:'rom',46:'1co',
  47:'2co',48:'gal',49:'eph',50:'php',51:'col',52:'1th',53:'2th',54:'1ti',55:'2ti',
  56:'tit',57:'phm',58:'heb',59:'jas',60:'1pe',61:'2pe',62:'1jn',63:'2jn',64:'3jn',
  65:'jud',66:'rev',
};

const MIN_BODY_LENGTH = 100;

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function main() {
  const dbUrl = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
  if (!dbUrl) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  // 1. Embedded source_ids (the covered set).
  const { rows: emb } = await client.query(
    `SELECT source_id FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary'`,
  );
  const embedded = new Set(emb.map((r: { source_id: string }) => r.source_id));

  // 2. All eligible entries; compute the source_id the job would synthesize.
  const { rows: entries } = await client.query(
    `SELECT book, chapter, verse_start, verse_end, author, length(body) AS len
     FROM commentary_entries WHERE length(body) >= $1`,
    [MIN_BODY_LENGTH],
  );

  // 3. Collapse to unique target source_ids; a source_id is covered if ANY of
  //    its (entry_index-collapsed) rows is embedded.
  const targetLen = new Map<string, number>(); // source_id -> max body len among its rows
  let noSlug = 0;
  for (const r of entries) {
    const slug = BOOK_SLUGS[r.book];
    if (!slug) { noSlug++; continue; }
    const sid = `commentary:${slug}:${r.chapter}:${r.verse_start}-${r.verse_end}:${r.author}`;
    targetLen.set(sid, Math.max(targetLen.get(sid) ?? 0, Number(r.len)));
  }

  const missing: { sid: string; len: number }[] = [];
  for (const [sid, len] of targetLen) {
    if (!embedded.has(sid)) missing.push({ sid, len });
  }

  // 4. Bucket missing by body length (proxy for token size; the singleton
  //    probe in the fix will give the authoritative >512-token split).
  const buckets = [
    { label: '<=1000 chars (truncated to full budget — should NOT fail on tokens)', lo: 0, hi: 1000 },
    { label: '1001-2000', lo: 1001, hi: 2000 },
    { label: '2001-4000', lo: 2001, hi: 4000 },
    { label: '4001-8000', lo: 4001, hi: 8000 },
    { label: '>8000', lo: 8001, hi: Infinity },
  ];
  const counts = buckets.map((b) => missing.filter((m) => m.len >= b.lo && m.len <= b.hi).length);

  console.log('='.repeat(70));
  console.log('EMBEDDING COVERAGE GAP (source of truth: Neon)');
  console.log('='.repeat(70));
  console.log(`Eligible entries (body >= ${MIN_BODY_LENGTH}):   ${entries.length}`);
  console.log(`  (rows with no book-slug mapping, skipped: ${noSlug})`);
  console.log(`Unique target source_ids (entry_index collapse): ${targetLen.size}`);
  console.log(`Embedded source_ids (in DB):                     ${embedded.size}`);
  console.log(`MISSING source_ids:                              ${missing.length}`);
  console.log('');
  console.log('Missing, bucketed by max body length (token-size proxy):');
  buckets.forEach((b, i) => console.log(`  ${String(counts[i]).padStart(7)}  ${b.label}`));
  console.log('');
  console.log('Interpretation: missing entries whose max body <= ~1000 chars are');
  console.log('almost certainly COLLATERAL (killed by a poisoned batch, not oversized).');
  console.log('Longer ones are candidate CULPRITS — the singleton probe confirms.');

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
