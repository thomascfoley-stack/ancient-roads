#!/usr/bin/env npx tsx
// CUTOVER REGRESSION GATE — runs after EVERY chunk, not just at the end
// (docs/CUTOVER_DESIGN.md §"Regression gates"). Any pre-existing surface that
// regresses ABORTS the cutover; the orchestrator rolls that chunk back and does
// NOT fix forward.
//
//   CUTOVER_DATABASE_URL=<owner> CUTOVER_EXPECT_HOST=ep-odd-fog \
//     npx tsx scripts/cutover-regression-gate.mts --phase=E0 --capture
//   ... --phase=E1 | E2 | E4 | E6      (there is no E3 — see cutover.mjs)
//
// The gates, mapped to the surfaces the design names:
//   G1 user-data invariant   — a per-table md5 DIGEST over ordered rows, the ACTIVE
//                              row count and the OWNER DISTRIBUTION, captured at E0
//                              and re-measured here. NOT count(*): three seeded
//                              corruptions passed the count-only version green
//                              (scripts/lib/user-data-invariant.mjs).
//   G2 >=2 distinct voices   — CORPUS-WIDE. Every verse in the served pool, one
//                              GROUP BY: how many meet the >=2-distinct-authors
//                              floor and how many have any voice at all, compared
//                              against the E0 reading. The old version sampled 3
//                              verses of 22,794 and its own comment said they had
//                              been chosen to be immune to the step it guarded.
//   G3 reader tap-verse      — the static reader corpus AND commentary_entries both
//                              still return published commentary for known-good refs.
//   G4 annotation round-trip — the SHIPPED load query returns the baseline number of
//                              active rows, and the shipped write shapes
//                              (createHighlight / upsertNote's ON CONFLICT) still
//                              execute. Wrapped in BEGIN..ROLLBACK: proves the write
//                              path without leaving one row behind.
//   G5 register wall         — no song/verse or lane work is reachable through the
//                              exegetical serving predicates.
//   G6 forbidden ratchet     — MONOTONE: never increases against the E0 reading.
//                              It is NOT "0 from E3 onward" any more: E3 is dropped
//                              from the cutover, so those rows stay by design and
//                              their cleanup is a later slice.
//   G7 live /ask             — the ONLY leg that touches the deployed app. Opt-in via
//                              CUTOVER_ASK_URL (+ CUTOVER_ASK_COOKIE, which must carry a
//                              logged-in SESSION, not just the site_gate cookie — /api/ask
//                              is authed-only). When unset the gate prints an explicit
//                              LIVE PROBE NOT RUN line and stamps the final verdict
//                              DB-ONLY, so a green gate can never be misread as end-to-end.
//   G8 sections integrity    — sections <-> section_embeddings: zero orphans always, and
//                              the unembedded count RATCHETED against E0. E4's own
//                              postcondition compares sections to the FLAT pool; nothing
//                              had ever compared them to their vectors, so a slice that
//                              wrote text and dropped the embedding half was green
//                              everywhere. Non-vacuous: zero sections is a failure.
//   G9 constraints reject    — the negative half of G4. The annotation CHECKs really
//                              refuse the shapes 025/030 forbid, verified by SQLSTATE
//                              23514 AND the constraint NAME (a bare catch counts a
//                              dropped connection as proof). Includes the one probe that
//                              distinguishes 030 from 025, and a positive twin so the
//                              rejections are attributable. See g9() for why the
//                              target_kind whitelists can only be checked in the catalog.
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
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { hostOf, declaredMatches } from './lib/target-guard.mjs';
import { loadCheckpoint, saveCheckpoint, OWNERSHIP_ERROR } from './lib/checkpoint.mjs';
import type { CheckpointFile } from './lib/checkpoint.d.mts';
import {
  USER_TABLES, measureSql, ownersSql, ABSENT, userShape, diffUserData,
} from './lib/user-data-invariant.mjs';
import type { UserDataMeasure } from './lib/user-data-invariant.d.mts';
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
// Overridable so the DESTRUCTIVE seeded-defect proof can use its own file. It captures a
// baseline before seeding, and that write went into the real cutover's checkpoint — the only
// record of a live run's restore-point branch id and step ledger.
const CHECKPOINT = process.env.CUTOVER_CHECKPOINT ?? path.join(ROOT, '.cutover-checkpoint.json');

const argOf = (f: string) => process.argv.find((a) => a.startsWith(`--${f}=`))?.split('=')[1];
const PHASE = argOf('phase') ?? 'E0';
const CAPTURE = process.argv.includes('--capture');

// ── known-good references, used by G3 (the reader) and as G2's named spot check.
// These are a SPOT CHECK ONLY. They are covered by the unconstrained legal authors
// (Gill / JFB / Clarke / Henry) and are therefore among the hardest verses in the
// corpus to break — which is exactly why G2's real leg is corpus-wide and these
// three are no longer allowed to stand in for it.
const REFS = [
  { label: 'John 3:16', book: 43, chapter: 3, verse: 16, dir: 'jhn' },
  { label: 'Psalm 23:1', book: 19, chapter: 23, verse: 1, dir: 'psa' },
  { label: 'Romans 8:28', book: 45, chapter: 8, verse: 28, dir: 'rom' },
  // John 10:11 — the project's standing known-good ("good shepherd" → John 10, not
  // Luke 2; CLAUDE.md §accuracy). Added because it is the ref the E6 work order names
  // and because, unlike the three above, it is served in part through the
  // `metadata->>'work'` leg of LEGAL_CORPUS_FILTER (catena-aurea) — the leg E2
  // populates. The other three are carried by the four unconstrained authors alone, so
  // a total E2 failure leaves them untouched and they cannot see it.
  { label: 'John 10:11', book: 43, chapter: 10, verse: 11, dir: 'jhn' },
];
const verseId = (r: { book: number; chapter: number; verse: number }) =>
  r.book * 1_000_000 + r.chapter * 1_000 + r.verse;

const sqlList = (xs: readonly string[]) => xs.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
const NON_EXEGETICAL_SLUGS = [...SERVED_SONG_VERSE_WORKS, ...SERVED_LANE_WORKS];

interface VoiceFloor {
  anyVoice: number; floor: number;
  // Optional: a baseline written by an earlier revision of this gate has neither field.
  // Compare only when both sides carry it, rather than treating `undefined` as zero and
  // manufacturing a pass.
  cleanAnyVoice?: number; cleanFloor?: number;
}
interface Baseline {
  host?: string;
  userData?: UserDataMeasure;
  forbidden?: number;
  voices?: VoiceFloor;
  sections?: SectionIntegrity;
  laneRows?: number;   // G5's denominator, ratcheted (never phase-hardcoded)
  labeled?: number;    // rows carrying any metadata->>'work' key — the leg E2 populates
}
type Checkpoint = CheckpointFile & { baseline: Record<string, unknown> & { regression?: Baseline } };

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
// The user rows are the invariant across every chunk. Captured at E0 from the TARGET
// itself (never a literal from a doc) and re-measured identically here. The property
// measured is the DIGEST + ACTIVE COUNT + OWNER DISTRIBUTION, not count(*) — see
// scripts/lib/user-data-invariant.mjs for the three seeded corruptions that count(*)
// waved through.
async function measureUserData(c: pg.Client): Promise<UserDataMeasure> {
  const out: UserDataMeasure = {};
  for (const t of USER_TABLES) {
    const exists = await c.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [t]);
    if (!exists.rows[0]!.ok) { out[t] = { ...ABSENT }; continue; }
    const m = await c.query<{ rows: number; users: number; active: number; digest: string }>(measureSql(t));
    const o = await c.query<{ owner: string; n: number }>(ownersSql(t));
    out[t] = { ...m.rows[0]!, owners: Object.fromEntries(o.rows.map((r) => [r.owner, r.n])) };
  }
  return out;
}

