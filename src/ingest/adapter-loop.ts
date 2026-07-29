// The outer ingestion loop (INGESTION_LOOP.md). Sweeps the clean-tier queue in
// ingest/sources.config.json, dispatches each work to its adapter, and banks the
// result — resumable, with the circuit breakers. Clean PD/CC works auto-publish
// (owner-authorized, CONTENT_GO_LIVE decision 3); historians go 006-staged
// (serve:false); anything that fails a gate quarantines/escalates, never publishes.
//
//   DATABASE_URL=<dev owner> NEON_BRANCH=dev DEEPINFRA_API_KEY=<key> \
//     npx tsx src/ingest/adapter-loop.ts [--only=slug,slug] [--adapters=ccel,gutenberg] [--dry]
//
// Ranked queue: verse-anchored hymn/poetry flagships first (cheap, high-value,
// exercise the new register path), then prose (sermons/fathers/theology), then
// historians (staged). Resume: a work whose sources row already has embedded rows
// is skipped. Breakers: quarantine-rate >30% of ATTEMPTED halts; a run-level cap.

import pg from 'pg';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { acquireGutenberg } from './adapter-gutenberg.js';
import { acquireCcel } from './adapter-ccel.js';
import { assertDevBranch } from './register-writer.js';
import { SERVED_PROSE_WORKS, SERVED_SONG_VERSE_WORKS } from '../../web/src/lib/teacher/routing.js';

// A work is PUBLISHED (served) only if it is in the served allowlists — the same
// lists LEGAL_CORPUS_FILTER / SONG_VERSE_CORPUS_FILTER enforce. origen-commentary,
// thayers-lexicon, and the historians are deliberately absent → they land STAGED.
const SERVED = new Set<string>([...SERVED_PROSE_WORKS, ...SERVED_SONG_VERSE_WORKS]);

const RUN_LOG = 'data/ingest-run-log.jsonl';
const RANK = ['hymn', 'poetry', 'confession', 'lexicon', 'commentary', 'father', 'theology', 'sermon', 'historian'];

const arg = (f: string) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);

interface LogRow { at: string; slug: string; adapter: string; result: 'published' | 'staged' | 'skipped' | 'quarantined' | 'escalated'; units?: number; anchored?: number; embedded?: number; reason?: string }

// Resume-skip is INTEGRITY-aware. Register works write to `embeddings` + a
// sources row, NOT the 006 `sections` table — so the old sections-count integrity
// check could never fire for them (s=0 → always 'done'), classifying a crashed
// partial as complete (A6 line-by-line 2026-07-17). The load-bearing signal is
// sources.status: register-writer stamps 'ingesting' at the start and 'published'/
// 'staged' only AFTER the write succeeds — so status still 'ingesting' means a
// crashed mid-write, i.e. partial. The sections-count check still catches the
// 006 write-contract (historian) partials.
async function ingestState(db: pg.Client, slug: string): Promise<'done' | 'partial' | 'absent'> {
  const r = await db.query(
    `SELECT (SELECT count(*) FROM embeddings WHERE metadata->>'work'=$1)::int e,
            (SELECT count(*) FROM sections s JOIN sources src ON src.id=s.source_id WHERE src.slug=$1)::int s,
            (SELECT status FROM sources WHERE slug=$1) status`,
    [slug],
  );
  const e = r.rows[0].e as number, s = r.rows[0].s as number, status = r.rows[0].status as string | null;
  if (e === 0 && s === 0) return 'absent';
  if (status === 'ingesting') return 'partial'; // crashed mid-write (register path)
  if (s > 0 && e > 0 && e < s) return 'partial'; // 006 write-contract partial (historian path)
  return 'done';
}

