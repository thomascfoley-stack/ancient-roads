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
const COPIED_TABLES = ['sources', 'sections', 'section_anchors', 'section_embeddings', 'section_history_anchors', 'embeddings'];

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
        `anchors=${String(r.anchors).padStart(7)} vectors=${String(r.section_embeddings).padStart(7)} flat=${String(r.flat_embeddings).padStart(7)}`,
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
    const sections = (await q(src, 'SELECT id, ordinal, heading, body FROM sections WHERE source_id = $1 ORDER BY ordinal', [s.id])).rows;
    for (const sec of sections) {
      await q(
        dest,
        `INSERT INTO sections (source_id, ordinal, heading, body) VALUES ($1,$2,$3,$4)
         ON CONFLICT (source_id, ordinal) DO NOTHING`,
        [destSourceId, sec.ordinal, sec.heading, sec.body],
      );
    }
    const destByOrdinal = new Map(
      (await q(dest, 'SELECT id, ordinal FROM sections WHERE source_id = $1', [destSourceId])).rows.map((r) => [r.ordinal, r.id]),
    );
    const idMap = new Map(sections.map((sec) => [String(sec.id), destByOrdinal.get(sec.ordinal)]).filter(([, v]) => v != null));

    // 3-5. the children, remapped.
    for (const a of (await q(src, 'SELECT section_id, verse_id_start, verse_id_end FROM section_anchors WHERE section_id = ANY($1::bigint[])', [sections.map((x) => x.id)])).rows) {
      const to = idMap.get(String(a.section_id));
      if (to == null) continue;
      await q(dest, `INSERT INTO section_anchors (section_id, verse_id_start, verse_id_end) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [to, a.verse_id_start, a.verse_id_end]);
    }
    for (const e of (await q(src, 'SELECT section_id, model_slug, embedding FROM section_embeddings WHERE section_id = ANY($1::bigint[])', [sections.map((x) => x.id)])).rows) {
      const to = idMap.get(String(e.section_id));
      if (to == null) continue;
      // The vector is passed through VERBATIM. Reuse is the entire point: the text is
      // byte-identical, so the vector remains valid and no re-embedding is paid for or risked.
      await q(dest, `INSERT INTO section_embeddings (section_id, model_slug, embedding) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [to, e.model_slug, e.embedding]);
    }
    for (const h of (await q(src, 'SELECT section_id, kind, entity_slug, entity_label FROM section_history_anchors WHERE section_id = ANY($1::bigint[])', [sections.map((x) => x.id)])).rows) {
      const to = idMap.get(String(h.section_id));
      if (to == null) continue;
      await q(dest, `INSERT INTO section_history_anchors (section_id, kind, entity_slug, entity_label) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [to, h.kind, h.entity_slug, h.entity_label]);
    }

    // 6. the flat retrieval store. `user_id IS NULL` is the corpus/user boundary and is in the
    //    READ, so user rows are never even fetched, let alone written.
    const flat = (await q(src, `SELECT source_type, source_id, chunk_index, content, embedding, metadata FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1`, [slug])).rows;
    for (const f of flat) {
      await q(
        dest,
        `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
         VALUES (NULL,$1,$2,$3,$4,$5,$6) ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING`,
        [f.source_type, f.source_id, f.chunk_index, f.content, f.embedding, f.metadata],
      );
    }
    console.log(`  copied ${slug}: ${sections.length} section(s), ${flat.length} flat row(s)`);
  }
  await q(dest, 'COMMIT');

  const destAfter = await censusOn(dest, 'DESTINATION census, AFTER');

  // The delta must equal what the source holds, per work. Anything else means rows were dropped
  // or duplicated, and the operator must see it as a failure, not read it out of two tables.
  let mismatch = 0;
  for (const slug of slugs) {
    for (const k of ['sections', 'anchors', 'section_embeddings', 'flat_embeddings']) {
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