function g1(now: UserDataMeasure, base?: UserDataMeasure) {
  const shape = userShape(now);
  if (!base) {
    // Even at capture there is something to assert. But "nothing to protect" and "the
    // instrument is not connected" are DIFFERENT states and used to collapse into one:
    // ABSENT is recorded as rows = -1 (user-data-invariant.mjs), and `Math.max(0, -1)` is
    // 0, so a target with MISSING tables and a target with EMPTY tables both summed to 0
    // and both were failed.
    //
    // That is now a cutover-blocking bug, because prod's user tables were deliberately
    // CLEARED on 2026-07-28 (owner decision). E0 runs the gate with --capture BEFORE the
    // owner gate and before the first write, and a fail there aborts the whole cutover —
    // so the gate would refuse to start against the exact state production is in, for the
    // reason that production is in it. It also killed the seeded-defect proof, which now
    // captures a baseline of its own before seeding.
    //
    // The right split: tables PRESENT but empty IS a usable baseline. The digest, the
    // active count and the owner distribution are all still comparable, and what they then
    // assert is "nothing was ADDED or altered" — which is precisely the guard that protects
    // the FIRST REAL USER. It is vacuous about preservation and must say so loudly, but it
    // is not broken. Tables MISSING is a broken instrument and still fails.
    const missing = USER_TABLES.filter((t) => (now[t]?.digest ?? 'ABSENT') === 'ABSENT');
    const rows = USER_TABLES.reduce((s, t) => s + Math.max(0, now[t]?.rows ?? 0), 0);
    if (missing.length === USER_TABLES.length) {
      fail('G1 user-data', `every user table is ABSENT on this target (${shape}) — this is not an empty database, it is the wrong one or a pre-migration schema. Nothing below can be compared.`);
    } else if (missing.length > 0) {
      fail('G1 user-data', `${missing.length} of ${USER_TABLES.length} user table(s) are ABSENT (${missing.join(', ')}) — a partial schema. Baseline refused: ${shape}`);
    } else if (rows === 0) {
      console.warn(`  ⚠ G1 user-data — baseline captured but EMPTY (${shape}). Every user table EXISTS and holds zero rows.`);
      console.warn('     This is the expected post-2026-07-28 production state (owner cleared the test data), NOT a fault.');
      console.warn('     What the invariant still proves from here: that nothing is ADDED, altered or mis-owned across');
      console.warn('     the cutover — the guard that protects the first real user. What it CANNOT prove on this target:');
      console.warn('     that anything was PRESERVED, because there is nothing to preserve. Read every later');
      console.warn('     "user data unchanged" line as 0 == 0.');
      pass('G1 user-data', `baseline captured (empty but present): ${shape}`);
    } else pass('G1 user-data', `baseline captured: ${shape}`);
    return;
  }
  const moved = diffUserData(base, now);
  if (moved.length > 0) fail('G1 user-data', `the user-data invariant broke — ${moved.join('; ')}`);
  else pass('G1 user-data', `unchanged vs E0 baseline (rows/active/owners/digest): ${shape}`);
}

// ── G2 ────────────────────────────────────────────────────────────────────────
// CORPUS-WIDE, not a sample. One GROUP BY over the served exegetical pool: for every
// verse, how many DISTINCT authors serve it. Two numbers come out — verses with any
// served voice, and verses meeting the >=2-distinct-authors floor — and both are
// compared against the E0 reading. An absolute threshold would not do: the floor is a
// property of this corpus at this moment, and what the cutover must not do is LOWER it.
// FORBIDDEN PROVENANCE, as a SQL predicate. One definition, used by the ratchet (G6) and by
// the durable-floor leg below, so the two can never drift into disagreeing about what
// "forbidden" means.
// NULL-SAFE ON PURPOSE, and this is not cosmetic. `metadata->>'sourceUrl'` is NULL for
// 74,234 of 420,974 flat rows on dev. Written the obvious way, the negation
// `NOT (x ILIKE '%a%' OR x ILIKE '%b%')` evaluates to NULL for every one of them, NULL is
// not TRUE, and so each is dropped from the WHERE clause of the "clean" measurement —
// silently, with no error and no zero to notice. The durable-floor leg below read 8,938
// verses on dev while the headline floor read 24,296, on a target whose forbidden count is
// ZERO: with no forbidden rows the two numbers must be IDENTICAL, and a 15,358-verse gap
// was the bug announcing itself. coalesce() to '' so the predicate is total, and the
// invariant `forbidden == 0 => durable == headline` becomes a self-check anyone can rerun.
const FORBIDDEN_PROVENANCE_SQL =
  `(coalesce(metadata->>'sourceUrl','') ILIKE '%biblehub%'
    OR coalesce(metadata->>'sourceUrl','') ILIKE '%studylight%'
    OR coalesce(metadata->>'sourceUrl','') ILIKE '%historicalchristian%')`;

// --print-predicates: emit the routing-derived SQL this gate measures with, as JSON, and
// exit. It exists so scripts/cutover-gate-redproof.mjs — which is plain .mjs and therefore
// cannot import routing.ts — can seed its defects against the SAME predicates the gate
// asserts on, instead of hand-copying them. A seeded defect aimed at a different population
// than the check measures is a proof that cannot fire, which is exactly what happened to the
// durable-floor case. This runs BEFORE any target guard or DB connection: it touches nothing.
if (process.argv.includes('--print-predicates')) {
  process.stdout.write(JSON.stringify({
    prose: PROSE_TYPE_SQL,
    legal: LEGAL_CORPUS_FILTER,
    forbidden: FORBIDDEN_PROVENANCE_SQL,
  }));
  process.exit(0);
}

async function measureVoiceFloor(c: pg.Client): Promise<VoiceFloor> {
  const q = await c.query<{ any_voice: number; floor: number }>(
    // `any_voice` filters on voices >= 1, NOT count(*). count(DISTINCT author) ignores NULLs
    // while the outer count(*) counts the group regardless, and LEGAL_CORPUS_FILTER's last
    // disjunct admits rows on the work key alone with no author requirement — so a verse
    // whose only served rows carry a NULL author counted as "has a voice" while having
    // nothing attributable. The product guarantee is ATTRIBUTION; measure that.
    `SELECT count(*) FILTER (WHERE voices >= 1)::int AS any_voice, count(*) FILTER (WHERE voices >= 2)::int AS floor
       FROM (SELECT (metadata->>'verseId')::int AS vid,
                    count(DISTINCT metadata->>'author') AS voices
               FROM embeddings
              WHERE user_id IS NULL
                AND metadata->>'verseId' ~ '^[0-9]+$'
                AND ${PROSE_TYPE_SQL}
                AND ${LEGAL_CORPUS_FILTER}
              GROUP BY 1) t`);
  // THE DURABLE FLOOR. The measurement above counts rows that the deferred
  // provenance-cleanup slice will DELETE (71,884 of them on prod). A floor that depends on
  // them is a floor with an expiry date, and the ADR-030 correction is the record of what
  // happens when that is not measured: E3 as designed would have dropped 580 verses below
  // the >=2-author floor and left 24 with no voice at all, and nothing in the cutover
  // measured that until it was asked for directly. This second number is what the corpus
  // can still promise AFTER the cleanup. It is REPORTED at every phase and ratcheted like
  // the first — never allowed to decrease — so the cutover cannot quietly spend it.
  const clean = await c.query<{ any_voice: number; floor: number }>(
    `SELECT count(*) FILTER (WHERE voices >= 1)::int AS any_voice, count(*) FILTER (WHERE voices >= 2)::int AS floor
       FROM (SELECT (metadata->>'verseId')::int AS vid,
                    count(DISTINCT metadata->>'author') AS voices
               FROM embeddings
              WHERE user_id IS NULL
                AND metadata->>'verseId' ~ '^[0-9]+$'
                AND ${PROSE_TYPE_SQL}
                AND ${LEGAL_CORPUS_FILTER}
                AND NOT ${FORBIDDEN_PROVENANCE_SQL}
              GROUP BY 1) t`);
  return {
    anyVoice: q.rows[0]!.any_voice, floor: q.rows[0]!.floor,
    cleanAnyVoice: clean.rows[0]!.any_voice, cleanFloor: clean.rows[0]!.floor,
  };
}