async function main() {
  assertDevBranch(); // hard dev/test guard
  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const only = arg('--only')?.split(',');
  const adaptersFilter = arg('--adapters')?.split(',');
  const dry = process.argv.includes('--dry');

  // --skip: KNOWN quarantines (source problems already triaged + logged). They
  // are excluded from the queue so they don't re-trip the systematic-failure
  // breaker on every resume pass — the breaker is for UNKNOWN failure, not for
  // works a human has already dispositioned.
  const skip = new Set(arg('--skip')?.split(',') ?? []);
  let queue = manifest.filter((e) => {
    const acq = (e.provenance as Record<string, unknown> | undefined)?.['acquire'] as { adapter?: string } | undefined;
    if (!acq?.adapter) return false;
    // Historians ride the sections write-contract (ingest-historian: period/
    // gazetteer/verbatim rules), NOT the register embeddings store — the
    // embeddings source_type CHECK rejects them by design.
    if ((e.source_type as string) === 'historian') return false;
    if (skip.has(e.slug as string)) return false;
    if (only && !only.includes(e.slug as string)) return false;
    if (adaptersFilter && !adaptersFilter.includes(acq.adapter)) return false;
    return true;
  });
  // skip the josephus dupe (v2 josephus-whiston already staged)
  queue = queue.filter((e) => e.slug !== 'josephus-works');
  queue.sort((a, b) => RANK.indexOf(a.source_type as string) - RANK.indexOf(b.source_type as string));

  // The shared client lives for HOURS across a bulk sweep — a Neon compute
  // restart kills it ("Connection terminated unexpectedly", 2026-07-17, which
  // orphaned the prose tier mid-sweep and briefly left the endpoint read-only).
  // reconnect() + one retry per work makes the sweep survive restarts; the
  // work that died mid-write is safe to retry (deleteWork-then-write).
  let db = new pg.Client({ connectionString: (assertDevBranch().dbUrl), ssl: { rejectUnauthorized: false } });
  await db.connect();
  const reconnect = async () => {
    try { await db.end(); } catch { /* already dead */ }
    db = new pg.Client({ connectionString: (assertDevBranch().dbUrl), ssl: { rejectUnauthorized: false } });
    await db.connect();
  };
  const isTransient = (e: unknown) =>
    /terminated|ECONNRESET|ETIMEDOUT|read-only|Connection ended|server closed/i.test(e instanceof Error ? e.message : String(e));
  mkdirSync('data', { recursive: true });
  const log = (row: LogRow) => { appendFileSync(RUN_LOG, JSON.stringify(row) + '\n'); console.log(`  [${row.result}] ${row.slug} ${row.units ?? ''}${row.embedded ? `/${row.embedded}emb` : ''} ${row.reason ?? ''}`); };

  let attempted = 0, quarantined = 0;
  try {
    for (const entry of queue) {
      const slug = entry.slug as string;
      const acq = (entry.provenance as Record<string, unknown>)['acquire'] as { adapter: string };
      let state: Awaited<ReturnType<typeof ingestState>>;
      try { state = await ingestState(db, slug); }
      catch (e) {
        if (!isTransient(e)) throw e;
        console.log('  ⟳ transient connection error on state check — reconnecting');
        await reconnect();
        state = await ingestState(db, slug);
      }
      // --force (with --only) re-ingests named done works; --force-all re-ingests
      // EVERY queued work — the corpus-repair mode after a parser fix (A6
      // 2026-07-17: the newline-fusion re-ingest). Safe either way:
      // register-writer deleteWork-then-write fully replaces prior rows.
      const force = process.argv.includes('--force-all') || (process.argv.includes('--force') && only?.includes(slug));
      if (state === 'done' && !force) { log({ at: new Date().toISOString(), slug, adapter: acq.adapter, result: 'skipped', reason: 'already ingested' }); continue; }
      if (state === 'partial') console.log(`  ↻ ${slug} partially ingested — re-running to complete (ON CONFLICT fills gaps)`);
      if (dry) { console.log(`  would run ${acq.adapter}: ${slug} (${entry.source_type})`); continue; }

      attempted++;
      const publish = SERVED.has(slug);
      const runWork = async (): Promise<void> => {
        if (acq.adapter === 'gutenberg') {
          const r = await acquireGutenberg(entry, { write: true, publish });
          log({ at: new Date().toISOString(), slug, adapter: 'gutenberg', result: publish ? 'published' : 'staged', units: r.sections, anchored: r.anchored, embedded: r.embedded });
        } else if (acq.adapter === 'ccel') {
          const r = await acquireCcel(entry, { write: true, publish });
          if (r.skipped) { quarantined++; log({ at: new Date().toISOString(), slug, adapter: 'ccel', result: 'quarantined', reason: r.reason }); }
          else log({ at: new Date().toISOString(), slug, adapter: 'ccel', result: publish ? 'published' : 'staged', units: r.units, anchored: r.anchored, embedded: r.embedded });
        } else {
          log({ at: new Date().toISOString(), slug, adapter: acq.adapter, result: 'escalated', reason: `adapter "${acq.adapter}" not run by this loop (sword/helloao/archive/github have separate paths)` });
        }
      };
      try {
        await runWork();
      } catch (e) {
        if (isTransient(e)) {
          console.log(`  ⟳ transient connection error on ${slug} — reconnecting + retrying once`);
          await reconnect();
          try { await runWork(); }
          catch (e2) { quarantined++; log({ at: new Date().toISOString(), slug, adapter: acq.adapter, result: 'quarantined', reason: `retry failed: ${(e2 as Error).message.slice(0, 180)}` }); }
        } else {
          quarantined++;
          log({ at: new Date().toISOString(), slug, adapter: acq.adapter, result: 'quarantined', reason: (e as Error).message.slice(0, 200) });
        }
      }

      // breaker: quarantine-rate > 30% of attempted (min 4 attempts)
      if (attempted >= 4 && quarantined / attempted > 0.3) {
        console.error(`\n⛔ BREAKER: quarantine rate ${quarantined}/${attempted} > 30% — halting. Investigate before resuming.`);
        break;
      }
    }
  } finally {
    await db.end();
  }
  console.log(`\nloop done: ${attempted} attempted, ${quarantined} quarantined.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
