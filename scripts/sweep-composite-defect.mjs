// READ-ONLY composite-defect sweep (hazard §3.3): the scrape-shaped defect is
// foreign matter swept under one author — another author's text, an editor's
// prologue, a publisher's price list, a page index. It attaches at HEADS and TAILS.
// This dumps the head + tail sections of a work AND flags non-authorial matter across
// ALL sections by marker regex, so a human reads the raw input before any publish.
// It NEVER writes. Positive control: prints total section count (0 => wrong slug).
//
//   node scripts/sweep-composite-defect.mjs <slug> [<slug> ...]
import pg from 'pg';
import fs from 'node:fs';

const envText = fs.readFileSync(process.env.HOME + '/theology-study-app/.env.local', 'utf8');
const val = (k) => envText.match(new RegExp('^' + k + '="?([^"\\n]*)"?$', 'm'))?.[1];
const url = val('DATABASE_URL_UNPOOLED') ?? val('DATABASE_URL');
if (!new URL(url).host.includes('ep-tiny-hat')) { console.error('NOT DEV — refusing'); process.exit(1); }

// Non-authorial matter markers. A HIT is a candidate for suppression, NOT proof —
// a real commentary can say "index" in prose. The human reads the flagged rows.
const MARKER = /\b(prolegomena|editor'?s? (preface|note|introduction|remarks)|transcriber'?s? note|project gutenberg|end of (the|this) project|list of (illustrations|works|books)|table of contents|advertisement|catalogue|price list|cloth,? (extra|gilt)|cheap editions?|shilling|bibliograph|colophon|title[- ]?page|frontispiece)\b/i;

const slugs = process.argv.slice(2);
if (slugs.length === 0) { console.error('usage: sweep-composite-defect.mjs <slug> ...'); process.exit(1); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query('BEGIN');
await c.query('SET TRANSACTION READ ONLY');

for (const slug of slugs) {
  const meta = (await c.query(`SELECT id, source_type, status, author, title FROM sources WHERE slug=$1`, [slug])).rows[0];
  console.log('\n' + '='.repeat(78) + `\n${slug}  [${meta?.source_type}/${meta?.status}]  author=${meta?.author}\n  title=${meta?.title}`);
  if (!meta) { console.log('  !! no such source'); continue; }
  const secs = (await c.query(
    `SELECT unit_ordinal, ordinal, heading, left(body, 160) AS head FROM sections WHERE source_id=$1 ORDER BY unit_ordinal, ordinal`, [meta.id])).rows;
  console.log(`  POSITIVE CONTROL: total sections = ${secs.length}${secs.length === 0 ? '  !! EMPTY — wrong slug or unsliced' : ''}`);
  if (secs.length === 0) continue;

  const show = (label, arr) => {
    console.log(`  --- ${label} ---`);
    for (const s of arr) console.log(`   u${String(s.unit_ordinal).padStart(4)}.${s.ordinal}  [${(s.heading || '').slice(0, 40)}]  ${s.head.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
  };
  show('HEAD (first 10)', secs.slice(0, 10));
  show('TAIL (last 10)', secs.slice(-10));

  const flagged = secs.filter((s) => MARKER.test(s.heading || '') || MARKER.test(s.head || ''));
  console.log(`  --- NON-AUTHORIAL MARKER HITS: ${flagged.length} ---`);
  for (const s of flagged.slice(0, 40)) console.log(`   u${String(s.unit_ordinal).padStart(4)}.${s.ordinal}  [${(s.heading || '').slice(0, 40)}]  ${s.head.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
  if (flagged.length > 40) console.log(`   ... +${flagged.length - 40} more`);
}

await c.query('ROLLBACK');
await c.end();