async function g2(c: pg.Client, base?: VoiceFloor, baseLabeled?: number): Promise<{ voices: VoiceFloor; labeled: number }> {
  const now = await measureVoiceFloor(c);
  if (!base) {
    // Positive control at capture: a measurement of zero is a broken instrument, and a
    // broken instrument that reports green is the failure mode this whole round closes.
    if (now.floor === 0) fail('G2 >=2 voices', `corpus-wide baseline is 0 verses at the floor (${now.anyVoice} with any voice) — the measurement is broken or the target is empty`);
    else pass('G2 >=2 voices', `corpus-wide baseline: ${now.floor} verses meet the >=2-distinct-authors floor, ${now.anyVoice} have any served voice`);
    if (now.cleanFloor === 0) fail('G2 durable floor', `baseline is 0 verses at the floor once forbidden-provenance rows are excluded — nothing survives the deferred cleanup slice`);
    else pass('G2 durable floor', `baseline EXCLUDING forbidden provenance: ${now.cleanFloor} verses at the floor, ${now.cleanAnyVoice} with any voice (what remains after the deferred cleanup)`);
  } else {
    if (now.floor < base.floor) fail('G2 >=2 voices', `${base.floor - now.floor} verse(s) DROPPED BELOW the >=2-distinct-authors floor (${base.floor} -> ${now.floor}) — this is the product's headline guarantee`);
    else if (now.anyVoice < base.anyVoice) fail('G2 >=2 voices', `${base.anyVoice - now.anyVoice} verse(s) LOST EVERY served voice (${base.anyVoice} -> ${now.anyVoice})`);
    else pass('G2 >=2 voices', `corpus-wide: ${now.floor} verses at the floor (E0 ${base.floor}), ${now.anyVoice} with any voice (E0 ${base.anyVoice})`);
    // Ratchet the durable floor too, but only against a baseline that actually recorded it.
    if (base.cleanFloor === undefined || now.cleanFloor === undefined) {
      console.warn('  ⚠ G2 durable floor — the E0 baseline predates this measurement, so it is REPORTED, not compared. Re-capture at E0 to make it a gate.');
      console.warn(`     now: ${now.cleanFloor ?? 'n/a'} verses at the floor excluding forbidden provenance`);
    } else if (now.cleanFloor < base.cleanFloor) {
      fail('G2 durable floor', `${base.cleanFloor - now.cleanFloor} verse(s) dropped below the >=2-author floor among rows that SURVIVE the deferred provenance cleanup (${base.cleanFloor} -> ${now.cleanFloor}). The headline number may still look fine; this is the one that will still be true afterwards.`);
    } else if (now.cleanAnyVoice! < base.cleanAnyVoice!) {
      fail('G2 durable floor', `${base.cleanAnyVoice! - now.cleanAnyVoice!} verse(s) lost every non-forbidden-provenance voice (${base.cleanAnyVoice} -> ${now.cleanAnyVoice})`);
    } else pass('G2 durable floor', `excluding forbidden provenance: ${now.cleanFloor} at the floor (E0 ${base.cleanFloor}), ${now.cleanAnyVoice} with any voice (E0 ${base.cleanAnyVoice})`);
  }
  // ── THE `work` LEG — the one E2 populates, and the one nothing asserted ──────
  // LEGAL_CORPUS_FILTER admits rows five ways; four are author-name legs that E2 never
  // touches, and the fifth is `metadata->>'work' IN (SERVED_PROSE_WORKS)`. That fifth leg
  // is 41,444 rows on dev (keil-delitzsch, chrysostom-homilies, catena-aurea,
  // augustine-homilies) and carries 2 of the 11 served authors — the two no name leg covers.
  //
  // Nothing above can see it fail. The corpus-wide ratchet cannot: pre-E2 `work` is NULL on
  // 100% of rows, so the leg contributes ZERO to the E0 baseline, and a totally failed E2
  // leaves `now == base` and passes. The spot checks cannot either: John 10:11 is served by
  // Gill, Clarke and JFB as well, so losing catena-aurea takes it 6 authors -> 5 and the
  // `>= 2` floor never notices. E2's own postcondition guards the step, but the GATE — the
  // thing that runs after every chunk and is supposed to be independent of the step — was
  // structurally blind to it. That is the same shape as the defect that sank the previous
  // attempt at this gate, arrived at from the other direction.
  const workLeg = await c.query<{ rows: number; authors: number; works: number; labeled: number }>(
    `SELECT count(*) FILTER (WHERE metadata->>'work' IN (${sqlList(SERVED_PROSE_WORKS)}))::int AS rows,
            count(DISTINCT metadata->>'author') FILTER (WHERE metadata->>'work' IN (${sqlList(SERVED_PROSE_WORKS)}))::int AS authors,
            count(DISTINCT metadata->>'work')   FILTER (WHERE metadata->>'work' IN (${sqlList(SERVED_PROSE_WORKS)}))::int AS works,
            count(*) FILTER (WHERE metadata->>'work' IS NOT NULL)::int AS labeled
       FROM embeddings
      WHERE user_id IS NULL AND ${PROSE_TYPE_SQL}`);
  const wl = workLeg.rows[0]!;
  // WHAT IS ASSERTED, and why it is `labeled` rather than the exegetical slugs.
  // E2 labels only the manifest entries with `backfill.match_author`; of the four
  // SERVED_PROSE_WORKS only keil-delitzsch is among them, so requiring all four (or even
  // one) after E2 would false-red on a target that legitimately has none — the same trap
  // that made the G5 rule above wrong. What E2 unambiguously DOES do is take rows whose
  // `work` is NULL and give them one. So the falsifiable, target-derived assertion is:
  //   - `labeled` (any work key at all) may never DECREASE, and
  //   - from E2 onward it must be NON-ZERO, because E2 doing literally nothing is the one
  //     unambiguous failure and it is what the census state (100% NULL) would leave behind.
  // Both hold on prod, on dev, and on a fork, without knowing the manifest.
  if (wl.labeled === 0 && ['E2', 'E4', 'E5', 'E6'].includes(PHASE)) {
    fail('G2 work leg', `at ${PHASE}, ZERO rows in the served pool carry ANY metadata->>'work' key. E2's whole job is to write that key, so it wrote nothing — and every author the work leg of LEGAL_CORPUS_FILTER admits (2 of the 11 served) is silently absent from /ask.`);
  } else if (baseLabeled !== undefined && wl.labeled < baseLabeled) {
    fail('G2 work leg', `rows carrying a metadata->>'work' key DECREASED ${baseLabeled} -> ${wl.labeled}. Nothing in this cutover removes work keys; ${baseLabeled - wl.labeled} row(s) dropped out of the leg E2 populates.`);
  } else if (wl.labeled === 0) {
    console.warn(`  ⚠ G2 work leg — 0 rows carry any metadata->>'work' key at ${PHASE}. Expected before E2 (the census found this true of 190,635 of 190,635 prod rows); it is a hard failure from E2 on.`);
  } else {
    pass('G2 work leg', `${wl.labeled} row(s) carry a work key${baseLabeled !== undefined ? ` (E0 ${baseLabeled}, not decreased)` : ''}; ${wl.rows} of them are admitted by the exegetical work leg across ${wl.works}/${SERVED_PROSE_WORKS.length} slug(s), ${wl.authors} author(s)`);
    if (wl.rows === 0) console.warn(`  ⚠ G2 work leg — none of the ${SERVED_PROSE_WORKS.length} exegetical work slug(s) (${SERVED_PROSE_WORKS.join(', ')}) is present, so the 2 authors only that leg admits are not served here. Not an abort: E2 does not create those slugs (they come from the register ingest, which has never run on prod).`);
  }

  // SELF-CHECK on the durable floor. If NOTHING carries forbidden provenance, the two
  // floors are measuring the same set and MUST agree. A mismatch means the exclusion
  // predicate is wrong — which is exactly how the NULL-safety bug in
  // FORBIDDEN_PROVENANCE_SQL was found (0 forbidden rows, floors 24,296 vs 8,938). This
  // makes that class of error self-announcing instead of plausible-looking.
  const forbNow = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM embeddings WHERE user_id IS NULL AND ${FORBIDDEN_PROVENANCE_SQL}`);
  if (forbNow.rows[0]!.n === 0 && (now.cleanFloor !== now.floor || now.cleanAnyVoice !== now.anyVoice)) {
    fail('G2 durable floor', `no row on this target carries forbidden provenance, yet the durable floor (${now.cleanFloor}/${now.cleanAnyVoice}) differs from the headline floor (${now.floor}/${now.anyVoice}). The two are measuring the same set, so the exclusion predicate is dropping rows it should keep — almost certainly a NULL-handling bug.`);
  }

  // The named spot check stays, clearly labelled as a spot check — it is the design's
  // "known-good query", and it is NOT what makes this gate falsifiable.
  for (const r of REFS) {
    const q = await c.query<{ voices: number; rows: number }>(
      `SELECT count(DISTINCT metadata->>'author')::int AS voices, count(*)::int AS rows
         FROM embeddings
        WHERE user_id IS NULL
          AND (metadata->>'verseId')::int = $1
          AND ${PROSE_TYPE_SQL}
          AND ${LEGAL_CORPUS_FILTER}`,
      [verseId(r)],
    );
    const { voices, rows } = q.rows[0]!;
    if (voices < 2) fail('G2 spot check', `${r.label}: served pool has ${voices} distinct author(s) (${rows} rows) — below the floor`);
    else pass('G2 spot check', `${r.label}: ${voices} distinct authors, ${rows} served rows`);
  }
  return { voices: now, labeled: wl.labeled };
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
// The SHIPPED load statements (web/src/lib/annotations.ts getChapterAnnotations),
// column list and all, with the per-user/per-chapter predicate widened to the whole
// table. Retyping the column list is deliberate here and is the point: if a migration
// drops or renames background_color / text_color / span_start / span_end / translation,
// THIS query errors and the gate goes red, where a `count(*)` would sail through.
const LOAD_SQL: Record<string, string> = {
  highlights: `SELECT id, verse_id, verse_end, coalesce(background_color, color) AS color,
                      text_color, span_start, span_end, translation
                 FROM highlights WHERE deleted_at IS NULL ORDER BY created_at`,
  notes: `SELECT id, verse_id, verse_end, body, updated_at
            FROM notes WHERE deleted_at IS NULL ORDER BY verse_id`,
};

async function g4(c: pg.Client, base?: UserDataMeasure) {
  // LOAD — an assertion, not a print. This leg used to be `pass()` with no comparison,
  // so seeded state printed "✓ G4 load — 0 active rows load" and the gate passed.
  for (const t of ['highlights', 'notes'] as const) {
    let n: number;
    try { n = (await c.query(LOAD_SQL[t]!)).rowCount ?? -1; }
    catch (e) { fail('G4 load', `${t}: the SHIPPED load query no longer executes: ${(e as Error).message}`); continue; }
    const want = base?.[t]?.active;
    if (want === undefined) pass('G4 load', `${t}: shipped load query returns ${n} active row(s) (baseline capture)`);
    else if (n !== want) fail('G4 load', `${t}: shipped load query returns ${n} active row(s), E0 baseline was ${want} — the rows a user would actually see changed`);
    else pass('G4 load', `${t}: shipped load query returns ${n} active row(s), unchanged vs E0`);
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
async function g5(c: pg.Client, phase: string, baseLaneRows?: number): Promise<number> {
  // NON-VACUITY FIRST. "0 lane rows leak" is the same sentence whether the wall is holding
  // or whether no lane work exists to leak — and on a pre-E2 target NOTHING carries a
  // `work` key at all (the prod census: 190,635 of 190,635 rows have
  // metadata->>'work' IS NULL), so this check is 0-of-0 by construction until E2 runs.
  // Measure the population the wall is supposed to be holding back and SAY which case
  // this is, rather than printing a pass that means two different things.
  const pop = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM embeddings
      WHERE user_id IS NULL AND metadata->>'work' IN (${sqlList(NON_EXEGETICAL_SLUGS)})`);
  const laneRows = pop.rows[0]!.n;
  const leak = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM embeddings
      WHERE user_id IS NULL
        AND metadata->>'work' IN (${sqlList(NON_EXEGETICAL_SLUGS)})
        AND ${LEGAL_CORPUS_FILTER}`,
  );
  if (leak.rows[0]!.n > 0) fail('G5 register wall', `${leak.rows[0]!.n} song/verse or lane row(s) are reachable through the exegetical serving filter`);
  else if (laneRows === 0) {
    // VACUOUS, AND THAT IS LEGITIMATE HERE — a warning, never a failure.
    //
    // The first version of this failed the gate from E2 onward, reasoning "after E2 the
    // labels must exist". That reasoning was wrong and would have ABORTED A CORRECT PROD
    // CUTOVER at E2, E4 and E6. E2 runs scripts/register-label-embeddings.mjs, which labels
    // only the manifest entries carrying `backfill.match_author` — Gill, Henry, JFB, Clarke,
    // Barnes, Keil-Delitzsch and the crosswire/TCP set. NOT ONE of them is in
    // SERVED_SONG_VERSE_WORKS or SERVED_LANE_WORKS. The hymn/poetry/sermon/theology rows
    // came from the register ingest, which (census, 2026-07-23) has never run on production
    // and is not part of this cutover. So on prod `laneRows` is 0 before E2 and still 0
    // after it, forever, by design — and a gate that fails on the target's designed state
    // is a gate the operator learns to override.
    //
    // Phase-hardcoded vacuity rules are the trap. The falsifiable version is the RATCHET
    // below: whatever population this target has, it may not shrink.
    console.warn(`  ⚠ G5 register wall — VACUOUS at ${phase}: 0 rows carry any of the ${NON_EXEGETICAL_SLUGS.length} song/verse or lane slugs, so "no leak" is 0-of-0 and proves nothing on this target. Expected on production, which has never had the register ingest. On dev this number is large; if it is 0 THERE, something removed the labels.`);
  } else pass('G5 register wall', `no leak: 0 of ${laneRows} song/verse or lane row(s) are reachable through LEGAL_CORPUS_FILTER`);
  // The falsifiable leg: the lane population may never DECREASE against E0. That works on
  // every target — it is 0 >= 0 on prod (vacuous but honest) and a real assertion on any
  // target that actually carries lane rows.
  if (baseLaneRows !== undefined && laneRows < baseLaneRows) {
    fail('G5 register wall', `the song/verse + lane population SHRANK ${baseLaneRows} -> ${laneRows}: ${baseLaneRows - laneRows} row(s) lost their register slug. Those works stop being served by their lane pools, and the wall silently stops being testable.`);
  }
  return laneRows;

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
  // Uses the SHARED constant. It previously inlined its own copy of the same three ILIKEs
  // while the constant's comment claimed "one definition, used by the ratchet (G6) and by
  // the durable-floor leg, so the two can never drift" — there were two definitions and the
  // guarantee did not exist. They agreed by luck; the NULL-safety fix above would have
  // broken that luck and left the ratchet and the floor disagreeing about the same word.
  const r = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM embeddings
      WHERE user_id IS NULL AND ${FORBIDDEN_PROVENANCE_SQL}`,
  );
  const n = r.rows[0]!.n;
  // MONOTONE ONLY. The old second leg required 0 from E3 onward; E3 is dropped from the
  // cutover (its premise was false — see the ADR-030 correction), so those rows remain
  // here by design and their removal is a later slice. Requiring 0 would abort every run.
  if (base !== undefined && n > base) fail('G6 ratchet', `forbidden-provenance rows INCREASED ${base} -> ${n}`);
  else pass('G6 ratchet', `${n} forbidden-provenance rows${base !== undefined ? ` (baseline ${base}, not increased)` : ''} — E3 deferred, cleanup is a later slice`);

  // ── the THIRD store the ratchet does not count ──────────────────────────────
  // The deferred provenance-cleanup slice (b2-remove-forbidden-provenance) sweeps flat
  // `embeddings` and the static
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
    else console.warn(`  ⚠ G6 sections-store — ${row.slug}: ${row.sections} sections carry forbidden provenance (${row.url}), status=${row.status}, not reachable via the reader's publish switch. The flat-embeddings ratchet does not count this store. Standing debt — owner call.`);
  }
  if (secStore.rows.length === 0) pass('G6 sections-store', 'no forbidden provenance in sources/sections');
  return n;
}

