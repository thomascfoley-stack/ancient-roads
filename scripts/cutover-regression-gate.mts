#!/usr/bin/env npx tsx
// CUTOVER REGRESSION GATE — runs after EVERY chunk, not just at the end
// (docs/CUTOVER_DESIGN.md §"Regression gates"). Any pre-existing surface that
// regresses ABORTS the cutover; the orchestrator rolls that chunk back and does
// NOT fix forward.
//
//   CUTOVER_DATABASE_URL=<owner> CUTOVER_EXPECT_HOST=ep-odd-fog \
//     npx tsx scripts/cutover-regression-gate.mts --phase=E0 --capture
//   ... --phase=E1 | E2 | E3 | E4 | E6
//
// The five gates, mapped to the four surfaces the design names:
//   G1 user-data invariant   — the 37 rows (34 highlights / 6 users, 2 notes / 1
//                              user, 1 chat) captured at E0 and re-measured here.
//   G2 >=2 distinct voices   — the SERVED pool (real LEGAL_CORPUS_FILTER, imported
//                              from web/src/lib/teacher/routing.ts, never retyped)
//                              still yields >=2 distinct authors on known-good refs.
//   G3 reader tap-verse      — the static reader corpus AND commentary_entries both
//                              still return published commentary for those refs.
//   G4 annotation round-trip — highlights and notes LOAD, and the shipped write
//                              shapes (createHighlight / upsertNote's ON CONFLICT)
//                              still execute. Wrapped in BEGIN..ROLLBACK: proves the
//                              write path without leaving one row behind.
//   G5 register wall         — no song/verse or lane work is reachable through the
//                              exegetical serving predicates.
//   G6 forbidden ratchet     — monotone: never increases; 0 from E3 onward.
//
// HONEST LIMITS, stated so nobody reads this wider than it is:
//   - This is a DATABASE-level gate. It proves the served POOL can satisfy the
//     >=2-voices floor; it does not run compose->verify. The live HTTP probe is
//     opt-in (CUTOVER_ASK_URL) and only meaningful after E5, which is owner-gated.
//   - G4 rolls its writes back. It proves the statements are accepted by the
//     post-025/030 constraints and index arbiters; it does not prove a committed
//     write survives, because committing test rows into live user data is not
//     something a cutover gate gets to do.
import pg from 'pg';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  LEGAL_CORPUS_FILTER,
  EXEGETICAL_FTS_EXCLUSION,
  PROSE_TYPE_SQL,
  SERVED_PROSE_WORKS,
  SERVED_SONG_VERSE_WORKS,
  SERVED_LANE_WORKS,
} from '../web/src/lib/teacher/routing.ts';
import {
  PUBLISHED_WHOLE_BIBLE_AUTHORS,
  isPublishedCommentaryEntry,
} from '../web/src/lib/legal-corpus.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKPOINT = path.join(ROOT, '.cutover-checkpoint.json');

const argOf = (f: string) => process.argv.find((a) => a.startsWith(`--${f}=`))?.split('=')[1];
const PHASE = argOf('phase') ?? 'E0';
const CAPTURE = process.argv.includes('--capture');

// ── known-good references. Chosen because every one of them is covered by the
// UNCONSTRAINED legal authors (Gill / JFB / Clarke / Henry), so E3 (which removes
// only Chrysostom + Augustine rows) must NOT be able to drop any of them below the
// floor. If it does, that is the over-deletion this gate exists to catch.
const REFS = [
  { label: 'John 3:16', book: 43, chapter: 3, verse: 16, dir: 'jhn' },
  { label: 'Psalm 23:1', book: 19, chapter: 23, verse: 1, dir: 'psa' },
  { label: 'Romans 8:28', book: 45, chapter: 8, verse: 28, dir: 'rom' },
];
const verseId = (r: { book: number; chapter: number; verse: number }) =>
  r.book * 1_000_000 + r.chapter * 1_000 + r.verse;

const sqlList = (xs: readonly string[]) => xs.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
const NON_EXEGETICAL_SLUGS = [...SERVED_SONG_VERSE_WORKS, ...SERVED_LANE_WORKS];

