// READ-ONLY prod census — the item-4 question plus the two cutover-blocking additions.
//
// SAFETY, in order of strength:
//   1. `BEGIN; SET TRANSACTION READ ONLY;` — the DATABASE refuses writes, not the script.
//   2. ROLLBACK always, never COMMIT.
//   3. count(*) / metadata only. The `embedding` column is never selected (vector payloads
//      would be slow on a live serving DB and are not needed for any question here).
//   4. Host asserted to be the prod endpoint BEFORE anything runs — a "prod census" that
//      silently ran against dev would be a confidently wrong answer, which is worse than an error.
//   5. Credentials never printed; host echoed via URL parse only.

const pg = require('pg');
const fs = require('fs');

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = process.env.PROD_ENV_FILE ?? path.join(ROOT, '.env.prod');

function envVal(file, name) {
  const t = fs.readFileSync(file, 'utf8');
  const m = t.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

(async () => {
  const url = process.env.CUTOVER_DATABASE_URL
    ?? envVal(ENV_FILE, 'CUTOVER_DATABASE_URL')
    ?? envVal(ENV_FILE, 'DATABASE_URL_UNPOOLED')
    ?? envVal(ENV_FILE, 'DATABASE_URL');
  if (!url) throw new Error(`no CUTOVER_DATABASE_URL in ${ENV_FILE} (or env)`);

  const host = new URL(url).host;
  if (!host.includes('ep-odd-fog')) {
    throw new Error(`STOP: host ${host} is NOT the prod endpoint — refusing to report dev numbers as prod`);
  }
  // The ONLY identity claim this script makes is the endpoint host, because that is
  // the one it can actually verify. It used to also print a `branch:` line read from
  // NEON_BRANCH in .env.prod — a self-attested label with no relationship to the URL
  // actually connected to. When the connection came from CUTOVER_DATABASE_URL it
  // printed `branch: census-clone` on top of a correct `ep-odd-fog` host assertion,
  // i.e. a census of PRODUCTION captioned as a census of a stale clone. A decorative
  // label that can contradict the verified fact next to it is worse than no label.
  console.log(`host:   ${host} (credentials redacted)`);

  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();

  try {
    await c.query('BEGIN');
    await c.query('SET TRANSACTION READ ONLY');
    const ro = await c.query('SHOW transaction_read_only');
    console.log(`read-only txn: ${ro.rows[0].transaction_read_only}`);
    if (ro.rows[0].transaction_read_only !== 'on') throw new Error('STOP: read-only not in force');
    console.log(`role: ${(await c.query('SELECT current_user u')).rows[0].u}`);

    // ── POSITIVE CONTROL. Must be non-zero, or every "0" below is meaningless.
    const control = await c.query(
      `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill'`);
    console.log(`\n=== POSITIVE CONTROL: John Gill rows on prod = ${control.rows[0].n} ${control.rows[0].n > 0 ? '✓ (probe fires)' : '✗ ABORT — probe is blind'}`);
    if (control.rows[0].n === 0) throw new Error('positive control returned 0 — probe shape is wrong');

    // ── ITEM 4: does prod carry the register works at all?
    const works = await c.query(
      `SELECT metadata->>'work' AS work, count(*)::int n
         FROM embeddings WHERE user_id IS NULL AND metadata->>'work' IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 40`);
    console.log(`\n=== PROD flat embeddings WITH a work key: ${works.rows.length} distinct works`);
    for (const r of works.rows) console.log(`   ${String(r.n).padStart(7)}  ${r.work}`);
    if (works.rows.length === 0) console.log('   (none — prod never received the register ingest)');

    // ── work-key COVERAGE (B1's "~30% of prose rows carry no work key", measured on dev)
    const cov = await c.query(
      `SELECT count(*)::int total,
              count(*) FILTER (WHERE metadata->>'work' IS NULL)::int no_work
         FROM embeddings WHERE user_id IS NULL`);
    const { total, no_work } = cov.rows[0];
    console.log(`\n=== WORK-KEY COVERAGE (gates E2)`);
    console.log(`   platform rows:        ${total}`);
    console.log(`   without a work key:   ${no_work}  (${(no_work / total * 100).toFixed(1)}%)`);

    const bytype = await c.query(
      `SELECT source_type, count(*)::int n,
              count(*) FILTER (WHERE metadata->>'work' IS NULL)::int no_work
         FROM embeddings WHERE user_id IS NULL GROUP BY 1 ORDER BY 2 DESC`);
    console.log(`\n=== BY source_type`);
    for (const r of bytype.rows) console.log(`   ${(r.source_type || '?').padEnd(12)} ${String(r.n).padStart(7)}   no-work: ${r.no_work}`);

    // ── SECTIONS: does prod have the sources/sections model populated?
    const secs = await c.query(`
      SELECT (SELECT count(*)::int FROM sources) sources,
             (SELECT count(*)::int FROM sections) sections,
             (SELECT count(*)::int FROM section_embeddings) section_embeddings`);
    console.log(`\n=== SECTIONS MODEL ON PROD`);
    console.log(`   sources=${secs.rows[0].sources}  sections=${secs.rows[0].sections}  section_embeddings=${secs.rows[0].section_embeddings}`);

    // ── ITEM 4 proper: do the suppressed defects exist on prod?
    const defects = await c.query(`
      SELECT
        count(*) FILTER (WHERE metadata->>'work' = 'chrysostom-homilies')::int chrysostom,
        count(*) FILTER (WHERE metadata->>'work' = 'tennyson-in-memoriam')::int tennyson,
        count(*) FILTER (WHERE metadata->>'work' = 'traherne-poems')::int traherne,
        count(*) FILTER (WHERE metadata->>'heading' ~* 'Words and Phrases')::int word_index,
        count(*) FILTER (WHERE content ILIKE '%cloth extra%' OR content ILIKE '%CHEAP EDITIONS%')::int ads
      FROM embeddings WHERE user_id IS NULL`);
    console.log(`\n=== DO THE DEV-SUPPRESSED DEFECTS EXIST ON PROD?`);
    console.log(`   ${JSON.stringify(defects.rows[0])}`);

    // ── FORBIDDEN PROVENANCE (item 6)
    const forb = await c.query(`
      SELECT count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%biblehub%')::int biblehub,
             count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%studylight%')::int studylight,
             count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%historicalchristian%')::int hcf
        FROM embeddings WHERE user_id IS NULL`);
    console.log(`\n=== FORBIDDEN PROVENANCE ON PROD`);
    console.log(`   ${JSON.stringify(forb.rows[0])}`);

    // ── MIGRATION MARKERS (item 1): is prod really at 015?
    const marks = await c.query(`
      SELECT
        to_regclass('section_history_anchors') IS NOT NULL AS m016_history_anchors,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='commentary_entries' AND column_name='work') AS m019_work_col,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sections' AND column_name='unit_ordinal') AS m024_unit_ordinal,
        to_regclass('library_items') IS NOT NULL AS m027_library_items,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='sources'::regclass AND pg_get_constraintdef(oid) ILIKE '%ingesting%') AS m023_ingesting,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='sources'::regclass AND pg_get_constraintdef(oid) ILIKE '%hymn%') AS m017_registers`);
    console.log(`\n=== MIGRATION MARKERS (true = applied)`);
    console.log(`   ${JSON.stringify(marks.rows[0], null, 1)}`);

    // ── LIVE USER DATA (item 5) — counts + distinct users only. Never content.
    console.log(`\n=== LIVE USER DATA (counts only, no content read)`);
    for (const t of ['highlights', 'notes', 'bookmarks', 'reading_progress', 'user_library', 'library_items', 'chats', 'messages']) {
      const exists = await c.query(`SELECT to_regclass($1) IS NOT NULL ok`, [t]);
      if (!exists.rows[0].ok) { console.log(`   ${t.padEnd(18)} (table absent)`); continue; }
      const r = await c.query(`SELECT count(*)::int n, count(DISTINCT user_id)::int users FROM ${t}`).catch(() => null);
      console.log(`   ${t.padEnd(18)} rows=${r ? r.rows[0].n : '?'}  distinct_users=${r ? r.rows[0].users : 'n/a'}`);
    }

    // ── COMPUTE SIZE (gates D2's wall-clock projection)
    console.log(`\n=== COMPUTE (calibrates the 121-190 s/10k slice rate measured on dev)`);
    for (const s of ['neon.compute_size', 'max_connections', 'shared_buffers', 'work_mem']) {
      const v = await c.query(`SHOW ${s}`).catch(() => null);
      console.log(`   ${s.padEnd(20)} ${v ? Object.values(v.rows[0])[0] : '(unavailable)'}`);
    }

    await c.query('ROLLBACK');
    console.log('\n✓ ROLLBACK issued. Zero writes performed (transaction was READ ONLY throughout).');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => { console.error('CENSUS ERROR:', e.message); process.exit(1); });