// ── G8: the sections store's own integrity ────────────────────────────────────
// E4 slices works into `sections` and REUSES the flat vectors verbatim into
// `section_embeddings` (src/ingest/migrate-sections-slice.ts). E4's own postcondition
// compares sections against the FLAT pool per work; NOTHING has ever compared sections
// against their embeddings, so a slice that wrote text rows and dropped the vector half
// would satisfy every existing check and ship a reader whose sections retrieve nothing.
// The slice runner asserts this per source as it goes — this is the independent
// re-assertion, because "the runner checked" is the class of claim this project has been
// burned by (E4's own comment says exactly that about its 1:1 check).
//
// SHAPE OF THE ASSERTION, and why it is not a flat equality. `sections == embeddings` is
// NOT an invariant at E0: the target carries a Barnes pilot from before this design, and
// asserting equality would either red the gate on pre-existing state or, worse, be
// "corrected" later by someone who reads the red as a gate bug. So:
//   - orphans (an embedding whose section is gone) must be ZERO, always. There is no
//     state of this system in which a dangling embedding is acceptable.
//   - unembedded sections are RATCHETED against E0, never zeroed. E4 adds ~70k sections;
//     if each gets its vector the count stays flat, and if the vector half fails it rises.
//     That is the defect this exists to catch, expressed so it cannot false-red.
//   - and it is non-vacuous: zero sections is a broken instrument, not a pass.
interface SectionIntegrity { sections: number; embeddings: number; unembedded: number; orphans: number }