interface Baseline {
  host?: string;
  userData?: Record<string, { rows: number; users: number }>;
  forbidden?: number;
}
interface Checkpoint { done: string[]; baseline: Record<string, unknown> & { regression?: Baseline } }

function loadCheckpoint(): Checkpoint {
  return existsSync(CHECKPOINT)
    ? (JSON.parse(readFileSync(CHECKPOINT, 'utf8')) as Checkpoint)
    : { done: [], baseline: {} };
}

const failures: string[] = [];
const fail = (gate: string, msg: string) => { failures.push(`${gate}: ${msg}`); console.error(`  ✗ ${gate} — ${msg}`); };
const pass = (gate: string, msg: string) => console.log(`  ✓ ${gate} — ${msg}`);

async function hasColumn(c: pg.Client, table: string, col: string): Promise<boolean> {
  const r = await c.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2) AS ok`,
    [table, col],
  );
  return r.rows[0]!.ok;
}

// ── G1 ────────────────────────────────────────────────────────────────────────
// The 37 user rows are the invariant across every chunk. Captured at E0 from the
// TARGET itself (never a literal from a doc) and re-measured identically here.
const USER_TABLES = ['highlights', 'notes', 'chats'] as const;

async function measureUserData(c: pg.Client): Promise<Record<string, { rows: number; users: number }>> {
  const out: Record<string, { rows: number; users: number }> = {};
  for (const t of USER_TABLES) {
    const exists = await c.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [t]);
    if (!exists.rows[0]!.ok) { out[t] = { rows: -1, users: -1 }; continue; }
    const r = await c.query<{ n: number; u: number }>(
      `SELECT count(*)::int AS n, count(DISTINCT user_id)::int AS u FROM ${t}`,
    );
    out[t] = { rows: r.rows[0]!.n, users: r.rows[0]!.u };
  }
  return out;
}

function g1(now: Record<string, { rows: number; users: number }>, base?: Record<string, { rows: number; users: number }>) {
  const shape = USER_TABLES.map((t) => `${t}=${now[t]!.rows}/${now[t]!.users}u`).join(' ');
  if (!base) { pass('G1 user-data', `baseline captured: ${shape}`); return; }
  for (const t of USER_TABLES) {
    const b = base[t], n = now[t]!;
    if (!b) continue;
    if (b.rows !== n.rows || b.users !== n.users) {
      fail('G1 user-data', `${t} moved ${b.rows}/${b.users}u -> ${n.rows}/${n.users}u — the user-row invariant broke`);
      return;
    }
  }
  pass('G1 user-data', `unchanged vs E0 baseline: ${shape}`);
}

// ── G2 ────────────────────────────────────────────────────────────────────────
async function g2(c: pg.Client) {
  for (const r of REFS) {
    const vid = verseId(r);
    const q = await c.query<{ voices: number; rows: number }>(
      `SELECT count(DISTINCT metadata->>'author')::int AS voices, count(*)::int AS rows
         FROM embeddings
        WHERE user_id IS NULL
          AND (metadata->>'verseId')::int = $1
          AND ${PROSE_TYPE_SQL}
          AND ${LEGAL_CORPUS_FILTER}`,
      [vid],
    );
    const { voices, rows } = q.rows[0]!;
    if (voices < 2) fail('G2 >=2 voices', `${r.label}: served pool has ${voices} distinct author(s) (${rows} rows) — below the floor`);
    else pass('G2 >=2 voices', `${r.label}: ${voices} distinct authors, ${rows} served rows`);
  }
}

// ── G3 ────────────────────────────────────────────────────────────────────────
async function g3(c: pg.Client) {
  // (a) the STATIC reader corpus — what the reader actually renders. Uses the
  // shipped isPublishedCommentaryEntry, not a re-implementation of it.
  for (const r of REFS) {
    const p = path.join(ROOT, 'web/public/commentaries', r.dir, `${r.chapter}.json`);
    if (!existsSync(p)) { fail('G3 reader/static', `${r.label}: ${p} missing — the reader would render an empty chapter`); continue; }
    const raw = JSON.parse(readFileSync(p, 'utf8')) as unknown;
    const entries = (Array.isArray(raw) ? raw : (raw as { entries?: unknown[] }).entries) as Array<Record<string, unknown>>;
    const onVerse = entries.filter((e) => Number(e.verseStart) <= r.verse && Number(e.verseEnd) >= r.verse);
    const published = onVerse.filter((e) => isPublishedCommentaryEntry({
      author: String(e.author), sourceUrl: e.sourceUrl as string | null, book: r.book, work: e.work as string | null,
    }));
    if (published.length === 0) fail('G3 reader/static', `${r.label}: tap-verse would open ZERO published commentaries`);
    else pass('G3 reader/static', `${r.label}: ${published.length} published entries on tap-verse`);
  }
  // (b) commentary_entries (the FTS/search read path). The `work` leg of the legal
  // predicate only exists from migration 019 — degrade rather than error before it,
  // so the gate is runnable at E0 on a pre-016 target.
  const hasWork = await hasColumn(c, 'commentary_entries', 'work');
  const predicate = hasWork
    ? `(author IN (${sqlList(PUBLISHED_WHOLE_BIBLE_AUTHORS)})
        OR (author = 'John Chrysostom' AND book IN (40,43,44))
        OR (author = 'Augustine of Hippo' AND book IN (19,43))
        OR work IN (${sqlList([...NON_EXEGETICAL_SLUGS, ...SERVED_PROSE_WORKS])}))`
    : `(author IN (${sqlList(PUBLISHED_WHOLE_BIBLE_AUTHORS)})
        OR (author = 'John Chrysostom' AND book IN (40,43,44))
        OR (author = 'Augustine of Hippo' AND book IN (19,43)))`;
  for (const r of REFS) {
    const q = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM commentary_entries
        WHERE book=$1 AND chapter=$2 AND verse_start<=$3 AND verse_end>=$3 AND ${predicate}`,
      [r.book, r.chapter, r.verse],
    );
    if (q.rows[0]!.n === 0) fail('G3 reader/db', `${r.label}: 0 legal commentary_entries`);
    else pass('G3 reader/db', `${r.label}: ${q.rows[0]!.n} legal commentary_entries${hasWork ? '' : ' (pre-019 predicate)'}`);
  }
}

