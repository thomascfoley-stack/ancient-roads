#!/usr/bin/env node
/**
 * CORPUS COPY — move named works from dev to production WITH THEIR VECTORS, staged.
 *
 *   COPY_ALLOW=1 COPY_EXPECT_HOST=<exact dest endpoint id> \
 *   CORPUS_COPY_SOURCE_URL=<dev owner url> CORPUS_COPY_DEST_URL=<dest owner url> \
 *     node scripts/corpus-copy.mjs --slugs=<file.json> --evidence=docs/evidence/<dir>
 *
 *   node scripts/corpus-copy.mjs --slugs=<file> --dry-run          # census only, no writes
 *
 * WHY A COPY AND NOT A RE-INGEST. `docs/MIGRATION_DESIGN.md` already weighed these and chose
 * reuse: re-embedding regenerates vectors that are still valid for byte-identical text, costs a
 * coverage gap while it runs, and "reintroduces every batch-pipeline failure mode". Worse here,
 * dev's corpus is ingest PLUS ~2 months of curation (ADR-029 suppressions, non-authorial-matter
 * deletes, quarantine rulings, the unit_ordinal repair) that a fresh ingest replays NONE of. A
 * re-ingest would land a measurably different corpus and call it the same one.
 *
 * WHAT IT WILL NOT DO, structurally rather than by convention:
 *   * `status` is the LITERAL 'staged' in the INSERT. There is no parameter, no flag and no code
 *     path to 'published'. Publishing stays `scripts/publish-flip.mjs`, behind its own owner gate.
 *   * Only `user_id IS NULL` rows are read from `embeddings`. User data is not corpus and is never
 *     in scope; COPIED_TABLES is asserted disjoint from USER_TABLES, derived from the module that
 *     owns that list rather than re-typed.
 *   * The source must NOT be production, the destination must be declared by exact endpoint id,
 *     and the two must differ. A copy onto itself is a bug, not a no-op.
 *   * Slugs come from a literal file and must exist in `ingest/sources.config.json`, pass the
 *     licence and forbidden-provenance predicates, and not be `serve:false`. Quarantine is law.
 *
 * PLAIN NODE, NO tsx. Same rule as publish-flip.mjs: the production write path does not depend on
 * a transpiler being installed and behaving.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { assertCutoverTarget, endpointId, hostOf, isProdHost, isLocalHost } from './lib/target-guard.mjs';
import { USER_TABLES } from './lib/user-data-invariant.mjs';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';
import { isAllowedLicense } from '../src/ingest/allowed-licenses.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => args.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const DRY = has('--dry-run');
const localOk = has('--local-redproof');
const slugFile = val('--slugs');
const evidenceDir = val('--evidence') ?? 'docs/evidence/corpus-copy';

function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

// ── WHAT MOVES. A constant, so the disjointness assertion below is over the real list. ────────
// `sections.tsv` is a GENERATED column and is deliberately absent: it is recomputed by the
// destination from the values we insert, which is what keeps it consistent with migration 016's
// heading-aware definition instead of carrying a stale vector across.
const COPIED_TABLES = ['sources', 'sections', 'section_anchors', 'section_embeddings', 'section_history_anchors', 'topical_entries', 'embeddings'];

// A copier that names a user table is not a bug to be caught in review; it is a data breach. The
// list is DERIVED from the module that owns it, so adding a user table anywhere makes this fire
// without anyone remembering to update a second copy here.
const overlap = COPIED_TABLES.filter((t) => USER_TABLES.includes(t));
if (overlap.length > 0) {
  die(`REFUSING TO RUN: COPIED_TABLES names user table(s): ${overlap.join(', ')}. This tool copies corpus only.`, 2);
}

if (!slugFile) die('usage: corpus-copy.mjs --slugs=<file.json> [--dry-run] [--evidence=<dir>]', 2);

// ── the slug list, read LITERALLY ─────────────────────────────────────────────────────────────
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(slugFile, 'utf8'));
} catch (e) {
  die(`STOP: cannot read the slug file ${slugFile}: ${e.message}`, 2);
}
const slugs = Array.isArray(manifest?.slugs) ? manifest.slugs : null;
if (!slugs || slugs.length === 0) die(`STOP: ${slugFile} carries no slugs.`, 2);
if (!slugs.every((s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s))) {
  die('STOP: slug file contains a value that is not a slug. Refusing to guess.', 2);
}
if (new Set(slugs).size !== slugs.length) die('STOP: slug file lists the same slug twice.', 2);

// ── the legal gates, against the manifest that owns the rulings ───────────────────────────────
const CONFIG = path.join(path.dirname(new URL(import.meta.url).pathname), '../ingest/sources.config.json');
let bySlug;
try {
  bySlug = new Map(
    Object.values(JSON.parse(fs.readFileSync(CONFIG, 'utf8')))
      .filter((e) => typeof e?.slug === 'string')
      .map((e) => [e.slug, e]),
  );
} catch (e) {
  die(`STOP: cannot read ingest/sources.config.json: ${e.message}`, 2);
}

const stops = [];
for (const slug of slugs) {
  const entry = bySlug.get(slug);
  if (!entry) {
    stops.push(`${slug}: not in ingest/sources.config.json — the manifest is the source of truth for what may exist`);
    continue;
  }
  if (entry.serve === false) stops.push(`${slug}: serve:false in the manifest (quarantined or held) — quarantine is law`);
  const domain = forbiddenProvenanceDomain(String(entry.provenance?.url ?? ''));
  if (domain) stops.push(`${slug}: provenance is ${domain} (ADR-008)`);
  if (!isAllowedLicense(entry.license)) stops.push(`${slug}: licence "${entry.license}" is not permitted`);
}
if (stops.length > 0) {
  console.error(`STOP — ${stops.length} slug(s) refused:`);
  for (const s of stops) console.error(`  ${s}`);
  die('\nNo rows were read and nothing was written.', 1);
}

// ── the endpoints ─────────────────────────────────────────────────────────────────────────────
const SRC = process.env.CORPUS_COPY_SOURCE_URL;
const DEST = process.env.CORPUS_COPY_DEST_URL;
if (!SRC) die('STOP: CORPUS_COPY_SOURCE_URL is unset. Credentials come from the environment only — never argv, never a dotfile.', 2);
if (!DEST && !DRY) die('STOP: CORPUS_COPY_DEST_URL is unset.', 2);

// PARSE BEFORE ANYTHING TOUCHES THEM. `hostOf` is `new URL(...)`, so a value that is not a URL —
// a shell placeholder left unreplaced, a pasted fragment, a variable that expanded to nothing but
// quotes — threw an uncaught TypeError with a stack trace instead of refusing. Two reasons that
// matters: a stack trace is not an answer an operator can act on, and an exception carrying an
// unparsed connection string is exactly how a credential ends up in a terminal buffer or a CI log.
//
// The message names the VARIABLE and never the value. That is the rule for every error in this
// tool: rail 3 says a credential is never printed, and "only when it is well-formed" is not a rule.
function assertParses(label, url) {
  try {
    new URL(String(url));
  } catch {
    die(
      `STOP: ${label} is not a valid connection URL. Its value is not shown here, deliberately.\n` +
        '  Expected something of the form postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require\n' +
        '  If you exported a placeholder from a command someone gave you, that is the usual cause.',
      2,
    );
  }
}
assertParses('CORPUS_COPY_SOURCE_URL', SRC);
if (!DRY) assertParses('CORPUS_COPY_DEST_URL', DEST);

// `--local-redproof` MUST NOT BE A SKELETON KEY. publish-flip.mjs shipped with exactly that hole
// (audit finding C3: the flag was honoured without checking the target was actually local, so a
// real endpoint could be driven with every gate disabled). So the flag is validated before it
// relaxes anything: it only ever means "the destination is a throwaway on this machine".
if (localOk && !DRY && !isLocalHost(DEST)) {
  die(`STOP: --local-redproof was set but the destination ${hostOf(DEST)} is not local. The flag relaxes the destination declaration; it is not an override for real endpoints.`, 2);
}

// THE SOURCE IS NEVER PRODUCTION, and no flag changes that. This tool reads dev and writes prod;
// reversing it would copy production over the top of the curated corpus. `--local-redproof` is
// deliberately NOT honoured here — a red-proof of the wrong direction is not worth the hole.
if (isProdHost(SRC)) {
  die(`STOP: the SOURCE is ${hostOf(SRC)}, which is production. This tool reads from dev and writes to prod, never the reverse.`, 2);
}

let destHost = null;
if (!DRY) {
  // Ordering is deliberate. The same-endpoint check runs FIRST because it is true or false
  // regardless of how the destination is declared: if it ran after the declaration gate, the
  // operator whose two URLs point at one database would be told about a missing env var instead
  // of about the actual mistake.
  //
  // TWO CHECKS, because neither alone is right. Comparing endpoint ids alone said "same endpoint"
  // for two DIFFERENT local databases — `endpointId('localhost')` is null, and null === null.
  // Comparing URLs alone would miss one Neon endpoint reached through two connection strings
  // (pooled vs direct, or a rotated password), which really is one database.
  const sameNeonEndpoint = (() => {
    const a = endpointId(hostOf(SRC));
    const b = endpointId(hostOf(DEST));
    return a != null && b != null && a === b;
  })();
  const sameDatabase = (() => {
    try {
      const norm = (u) => {
        const x = new URL(u);
        return `${x.hostname}:${x.port || '5432'}${x.pathname}`;
      };
      return norm(SRC) === norm(DEST);
    } catch {
      return false; // an unparseable URL fails its own guard elsewhere; do not claim identity here
    }
  })();
  if (sameNeonEndpoint || sameDatabase) {
    die(`STOP: source and destination are the same database (${hostOf(SRC)}). A copy onto itself is a bug.`, 2);
  }
  if (localOk) {
    destHost = hostOf(DEST); // already proven local above
  } else {
    try {
      destHost = assertCutoverTarget(DEST, {
        allow: process.env.COPY_ALLOW === '1',
        declared: process.env.COPY_EXPECT_HOST,
        what: 'copy destination',
      });
    } catch (e) {
      die(e.message, 2);
    }
  }
}

// ── the owner gate. TTY only; piped input is refused, not trusted. ────────────────────────────
// `--redproof-skip-gate` exists ONLY so the throwaway red-proof can drive the copy path without a
// terminal, and it is inert unless --local-redproof already proved the destination is local. It is
// separate from --local-redproof on purpose: if one flag disabled both the destination
// declaration AND the human gate, the human gate would never be exercised by anything, and an
// unexercised gate is the thing this repo keeps finding.
const skipGate = has('--redproof-skip-gate') && localOk;
async function ownerGate(summary) {
  if (skipGate || DRY) return;
  if (!process.stdin.isTTY) {
    die('STOP: stdin is not a TTY. This gate exists to be answered by a person at a terminal; a piped answer is not consent.', 2);
  }
  console.log(`\n${summary}\n`);
  process.stdout.write("Type 'copy' to proceed: ");
  const answer = await new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (d) => resolve(String(d).trim()));
  });
  if (answer !== 'copy') die('Refused at the gate. Nothing was written.', 1);
}

const q = (c, sql, params) => c.query(sql, params);

// ── bulk transfer ────────────────────────────────────────────────────────────────────────────
// Until 2026-08-02 this tool inserted ONE ROW PER ROUND TRIP and read each work's children with
// `section_id = ANY($1::bigint[])`. Both are invisible at hymn scale (5,070 statements, 1,690
// sections) and neither survives the registers behind it: the sermon batch is 162,805 sections
// and 162,507 flat rows, i.e. 488,117 statements (~6.8 hours, in ONE transaction held open on
// production) and an `ANY` array of 162,805 ids, with every 1024-float vector resident in Node at
// once. Measured on the real dev census before it was written, not guessed afterwards.
//
// WRITES are batched with parameterised `unnest`, deliberately NOT `COPY`: section bodies contain
// tabs and newlines, and COPY's text escaping is a correctness hazard on exactly that content.
// Proven on a throwaway PG17 + pgvector cluster against tabs, newlines, single quotes and
// backslashes, with vectors round-tripped byte-identical.
//
// READS are keyset-paged, so peak memory is one page rather than one work. The id maps are kept
// (two integers per section) but never the bodies or the vectors.
// Both are overridable ONLY so the red proof can drive real page and batch boundaries. The
// committed fixture is 5 sections against a 2,000-row page, so at the shipped defaults the whole
// of the paging below is dead code during the proof and every check passes on the single-page
// path — green earned by not being executed (THE_LOOP.md §6). The proof therefore re-runs the
// copy at COPY_READ_PAGE=2 / COPY_WRITE_BATCH=2. These knobs change throughput only; correctness
// must not depend on them, which is exactly what running at 2 and at 250 is there to demonstrate.
const intEnv = (name, dflt) => {
  const raw = process.env[name];
  if (raw === undefined) return dflt;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) die(`STOP: ${name} must be a positive integer`, 2);
  return n;
};
const WRITE_BATCH = intEnv('COPY_WRITE_BATCH', 250); // rows per INSERT. 1024-dim vectors are ~10KB
                         // of text each; 250 keeps a statement near 2.5MB rather than the ~15MB a
                         // 1,000-row batch would be.
const READ_PAGE = intEnv('COPY_READ_PAGE', 2000);    // rows per SELECT.

/**
 * Insert `rows` with one statement per WRITE_BATCH. `sql` must consume its columns as
 * `unnest($1::T[], $2::T[], ...)`; `rows` is an array of column-value arrays.
 */