async function measureSectionIntegrity(c: pg.Client): Promise<SectionIntegrity | null> {
  const has = await c.query<{ ok: boolean }>(
    `SELECT to_regclass('sections') IS NOT NULL AND to_regclass('section_embeddings') IS NOT NULL AS ok`);
  if (!has.rows[0]!.ok) return null;
  const r = await c.query<SectionIntegrity>(
    `SELECT (SELECT count(*) FROM sections)::int                      AS sections,
            (SELECT count(*) FROM section_embeddings)::int            AS embeddings,
            (SELECT count(*) FROM sections s
               WHERE NOT EXISTS (SELECT 1 FROM section_embeddings se WHERE se.section_id = s.id))::int AS unembedded,
            (SELECT count(*) FROM section_embeddings se
               WHERE NOT EXISTS (SELECT 1 FROM sections s WHERE s.id = se.section_id))::int            AS orphans`);
  return r.rows[0]!;
}

async function g8(c: pg.Client, phase: string, base?: SectionIntegrity): Promise<SectionIntegrity | undefined> {
  const now = await measureSectionIntegrity(c);
  if (!now) {
    // Pre-006 only. Everywhere this cutover runs, both tables exist.
    console.warn('  ⚠ G8 sections/embeddings — sections or section_embeddings does not exist on this target; nothing checked.');
    return undefined;
  }
  if (now.sections === 0) {
    fail('G8 sections/embeddings', `ZERO sections exist — every ratio below is 0-of-0 and this check proves nothing. ${phase === 'E0' ? 'The target is empty or wrong.' : 'E4 produced no sections at all.'}`);
    return now;
  }
  if (now.orphans > 0) {
    fail('G8 sections/embeddings', `${now.orphans} section_embeddings row(s) point at a section that does not exist — a slice deleted sections without their vectors, or wrote vectors against ids it then rolled back`);
  } else pass('G8 sections/embeddings', `no orphan embeddings — ${now.embeddings} embedding row(s) over ${now.sections} section(s). NOTE: section_embeddings.section_id is NOT NULL REFERENCES sections(id), so an orphan is unrepresentable while that FK stands; this leg only becomes informative if the FK is ever dropped. It is not evidence of a healthy slice. Also note embeddings > sections is NORMAL — the PK is (section_id, model_slug), so a second model legitimately adds rows.`);

  if (!base) {
    pass('G8 unembedded', `baseline: ${now.unembedded} of ${now.sections} section(s) carry no embedding${now.unembedded > 0 ? ' (pre-existing; ratcheted from here, not zeroed)' : ''}`);
  } else if (now.unembedded > base.unembedded) {
    fail('G8 unembedded', `${now.unembedded - base.unembedded} section(s) GAINED no-embedding status (${base.unembedded} -> ${now.unembedded}). The slice wrote section text without reusing the vector, so those sections exist in the reader and retrieve nothing.`);
  } else pass('G8 unembedded', `${now.unembedded} section(s) without an embedding (E0 ${base.unembedded}, not increased) over ${now.sections} sections`);

  // Sections must never be LOST. E4 only adds; a decrease means a slice deleted rows it
  // did not rewrite, which is the ADR-029 suppression class in the sections store.
  if (base && now.sections < base.sections) {
    fail('G8 sections/embeddings', `sections DECREASED ${base.sections} -> ${now.sections} — the cutover removed ${base.sections - now.sections} section(s); E4 is additive and nothing in this cutover deletes sections`);
  }
  return now;
}

