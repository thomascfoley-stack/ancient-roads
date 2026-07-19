#!/usr/bin/env node
// ACCEPTANCE PROOF for the headline Phase 4 feature: sermon search.
//
// "The tests pass" is not the same as "search finds the sermon". The unit tests assert properties
// (dedupe, cap, fence) against synthetic or scoped inputs. This walks the USER's path end-to-end
// through the real HTTP endpoint and proves three things about a REAL, known, published sermon:
//
//   (a) FINDABILITY  — a distinctive phrase from that sermon actually returns that sermon.
//   (b) DEDUPE       — a term hitting N chunks INSIDE one reading unit returns ONE result, not N.
//   (c) DEEP LINK    — the returned ordinal really belongs to that unit, and the reader serves it,
//                      so /work/{slug}#s{ordinal} lands in the right place rather than merely
//                      being a well-formed-looking URL.
//
// Ground truth comes from the DB, so the assertions are anchored to reality rather than to the
// search engine's own opinion of itself.
//
//   node scripts/verify-sermon-search.mjs [baseUrl]     (default http://localhost:3012)
// Exit 0 = all legs pass. Exit 1 = a leg failed (message says which).

import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const BASE = process.argv[2] ?? 'http://localhost:3012';
const ENV = 'web/.env.local';
const envVal = (n) =>
  process.env[n] ?? (existsSync(ENV) ? readFileSync(ENV, 'utf8').match(new RegExp(`^${n}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '') : undefined);

const url = envVal('DATABASE_URL');
if (!url || !/ep-tiny-hat|localhost|127\.0\.0\.1/.test(url)) {
  console.log('⚠ SKIPPED (visibly): no dev owner DATABASE_URL — cannot establish ground truth.');
  process.exit(0);
}

const PHRASE = 'Eyes and no eyes'; // distinctive line from a known published Spurgeon sermon
const DEDUPE_TERM = 'sluggard';
const DEDUPE_WORK = 'spurgeon-sermons';

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails.push(label);
};
const api = async (qs) => {
  const res = await fetch(`${BASE}/api/search/works?${qs}`);
  if (!res.ok) throw new Error(`API ${res.status} for ${qs}`);
  return res.json();
};

try {
  // ── ground truth ───────────────────────────────────────────────────────────────────────────
  const gtPhrase = (
    await client.query(
      `SELECT s.slug, sec.ordinal, sec.unit_ordinal FROM sections sec JOIN sources s ON s.id=sec.source_id
       WHERE s.status='published' AND sec.body ILIKE $1 ORDER BY s.slug, sec.ordinal`,
      [`%${PHRASE}%`],
    )
  ).rows;
  const gtDedupe = (
    await client.query(
      `SELECT sec.unit_ordinal, count(*)::int AS chunk_hits FROM sections sec JOIN sources s ON s.id=sec.source_id
       WHERE s.status='published' AND s.slug=$1 AND sec.tsv @@ websearch_to_tsquery('english',$2)
       GROUP BY 1 ORDER BY chunk_hits DESC LIMIT 1`,
      [DEDUPE_WORK, DEDUPE_TERM],
    )
  ).rows[0];

  console.log(`GROUND TRUTH: "${PHRASE}" is in ${gtPhrase.length} published section(s);`);
  console.log(`              "${DEDUPE_TERM}" hits ${gtDedupe.chunk_hits} chunks inside ${DEDUPE_WORK} unit ${gtDedupe.unit_ordinal}\n`);

  // ── (a) findability ────────────────────────────────────────────────────────────────────────
  console.log(`(a) FINDABILITY — search the distinctive phrase through ${BASE}/api/search/works`);
  const a = await api(`q=${encodeURIComponent(`"${PHRASE}"`)}&catalog=sermons&limit=25`);
  const expectedSlugs = [...new Set(gtPhrase.map((r) => r.slug))];
  const gotSlugs = a.results.map((r) => r.slug);
  check(a.results.length > 0, 'the search returns results at all', `${a.results.length} result(s), total=${a.total}`);
  for (const slug of expectedSlugs) {
    check(gotSlugs.includes(slug), `the known sermon "${slug}" is returned`);
  }
  check(
    a.results.every((r) => r.sourceType === 'sermon'),
    'every result is register-labelled as a sermon',
    [...new Set(a.results.map((r) => r.sourceType))].join(','),
  );

  // ── (b) dedupe ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n(b) DEDUPE — "${DEDUPE_TERM}" hits ${gtDedupe.chunk_hits} chunks in one unit; search must return ONE`);
  const b = await api(`q=${DEDUPE_TERM}&work=${DEDUPE_WORK}&limit=100`);
  const forUnit = b.results.filter((r) => r.unitOrdinal === gtDedupe.unit_ordinal);
  check(gtDedupe.chunk_hits >= 3, 'precondition: the term really does hit many chunks in one unit', `${gtDedupe.chunk_hits} chunks`);
  check(forUnit.length === 1, `unit ${gtDedupe.unit_ordinal} yields exactly ONE result`, `got ${forUnit.length} (raw chunk hits: ${gtDedupe.chunk_hits})`);
  const unitKeys = b.results.map((r) => `${r.slug}#${r.unitOrdinal}`);
  check(new Set(unitKeys).size === unitKeys.length, 'no reading unit appears twice anywhere in the page');

  // ── (c) deep link ──────────────────────────────────────────────────────────────────────────
  console.log(`\n(c) DEEP LINK — /work/{slug}#s{ordinal} must land in the right unit, and the reader must serve it`);
  const hit = forUnit[0];
  if (!hit) {
    check(false, 'a result exists to deep-link into');
  } else {
    const owns = (
      await client.query(
        `SELECT sec.unit_ordinal FROM sections sec JOIN sources s ON s.id=sec.source_id
         WHERE s.slug=$1 AND sec.ordinal=$2`,
        [hit.slug, hit.ordinal],
      )
    ).rows[0];
    check(!!owns, 'the linked ordinal exists in that work', `ordinal=${hit.ordinal}`);
    check(
      owns && owns.unit_ordinal === gtDedupe.unit_ordinal,
      'the linked ordinal belongs to the SAME reading unit the hit claims',
      `link unit=${owns?.unit_ordinal} vs hit unit=${hit.unitOrdinal}`,
    );
    // the reader must actually serve that position (keyset: after = ordinal-1 returns it first)
    const res = await fetch(`${BASE}/api/work/${hit.slug}/sections?after=${hit.ordinal - 1}&limit=1`);
    const page = res.ok ? await res.json() : null;
    check(res.ok, 'the reader sections API serves that position', `HTTP ${res.status}`);
    check(
      !!page && Array.isArray(page.sections) && page.sections[0]?.ordinal === hit.ordinal,
      'the reader returns exactly the linked section',
      `got ordinal=${page?.sections?.[0]?.ordinal}`,
    );
    console.log(`\n  USER-FACING LINK: ${BASE}/work/${hit.slug}#s${hit.ordinal}`);
    console.log(`  heading: ${hit.heading}`);
  }
} finally {
  await client.end();
}

console.log('');
if (fails.length) {
  console.error(`✗ SERMON SEARCH ACCEPTANCE FAILED (${fails.length}): ${fails.join(' | ')}`);
  process.exit(1);
}
console.log('✓ SERMON SEARCH ACCEPTANCE PASSED — findable, deduped to its reading unit, and the deep link lands correctly.');
