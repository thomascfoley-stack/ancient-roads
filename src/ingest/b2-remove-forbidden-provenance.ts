// Part B2 (GO_LIVE_EXECUTION), WIDENED for blocker 7: remove EVERY forbidden-
// aggregator-provenance row from BOTH served stores — the DB `embeddings` corpus
// AND the static reader corpus `web/public/commentaries` — not just the
// historicalchristian.faith case this script originally handled.
//
// The forbidden set is the SINGLE canonical list in src/ingest/license-manifest.ts
// (biblehub.com, studylight.org, historicalchristian.faith), matched with the SAME
// host-aware predicate (`forbiddenProvenanceDomain`) the pre-deploy ratchet and the
// QA suite use — so this script removes EXACTLY what the ratchet counts, no more,
// no less. (The historicalchristian.faith Chrysostom/Augustine rows are re-sourced
// from clean NPNF/CCEL; the biblehub authors are re-sourced from CrossWire or held
// in quarantine per the owner's "HOLD all 14" ruling — see regen-crosswire-static.)
//
// Fail-safe discipline (unchanged):
//   1. COVERAGE GUARD — REFUSE to delete if removal would leave any (book,chapter)
//      cell with ZERO clean (non-forbidden) served commentary. Domain-agnostic:
//      it checks actual per-cell coverage, not the presence of two specific slugs.
//   2. BACK UP every removed row to a timestamped JSONL before deleting (no hard
//      delete without a backup; the rows are also re-ingestable from the clean source).
//   3. DELETE the forbidden rows (DB by exact id; static by shape-preserving rewrite).
//   4. Verify the ratchet: 0 forbidden-provenance rows in BOTH stores.
//
//   DATABASE_URL=<dev owner> NEON_BRANCH=dev npx tsx src/ingest/b2-remove-forbidden-provenance.ts [--apply]
//
// Default is a DRY RUN (counts + coverage, no delete). --apply performs the backup
// + delete + static sweep.