// ── G9: the annotation constraints REJECT what they forbid ────────────────────
// G4 proves the shipped write path still WORKS. That is the positive half. This is the
// negative half: that the schema still refuses the shapes 025 and 030 exist to refuse. A
// migration that silently failed to add a CHECK leaves G4 perfectly green.
//
// TWO HONEST LIMITS, stated because the first draft of this check got both wrong:
//
//  1. `notes_target_kind_chk` / `highlights_target_kind_chk` / `bookmarks_target_kind_chk`
//     (030c) CANNOT be proven behaviourally. Each of those tables also carries an
//     anchor-XOR whose every disjunct pins target_kind to 'verse' or 'section', so ANY row
//     with a third value already violates the XOR — 025 (and 026, for bookmarks) rejects it
//     on its own. A probe row inserting target_kind='bogus' is therefore rejected whether or
//     not 030 ever landed, and a check that passes for a reason unrelated to its subject is
//     worse than no check. For these three the ONLY sound assertion is a CATALOG one: the
//     constraint exists, by name, with the expected body.
//  2. What IS behaviourally reachable is 030's TIGHTENING of highlights_anchor_xor: a
//     section-anchored highlight with a NULL source_content_hash, or one carrying a
//     translation, passes 025's version and is refused by 030's. That single probe is what
//     distinguishes "030 applied" from "030 silently did not", and it is included below.
//
// Every rejection is verified by SQLSTATE 23514 *and* the constraint NAME. A bare `catch`
// counts a dropped connection, a missing column, or a unique-index collision as proof the
// CHECK fired — which is how the previous attempt at this check could not fail.
// `mustContain` is a substring test and proves the body is not NARROWER than expected. For
// the three target_kind whitelists that is not enough: the regression 030(c) exists to
// prevent is a WIDENED list, and `CHECK (target_kind IN ('verse','section','bogus'))`
// contains both required tokens and would pass. Those three therefore carry `exactBody`,
// compared modulo whitespace against what 030 actually writes. They are also the three that
// cannot be probed behaviourally (see the note above), so the catalog is their only check
// and it has to be exact.
const NORM = (x: string) => x.replace(/\s+/g, ' ').trim();
const KIND_BODY = "CHECK ((target_kind = ANY (ARRAY['verse'::text, 'section'::text])))";
const REQUIRED_CONSTRAINTS: Array<{ table: string; name: string; mustContain: string[]; exactBody?: string; migration: string }> = [
  { table: 'notes', name: 'notes_anchor_xor', mustContain: ['target_kind', 'section_id', 'verse_id'], migration: '025' },
  { table: 'highlights', name: 'highlights_anchor_xor', mustContain: ['source_content_hash', 'translation'], migration: '030' },
  { table: 'notes', name: 'notes_target_kind_chk', mustContain: ['verse', 'section'], exactBody: KIND_BODY, migration: '030' },
  { table: 'highlights', name: 'highlights_target_kind_chk', mustContain: ['verse', 'section'], exactBody: KIND_BODY, migration: '030' },
  { table: 'bookmarks', name: 'bookmarks_target_kind_chk', mustContain: ['verse', 'section'], exactBody: KIND_BODY, migration: '030' },
];

/** A rejection is only proof if it is THE constraint. 23514 = check_violation. */
function isCheckViolation(e: unknown, constraint: string): boolean {
  const err = e as { code?: string; constraint?: string };
  return err?.code === '23514' && err?.constraint === constraint;
}

async function g9(c: pg.Client) {
  // (a) CATALOG — every constraint exists, by name, with the body its migration wrote.
  const present = new Map<string, string>();
  const rows = await c.query<{ tbl: string; name: string; def: string }>(
    `SELECT rel.relname AS tbl, con.conname AS name, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = 'public' AND con.contype IN ('c','u')`);
  for (const r of rows.rows) present.set(`${r.tbl}.${r.name}`, r.def);

  // PRE-025 DETECTION, and it must not be table-existence. `notes` and `highlights` have
  // existed since long before this cutover; what 025 adds is the `target_kind` COLUMN and
  // the constraints. On the real production target at E0 the tables are present and the
  // constraints are not (025-030 apply inside E1), so a table-existence guard let all five
  // constraints report MISSING and failed the gate at E0 — before a single migration ran,
  // with no baseline written, aborting the cutover it exists to protect. G4 already had the
  // right detector (`hasColumn(notes,'target_kind')`); G9 now uses the same one.
  const polymorphic = await hasColumn(c, 'notes', 'target_kind');
  if (!polymorphic) {
    console.warn('  ⚠ G9 constraints — this target is PRE-025 (notes.target_kind does not exist), so none of the 025/030 constraints can exist yet. Nothing checked. This is the expected state at E0; the constraints are asserted from E1 on, and their ABSENCE after E1 is a hard failure.');
    if (['E1', 'E2', 'E4', 'E5', 'E6'].includes(PHASE)) {
      fail('G9 constraints', `notes.target_kind does not exist at ${PHASE}, but migration 025 runs inside E1 — E1 did not apply, or applied and was rolled back.`);
    }
    return;
  }
  let catalogChecked = 0;
  for (const want of REQUIRED_CONSTRAINTS) {
    const exists = await c.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [want.table]);
    if (!exists.rows[0]!.ok) {
      // Pre-025/026 target at E0: the table itself is not there yet. A visible skip, not a pass.
      console.warn(`  ⚠ G9 constraints — ${want.table} does not exist yet (pre-${want.migration}); ${want.name} not checked.`);
      continue;
    }
    const def = present.get(`${want.table}.${want.name}`);
    if (!def) {
      fail('G9 constraints', `${want.table}.${want.name} is MISSING — migration ${want.migration} did not land, or something dropped it. The write path stays green without it; only this notices.`);
      continue;
    }
    const missing = want.mustContain.filter((t) => !def.includes(t));
    if (missing.length > 0) {
      fail('G9 constraints', `${want.table}.${want.name} exists but its body does not mention ${missing.join(', ')} — it looks like the pre-${want.migration} version. Body: ${def}`);
    } else if (want.exactBody && NORM(def) !== NORM(want.exactBody)) {
      fail('G9 constraints', `${want.table}.${want.name} does not match the exact ${want.migration} body — a WIDENED whitelist would pass a substring test, which is the regression this constraint exists to prevent. Expected: ${want.exactBody} / found: ${def}`);
    } else { catalogChecked++; pass('G9 constraints', `${want.table}.${want.name} present with the ${want.migration} body${want.exactBody ? ' (exact match)' : ''}`); }
  }
  if (catalogChecked === 0) {
    console.warn('  ⚠ G9 constraints — no annotation constraint was checkable on this target (pre-025 schema). The behavioural probes below are skipped too.');
    return;
  }

  // (b) BEHAVIOURAL — the DB really refuses these rows, and refuses them for the stated reason.
  // All inside BEGIN..ROLLBACK. The probe user carries the __cutover_e6_probe__ prefix, which
  // scripts/check-test-residue.mjs now sweeps for, so a crash mid-probe is DETECTABLE rather
  // than becoming the next qa-hl-a-* (which sat on production for months because nothing looked).
  const probeUser = `__cutover_e6_probe__${randomUUID()}`;
  const vid = verseId(REFS[0]!);
  // Guarded: an unguarded SELECT here throws 42P01 on a pre-006 target and the throw escapes
  // into a try/finally with no catch, killing the process before the verdict line ever prints.
  const hasSections = await c.query<{ ok: boolean }>(`SELECT to_regclass('sections') IS NOT NULL AS ok`);
  const sect = hasSections.rows[0]!.ok
    ? await c.query<{ id: string }>(`SELECT id FROM sections ORDER BY id LIMIT 1`)
    : { rows: [] as Array<{ id: string }> };
  const sectionId = sect.rows[0]?.id;

  type Probe = { label: string; constraint: string; sql: string; params: unknown[]; needsSection: boolean };
  const probes: Probe[] = [
    {
      label: '025 notes_anchor_xor rejects a verse note with no verse_id',
      constraint: 'notes_anchor_xor', needsSection: false,
      sql: `INSERT INTO notes (user_id, target_kind, verse_id, section_id, body) VALUES ($1,'verse',NULL,NULL,'probe')`,
      params: [probeUser],
    },
    {
      label: '025 notes_anchor_xor rejects a note anchored to BOTH a verse and a section',
      constraint: 'notes_anchor_xor', needsSection: true,
      sql: `INSERT INTO notes (user_id, target_kind, verse_id, section_id, body) VALUES ($1,'verse',$2,$3,'probe')`,
      params: [probeUser, vid, sectionId],
    },
    {
      // THE 030-SPECIFIC PROBE. Passes 025's XOR, fails 030's. If 030 never landed this
      // INSERT SUCCEEDS and this check goes red — which is precisely what it is for.
      label: '030 highlights_anchor_xor rejects a section highlight with no source_content_hash',
      constraint: 'highlights_anchor_xor', needsSection: true,
      sql: `INSERT INTO highlights (user_id, target_kind, verse_id, section_id, source_content_hash, color)
            VALUES ($1,'section',NULL,$2,NULL,'yellow')`,
      params: [probeUser, sectionId],
    },
    {
      label: '030 highlights_anchor_xor rejects a section highlight carrying a translation',
      constraint: 'highlights_anchor_xor', needsSection: true,
      sql: `INSERT INTO highlights (user_id, target_kind, verse_id, section_id, source_content_hash, translation, color)
            VALUES ($1,'section',NULL,$2,'deadbeef','KJV','yellow')`,
      params: [probeUser, sectionId],
    },
  ];

  for (const p of probes) {
    if (p.needsSection && !sectionId) {
      console.warn(`  ⚠ G9 constraints — "${p.label}" needs a real sections row for the FK and the table is empty; skipped visibly.`);
      continue;
    }
    try {
      await c.query('BEGIN');
      await c.query(p.sql, p.params);
      fail('G9 constraints', `${p.label} — the INSERT was ACCEPTED. The constraint is not enforcing what its migration says it enforces.`);
    } catch (e) {
      if (isCheckViolation(e, p.constraint)) pass('G9 constraints', p.label);
      else {
        const err = e as { code?: string; constraint?: string; message?: string };
        fail('G9 constraints', `${p.label} — rejected, but by SQLSTATE ${err.code ?? '?'} / constraint ${err.constraint ?? '(none)'}, not 23514 / ${p.constraint}. That is a DIFFERENT failure and does not prove this constraint fired: ${err.message}`);
      }
    } finally {
      await c.query('ROLLBACK').catch(() => {});
    }
  }

  // (c) POSITIVE TWIN. Every probe above asserts a REJECTION; a table that rejected every
  // insert for an unrelated reason would pass all of them. Prove the corrected row is
  // ACCEPTED, so the rejections are attributable to the field under test.
  if (!sectionId) {
    // Visibly, not silently. Without a sections row the three section-anchored probes AND
    // this control all skip, which removes the only leg that distinguishes 030 from 025 and
    // the only evidence the rejections are attributable — while the gate still prints seven
    // green G9 lines. Say so.
    console.warn('  ⚠ G9 constraints — sections is empty or absent, so the 030-discriminating probes AND the positive twin did NOT run. G9 above is a catalog check only: it proves the constraints exist, not that they reject anything.');
  } else {
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO highlights (user_id, target_kind, verse_id, section_id, source_content_hash, translation, color)
         VALUES ($1,'section',NULL,$2,'deadbeef',NULL,'yellow')`, [probeUser, sectionId]);
      pass('G9 constraints', 'positive twin: the SAME row with a content hash and no translation is ACCEPTED (so the rejections above are about those fields, not about the insert)');
    } catch (e) {
      fail('G9 constraints', `positive twin FAILED: a valid section highlight was rejected: ${(e as Error).message}. The negative probes above cannot be attributed to the constraints they name.`);
    } finally {
      await c.query('ROLLBACK').catch(() => {});
    }
  }

  // Residue sweep for this gate's own probes — same reasoning as G4's.
  const residue = await c.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM notes      WHERE user_id LIKE '\\_\\_cutover\\_e6\\_probe\\_\\_%')
          + (SELECT count(*) FROM highlights WHERE user_id LIKE '\\_\\_cutover\\_e6\\_probe\\_\\_%') AS n`);
  if (Number(residue.rows[0]!.n) !== 0) fail('G9 constraints', `probe left ${residue.rows[0]!.n} row(s) behind — ROLLBACK did not hold`);
  else pass('G9 constraints', 'probes rolled back clean, zero residue');
}