async function bulkInsert(client, sql, rows) {
  if (rows.length === 0) return 0;
  const nCols = rows[0].length;
  for (let i = 0; i < rows.length; i += WRITE_BATCH) {
    const chunk = rows.slice(i, i + WRITE_BATCH);
    const cols = Array.from({ length: nCols }, () => []);
    for (const r of chunk) for (let c = 0; c < nCols; c++) cols[c].push(r[c]);
    await q(client, sql, cols);
  }
  return rows.length;
}

/**
 * Read a query in keyset pages, handing each page to `onPage`. `sql` takes the previous page's
 * cursor values as its trailing parameters and must ORDER BY the same keys, so no row is seen
 * twice and none is skipped — which OFFSET does not guarantee under concurrent writes.
 */
async function pageThrough(client, sql, baseParams, initialCursor, cursorOf, onPage) {
  let cursor = initialCursor;
  let total = 0;
  for (;;) {
    const rows = (await q(client, sql, [...baseParams, ...cursor])).rows;
    if (rows.length === 0) return total;
    await onPage(rows);
    total += rows.length;
    if (rows.length < READ_PAGE) return total;
    cursor = cursorOf(rows[rows.length - 1]);
  }
}

async function censusOn(client, label) {
  const rows = {};
  for (const slug of slugs) {
    const r = (
      await q(
        client,
        `SELECT
           (SELECT count(*)::int FROM sources WHERE slug = $1)                                                       AS sources,
           (SELECT count(*)::int FROM sections s JOIN sources src ON src.id = s.source_id WHERE src.slug = $1)        AS sections,
           (SELECT count(*)::int FROM section_anchors a JOIN sections s ON s.id = a.section_id
              JOIN sources src ON src.id = s.source_id WHERE src.slug = $1)                                          AS anchors,
           (SELECT count(*)::int FROM section_embeddings se JOIN sections s ON s.id = se.section_id
              JOIN sources src ON src.id = s.source_id WHERE src.slug = $1)                                          AS section_embeddings,
           (SELECT count(*)::int FROM topical_entries te JOIN sections s ON s.id = te.section_id
              JOIN sources src ON src.id = s.source_id WHERE src.slug = $1)                                          AS topical_entries,
           (SELECT count(*)::int FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1)                    AS flat_embeddings`,
        [slug],
      )
    ).rows[0];
    rows[slug] = r;
  }
  console.log(`\n${label}`);
  for (const [slug, r] of Object.entries(rows)) {
    console.log(
      `  ${slug.padEnd(28)} sources=${r.sources} sections=${String(r.sections).padStart(7)} ` +
        `anchors=${String(r.anchors).padStart(7)} vectors=${String(r.section_embeddings).padStart(7)} ` +
        `topical=${String(r.topical_entries).padStart(7)} flat=${String(r.flat_embeddings).padStart(7)}`,
    );
  }
  return rows;
}