import pg from 'pg';
import { readFileSync, appendFileSync, mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { forbiddenProvenanceDomain, FORBIDDEN_PROVENANCE_DOMAINS } from './license-manifest';

const STATIC_DIR = 'web/public/commentaries';
// Coarse SQL pre-filter for every forbidden domain; the exact host-aware
// `forbiddenProvenanceDomain` re-check in JS is what actually decides removal.
const LIKE_PATTERNS = FORBIDDEN_PROVENANCE_DOMAINS.map((d) => `%${d}%`);

// The forbidden provenance lives in the STATIC reader corpus too, and the FTS table
// is COPYed FROM these files — so the static sweep must run before the FTS regen.
// Same discipline: back up every removed entry, then rewrite the file shape-preservingly.
// Uses the SAME predicate as the ratchet counter, so a green ratchet means a clean sweep.
function sweepStatic(apply: boolean, backup: string): { files: number; removed: number; byDomain: Map<string, number> } {
  let files = 0, removed = 0;
  const byDomain = new Map<string, number>();
  if (!existsSync(STATIC_DIR)) return { files, removed, byDomain };
  for (const book of readdirSync(STATIC_DIR)) {
    const dir = `${STATIC_DIR}/${book}`;
    let chapters: string[];
    try { chapters = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { continue; }
    for (const ch of chapters) {
      const path = `${dir}/${ch}`;
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const entries = (Array.isArray(raw) ? raw : (raw as { entries?: unknown[] }).entries) as Array<Record<string, unknown>> | undefined;
      if (!entries) continue;
      const bad = entries.filter((e) => forbiddenProvenanceDomain(String(e.sourceUrl ?? '')) !== null);
      if (bad.length === 0) continue;
      files++; removed += bad.length;
      for (const e of bad) {
        const d = forbiddenProvenanceDomain(String(e.sourceUrl ?? '')) ?? 'unknown';
        byDomain.set(d, (byDomain.get(d) ?? 0) + 1);
      }
      if (apply) {
        for (const e of bad) appendFileSync(backup, JSON.stringify({ static: path, entry: e }) + '\n');
        const kept = entries.filter((e) => forbiddenProvenanceDomain(String(e.sourceUrl ?? '')) === null);
        writeFileSync(path, JSON.stringify(Array.isArray(raw) ? kept : { ...(raw as object), entries: kept }));
      }
    }
  }
  return { files, removed, byDomain };
}
const arg = (f: string) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dbUrl = (localEnv('DATABASE_URL') ?? '').replace(/^"|"$/g, '');
  const branch = process.env.DATABASE_URL ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  if (branch !== 'dev' && branch !== 'test') throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" must be dev|test`);
  // The branch label is self-attested — also require a known non-prod endpoint.
  // Part C runs this against prod DELIBERATELY: that run must set B2_ALLOW_PROD=1
  // (the conscious-override friction is the design).
  if (!/ep-tiny-hat|localhost|127\.0\.0\.1/.test(dbUrl) && process.env.B2_ALLOW_PROD !== '1') {
    throw new Error('STOP: DATABASE_URL is not the dev endpoint (ep-tiny-hat). For the deliberate Part C prod run, set B2_ALLOW_PROD=1.');
  }
  void arg;

  console.log(`forbidden domains (canonical, license-manifest): ${FORBIDDEN_PROVENANCE_DOMAINS.join(', ')}`);

  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    // ---- (A) enumerate the forbidden served DB rows (coarse pre-filter, exact re-check) ----
    const cand = await db.query<{ id: string; source_type: string; source_id: string; content: string; metadata: Record<string, unknown> }>(
      `SELECT id, source_type, source_id, content, metadata FROM embeddings
       WHERE user_id IS NULL AND metadata->>'sourceUrl' ILIKE ANY($1)`,
      [LIKE_PATTERNS],
    );
    const forbiddenRows = cand.rows.filter((r) => forbiddenProvenanceDomain(r.metadata?.sourceUrl) !== null);
    const dbByDomain = new Map<string, number>();
    const dbByAuthor = new Map<string, number>();
    for (const r of forbiddenRows) {
      const dom = forbiddenProvenanceDomain(r.metadata?.sourceUrl)!;
      dbByDomain.set(dom, (dbByDomain.get(dom) ?? 0) + 1);
      const a = String(r.metadata?.author ?? '(unknown)');
      dbByAuthor.set(a, (dbByAuthor.get(a) ?? 0) + 1);
    }
    const totalForbidden = forbiddenRows.length;
    console.log('\nforbidden-provenance rows in DB `embeddings` (served, user_id IS NULL):');
    for (const [d, n] of [...dbByDomain].sort((a, b) => b[1] - a[1])) console.log(`  [${d}] ${n}`);
    for (const [a, n] of [...dbByAuthor].sort((a, b) => b[1] - a[1])) console.log(`    - ${a}: ${n}`);
    console.log(`  DB total: ${totalForbidden}`);

    // ---- (B) the STATIC reader corpus (independent store — check ALWAYS) ----
    const staticDry = sweepStatic(false, '');
    console.log(`\nforbidden-provenance entries in STATIC corpus (${STATIC_DIR}): ${staticDry.removed} across ${staticDry.files} chapter files`);
    for (const [d, n] of [...staticDry.byDomain].sort((a, b) => b[1] - a[1])) console.log(`  [${d}] ${n}`);

    if (totalForbidden === 0 && staticDry.removed === 0) {
      console.log('\n✓ already clean — DB and static ratchet both 0');
      return;
    }

    // ---- (C) COVERAGE GUARD (domain-agnostic) — no (book,chapter) cell may lose ALL
    // clean commentary. `forb` = cells that have a forbidden served row; `clean` =
    // cells that have a non-forbidden served row. A forb cell absent from clean is a gap. ----
    const gap = await db.query<{ book: number; chapter: number }>(
      `WITH forb AS (
         SELECT DISTINCT (metadata->>'verseId')::int/1000000 AS book, ((metadata->>'verseId')::int/1000)%1000 AS chapter
         FROM embeddings WHERE user_id IS NULL AND metadata ? 'verseId' AND metadata->>'sourceUrl' ILIKE ANY($1)
       ),
       clean AS (
         SELECT DISTINCT (metadata->>'verseId')::int/1000000 AS book, ((metadata->>'verseId')::int/1000)%1000 AS chapter
         FROM embeddings WHERE user_id IS NULL AND metadata ? 'verseId' AND NOT (metadata->>'sourceUrl' ILIKE ANY($1))
       )
       SELECT f.book, f.chapter FROM forb f LEFT JOIN clean c USING (book, chapter)
       WHERE c.book IS NULL ORDER BY f.book, f.chapter`,
      [LIKE_PATTERNS],
    );
    if (gap.rows.length > 0) {
      console.error(`\n✗ REFUSE (coverage gap): ${gap.rows.length} (book,chapter) cell(s) would lose ALL commentary with no clean replacement:`);
      for (const g of gap.rows.slice(0, 50)) console.error(`    book ${g.book} chapter ${g.chapter}`);
      if (gap.rows.length > 50) console.error(`    …and ${gap.rows.length - 50} more`);
      console.error('  ESCALATE — re-source clean editions for these cells before removing. NOT applying.');
      process.exit(1);
    }
    console.log('\n✓ coverage guard: 0 (book,chapter) cells would be emptied — every forbidden cell retains clean commentary.');

    if (!apply) {
      console.log('\n(dry run — pass --apply to back up + delete DB rows + sweep static)');
      return;
    }

    // ---- (D) back up, then delete (DB by exact id), then sweep static ----
    mkdirSync('data/quarantine', { recursive: true });
    const backup = `data/quarantine/forbidden-provenance-removed-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    for (const r of forbiddenRows) {
      appendFileSync(backup, JSON.stringify({ store: 'embeddings', id: r.id, source_type: r.source_type, source_id: r.source_id, content: r.content, metadata: r.metadata }) + '\n');
    }
    console.log(`\nbacked up ${forbiddenRows.length} DB rows → ${backup}`);
    const ids = forbiddenRows.map((r) => r.id);
    const del = await db.query(`DELETE FROM embeddings WHERE id = ANY($1::uuid[])`, [ids]);
    console.log(`deleted ${del.rowCount} forbidden-provenance rows from DB embeddings`);

    // static reader corpus (FTS regen, if any, must run after this)
    const swept = sweepStatic(true, backup);
    console.log(`static corpus: removed ${swept.removed} entries from ${swept.files} files (backed up to same JSONL)`);

    // ---- (E) verify the ratchet — DB and static both 0 ----
    const afterCand = await db.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM embeddings WHERE user_id IS NULL AND metadata->>'sourceUrl' ILIKE ANY($1)`,
      [LIKE_PATTERNS],
    );
    const remaining = afterCand.rows.filter((r) => forbiddenProvenanceDomain(r.metadata?.sourceUrl) !== null).length;
    const staticAfter = sweepStatic(false, '');
    console.log(
      remaining === 0 && staticAfter.removed === 0
        ? '\n✓ RATCHET GREEN: 0 forbidden-provenance rows in served embeddings AND static corpus'
        : `\n✗ remaining: db=${remaining} static=${staticAfter.removed}`,
    );
    if (remaining !== 0 || staticAfter.removed !== 0) process.exit(1);
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
