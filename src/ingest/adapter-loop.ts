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
// is skipped. Breakers (INGESTION_LOOP.md §4, loop-breakers.ts): quarantine-rate
// and consecutive-failure HALT; staged-backlog and budget PAUSE — every trip
// writes its reason and the run emits a publish digest + escalation list
// (loop-digest.ts → docs/evidence/ingest-runs/). Failures are classified to
// decision-tree codes; an unmapped code is the novel-fork stop and escalates.

import pg from 'pg';
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { acquireGutenberg } from './adapter-gutenberg.js';
import { acquireCcel } from './adapter-ccel.js';
import { assertDevBranch } from './register-writer.js';
import { SERVED_PROSE_WORKS, SERVED_SONG_VERSE_WORKS } from '../../web/src/lib/teacher/routing.js';
import { checkBreakers, classifyFailure, KNOWN_FAILURE_CODES, DEFAULT_BREAKERS } from './loop-breakers.js';
import { buildDigest, digestMarkdown, type DigestRow } from './loop-digest.js';

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
//
// Vector coverage counts BOTH embedding planes (LAUNCH_BLOCKERS #14). The corpus
// is dual-read during the sources/sections migration: live retrieval reads flat
// `embeddings` (teacher/routing, related-voices), newer works carry one vector
// per section in `section_embeddings` (Gate A --target=sections requires 1:1
// sections↔section_embeddings). There is no per-work model-of-record column, so
// the vector count is the GREATEST of the two planes' coverage — complete when
// EITHER plane covers every section, partial when neither does. Checking only
// the flat table misclassified both ways on prod: 668 sections-plane works with
// e=0 fell through to 'done' with zero vectors anywhere, and openbible-topics
// (6711 sections, 6711 section_embeddings, flat short by 41) read 'partial'.
export async function ingestState(db: pg.Client, slug: string): Promise<'done' | 'partial' | 'absent'> {
  const r = await db.query(
    `SELECT (SELECT count(*) FROM embeddings WHERE metadata->>'work'=$1)::int e,
            (SELECT count(*) FROM section_embeddings se
               JOIN sections s ON s.id = se.section_id
               JOIN sources src ON src.id = s.source_id
              WHERE src.slug = $1)::int se,
            (SELECT count(*) FROM sections s JOIN sources src ON src.id=s.source_id WHERE src.slug=$1)::int s,
            (SELECT status FROM sources WHERE slug=$1) status`,
    [slug],
  );
  const e = r.rows[0].e as number, se = r.rows[0].se as number, s = r.rows[0].s as number, status = r.rows[0].status as string | null;
  if (e === 0 && se === 0 && s === 0) return 'absent';
  if (status === 'ingesting') return 'partial'; // crashed mid-write (register path)
  const vectors = Math.max(e, se); // the plane that covers this work best is its vector of record
  if (s > 0 && vectors < s) return 'partial'; // sections exist but their vectors don't (either plane)
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
    // D2: a quarantined work is never queued. The adapters also refuse at their mouths;
    // this keeps it out of the attempt count and the breaker maths in the first place.
    if (typeof e.quarantine === 'string' && (e.quarantine as string).trim()) return false;
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

  // ── breaker + digest state (INGESTION_LOOP.md §2/§4) ──────────────────────
  const startedAt = new Date();
  const digestRows: DigestRow[] = [];
  let stagedThisRun = 0;
  const recentCodes: string[] = [];
  let outcome: 'queue-empty' | 'paused' | 'halted' = 'queue-empty';
  let outcomeReason: string | undefined;
  let rateLimited = false;
  // --staged-cap / --max-attempts / --max-hours override the defaults; the
  // consecutive-failure and quarantine-rate limits are design constants.
  const breakerCfg = {
    ...DEFAULT_BREAKERS,
    stagedCap: Number(arg('--staged-cap') ?? DEFAULT_BREAKERS.stagedCap),
    maxAttempts: Number(arg('--max-attempts') ?? 0),
    maxElapsedMs: Number(arg('--max-hours') ?? 6) * 60 * 60 * 1000,
  };
  // A failure whose code the decision tree covers quarantines the work; a code
  // it does NOT cover is the novel-fork stop — escalate, never invent a fix.
  const failWork = (slug: string, adapter: string, sourceType: string, message: string) => {
    const code = classifyFailure(message);
    // The budget/rate breaker (design §4): an exhausted provider 429 pauses
    // the RUN — the work is innocent and is deferred, never quarantined.
    if (code === 'embed-429') {
      rateLimited = true;
      const reason = 'embed-429: provider rate-limited — deferred, NOT quarantined';
      log({ at: new Date().toISOString(), slug, adapter, result: 'skipped', reason });
      digestRows.push({ slug, adapter, sourceType, result: 'skipped', code, reason });
      return;
    }
    const known = (KNOWN_FAILURE_CODES as readonly string[]).includes(code);
    if (known) { quarantined++; recentCodes.push(code); }
    const result = known ? 'quarantined' as const : 'escalated' as const;
    const reason = `${code}: ${message.slice(0, 180)}`;
    log({ at: new Date().toISOString(), slug, adapter, result, reason });
    digestRows.push({ slug, adapter, sourceType, result, code, reason });
  };

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
      const sourceType = entry.source_type as string;
      const banked = (result: 'published' | 'staged', units: number, anchored: number, embedded: number) => {
        stagedThisRun++;
        log({ at: new Date().toISOString(), slug, adapter: acq.adapter, result, units, anchored, embedded });
        digestRows.push({ slug, adapter: acq.adapter, sourceType, result, units, anchored, embedded });
      };
      const runWork = async (): Promise<void> => {
        if (acq.adapter === 'gutenberg') {
          const r = await acquireGutenberg(entry, { write: true, publish });
          banked(publish ? 'published' : 'staged', r.sections, r.anchored, r.embedded);
        } else if (acq.adapter === 'ccel') {
          const r = await acquireCcel(entry, { write: true, publish });
          if (r.skipped) failWork(slug, 'ccel', sourceType, r.reason ?? 'adapter skip, no reason');
          else banked(publish ? 'published' : 'staged', r.units, r.anchored, r.embedded);
        } else {
          log({ at: new Date().toISOString(), slug, adapter: acq.adapter, result: 'escalated', reason: `adapter "${acq.adapter}" not run by this loop (sword/helloao/archive/github have separate paths)` });
          digestRows.push({ slug, adapter: acq.adapter, sourceType, result: 'escalated', reason: `adapter "${acq.adapter}" not run by this loop` });
        }
      };
      try {
        await runWork();
      } catch (e) {
        if (isTransient(e)) {
          console.log(`  ⟳ transient connection error on ${slug} — reconnecting + retrying once`);
          await reconnect();
          try { await runWork(); }
          catch (e2) { failWork(slug, acq.adapter, sourceType, `retry failed: ${(e2 as Error).message}`); }
        } else {
          failWork(slug, acq.adapter, sourceType, (e as Error).message);
        }
      }

      // ── the circuit breakers (INGESTION_LOOP.md §4): the loop stops itself ──
      const trip = checkBreakers(
        { attempted, quarantined, stagedThisRun, recentCodes, elapsedMs: Date.now() - startedAt.getTime(), rateLimited },
        breakerCfg,
      );
      if (trip) {
        outcome = trip.action === 'halt' ? 'halted' : 'paused';
        outcomeReason = `${trip.breaker}: ${trip.reason}`;
        console.error(`\n${trip.action === 'halt' ? '⛔ BREAKER HALT' : '⏸ BREAKER PAUSE'}: ${outcomeReason}`);
        break;
      }
    }
  } finally {
    await db.end();
  }

  // ── the digest (INGESTION_LOOP.md §2/§8): the batched unit of owner review ──
  const digest = buildDigest(digestRows, {
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    outcome,
    outcomeReason,
  });
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const digestDir = 'docs/evidence/ingest-runs';
  mkdirSync(digestDir, { recursive: true });
  writeFileSync(`${digestDir}/digest-${stamp}.json`, JSON.stringify(digest, null, 2));
  writeFileSync(`${digestDir}/digest-${stamp}.md`, digestMarkdown(digest));
  console.log(`\nloop ${outcome}${outcomeReason ? ` (${outcomeReason})` : ''}: ${attempted} attempted, ${stagedThisRun} staged/published, ${quarantined} quarantined.`);
  console.log(`digest: ${digestDir}/digest-${stamp}.md`);
  if (outcome === 'halted') process.exitCode = 1;
}

// Runnable loop when invoked directly; importable (ingestState) from tests —
// same guard pattern as check-corpus-coverage.ts.
if (process.argv[1] && /adapter-loop/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