// ── G4 ────────────────────────────────────────────────────────────────────────
// LOAD, then WRITE. The write half runs the SHIPPED statement shapes and is rolled
// back — a real exercise of the constraints/arbiters with zero residue.
async function g4(c: pg.Client) {
  for (const t of ['highlights', 'notes'] as const) {
    const r = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${t} WHERE deleted_at IS NULL`,
    );
    pass('G4 load', `${t}: ${r.rows[0]!.n} active rows load`);
  }
  const polymorphic = await hasColumn(c, 'notes', 'target_kind'); // migration 025
  const probeUser = `__cutover_probe__${randomUUID()}`;
  const vid = verseId(REFS[0]!);
  try {
    await c.query('BEGIN');
    await c.query(
      `INSERT INTO highlights (user_id, verse_id, color) VALUES ($1, $2, 'yellow')`,
      [probeUser, vid],
    );
    // upsertNote's exact ON CONFLICT shape. Post-025 it names target_kind, and the
    // partial unique index MUST still arbitrate or upsertNote breaks in production.
    const conflict = polymorphic
      ? `ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL AND target_kind = 'verse'`
      : `ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL`;
    await c.query(
      `INSERT INTO notes (user_id, verse_id, body) VALUES ($1, $2, 'cutover probe')
       ${conflict} DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
      [probeUser, vid],
    );
    // second insert must UPDATE, not raise — that is what proves the arbiter matched
    await c.query(
      `INSERT INTO notes (user_id, verse_id, body) VALUES ($1, $2, 'cutover probe 2')
       ${conflict} DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
      [probeUser, vid],
    );
    const n = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM notes WHERE user_id = $1`, [probeUser]);
    if (n.rows[0]!.n !== 1) fail('G4 write', `upsertNote produced ${n.rows[0]!.n} rows, expected exactly 1 (the partial index did not arbitrate)`);
    else pass('G4 write', `createHighlight + upsertNote(x2 -> 1 row) accepted${polymorphic ? ' under the 025/030 constraints' : ' (pre-025 schema)'}`);
  } catch (e) {
    fail('G4 write', `annotation write path threw: ${(e as Error).message}`);
  } finally {
    await c.query('ROLLBACK').catch(() => {});
  }
  // Check BOTH tables the probe writes — an earlier version queried only `notes`, so a
  // leaked `highlights` row would have gone uncounted.
  const residue = await c.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM notes      WHERE user_id LIKE '\\_\\_cutover\\_probe\\_\\_%')
          + (SELECT count(*) FROM highlights WHERE user_id LIKE '\\_\\_cutover\\_probe\\_\\_%') AS n`,
  );
  if (Number(residue.rows[0]!.n) !== 0) fail('G4 write', `probe left ${residue.rows[0]!.n} row(s) behind — ROLLBACK did not hold`);
  else pass('G4 write', 'rolled back clean, zero residue');

  // ── the E1→E5 window, surfaced (not vetoed) ────────────────────────────────
  // Between E1 and E5 the DEPLOYED build is still the pre-cutover one, and its
  // upsertNote issues `ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL`.
  // 025 replaces idx_notes_user_verse with a predicate that adds
  // `target_kind = 'verse'`, which the old predicate does not IMPLY — so Postgres
  // rejects the statement and note-saving on the live site fails until E5 ships the
  // matching code. This probe reports that window; it is a WARNING, not an abort,
  // because the ordering is the approved design's and closing it is an owner call.
  if (polymorphic && ['E1', 'E2', 'E3', 'E4'].includes(PHASE)) {
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO notes (user_id, verse_id, body) VALUES ($1, $2, 'pre-025 shape probe')
         ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL DO UPDATE SET body = EXCLUDED.body`,
        [`${probeUser}_legacy`, vid],
      );
      pass('G4 window', 'the pre-cutover build\'s upsertNote still executes against the new schema');
    } catch (e) {
      console.warn(`  ⚠ G4 window — the DEPLOYED (pre-025) upsertNote is REJECTED by the post-025 schema: ${(e as Error).message}`);
      console.warn('     Live note-saving is broken from E1 until E5 ships the matching code. Expected from the');
      console.warn('     approved E-step ordering; NOT an abort. Shorten the window or accept it — owner call.');
    } finally {
      await c.query('ROLLBACK').catch(() => {});
    }
  }
}