const src = new pg.Client({
  connectionString: SRC,
  ssl: isLocalHost(SRC) ? false : { rejectUnauthorized: false },
  application_name: 'corpus-copy-src',
});
await src.connect();

let dest = null;
try {
  await q(src, 'BEGIN');
  await q(src, 'SET TRANSACTION READ ONLY');
  if ((await q(src, 'SHOW transaction_read_only')).rows[0]?.transaction_read_only !== 'on') {
    throw new Error('STOP: the source transaction is not read-only');
  }

  console.log(`corpus-copy — source ${hostOf(SRC)} → ${DRY ? '(dry run, no destination)' : hostOf(DEST)}`);
  console.log(`${slugs.length} work(s): ${slugs.join(', ')}`);
  const before = await censusOn(src, 'SOURCE census (dev)');

  const missing = slugs.filter((s) => before[s].sources === 0);
  if (missing.length > 0) {
    die(`\nSTOP: ${missing.length} slug(s) do not exist on the source: ${missing.join(', ')}. A copy cannot invent them.`, 1);
  }

  if (DRY) {
    console.log('\nDRY RUN — no destination was contacted and nothing was written.');
    await q(src, 'ROLLBACK');
    await src.end();
    process.exit(0);
  }

  dest = new pg.Client({
    connectionString: DEST,
    ssl: isLocalHost(DEST) ? false : { rejectUnauthorized: false },
    application_name: 'corpus-copy-dest',
  });
  await dest.connect();

  // Corpus tables are owner-only (migration 010 revoked DML from app_runtime), so a non-owner
  // connection cannot do this work. Asserted at the SERVER, not inferred from the URL.
  const who = (await q(dest, 'SELECT current_user AS u')).rows[0].u;
  if (who !== 'neondb_owner' && !localOk) {
    die(`STOP: destination connection is '${who}', not neondb_owner. Corpus writes are owner-only (migration 010).`, 2);
  }

  const destBefore = await censusOn(dest, 'DESTINATION census, BEFORE');

  await ownerGate(
    `About to copy ${slugs.length} work(s) into ${hostOf(DEST)} (${destHost}).\n` +
      `They will land as status='staged' and will NOT be published by this tool.`,
  );

  await q(dest, 'BEGIN');
  for (const slug of slugs) {
    // 1. the source row. status is the LITERAL 'staged' — there is no parameter to get this wrong.
    const s = (await q(src, 'SELECT * FROM sources WHERE slug = $1', [slug])).rows[0];
    await q(
      dest,
      `INSERT INTO sources (slug, title, author, author_died, year_written, source_type, tradition, era, language, license, provenance, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'staged')
       ON CONFLICT (slug) DO NOTHING`,
      [s.slug, s.title, s.author, s.author_died, s.year_written, s.source_type, s.tradition, s.era, s.language, s.license, s.provenance],
    );
    const destSourceId = (await q(dest, 'SELECT id FROM sources WHERE slug = $1', [slug])).rows[0].id;

    // 2. sections. `id` is GENERATED ALWAYS, so the destination assigns its own; the child rows
    //    below are remapped through (source_id, ordinal), which is UNIQUE, rather than through
    //    insertion order — order is not a key and relying on it is how a remap silently skews.
    // `unit_ordinal` IS COPIED, and its absence was a real reader-facing defect (2026-08-02).
    //
    // This SELECT read `id, ordinal, heading, body` and the INSERT wrote the same four, so
    // `unit_ordinal` — the column that GROUPS chunked sections into the thing a reader calls a
    // work-unit — arrived NULL on every one of the 277,356 rows this tool copied. The reader's
    // TOC orders by `unit_ordinal, ordinal` (web/src/lib/work.ts:147), so with it NULL the TOC
    // degrades to one row per SECTION: `spurgeon-sermons` is 118,371 sections in 3,540 units, and
    // the contents listed "Sermon 5. The Comforter" thirty-three times in a row.
    //
    // It is COPIED, never recomputed. Recomputing would re-run migration 024's classification
    // against a different corpus shape and silently move the grouping — and `unit_ordinal` feeds
    // the G10 rollup digest, whose whole purpose is to notice exactly that kind of drift. The
    // source's values are the baseline the digest was built from.
    //
    // AND THE ON CONFLICT CLAUSE FILLS, because 277,356 rows were already written without it and
    // `DO NOTHING` would leave every one of them NULL forever. The update is provably narrow: one
    // column, and only `WHERE sections.unit_ordinal IS NULL`, so it can add a missing value and
    // can never overwrite a present one. That is what makes re-running this tool the repair.
    const srcIdToOrdinal = new Map();
    let filled = 0;
    const nSections = await pageThrough(
      src,
      `SELECT id, ordinal, heading, body, unit_ordinal FROM sections
        WHERE source_id = $1 AND ordinal > $2::int ORDER BY ordinal LIMIT ${READ_PAGE}`,
      [s.id], [-1], (last) => [last.ordinal],
      async (page) => {
        const before = (await q(dest, 'SELECT count(*)::int n FROM sections WHERE source_id = $1 AND unit_ordinal IS NULL', [destSourceId])).rows[0].n;
        await bulkInsert(
          dest,
          `INSERT INTO sections (source_id, ordinal, heading, body, unit_ordinal)
           SELECT * FROM unnest($1::bigint[], $2::int[], $3::text[], $4::text[], $5::int[])
           ON CONFLICT (source_id, ordinal) DO UPDATE SET unit_ordinal = EXCLUDED.unit_ordinal
             WHERE sections.unit_ordinal IS NULL`,
          page.map((r) => [destSourceId, r.ordinal, r.heading, r.body, r.unit_ordinal]),
        );
        const after = (await q(dest, 'SELECT count(*)::int n FROM sections WHERE source_id = $1 AND unit_ordinal IS NULL', [destSourceId])).rows[0].n;
        filled += Math.max(0, before - after);
        for (const r of page) srcIdToOrdinal.set(String(r.id), r.ordinal);
      },
    );

    // The remap table: SOURCE section id -> DESTINATION section id, keyed through the ordinal.
    // Only two integers per section are retained; bodies and vectors are never held.
    const destByOrdinal = new Map(
      (await q(dest, 'SELECT id, ordinal FROM sections WHERE source_id = $1', [destSourceId])).rows.map((r) => [r.ordinal, r.id]),
    );
    const idMap = new Map();
    for (const [srcId, ord] of srcIdToOrdinal) {
      const to = destByOrdinal.get(ord);
      if (to != null) idMap.set(srcId, to);
    }
    srcIdToOrdinal.clear();
    destByOrdinal.clear();

    // 3-5. the children, remapped. Joined to `sections` rather than handed an ANY() array of every
    //      id, which for the sermon register would be a 162,805-element parameter.
    //
    //      EACH PAGES ON ITS FULL PRIMARY KEY, not on section_id. All three tables allow several
    //      rows per section (multiple anchors, several model_slugs, several entities), so a
    //      keyset of `section_id > last` would SKIP every remaining row of whichever section a
    //      page boundary landed inside — silent, partial, and invisible in a row-count check that
    //      compares only what it copied against what it read.
    const remap = (rows, take) =>
      rows.map((r) => [idMap.get(String(r.section_id)), ...take(r)]).filter((r) => r[0] != null);

    await pageThrough(
      src,
      `SELECT c.section_id, c.verse_id_start, c.verse_id_end FROM section_anchors c
         JOIN sections sec ON sec.id = c.section_id
        WHERE sec.source_id = $1 AND (c.section_id, c.verse_id_start) > ($2::bigint, $3::int)
        ORDER BY c.section_id, c.verse_id_start LIMIT ${READ_PAGE}`,
      [s.id], [0, -2147483648], (l) => [l.section_id, l.verse_id_start],
      (page) => bulkInsert(
        dest,
        `INSERT INTO section_anchors (section_id, verse_id_start, verse_id_end)
         SELECT * FROM unnest($1::bigint[], $2::int[], $3::int[]) ON CONFLICT DO NOTHING`,
        remap(page, (r) => [r.verse_id_start, r.verse_id_end]),
      ),
    );

    // topical_entries (migration 042 for the table's consumer, 039 for the table): the
    // ORDERED, labeled topic→passage expansion a topical-index work carries. Added when
    // the /plans topic slice made it corpus rather than a private detail — without it a
    // copied Nave's would arrive as headings with no plan-able structure, and the failure
    // would be silent because every OTHER count would reconcile.
    //
    // Keyed on (section_id, ordinal) — its UNIQUE constraint, not its surrogate `id`, for
    // the reason the block above states: several rows per section mean a section_id-only
    // keyset skips the tail of whichever section a page boundary lands inside.
    await pageThrough(
      src,
      `SELECT c.section_id, c.ordinal, c.label, c.verse_id_start, c.verse_id_end FROM topical_entries c
         JOIN sections sec ON sec.id = c.section_id
        WHERE sec.source_id = $1 AND (c.section_id, c.ordinal) > ($2::bigint, $3::int)
        ORDER BY c.section_id, c.ordinal LIMIT ${READ_PAGE}`,
      [s.id], [0, -2147483648], (l) => [l.section_id, l.ordinal],
      (page) => bulkInsert(
        dest,
        `INSERT INTO topical_entries (section_id, ordinal, label, verse_id_start, verse_id_end)
         SELECT * FROM unnest($1::bigint[], $2::int[], $3::text[], $4::int[], $5::int[]) ON CONFLICT DO NOTHING`,
        remap(page, (r) => [r.ordinal, r.label, r.verse_id_start, r.verse_id_end]),
      ),
    );

    // The vector is passed through VERBATIM. Reuse is the entire point: the text is
    // byte-identical, so the vector remains valid and no re-embedding is paid for or risked.
    const nVectors = await pageThrough(
      src,
      `SELECT c.section_id, c.model_slug, c.embedding FROM section_embeddings c
         JOIN sections sec ON sec.id = c.section_id
        WHERE sec.source_id = $1 AND (c.section_id, c.model_slug) > ($2::bigint, $3::text)
        ORDER BY c.section_id, c.model_slug LIMIT ${READ_PAGE}`,
      [s.id], [0, ''], (l) => [l.section_id, l.model_slug],
      (page) => bulkInsert(
        dest,
        `INSERT INTO section_embeddings (section_id, model_slug, embedding)
         SELECT * FROM unnest($1::bigint[], $2::text[], $3::vector[]) ON CONFLICT DO NOTHING`,
        remap(page, (r) => [r.model_slug, r.embedding]),
      ),
    );

    await pageThrough(
      src,
      `SELECT c.section_id, c.kind, c.entity_slug, c.entity_label FROM section_history_anchors c
         JOIN sections sec ON sec.id = c.section_id
        WHERE sec.source_id = $1
          AND (c.section_id, c.kind, c.entity_slug) > ($2::bigint, $3::text, $4::text)
        ORDER BY c.section_id, c.kind, c.entity_slug LIMIT ${READ_PAGE}`,
      [s.id], [0, '', ''], (l) => [l.section_id, l.kind, l.entity_slug],
      (page) => bulkInsert(
        dest,
        `INSERT INTO section_history_anchors (section_id, kind, entity_slug, entity_label)
         SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[]) ON CONFLICT DO NOTHING`,
        remap(page, (r) => [r.kind, r.entity_slug, r.entity_label]),
      ),
    );

    // 6. the flat retrieval store. `user_id IS NULL` is the corpus/user boundary and is in the
    //    READ, so user rows are never even fetched, let alone written. The keyset is the composite
    //    the unique index already uses, because chunk_index alone is not unique across source_ids.
    //    `metadata` is serialised here rather than handed over as an object: node-postgres has no
    //    array-of-jsonb encoding for a JS object, and the silent result is a row of "[object
    //    Object]".
    const nFlat = await pageThrough(
      src,
      `SELECT source_type, source_id, chunk_index, content, embedding, metadata FROM embeddings
        WHERE user_id IS NULL AND metadata->>'work' = $1
          AND (source_id, chunk_index) > ($2::text, $3::int)
        ORDER BY source_id, chunk_index LIMIT ${READ_PAGE}`,
      [slug], ['', -1], (l) => [l.source_id, l.chunk_index],
      (page) => bulkInsert(
        dest,
        `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
         SELECT NULL::text, * FROM unnest($1::text[], $2::text[], $3::int[], $4::text[], $5::vector[], $6::jsonb[])
         ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING`,
        page.map((f) => [f.source_type, f.source_id, f.chunk_index, f.content, f.embedding, JSON.stringify(f.metadata)]),
      ),
    );

    console.log(`  copied ${slug}: ${nSections} section(s), ${nVectors} vector(s), ${nFlat} flat row(s)` +
      (filled > 0 ? ` · filled unit_ordinal on ${filled} existing row(s)` : ''));
  }
  await q(dest, 'COMMIT');

  const destAfter = await censusOn(dest, 'DESTINATION census, AFTER');

  // The delta must equal what the source holds, per work. Anything else means rows were dropped
  // or duplicated, and the operator must see it as a failure, not read it out of two tables.
  // DERIVED from the census row, not hand-listed: a census column added without a matching
  // entry here would copy unverified — which is exactly what `topical_entries` would have
  // done on 2026-08-03, since every other count reconciles while the new table arrives
  // empty. `sources` is excluded because it is 1 by construction on both sides.
  let mismatch = 0;
  const COMPARED = Object.keys(before[slugs[0]] ?? {}).filter((k) => k !== 'sources');
  for (const slug of slugs) {
    for (const k of COMPARED) {
      const expected = before[slug][k];
      const got = destAfter[slug][k];
      if (got < expected) {
        console.error(`  ✗ ${slug}.${k}: destination has ${got}, source has ${expected}`);
        mismatch++;
      }
    }
  }

  fs.mkdirSync(evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(
    path.join(evidenceDir, `corpus-copy-${stamp}.json`),
    `${JSON.stringify({ source: hostOf(SRC), destination: hostOf(DEST), declaredEndpoint: destHost, slugs, before, destBefore, destAfter, mismatch }, null, 2)}\n`,
  );

  if (mismatch > 0) die(`\n✗ ${mismatch} count mismatch(es). The copy is INCOMPLETE — do not publish.`, 1);
  console.log(`\n✓ copied ${slugs.length} work(s), all counts match. They are STAGED. Publishing is a separate act (publish-flip.mjs).`);
} catch (e) {
  if (dest) await q(dest, 'ROLLBACK').catch(() => {});
  die(`\n✗ ${e.message}`, 1);
} finally {
  await q(src, 'ROLLBACK').catch(() => {});
  await src.end().catch(() => {});
  if (dest) await dest.end().catch(() => {});
}
