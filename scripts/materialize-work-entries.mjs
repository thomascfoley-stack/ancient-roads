// Materialize a work into `commentary_entries` so legal, served, verse-anchored material stops
// being invisible to passage search.
//
// GENERALIZED 2026-08-20 from the gill-song run. Same shape, same conventions, different work —
// forking it would have duplicated every convention comment below, and those were paid for.
//   MATERIALIZE_SLUG   the source slug to materialize
//   MATERIALIZE_AUTHOR the author string to write; MUST already be admitted by the shipped
//                      predicate, or the rows land invisible and this was pointless.
//
// THE GAP, measured on production 2026-08-19. John Gill's admitted commentary covers 65 of 66
// books — 28,300 rows, clean provenance, everything except book 22. His exposition of the Song was
// ingested as a SEPARATE source (`gill-song`, 123 sections / 1,942 verse-anchored embeddings) and
// only ever reached the /ask side. Two independent causes kept the Song empty:
//   1. All 206 book-22 rows by an admitted author carry BibleHub provenance — correctly excluded.
//   2. The admission predicate's work-slug clause names `gill-song` explicitly, but
//      `work IS NOT NULL` is 0 of 371,406 rows table-wide, so that clause can never fire.
// So the material was legal, served, anchored, and named in the predicate — and unreachable.
// Nothing here changes the predicate: these rows are admitted BY AUTHOR, which already works.
//
// EVERY CONVENTION BELOW WAS READ OFF THE TABLE, NOT CHOSEN. Writing what seemed reasonable would
// have produced 123 rows unlike every other row in it:
//   - `tsv` is a GENERATED column (`to_tsvector('english', body)`), so it must NOT be inserted.
//   - Bodies are TRUNCATED at 5,000 chars — 8,951 rows sit exactly at that cap. gill-song sections
//     average 14,685 and reach 52,631, so an untruncated insert would be 10x anything present.
//   - The 8 CHAPTER-LEVEL sections (anchored `v 1-999`) are SKIPPED: no row in the table has
//     verse_end >= 900, so they have no honest home in a per-verse schema.
//   - `entry_index` sequences entries WITHIN a (book, chapter, verse) slot, across authors — one
//     slot in Genesis 1:1 runs Barnes 3-29, Basil 30-33, Bonaventure 35-39. Book 22 already holds
//     1,745 (inadmissible) rows occupying indexes, so new rows continue from the slot's current
//     max rather than restarting at 0 and colliding.
//
// A GUARD I GOT WRONG, KEPT HERE BECAUSE THE CORRECTION IS THE POINT. The first version refused
// unless John Gill held exactly one entry per verse — true across all 28,300 of his rows, so it
// looked like an invariant. It fired, on four real slots: Gill splits Song 4:16, 5:16, 6:5 and 7:5
// into "Former part" / "Latter part", and both halves are genuine exposition. Measuring the TABLE
// rather than the author showed 155 authors hold multiple entries in one slot, up to 176. The
// "invariant" was a coincidence of Gill's source, and enforcing it would have silently dropped
// half of four verses. The guard now checks what is actually structural: no duplicate entry_index
// within a slot, and the verse_end / body-length conventions.
//   - `year`, `tradition` and the empty-string `source_url` are DERIVED from the author's own
//     admitted rows at runtime, not typed here, so they cannot drift from the other 65 books.
//     `source_title` deliberately uses the work's REAL title rather than copying "John Gill's
//     Commentary": it is a different work, and passage search displays this field.
import { writeFileSync } from 'node:fs';
import pg from 'pg';

