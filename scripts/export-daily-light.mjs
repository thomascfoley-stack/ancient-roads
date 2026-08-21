#!/usr/bin/env node
// Export Bagster's Daily Light (sources.slug = 'daily-light') to
// web/public/devotional/daily-light.json — the same off-request-path pattern
// as morning-evening.json: static, CDN-cacheable, date-keyed.
//
// WHAT THE SOURCE ACTUALLY HOLDS (verified against raw rows, 2026-08-21):
//  - Bodies are HARD-WRAPPED at ~60 chars with double newlines, mid-sentence
//    ("...all that we ask or\n\nthink.") — the line breaks are typesetting,
//    not structure. Unwrapping them to spaces is presentation-only.
//  - SOME entries separate scripture portions with "--"; these are preserved,
//    rendered as em dashes. The REMAINING portion boundaries were flattened
//    by the ingest (the raw body carries nothing that distinguishes them from
//    line wraps). This export cannot recover them and does not pretend to —
//    a structural re-ingest of the SWORD `Daily` module is the real fix and
//    is filed in WORKLOG 2026-08-21.
//  - Every entry ENDS with one or more citation lines ("Ps 119:57 1Co 3:21,23
//    …") — the compiler's own reference list for the portions. Those lines are
//    SPLIT into a separate `refs` field so the page can present citations AS
//    citations instead of fusing them into the scripture paragraph. No words
//    are added, removed, or reordered; the split is refused (STOP) unless it
//    parses cleanly for every entry.
//
// Output: { "MM-DD": { am?: {title, body, refs, attribution}, pm?: {...} } }.
// Read-only. Refuses: no DATABASE_URL; source missing/unpublished; license
// not recorded as public domain; an incomplete calendar; any entry whose
// citation tail cannot be split. Fail closed, loudly.
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

// Citation-line grammar, derived from the module's own tail lines: every
// whitespace token is a book abbreviation ("Ps", "1Co", "Jude", "De") or a
// chapter:verse group ("119:105", "13:1-4", "9:28,29", bare "28:26"), and at
// least one token carries a colon. A prose line always fails (lowercase words).
const BOOK_TOKEN = /^[0-9]?[A-Z][A-Za-z]{0,4}\.?$/; // interior capital: the module prints "EPh 2:1,3" (Feb 18 Evening)
// [:.]: the module prints "Ps 142.3" once (a period where its own convention is
// a colon — August 24 Morning; the same source-misprint class Torrey's ingest
// records as knownBad). The token is preserved verbatim in `refs`; the grammar
// just has to recognize the module's own typography, both variants.
const NUM_TOKEN = /^\d{1,3}(?:[:.]\d{1,3})?(?:[,\-]\d{1,3})*(?::\d{1,3}(?:[,\-]\d{1,3})*)?$/;
function isCitationLine(line) {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length === 0) return false;
  let sawSeparator = false;
  for (const t of tokens) {
    if (NUM_TOKEN.test(t)) { if (/\d[:.]\d/.test(t)) sawSeparator = true; continue; }
    if (BOOK_TOKEN.test(t)) continue;
    return false;
  }
  return sawSeparator;
}

/** Split the raw body into { text, refs }; null when no citation tail parses. */
function splitBody(raw) {
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let i = lines.length;
  while (i > 0 && isCitationLine(lines[i - 1])) i--;
  if (i === lines.length) return null; // no citation tail found
  const text = lines.slice(0, i).join(' ').replace(/\s+/g, ' ').replace(/ *-- */g, ' — ').trim();
  const refs = lines.slice(i).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return { text, refs };
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
    `SELECT id, title, author, status, license FROM sources WHERE slug = 'daily-light'`,
  )).rows;
  if (src.length !== 1) {
    console.error('STOP: sources.slug = daily-light not found.');
    process.exit(1);
  }
  if (src[0].status !== 'published') {
    console.error(`STOP: daily-light status is '${src[0].status}', not published — not exporting.`);
    process.exit(1);
  }
  // Writing corpus text into web/public/ bypasses every runtime serve gate by
  // construction, so the licensing check happens HERE, fail-closed: the row
  // must carry a public-domain license record, not merely a published status.
  const license = String(src[0].license ?? '');
  if (!/public.?domain|\bPD\b|CC0/i.test(license)) {
    console.error(`STOP: daily-light license is '${license || '(none)'}' — not recorded as public domain; not exporting.`);
    process.exit(1);
  }
  const attribution = `${src[0].title}${src[0].author ? ` · ${src[0].author}` : ''}`;

  // Ingestion order (id), never ORDER BY heading: an alphabetical sort would
  // truncate from the calendar's alphabetical tail if the LIMIT ever bit.
  const rows = (await client.query(
    `SELECT heading, body FROM sections
     WHERE source_id = $1 AND heading IS NOT NULL
     ORDER BY id
     LIMIT 1200`,
    [src[0].id],
  )).rows;

  const out = {};
  const problems = [];
  for (const r of rows) {
    const m = HEADING_RE.exec(r.heading.trim());
    if (!m) { problems.push(`unparsed heading: ${r.heading}`); continue; }
    const mm = MONTHS.get(m[1]);
    if (!mm) { problems.push(`unknown month: ${r.heading}`); continue; }
    const key = `${mm}-${String(Number(m[2])).padStart(2, '0')}`;
    const half = m[3] === 'Morning' ? 'am' : 'pm';
    const split = splitBody(r.body);
    if (!split) { problems.push(`no citation tail: ${r.heading}`); continue; }
    out[key] ??= {};
    if (out[key][half]) { problems.push(`duplicate: ${r.heading}`); continue; }
    out[key][half] = { title: r.heading.trim(), body: split.text, refs: split.refs, attribution };
  }

  const days = Object.keys(out).length;
  const entries = Object.values(out).reduce((n, d) => n + (d.am ? 1 : 0) + (d.pm ? 1 : 0), 0);
  // The module is a complete calendar: exactly 366 days x 2 halves, no slack.
  if (days !== 366 || entries !== 732 || problems.length > 0) {
    console.error(`STOP: export incomplete — ${days}/366 days, ${entries}/732 entries, ${problems.length} problems.`);
    for (const p of problems.slice(0, 10)) console.error(`  - ${p}`);
    process.exit(1);
  }

  const dest = join(root, 'web', 'public', 'devotional', 'daily-light.json');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(out));
  console.log(`wrote ${dest}: ${days} days, ${entries} entries, every citation tail split clean.`);
} finally {
  await client.end();
}
