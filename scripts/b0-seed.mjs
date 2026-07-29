#!/usr/bin/env node
/** Seed defects on a DISPOSABLE fork for redproof — never dev or prod. */
import pg from 'pg';
import fs from 'node:fs';

const REFUSE_HOST_FRAGMENTS = ['ep-tiny-hat', 'ep-odd-fog'];

const urlFile = process.env.THROWAWAY_URL_FILE;
if (!urlFile) throw new Error('THROWAWAY_URL_FILE must point at a disposable fork connection string file');
const url = fs.readFileSync(urlFile, 'utf8').trim();
const host = new URL(url).host.toLowerCase();
if (REFUSE_HOST_FRAGMENTS.some((r) => host.includes(r))) {
  throw new Error(`REFUSING: ${host} is dev or prod — this script corrupts its target`);
}

const cls = process.argv[2];
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 600000, query_timeout: 600000 });
await c.connect();
const q = (s, p = []) => c.query(s, p);

if (cls === 'unit-null') {
  const r = await q(`UPDATE sections SET unit_ordinal = NULL WHERE source_id = (SELECT id FROM sources WHERE slug='milton-poetical-works')`);
  console.log(`SEEDED class 1 (unit_ordinal NULL): ${r.rowCount} sections of milton-poetical-works`);
} else if (cls === 'mispair') {
  const r = await q(`
    WITH ord AS (
      SELECT sec.id, se.embedding, row_number() OVER (ORDER BY sec.ordinal) rn
        FROM sections sec JOIN section_embeddings se ON se.section_id = sec.id
        JOIN sources s ON s.id = sec.source_id WHERE s.slug='herbert-temple'),
    rot AS (SELECT a.id, b.embedding FROM ord a JOIN ord b ON b.rn = (a.rn % (SELECT count(*) FROM ord)) + 1)
    UPDATE section_embeddings se SET embedding = rot.embedding FROM rot WHERE se.section_id = rot.id`);
  console.log(`SEEDED class 2 (body<->vector mispair): rotated ${r.rowCount} vectors of herbert-temple by one section`);
} else if (cls === 'verify-mispair') {
  const r = await q(`
    SELECT count(*)::int n FROM sections sec JOIN section_embeddings se ON se.section_id=sec.id
     JOIN sources s ON s.id=sec.source_id WHERE s.slug='herbert-temple'`);
  console.log(`herbert-temple sections with a vector: ${r.rows[0].n} (count is UNCHANGED by the mispair — that is the point)`);
} else if (cls === 'census') {
  const r = await q(`SELECT count(*) FILTER (WHERE unit_ordinal IS NULL)::int nulls, count(*)::int total FROM sections`);
  console.log(`sections: ${r.rows[0].total}, unit_ordinal NULL: ${r.rows[0].nulls}`);
} else {
  throw new Error(`unknown class ${cls ?? '(none)'} — expected unit-null | mispair | verify-mispair | census`);
}

await c.end();