// ── G7: the ONLY leg that touches the deployed app ────────────────────────────
// It is opt-in, and it had never run: CUTOVER_ASK_URL was unset in both rehearsals, so
// the leg was skipped in silence while the gate printed PASSED and E6 claimed a "full
// regression battery" (deep-audit finding 21).
//
// THE CHOICE MADE HERE, and why. The two options were (a) require CUTOVER_ASK_URL at E6,
// or (b) print an explicit LIVE PROBE NOT RUN line beside the pass. This is (b), for two
// reasons that are properties of the design, not preferences:
//   1. E6 runs on rehearsal forks that HAVE no deployed app — E5 is skipped there by
//      design. Requiring the URL would make every rehearsal end in a red gate, which
//      trains an operator to ignore red. A gate you must override is not a gate.
//   2. E6 runs immediately AFTER `vercel --prod`. A required probe that fails there
//      aborts with "roll back this chunk" where the chunk is the live deploy — the gate
//      would be dictating an emergency rollback of production on a single HTTP read.
// So the leg stays opt-in and the DISCLOSURE becomes loud: the not-run line is printed
// at every phase, and the final verdict is stamped DB-ONLY so no reader can mistake a
// green gate for end-to-end. The operator sets CUTOVER_ASK_URL at E6 after E5 to make it
// end-to-end, and the verdict line then says so.
const LIVE_PROBE_NOT_RUN =
  '  ⚠ G7 live /ask — LIVE PROBE NOT RUN (CUTOVER_ASK_URL is unset). Everything above is\n' +
  '     DATABASE-ONLY. Nothing in this gate touched the deployed application: not routing,\n' +
  '     not legalBasePool, not hnsw.ef_search, not the reranker, not compose, and NOT THE\n' +
  '     VERIFIER — the artifact that actually implements the product guarantee. Set\n' +
  '     CUTOVER_ASK_URL at E6, after E5, for an end-to-end result. You will also need\n' +
  '     CUTOVER_ASK_COOKIE carrying a logged-in SESSION cookie (/api/ask is authed-only);\n' +
  '     the site_gate password cookie alone yields 401.';

// The probe question is the project's standing known-good: "good shepherd" must route to
// John 10, not Luke 2 (CLAUDE.md §accuracy). Asking it here means the live leg exercises
// routing as well as liveness.
const ASK_QUESTION = 'What does it mean that Jesus is the good shepherd in John 10?';
const ASK_TIMEOUT_MS = 120_000; // compose can take ~15s worst case; maxDuration on the route is 300s

