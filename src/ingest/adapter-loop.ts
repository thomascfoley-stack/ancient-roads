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

async function alreadyIngested(db: pg.Client, slug: string): Promise<boolean> {
  const r = await db.query(
    `SELECT (SELECT count(*) FROM embeddings WHERE metadata->>'work'=$1)::int e,
            (SELECT count(*) FROM sections s JOIN sources src ON src.id=s.source_id WHERE src.slug=$1)::int s`,
    [slug],
  );
  return (r.rows[0].e as number) > 0 || (r.rows[0].s as number) > 0;
}

async function main() {
  assertDevBranch(); // hard dev/test guard
  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const only = arg('--only')?.split(',');
  const adaptersFilter = arg('--adapters')?.split(',');
  const dry = process.argv.includes('--dry');

  let queue = manifest.filter((e) => {
    const acq = (e.provenance as Record<string, unknown> | undefined)?.['acquire'] as { adapter?: string } | undefined;
    if (!acq?.adapter) return false;
    if (only && !only.includes(e.slug as string)) return false;
    if (adaptersFilter && !adaptersFilter.includes(acq.adapter)) return false;
    return true;
  });
  // skip the josephus dupe (v2 josephus-whiston already staged)
  queue = queue.filter((e) => e.slug !== 'josephus-works');
  queue.sort((a, b) => RANK.indexOf(a.source_type as string) - RANK.indexOf(b.source_type as string));

  const db = new pg.Client({ connectionString: (assertDevBranch().dbUrl), ssl: { rejectUnauthorized: false } });
  await db.connect();
  mkdirSync('data', { recursive: true });
  const log = (row: LogRow) => { appendFileSync(RUN_LOG, JSON.stringify(row) + '\n'); console.log(`  [${row.result}] ${row.slug} ${row.units ?? ''}${row.embedded ? `/${row.embedded}emb` : ''} ${row.reason ?? ''}`); };

  let attempted = 0, quarantined = 0;
  try {
    for (const entry of queue) {
      const slug = entry.slug as string;
      const acq = (entry.provenance as Record<string, unknown>)['acquire'] as { adapter: string };
      if (await alreadyIngested(db, slug)) { log({ at: new Date().toISOString(), slug, adapter: acq.adapter, result: 'skipped', reason: 'already ingested' }); continue; }
      if (dry) { console.log(`  would run ${acq.adapter}: ${slug} (${entry.source_type})`); continue; }

      attempted++;
      const publish = SERVED.has(slug);
      try {
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
      } catch (e) {
        quarantined++;
        log({ at: new Date().toISOString(), slug, adapter: acq.adapter, result: 'quarantined', reason: (e as Error).message.slice(0, 200) });
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