// ── G5 ────────────────────────────────────────────────────────────────────────
async function g5(c: pg.Client) {
  const leak = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM embeddings
      WHERE user_id IS NULL
        AND metadata->>'work' IN (${sqlList(NON_EXEGETICAL_SLUGS)})
        AND ${LEGAL_CORPUS_FILTER}`,
  );
  if (leak.rows[0]!.n > 0) fail('G5 register wall', `${leak.rows[0]!.n} song/verse or lane row(s) are reachable through the exegetical serving filter`);
  else pass('G5 register wall', 'no song/verse or lane work reachable through LEGAL_CORPUS_FILTER');

  // The FTS surface. THE SIGNAL MUST BE INDEPENDENT OF THE PREDICATE UNDER TEST.
  // The first version of this check asked for rows that are non-exegetical *by
  // register or slug* AND survive EXEGETICAL_FTS_EXCLUSION — but the exclusion is
  // exactly the negation of that same pair of tests, so the query was `P AND NOT P`
  // and returned 0 for any table contents, forever. That is precisely the tautology
  // the 2026-07-17 line-by-line already caught once in register-wall-check
  // ("register IN (hymn,poetry) AND register NOT IN (hymn,poetry) = 0 by
  // construction") and I reproduced it. A check that cannot fail is worse than none.
  //
  // The wall can only fail OPEN when a row is genuinely non-exegetical but BOTH
  // signals the exclusion reads are missing or wrong on it. So the detector needs a
  // third signal: the row's own source. `sources.source_type` is set by ingest,
  // independent of commentary_entries.register and of the routing slug lists, so a
  // slug rename or a NULL register cannot hide a leak from it.
  // HONEST LIMIT: this can only see rows whose `work` resolves to a source. On a
  // target where commentary_entries.work is entirely NULL it matches nothing — that
  // is vacuous, but it is not tautological: populate the column and it can fire.
  if (await hasColumn(c, 'commentary_entries', 'register')) {
    const fts = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM commentary_entries ce
         JOIN sources s ON s.slug = ce.work
        WHERE s.source_type IN ('hymn','poetry','sermon','theology','confession')
          AND ${EXEGETICAL_FTS_EXCLUSION}`,
    );
    if (fts.rows[0]!.n > 0) fail('G5 register wall', `${fts.rows[0]!.n} commentary_entries from a non-exegetical SOURCE survive EXEGETICAL_FTS_EXCLUSION`);
    else pass('G5 register wall', 'FTS exclusion holds against the independent sources.source_type signal');
  }
}

