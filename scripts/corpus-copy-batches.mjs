#!/usr/bin/env node
/**
 * EMIT THE COPY BATCHES — one slug file per register, derived from the manifest.
 *
 *   node scripts/corpus-copy-batches.mjs            # print the plan
 *   node scripts/corpus-copy-batches.mjs --write    # write docs/evidence/corpus-copy/<batch>.json
 *
 * WHY A GENERATOR AND NOT A HAND-WRITTEN FILE. `publish-flip.mjs:62-78` refuses a slug list that
 * is anything but a literal file, precisely so nobody flips "whatever happened to be staged". The
 * same argument applies one layer up: a slug list TYPED BY HAND is the repo's most-repeated defect
 * shape, and it would be typed against the same manifest this reads. So the file stays literal —
 * the copier still reads a fixed list off disk — but the list is DERIVED, and re-running this
 * regenerates it from the manifest rather than from someone's memory of it.
 *
 * The predicates are imported, never restated: a work is eligible if the manifest does not
 * withhold it (`serve:false`), its licence is permitted, and its provenance is not a forbidden
 * aggregator. Anything excluded is printed WITH ITS REASON, so a short batch is explained rather
 * than discovered later.
 */
import fs from 'node:fs';
import path from 'node:path';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';
import { isAllowedLicense } from '../src/ingest/allowed-licenses.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = path.join(REPO, 'docs/evidence/corpus-copy');
const WRITE = process.argv.includes('--write');

// Batch ORDER is the owner's: hymns first, then everything else. Hymns first because the
// song/verse register is the most walled-off content in the app — its own retrieval pool, its own
// partial index, and it can never satisfy the exegetical voice floor — so if the first real copy
// goes wrong, it goes wrong in a corner rather than in the /ask answers.
const BATCHES = [
  { name: 'hymns', types: ['hymn'], note: 'first — the most isolated register' },
  { name: 'poetry', types: ['poetry'], note: 'same lane as hymns, same partial index' },
  { name: 'sermons', types: ['sermon'], note: 'the sermon register lane' },
  { name: 'theology', types: ['theology', 'confession'], note: 'the systematic/confessional lane' },
  { name: 'fathers', types: ['father'], note: 'exegetical pool — shares the /ask voice floor' },
  { name: 'historians', types: ['historian'], note: 'shelf + Book Reader only; no retrieval lane exists' },
  { name: 'lexicons', types: ['lexicon'], note: 'held by owner ruling until the reference-pane UX ships' },
  { name: 'commentaries', types: ['commentary'], note: 'ALREADY on production — listed for completeness only' },
  // One file for everything left after hymns and poetry, EXCEPT sermons. Added 2026-08-02 when
  // the owner asked to finish the remaining registers in one pass: six gate answers for work
  // that is one decision is friction without safety, and the gate's value is the decision, not
  // the repetition. Sermons stay out on purpose — migration 037 must be applied first, or
  // spurgeon-talks-to-farmers lands with rows its partial HNSW index does not cover — and they
  // are 60% of the remaining volume, so keeping them separate means a failure there does not
  // roll back the other 25 works.
  //
  // DERIVED from the same manifest and the same eligibility predicates as every batch above, so
  // it cannot drift from them. It deliberately OVERLAPS the per-register files rather than
  // replacing them: those stay the way to copy one register at a time.
  {
    name: 'remaining-nonsermon',
    types: ['theology', 'confession', 'father', 'historian', 'lexicon'],
    note: 'theology + fathers + historians + lexicons in ONE gate answer; sermons excluded (037 first)',
  },
];

const entries = Object.values(JSON.parse(fs.readFileSync(path.join(REPO, 'ingest/sources.config.json'), 'utf8')))
  .filter((e) => typeof e?.slug === 'string');

// --verify-source: ask the SOURCE which of these works actually exists, instead of trusting that
// a manifest entry implies ingested rows. `vincent-word-studies` is in the manifest, is perfectly
// eligible by licence and provenance, and has ZERO sections on dev — so it rode into the
// remaining-nonsermon batch and STOPped a 15-work copy of 109,328 sections at the gate on
// 2026-08-02. The copier is right to refuse (a copy cannot invent rows) but the batch should
// never have offered it, and the NOTE at the foot of this file had already said so.
//
// Read-only, one query, no credential printed. Without the flag the generator stays a pure
// manifest tool that needs no database, which is why this is opt-in rather than always-on.
const VERIFY = process.argv.includes('--verify-source');
let onSource = null;
if (VERIFY) {
  const url = process.env.CORPUS_COPY_SOURCE_URL;
  if (!url) {
    console.error('--verify-source needs CORPUS_COPY_SOURCE_URL (the dev url)');
    process.exit(2);
  }
  const { default: pg } = await import('pg');
  const c = new pg.Client({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query('BEGIN');
  await c.query('SET TRANSACTION READ ONLY');
  const rows = (
    await c.query(`SELECT src.slug, count(s.id)::int AS n
                     FROM sources src LEFT JOIN sections s ON s.source_id = src.id
                    GROUP BY src.slug`)
  ).rows;
  await c.query('ROLLBACK');
  await c.end();
  onSource = new Map(rows.map((r) => [r.slug, r.n]));
  console.log(`verified against the source: ${onSource.size} work(s) present`);
}

/** Why this work cannot be copied, or null if it can. */
function ineligible(e) {
  if (e.serve === false) return 'withheld in the manifest (serve:false)';
  if (!isAllowedLicense(e.license)) return `licence "${e.license}" is not permitted`;
  const d = forbiddenProvenanceDomain(String(e.provenance?.url ?? ''));
  if (d) return `provenance is ${d} (ADR-008)`;
  if (onSource && (onSource.get(e.slug) ?? 0) === 0) return 'not ingested on the source (0 sections)';
  return null;
}

let total = 0;
const plan = [];
for (const b of BATCHES) {
  const inType = entries.filter((e) => b.types.includes(e.source_type));
  const ok = [];
  const skipped = [];
  for (const e of inType) {
    const why = ineligible(e);
    if (why) skipped.push(`${e.slug}: ${why}`);
    else ok.push(e.slug);
  }
  ok.sort();
  plan.push({ ...b, slugs: ok, skipped });
  total += ok.length;

  console.log(`\n${b.name.toUpperCase()}  (${ok.length} work(s))  — ${b.note}`);
  if (ok.length) console.log(`  ${ok.join(', ')}`);
  for (const s of skipped) console.log(`  skipped  ${s}`);

  if (WRITE && ok.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `${b.name}.json`);
    fs.writeFileSync(
      file,
      `${JSON.stringify(
        {
          _: 'Copy batch for scripts/corpus-copy.mjs. GENERATED by scripts/corpus-copy-batches.mjs from ingest/sources.config.json — re-run it rather than editing this by hand.',
          batch: b.name,
          note: b.note,
          excluded: b.skipped ?? skipped,
          slugs: ok,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`  wrote ${path.relative(REPO, file)}`);
  }
}

console.log(`\n${total} work(s) eligible across ${plan.filter((p) => p.slugs.length).length} batch(es).`);
if (!WRITE) console.log('Nothing written — pass --write to emit the slug files.');
console.log(
  '\nNOTE: eligibility here is a MANIFEST question. Whether a work actually exists on the\n' +
    'source database is a different question, and the copier answers it — a slug missing on\n' +
    'dev is a hard STOP, not a silent skip. Run --dry-run to find out before writing anything.',
);
