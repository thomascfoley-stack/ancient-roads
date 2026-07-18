// Part B2 (GO_LIVE_EXECUTION): remove the historicalchristian.faith-provenance
// Chrysostom/Augustine rows from the SERVED embeddings corpus, now that the clean
// NPNF/CCEL re-source (chrysostom-homilies / augustine-homilies) provides the
// replacement coverage. Fail-safe:
//   1. REFUSE unless the clean replacements are actually ingested (coverage guard).
//   2. BACK UP every removed row to a timestamped JSONL (recoverable — no hard
//      delete without a backup; the rows are also re-ingestable from CCEL).
//   3. DELETE the forbidden rows.
//   4. Verify the ratchet: 0 served rows with historicalchristian.faith provenance.
//
//   DATABASE_URL=<dev owner> NEON_BRANCH=dev npx tsx src/ingest/b2-remove-forbidden-provenance.ts [--apply]
//
// Default is a DRY RUN (counts + coverage, no delete). --apply performs the backup
// + delete. The LEGAL_CORPUS_FILTER need not change: the old author+verseId clauses
// simply match zero rows afterward, and the new coverage is served by the
// work-slug clause (chrysostom-homilies / augustine-homilies) already in the filter.

import pg from 'pg';
import { readFileSync, appendFileSync, mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';

const FORBIDDEN = '%historicalchristian.faith%';
const FORBIDDEN_RE = /historicalchristian\.faith/i;
const STATIC_DIR = 'web/public/commentaries';

// The forbidden provenance lives in the STATIC reader corpus too (e.g. Mat 5:
// 433 of 981 entries), and the FTS table is COPYed FROM these files — so the
// static sweep must run before the FTS regen. Same discipline: back up every
// removed entry, then rewrite the file shape-preservingly.
function sweepStatic(apply: boolean, backup: string): { files: number; removed: number } {
  let files = 0, removed = 0;
  if (!existsSync(STATIC_DIR)) return { files, removed };
  for (const book of readdirSync(STATIC_DIR)) {
    const dir = `${STATIC_DIR}/${book}`;
    let chapters: string[];
    try { chapters = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { continue; }
    for (const ch of chapters) {
      const path = `${dir}/${ch}`;
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const entries = (Array.isArray(raw) ? raw : (raw as { entries?: unknown[] }).entries) as Array<Record<string, unknown>> | undefined;
      if (!entries) continue;
      const bad = entries.filter((e) => FORBIDDEN_RE.test(String(e.sourceUrl ?? '')));
      if (bad.length === 0) continue;
      files++; removed += bad.length;
      if (apply) {
        for (const e of bad) appendFileSync(backup, JSON.stringify({ static: path, entry: e }) + '\n');
        const kept = entries.filter((e) => !FORBIDDEN_RE.test(String(e.sourceUrl ?? '')));
        writeFileSync(path, JSON.stringify(Array.isArray(raw) ? kept : { ...(raw as object), entries: kept }));
      }
    }
  }
  return { files, removed };
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

  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    // (1) coverage guard — the clean replacements must exist first
    const repl = await db.query<{ w: string; n: number }>(
      `SELECT metadata->>'work' w, count(*)::int n FROM embeddings
       WHERE metadata->>'work' IN ('chrysostom-homilies','augustine-homilies') GROUP BY 1`,
    );
    const replMap = new Map(repl.rows.map((r) => [r.w, r.n]));
    const cN = replMap.get('chrysostom-homilies') ?? 0, aN = replMap.get('augustine-homilies') ?? 0;
    console.log(`clean replacements: chrysostom-homilies=${cN}, augustine-homilies=${aN}`);

    // the forbidden rows to remove
    const forb = await db.query<{ author: string; n: number; books: string }>(
      `SELECT metadata->>'author' author, count(*)::int n,
              string_agg(DISTINCT ((metadata->>'verseId')::int/1000000)::text, ',') books
       FROM embeddings WHERE user_id IS NULL AND metadata->>'sourceUrl' ILIKE $1 GROUP BY 1`,
      [FORBIDDEN],
    );
    const totalForbidden = forb.rows.reduce((s, r) => s + r.n, 0);
    console.log('forbidden-provenance rows (served):');
    for (const r of forb.rows) console.log(`  ${r.author}: ${r.n} rows, books {${r.books}}`);
    console.log(`total: ${totalForbidden}`);

    // The DB and the STATIC reader corpus are independent stores — a clean DB
    // does NOT mean the static corpus is clean (A6 line-by-line 2026-07-17: the
    // early return on DB-clean skipped the static sweep entirely). Check static
    // ALWAYS, and only declare victory when BOTH are 0.
    const staticDry = sweepStatic(false, '');
    console.log(`static corpus: ${staticDry.removed} forbidden entries across ${staticDry.files} chapter files`);

    if (totalForbidden === 0 && staticDry.removed === 0) { console.log('✓ already clean — DB and static ratchet both 0'); return; }
    if ((totalForbidden > 0 || staticDry.removed > 0) && (cN === 0 || aN === 0)) {
      console.error('✗ REFUSE: a clean replacement is missing (chrysostom-homilies or augustine-homilies not ingested) — coverage would shrink. Ingest them first.');
      process.exit(1);
    }

    if (!apply) { console.log('\n(dry run — pass --apply to back up + delete)'); return; }

    // (2) back up, then (3) delete
    mkdirSync('data/quarantine', { recursive: true });
    const backup = `data/quarantine/historicalchristian-faith-removed-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    const rows = await db.query(`SELECT source_type, source_id, content, metadata FROM embeddings WHERE user_id IS NULL AND metadata->>'sourceUrl' ILIKE $1`, [FORBIDDEN]);
    for (const r of rows.rows) appendFileSync(backup, JSON.stringify(r) + '\n');
    console.log(`backed up ${rows.rows.length} rows → ${backup}`);
    const del = await db.query(`DELETE FROM embeddings WHERE user_id IS NULL AND metadata->>'sourceUrl' ILIKE $1`, [FORBIDDEN]);
    console.log(`deleted ${del.rowCount} forbidden-provenance rows`);

    // (3b) the static reader corpus (FTS regen must run after this)
    const swept = sweepStatic(true, backup);
    console.log(`static corpus: removed ${swept.removed} entries from ${swept.files} files (backed up)`);

    // (4) verify the ratchet — DB and static both
    const after = await db.query<{ n: number }>(`SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'sourceUrl' ILIKE $1`, [FORBIDDEN]);
    const remaining = after.rows[0]!.n;
    const staticAfter = sweepStatic(false, '');
    console.log(remaining === 0 && staticAfter.removed === 0
      ? '✓ RATCHET GREEN: 0 forbidden-provenance rows in served embeddings AND static corpus'
      : `✗ remaining: db=${remaining} static=${staticAfter.removed}`);
    if (remaining !== 0 || staticAfter.removed !== 0) process.exit(1);
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
