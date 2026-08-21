#!/usr/bin/env node
// Export Bagster's Daily Light (already ingested: sources.slug = 'daily-light')
// to web/public/devotional/daily-light.json — the same off-request-path pattern
// as morning-evening.json: a static, CDN-cacheable, date-keyed file, so the home
// screen never puts a DB read on the request path for platform content.
//
// Output shape: { "MM-DD": { am?: {title, body, attribution}, pm?: {...} } }.
// Body is the author's own verse chain, VERBATIM text with presentation-only
// normalization: whitespace runs collapse to single spaces (the ingest carried
// the source's arbitrary line breaks mid-sentence), and the printed "--" verse
// separator renders as an em dash. No words are added, removed, or reordered.
//
// Read-only; refuses to run without DATABASE_URL; refuses an unpublished source.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function envUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const line = readFileSync(join(root, '.env.local'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
  } catch {
    /* fall through */
  }
  return null;
}

const MONTHS = new Map([
  ['January', '01'], ['February', '02'], ['March', '03'], ['April', '04'],
  ['May', '05'], ['June', '06'], ['July', '07'], ['August', '08'],
  ['September', '09'], ['October', '10'], ['November', '11'], ['December', '12'],
]);

// "August 21 — Morning" (em dash) — tolerate a hyphen or double hyphen from ingest.
const HEADING_RE = /^([A-Z][a-z]+) (\d{1,2}) *(?:—|-|--) *(Morning|Evening)$/;

function normalizeBody(raw) {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/ *-- */g, ' — ')
    .trim();
}

const url = envUrl();
if (!url) {
  console.error('STOP: no DATABASE_URL (env or .env.local).');
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const src = (await client.query(
    `SELECT id, title, author, status FROM sources WHERE slug = 'daily-light'`,
  )).rows;
  if (src.length !== 1) {
    console.error('STOP: sources.slug = daily-light not found.');
    process.exit(1);
  }
  if (src[0].status !== 'published') {
    console.error(`STOP: daily-light status is '${src[0].status}', not published — not exporting.`);
    process.exit(1);
  }
  const attribution = `${src[0].title}${src[0].author ? ` · ${src[0].author}` : ''}`;

  const rows = (await client.query(
    `SELECT heading, body FROM sections
     WHERE source_id = $1 AND heading IS NOT NULL
     ORDER BY heading
     LIMIT 1000`,
    [src[0].id],
  )).rows;

  const out = {};
  let skipped = 0;
  for (const r of rows) {
    const m = HEADING_RE.exec(r.heading.trim());
    if (!m) { skipped++; continue; }
    const mm = MONTHS.get(m[1]);
    if (!mm) { skipped++; continue; }
    const key = `${mm}-${String(Number(m[2])).padStart(2, '0')}`;
    const half = m[3] === 'Morning' ? 'am' : 'pm';
    out[key] ??= {};
    if (out[key][half]) { skipped++; continue; } // first wins; a duplicate is a data smell, counted
    out[key][half] = { title: r.heading.trim(), body: normalizeBody(r.body), attribution };
  }

  const days = Object.keys(out).length;
  const entries = Object.values(out).reduce((n, d) => n + (d.am ? 1 : 0) + (d.pm ? 1 : 0), 0);
  if (days < 360 || entries < 700) {
    console.error(`STOP: export looks incomplete — ${days} days / ${entries} entries (want ~366/~732). Skipped ${skipped}.`);
    process.exit(1);
  }

  const dest = join(root, 'web', 'public', 'devotional', 'daily-light.json');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(out));
  console.log(`wrote ${dest}: ${days} days, ${entries} entries, ${skipped} rows skipped (non-calendar headings).`);
} finally {
  await client.end();
}