// ── G6 ────────────────────────────────────────────────────────────────────────
async function g6(c: pg.Client, base?: number): Promise<number> {
  const r = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM embeddings
      WHERE user_id IS NULL AND (metadata->>'sourceUrl' ILIKE '%biblehub%'
        OR metadata->>'sourceUrl' ILIKE '%studylight%' OR metadata->>'sourceUrl' ILIKE '%historicalchristian%')`,
  );
  const n = r.rows[0]!.n;
  if (base !== undefined && n > base) fail('G6 ratchet', `forbidden-provenance rows INCREASED ${base} -> ${n}`);
  else if (['E3', 'E4', 'E6'].includes(PHASE) && n !== 0) fail('G6 ratchet', `${n} forbidden-provenance rows remain at ${PHASE} (must be 0 from E3 on)`);
  else pass('G6 ratchet', `${n} forbidden-provenance rows${base !== undefined ? ` (baseline ${base}, monotone)` : ''}`);

  // ── the THIRD store the ratchet does not count ──────────────────────────────
  // E3 (b2-remove-forbidden-provenance) sweeps flat `embeddings` and the static
  // reader corpus. It does NOT touch `sources`/`sections`, where provenance lives
  // in sources.provenance->>'url'. Production carries `barnes-notes` there with a
  // biblehub URL and 1,300 sections, so a green ratchet is narrower than it reads.
  // ADR-029 addendum 2's rule — express a cross-store removal in EACH store's own
  // key — applies to a store the design did not enumerate. REPORTED always; a HARD
  // FAIL only if such a work is actually reachable (status='published' or in a
  // served slug set), because that would be a live licensing breach. Deleting the
  // staged rows is an owner call, not something a gate improvises mid-cutover.
  // Scan the WHOLE provenance object as text, not just `provenance->>'url'` — a source
  // that records its origin under any other key would otherwise yield NULL ILIKE ...
  // = NULL, drop out of the WHERE, and be reported as clean.
  const secStore = await c.query<{ slug: string; url: string; status: string; sections: number }>(
    `SELECT s.slug, coalesce(s.provenance->>'url', s.provenance::text) AS url, s.status, count(sec.id)::int AS sections
       FROM sources s LEFT JOIN sections sec ON sec.source_id = s.id
      WHERE s.provenance::text ILIKE '%biblehub%' OR s.provenance::text ILIKE '%studylight%'
         OR s.provenance::text ILIKE '%historicalchristian%'
      GROUP BY s.slug, s.provenance, s.status`,
  );
  // Reachability for the SECTIONS store specifically: a section is served only via the
  // reader's publish switch, which is `status='published'` or membership in the routing
  // slug sets. LEGAL_CORPUS_FILTER's author legs govern `embeddings`, NOT `sections`, so
  // they deliberately do not count here.
  // STATED PLAINLY so nobody reads this as a live gate: given today's manifest and prod
  // data, NOTHING sets status='published' (migrate-sections-slice writes 'staged') and
  // none of the affected slugs is in a SERVED_* list — so this fail() does not fire, by
  // construction. It exists to catch the day such a work IS published. The warning below
  // is the part that actually reports today's state.
  const servedSlugs = new Set<string>([...SERVED_PROSE_WORKS, ...NON_EXEGETICAL_SLUGS]);
  for (const row of secStore.rows) {
    const reachable = row.status === 'published' || servedSlugs.has(row.slug);
    if (reachable) fail('G6 sections-store', `${row.slug} is REACHABLE (status=${row.status}) with forbidden provenance ${row.url} and ${row.sections} sections`);
    else console.warn(`  ⚠ G6 sections-store — ${row.slug}: ${row.sections} sections carry forbidden provenance (${row.url}), status=${row.status}, not reachable via the reader's publish switch. E3's ratchet does not count this store. Standing debt — owner call.`);
  }
  if (secStore.rows.length === 0) pass('G6 sections-store', 'no forbidden provenance in sources/sections');
  return n;
}

// ── optional live probe (only meaningful after E5, which is owner-gated) ───────
async function liveAsk(url: string) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'What does John 3:16 mean?' }),
  });
  if (!res.ok) { fail('G7 live /ask', `HTTP ${res.status}`); return; }
  // The payload is `{ kind, response, retrieval } & LanePayloads` (teacher/teach.ts:18)
  // — authors live in `retrieval[].metadata.author`. An earlier version of this read a
  // `citations` field that does not exist anywhere in the response, so `voices.size`
  // was always 0 and enabling CUTOVER_ASK_URL would have guaranteed a FAILED E6 gate
  // immediately AFTER `vercel --prod` had already shipped — with the abort text telling
  // the operator to "roll back this chunk", the chunk being the live deploy.
  const body = (await res.json()) as { retrieval?: Array<{ metadata?: { author?: string } }> };
  const voices = new Set((body.retrieval ?? []).map((x) => x.metadata?.author).filter(Boolean));
  if (voices.size < 2) fail('G7 live /ask', `${voices.size} distinct voice(s) in retrieval — below the floor`);
  else pass('G7 live /ask', `${voices.size} distinct voices`);
}

// ──────────────────────────────────────────────────────────────────────────────
const url = process.env.CUTOVER_DATABASE_URL;
if (!url) { console.error('✗ CUTOVER_DATABASE_URL is unset'); process.exit(1); }
const host = new URL(url).host;
const expect = process.env.CUTOVER_EXPECT_HOST;
if (!expect) { console.error('✗ CUTOVER_EXPECT_HOST is unset — declare the target endpoint explicitly'); process.exit(1); }
if (!host.includes(expect)) { console.error(`✗ host ${host} is not the declared target '${expect}'`); process.exit(1); }

console.log(`\nREGRESSION GATE — phase ${PHASE}`);
console.log(`  target: ${host} (credentials redacted)`);

const cp = loadCheckpoint();
const stored: Baseline = cp.baseline.regression ?? {};
if (stored.host && stored.host !== host) {
  console.error(`✗ baseline in .cutover-checkpoint.json belongs to ${stored.host}, not ${host}. Refusing to compare across targets.`);
  process.exit(1);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const now = await measureUserData(c);
  g1(now, CAPTURE ? undefined : stored.userData);
  await g2(c);
  await g3(c);
  await g4(c);
  await g5(c);
  const forbidden = await g6(c, CAPTURE ? undefined : stored.forbidden);
  if (process.env.CUTOVER_ASK_URL) await liveAsk(process.env.CUTOVER_ASK_URL);

  if (CAPTURE) {
    cp.baseline.regression = { host, userData: now, forbidden };
    writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2));
    console.log('  baseline written to .cutover-checkpoint.json');
  }
} finally {
  await c.end();
}

if (failures.length > 0) {
  console.error(`\n✗ REGRESSION GATE FAILED at ${PHASE} (${failures.length} check(s))`);
  failures.forEach((f) => console.error(`    ${f}`));
  console.error('  ABORT the cutover and roll back this chunk. Do NOT fix forward mid-cutover.');
  process.exit(1);
}
console.log(`✓ REGRESSION GATE PASSED at ${PHASE}`);
