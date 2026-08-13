// whitefield-works dry-run harness + dev-only staged ingest (corpus-backlog
// Phase 4). Default mode touches NO database: it prints the segmentation
// report — detected sermon titles + sizes per volume, the CONTENTS-page
// cross-check, the negative control (letters / tracts / journal-pieces
// detected as NON-sermons), and boundary samples.
//
//   npx tsx src/ingest/ingest-whitefield-works.ts                 # dry-run report
//   npx tsx src/ingest/ingest-whitefield-works.ts --census        # dev DB census only
//   npx tsx src/ingest/ingest-whitefield-works.ts --write         # segment + stage to DEV
//
// --write goes through register-writer.writeRegisterWork, the standard
// re-ingest idiom: BEGIN → assertReingestable (refuses a published work or
// user annotations) → delete prior rows → write → stamp 'staged'
// (manifest serve:false ⇒ publish=false). register-writer refuses any
// DATABASE_URL that is not the dev endpoint. Never prints a secret.

import { readFileSync } from 'node:fs';
import pg from 'pg';
import { segmentWhitefieldWorks, VOLUMES, EXPECTED_SERMONS, type SegmentationResult } from './profile-whitefield-works.js';
import { writeRegisterWork, type RegisterWork } from './register-writer.js';

const arg = (f: string) => process.argv.includes(f);

function report(r: SegmentationResult): void {
  console.log('=== whitefield-works segmentation dry-run ===');
  console.log(`volumes scanned: ${VOLUMES.map((v) => `#${v.ebookId} (vol ${v.vol})`).join(', ')}`);
  console.log('');
  for (const v of r.perVolume) {
    console.log(`── vol ${v.vol} (PG #${v.ebookId}): ${v.sermons} sermons | EXCLUDED non-sermons: ${v.letters} letters${v.tracts.length ? `, ${v.tracts.length} tracts (index entries)` : ''}`);
    for (const t of v.tracts.slice(0, 8)) console.log(`     tract excluded: ${t.slice(0, 96)}`);
  }
  console.log('');
  // POSITIVE CONTROL: the expected list is each sermon volume's own CONTENTS
  // page. Strict check is the numeral sequence (done in segmentWhitefieldWorks,
  // which throws otherwise); here we name them.
  const toc = r.perVolume.flatMap((v) => v.toc);
  console.log(`CONTENTS-page expected list: ${toc.length} entries (vol 5: I–XXXI, vol 6: XXXII–LIX)`);
  for (const t of toc) console.log(`  expected: SERMON ${t.numeral}. ${t.title}`);
  console.log('');
  console.log(`detected sermons: ${r.sermons.length} (expected ${EXPECTED_SERMONS})`);
  for (const s of r.sermons) {
    console.log(`  [vol ${s.vol}] SERMON ${s.numeral}. ${s.title} — ${s.statedRef} (raw: "${s.statedRefRaw}")${s.openRange ? ' [open range: anchored first verse]' : ''} body=${s.body.length} chars anchor=${s.anchors.length ? `${s.anchors[0]!.verseIdStart}-${s.anchors[0]!.verseIdEnd}` : 'NONE'}`);
  }
  console.log('');
  // BOUNDARY QUALITY: first/last lines of 5 sampled sermons across the range.
  const picks = [0, 21, 25, 30, 58]; // I, XXII, XXVI (dedication case), XXXI, LIX
  for (const p of picks) {
    const s = r.sermons[p];
    if (!s) continue;
    const bl = s.body.split('\n').map((l) => l.trim()).filter(Boolean);
    console.log(`boundary sample SERMON ${s.numeral}. "${s.title}" (${s.body.length} chars):`);
    console.log(`  first: ${bl[0]}`);
    console.log(`  2nd:   ${bl[1] ?? ''}`);
    console.log(`  last-1:${bl[bl.length - 2] ?? ''}`);
    console.log(`  last:  ${bl[bl.length - 1]}`);
  }
  const bleed = r.sermons.filter((s) => /\bSERMON\s+[IVXLCDM]+\.\s*$/m.test(s.body) || s.body.includes('*** END OF') || /END of the (FIFTH|SIXTH) VOLUME|FINIS\./.test(s.body));
  console.log(`bleed check: ${bleed.length} sermon bodies contain a neighbour heading or volume-end marker ${bleed.length ? `— ${bleed.map((s) => s.numeral).join(',')}` : '(clean)'}`);
}

async function census(): Promise<void> {
  const dbUrl = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
  if (!dbUrl) throw new Error('DATABASE_URL required in env (dev only)');
  if (!/ep-tiny-hat|localhost|127\.0\.0\.1/.test(dbUrl)) throw new Error('STOP: census refuses a non-dev endpoint');
  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const src = await db.query<{ id: string; status: string }>(`SELECT id, status FROM sources WHERE slug='whitefield-works'`);
    if (!src.rows[0]) { console.log('census: no sources row for whitefield-works'); return; }
    const id = src.rows[0].id;
    const sec = await db.query<{ n: string }>(`SELECT count(*)::text n FROM sections WHERE source_id=$1`, [id]);
    const anc = await db.query<{ n: string }>(`SELECT count(*)::text n FROM section_anchors a JOIN sections s ON s.id=a.section_id WHERE s.source_id=$1`, [id]);
    const emb = await db.query<{ n: string }>(`SELECT count(*)::text n FROM embeddings WHERE user_id IS NULL AND metadata->>'work'='whitefield-works'`);
    console.log(`census whitefield-works: status=${src.rows[0].status} sections=${sec.rows[0]!.n} section_anchors=${anc.rows[0]!.n} flat_embeddings=${emb.rows[0]!.n}`);
  } finally {
    await db.end();
  }
}

async function main(): Promise<void> {
  if (arg('--census')) return census();
  const result = await segmentWhitefieldWorks();
  report(result);
  if (!arg('--write')) {
    console.log('\ndry-run only — no database write (pass --write to stage on DEV)');
    return;
  }
  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((e) => e.slug === 'whitefield-works');
  if (!entry) throw new Error('no manifest entry whitefield-works');
  const prov = entry.provenance as Record<string, unknown>;
  const work: RegisterWork = {
    slug: 'whitefield-works',
    title: entry.title as string,
    author: entry.author as string,
    authorDied: entry.author_died as number | undefined,
    year: entry.year_written as number,
    sourceType: entry.source_type as string, // 'sermon'
    register: 'prose',
    tradition: entry.tradition as string,
    era: entry.era as string,
    license: entry.license as string,
    url: prov.url as string,
    edition: `${prov.edition as string} — sermons segmented from vols 5–6 (PG #77034/#77041); vols 1–4 letters/tracts excluded`,
    // manifest serve:false ⇒ staged, never published by this path
    publish: false,
    sections: result.sections,
  };
  const res = await writeRegisterWork(work);
  console.log(`writeRegisterWork: embedded=${res.embedded} staticEntries=${res.staticEntries}`);
  await census();
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