async function liveAsk(url: string) {
  // TWO COOKIES ARE REQUIRED, and this is the thing that is easy to get wrong:
  //   - `site_gate` gets you past web/src/middleware.ts (the pre-launch password wall).
  //   - a Neon Auth SESSION cookie gets you past requireUser() inside the route itself
  //     (web/src/app/api/ask/route.ts: /api/ask is authed-only because it spends on
  //     embeddings + LLM).
  // The site-gate cookie ALONE yields HTTP 401 UNAUTHENTICATED, not a 200 — so an operator
  // who supplies only the gate cookie gets a red leg that looks like the product is broken
  // when it is the probe that is under-credentialled. CUTOVER_ASK_COOKIE therefore takes a
  // WHOLE `Cookie:` header value (copy it from a logged-in browser session), not one cookie.
  const cookie = process.env.CUTOVER_ASK_COOKIE;
  // A DNS failure or a refused connection must be a FAILED gate leg with a readable
  // message, not an unhandled rejection that kills the process before the verdict line.
  // Likewise a hang: without a timeout this leg can wedge the gate indefinitely, and the
  // moment it runs is immediately after `vercel --prod`.
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ question: ASK_QUESTION }),
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });
  } catch (e) {
    const msg = (e as Error).name === 'TimeoutError'
      ? `no response in ${ASK_TIMEOUT_MS / 1000}s`
      : (e as Error).message;
    fail('G7 live /ask', `could not reach ${url}: ${msg}`); return;
  }
  if (res.status === 401) {
    fail('G7 live /ask', `HTTP 401 — /api/ask is authed-only (requireUser). CUTOVER_ASK_COOKIE must carry a logged-in SESSION cookie, not just the site_gate password cookie. This is a probe-credential problem, NOT evidence that the product is broken; do not roll back a deploy on it.`);
    return;
  }
  if (res.status === 503 || (res.status === 307 && res.headers.get('location')?.includes('/gate'))) {
    fail('G7 live /ask', `HTTP ${res.status} — blocked by the site password gate (web/src/middleware.ts) before reaching the route. Supply site_gate in CUTOVER_ASK_COOKIE. Again: a probe-credential problem, not a product regression.`);
    return;
  }
  if (!res.ok) { fail('G7 live /ask', `HTTP ${res.status}`); return; }

  // The payload is `{ kind, response, retrieval } & LanePayloads` (teacher/teach.ts) —
  // authors live in `retrieval[].metadata.author` (RetrievedChunk in teacher/retrieve.ts).
  // VERIFIED against the types 2026-07-28. There is NO `citations`, `sources`, or `voices`
  // field anywhere in the response; a parser reading those would score 0 voices on a
  // perfectly healthy site and hand the operator a red gate seconds after a prod deploy.
  let body: { kind?: string; retrieval?: Array<{ metadata?: { author?: string } }>; reason?: string };
  try { body = await res.json() as typeof body; }
  catch (e) { fail('G7 live /ask', `200 OK but the body is not JSON: ${(e as Error).message}`); return; }

  // `kind` IS the verifier verdict. 'composed' means compose→verify passed and the user
  // saw an answer; 'fallback' means the verifier REJECTED the model text and the product
  // degraded to raw retrieval; 'empty' means retrieval found nothing at all. Only the
  // first is the shipped happy path, and collapsing the three into "did we get 2 authors"
  // would let a site whose verifier rejects every composition report a green gate.
  if (body.kind === 'empty') {
    fail('G7 live /ask', `kind='empty' (${body.reason ?? 'no reason given'}) — the live pipeline retrieved NOTHING for a known-good query. Routing, legalBasePool or the HNSW index is broken on the deployed build.`);
    return;
  }
  const voices = new Set((body.retrieval ?? []).map((x) => x.metadata?.author).filter(Boolean));
  if (voices.size < 2) {
    fail('G7 live /ask', `${voices.size} distinct attributed voice(s) in retrieval (kind='${body.kind}') — below the >=2-voices floor, which is the product's headline guarantee`);
    return;
  }
  if (body.kind === 'fallback') {
    // Not a pass. The retrieval floor held but the verifier refused the composition, which
    // is the fail-closed path working — and it is still a degraded product, so it must not
    // print as green.
    fail('G7 live /ask', `kind='fallback' with ${voices.size} voices — retrieval is healthy but the VERIFIER rejected every composition attempt, so the live site is serving raw retrieval instead of an answer. Fail-closed behaved correctly; the pipeline did not.`);
    return;
  }
  // POSITIVE assertion. Failing only on the two known-bad kinds meant any unrecognised or
  // absent `kind` — a future 'degraded', or a shape change — printed "verifier passed".
  if (body.kind !== 'composed') {
    fail('G7 live /ask', `unrecognised kind='${body.kind ?? '(absent)'}' with ${voices.size} voices. Only kind='composed' means compose->verify succeeded; this response shape is not one this gate knows, so it must not be read as a pass.`);
    return;
  }
  pass('G7 live /ask', `kind='composed' (verifier passed), ${voices.size} distinct attributed voices: ${[...voices].slice(0, 5).join(', ')}`);
}

// ──────────────────────────────────────────────────────────────────────────────
const url = process.env.CUTOVER_DATABASE_URL;
if (!url) { console.error('✗ CUTOVER_DATABASE_URL is unset'); process.exit(1); }
// hostOf() lowercases (new URL() will not, for postgresql:) and declaredMatches()
// compares the ENDPOINT ID exactly — the old `host.includes(expect)` accepted
// CUTOVER_EXPECT_HOST=neon.tech for every endpoint in the account. One guard module,
// scripts/lib/target-guard.mjs, never a hand-rolled comparison.
const host = hostOf(url);
const expect = process.env.CUTOVER_EXPECT_HOST;
if (!expect) { console.error('✗ CUTOVER_EXPECT_HOST is unset — declare the target endpoint explicitly'); process.exit(1); }
if (!declaredMatches(url, expect)) { console.error(`✗ host ${host} is not the declared target '${expect}' (it must name the endpoint id exactly)`); process.exit(1); }

console.log(`\nREGRESSION GATE — phase ${PHASE}`);
console.log(`  target: ${host} (credentials redacted)`);

const cp = loadCheckpoint(CHECKPOINT) as Checkpoint;
const stored: Baseline = cp.baseline.regression ?? {};
if (stored.host && stored.host !== host) {
  console.error(`✗ baseline in .cutover-checkpoint.json belongs to ${stored.host}, not ${host}. Refusing to compare across targets.`);
  process.exit(1);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
let liveProbeRan = false;
try {
  // A column the invariant covers being GONE is itself the regression, and it must read
  // as one. Unwrapped, it surfaced as a raw pg stack trace: red, but unreadable.
  let now: UserDataMeasure = {};
  let measured = true;
  try { now = await measureUserData(c); }
  catch (e) {
    measured = false;
    fail('G1 user-data', `the invariant could not be MEASURED: ${(e as Error).message}. A column it covers has been dropped or renamed — a schema regression on live user data.`);
  }
  // Do NOT run the comparison on a reading that failed: it would print a green
  // "unchanged" line off nothing.
  if (measured) g1(now, CAPTURE ? undefined : stored.userData);
  const g2r = await g2(c, CAPTURE ? undefined : stored.voices, CAPTURE ? undefined : stored.labeled);
  const voices = g2r.voices;
  await g3(c);
  await g4(c, CAPTURE ? undefined : stored.userData);
  const laneRows = await g5(c, PHASE, CAPTURE ? undefined : stored.laneRows);
  const forbidden = await g6(c, CAPTURE ? undefined : stored.forbidden);
  const sections = await g8(c, PHASE, CAPTURE ? undefined : stored.sections);
  await g9(c);
  if (process.env.CUTOVER_ASK_URL) { liveProbeRan = true; await liveAsk(process.env.CUTOVER_ASK_URL); }
  else console.warn(LIVE_PROBE_NOT_RUN);

  // Never persist a baseline from a run that already failed — a baseline captured off a
  // broken reading is a check that can never fail again.
  if (CAPTURE && failures.length === 0) {
    cp.baseline.regression = { host, userData: now, forbidden, voices, sections, laneRows, labeled: g2r.labeled };
    try { saveCheckpoint(CHECKPOINT, cp); }
    catch (e) {
      const m = (e as Error).message;
      console.error(m.startsWith(OWNERSHIP_ERROR) ? `✗ ${m}` : `✗ could not write the baseline: ${m}`);
      process.exit(1);
    }
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
// The verdict states its own scope. "PASSED" with no qualifier is exactly how a DB-only
// result got read as a full regression battery.
//
// It now also states whether anything was COMPARED. Roughly half the legs here are
// ratchets against the E0 reading, and with no stored baseline every one of them takes its
// "capture" branch and reports a measurement instead of asserting on it. That run is a
// SURVEY, not a regression gate — both end in a green line, and only this qualifier tells
// them apart. It matters most in --e6-only against a fresh fork, which is exactly the
// situation in which someone is trying to convince themselves the gate works.
const compared = !CAPTURE && stored.userData !== undefined;
const scope = liveProbeRan ? 'including the live /ask probe (end-to-end)' : 'DB-ONLY, LIVE PROBE NOT RUN';
console.log(`✓ REGRESSION GATE PASSED at ${PHASE} — ${scope}${compared ? '' : '; NO E0 BASELINE, so the ratcheted legs REPORTED rather than asserted (survey, not regression gate)'}`);