const SLUG = process.env.MATERIALIZE_SLUG ?? 'gill-song';
const AUTHOR = process.env.MATERIALIZE_AUTHOR ?? 'John Gill';
const APPLY = process.argv.includes('--execute');
const BODY_CAP = 5000;
const url = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
const endpoint = process.env.MATERIALIZE_TARGET_ENDPOINT;
if (!url) { console.error('DATABASE_URL is required'); process.exit(1); }
if (!endpoint) { console.error('STOP: declare MATERIALIZE_TARGET_ENDPOINT=<exact endpoint id>'); process.exit(2); }
if (!new URL(url).hostname.split('.')[0].includes(endpoint)) {
  console.error(`STOP: connection does not resolve to the declared endpoint ${endpoint}.`); process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows: busy } = await client.query(
    `SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
       AND state='active' AND (query ILIKE '%commentary_entries%' OR query ILIKE '%UPDATE embeddings%')`);
  if (busy[0].n > 0) { console.error(`STOP: ${busy[0].n} other session(s) writing. Wait, then re-run.`); process.exit(3); }

  // LICENSING GATE, evaluated here rather than trusted: PD + no aggregator host, or nothing runs.
  const { rows: prov } = await client.query(
    `SELECT src.license, count(*) FILTER (WHERE s.source_url ~* '(biblehub|studylight|historicalchristian)') AS dirty
       FROM sources src JOIN sections s ON s.source_id = src.id WHERE src.slug = $1 GROUP BY src.license`, [SLUG]);
  if (prov.length !== 1 || prov[0].license !== 'Public Domain' || Number(prov[0].dirty) !== 0) {
    throw new Error(`licensing gate: ${JSON.stringify(prov)} — refusing to materialize`);
  }

  const { rows: conv } = await client.query(
    `SELECT mode() WITHIN GROUP (ORDER BY year) AS year, mode() WITHIN GROUP (ORDER BY tradition) AS tradition,
            min(source_url) AS source_url FROM commentary_entries WHERE author = $1`, [AUTHOR]);
  // If the author has no admitted rows yet, fall back to the work's OWN embedding metadata rather
  // than inventing values — barnes-crosswire-nt is exactly that case.
  if (conv[0].year == null) {
    const { rows: meta } = await client.query(
      `SELECT max((metadata->>'year')::int) AS year, max(metadata->>'tradition') AS tradition
         FROM embeddings WHERE metadata->>'work' = $1`, [SLUG]);
    conv[0].year = meta[0].year; conv[0].tradition = meta[0].tradition; conv[0].source_url = '';
  }
  const { year, tradition, source_url } = conv[0];
  const { rows: title } = await client.query(`SELECT title FROM sources WHERE slug = $1`, [SLUG]);

  const { rows: existing } = await client.query(
    `SELECT count(*)::int n FROM commentary_entries WHERE author = $1 AND source_title = $2`, [AUTHOR, title[0].title]);
  if (existing[0].n > 0) { console.log(`  already materialized (${existing[0].n} rows) — nothing to do.`); process.exit(0); }

  await client.query('BEGIN');
  const ins = await client.query(
    `INSERT INTO commentary_entries (book, chapter, verse_start, verse_end, author, year, tradition,
                                     source_title, source_url, body, entry_index)
     SELECT (sa.verse_id_start/1000000)::smallint,
            ((sa.verse_id_start/1000)%1000)::smallint,
            (sa.verse_id_start%1000)::smallint,
            (sa.verse_id_end%1000)::smallint,
            $5, $1::smallint, $2, $3, $4,
            left(s.body, ${BODY_CAP}),
            (COALESCE(slot.max_idx, -1)
              + row_number() OVER (PARTITION BY sa.verse_id_start ORDER BY s.id))::smallint
       FROM section_anchors sa
       JOIN sections s ON s.id = sa.section_id
       JOIN sources src ON src.id = s.source_id
       LEFT JOIN LATERAL (
         SELECT max(ce.entry_index) AS max_idx FROM commentary_entries ce
          WHERE ce.book = (sa.verse_id_start/1000000)::smallint
            AND ce.chapter = ((sa.verse_id_start/1000)%1000)::smallint
            AND ce.verse_start = (sa.verse_id_start%1000)::smallint
       ) slot ON true
      WHERE src.slug = $6 AND sa.verse_id_end % 1000 <> 999
      RETURNING id`,
    [year, tradition, title[0].title, source_url, AUTHOR, SLUG]);

  // Structural, not coincidental: entry_index orders a passage's entries, so it must be unique
  // within the slot or the display order is ambiguous.
  const { rows: dup } = await client.query(
    `SELECT count(*)::int n FROM (SELECT 1 FROM commentary_entries
       GROUP BY book, chapter, verse_start, entry_index HAVING count(*) > 1) x`);
  if (dup[0].n > 0) throw new Error(`REFUSING: ${dup[0].n} duplicate entry_index within a book-22 slot`);
  const { rows: bad } = await client.query(
    `SELECT count(*)::int n FROM commentary_entries WHERE author = $1 AND source_title = $2
      AND (verse_end >= 900 OR length(body) > ${BODY_CAP})`, [AUTHOR, title[0].title]);
  if (bad[0].n > 0) throw new Error(`REFUSING: ${bad[0].n} row(s) violate the table's own conventions`);

  const ids = ins.rows.map((r) => r.id);
  writeFileSync(`docs/evidence/materialization-${SLUG}-ids.json`,
    JSON.stringify({ slug: SLUG, author: AUTHOR, inserted: ids.length, ids }, null, 2));
  console.log(`  inserted ${ids.length} row(s); chapter-level sections (v..999) skipped by design`);
  console.log(`  INVERSE: DELETE FROM commentary_entries WHERE id = ANY(<ids in the evidence file>);`);

  if (!APPLY) { await client.query('ROLLBACK'); console.log('\n  DRY RUN — rolled back. Re-run with --execute.'); }
  else { await client.query('COMMIT'); console.log('\n  COMMITTED.'); }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`  ✗ ${e.message}`); process.exitCode = 1;
} finally { await client.end(); }
