// A4 — THE PUBLISH FLIP. The one legally irreversible write this project makes.
//
//   PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=ep-odd-fog-atnykudm CUTOVER_DATABASE_URL=<owner url> \
//     node scripts/publish-flip.mjs --slugs=docs/evidence/work-order-v2-stage2/flip-slugs.json
//
//   ... --reverse    the exact inverse: published -> staged, same slug file, same guards.
//
// WHY A NEW SCRIPT AND NOT A FLAG ON publish-works.mjs. That script is dev-only by
// construction (`:17` refuses any host not containing 'ep-tiny-hat', by naive substring), it
// reads its credential from a hardcoded `$HOME/theology-study-app/.env.local`, and it
// hand-copies the allowed-licence and forbidden-domain lists (`:11-12`) instead of importing
// them — a hand-maintained expected set, on the legal rail. PUBLISH_FLIP.md:77-84 already
// ruled it "the right tool to adapt" but "not usable as-is". This is that adaptation.
//
// WHAT IT KEEPS from publish-works.mjs, because that part is genuinely good: the gate runs
// INSIDE the transaction, after the UPDATE and before COMMIT, so a work that would leave the
// published set illegal never becomes visible for an instant. And `AND status='staged'` makes
// a re-run flip zero rows rather than double-apply.
//
// WHAT IT ADDS:
//   * credential from env only (never a dotfile, never argv, never printed);
//   * an exact endpoint-id declaration on top of an explicit override (publish-flip-guard);
//   * a server-side role assertion — app_runtime CANNOT write `sources`
//     (db/migrations/010_revoke_corpus_writes.sql:16), so this must be neondb_owner;
//   * an interactive owner gate that refuses a non-TTY stdin, so a piped "yes" cannot pass it;
//   * a full pre-flip snapshot of every row's status, written BEFORE commit;
//   * a delta assertion — the ONLY rows that changed are the listed slugs, in the one
//     direction expected. A flip that also moved something else rolls back.
//
// WHAT IT DOES NOT DO. It does not create a Neon restore point: branch creation is forbidden
// by the standing rails and is an owner-level call. The snapshot + `--reverse` restore
// `sources.status` and NOTHING DOWNSTREAM. That is a real downgrade from the rehearsed plan
// (PUBLISH_FLIP.md:99) and the owner must accept it explicitly before the go.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { ALLOWED_LICENSES, isAllowedLicense } from '../src/ingest/allowed-licenses.mjs';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';
import { eligibility, flipDelta } from './lib/publish-flip-delta.mjs';
import { assertPublishTarget, assertStrongTls } from './lib/publish-flip-guard.mjs';
import { scrubCredentialText } from './lib/neon-connection.mjs';
import { isMustNotServe } from './lib/served-corpus-authors.mjs';

const OWNER_ROLE = 'neondb_owner';
const CONFIRM_WORD = 'publish';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => args.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);

const reverse = has('--reverse');
// ── --serve-published: the ONLY way a forward flip may list an already-published slug ──────
// 2026-08-03 audit, finding 2 (CONFIRMED). Since migration 044 the flip also writes
// `embeddings.served`, so a forward run whose payload contains already-published works SERVES
// their rows while moving zero status rows — a materially different act from re-running a
// status flip, and the old code did it silently ("the rest are already 'published'") with no
// tool inverse. serving the 88 published-but-unserved works (docs/evidence/corpus-copy/serve-88.json) is precisely this act, so it must
// be deliberate: without this flag a forward payload containing a published slug is a STOP.
const servePublished = has('--serve-published');
const slugFile = val('--slugs');
const snapshotFile = val('--snapshot');
const localOk = has('--local-redproof');
const evidenceDir = val('--evidence') ?? 'docs/evidence/work-order-v2-stage2';

// ── M8: THE WRITER GETS A RUN LOG ───────────────────────────────────────────────────────────
// 2026-08-02 deep audit. The forward flip of 2026-08-01 left two verify logs, a snapshot and a
// board row — and NOTHING from the writer itself. Its stdout, including `role neondb_owner
// (asserted at the server)` and the target/direction header, survived only as three lines
// hand-transcribed into a commit message, with the role line dropped in transcription. The
// artifacts could not distinguish the scripted flip from a manual psql UPDATE, nor one flip from
// flip -> reverse -> re-flip.
//
// Written on EVERY exit including a refusal, because the runs you most want a log of are the ones
// that stopped. Scrubbed through the same function every other output path uses, so a credential
// cannot reach it.
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const runLogPath = path.join(evidenceDir, `flip-run-${runStamp}.log`);
const runLog = [];
for (const [stream, sink] of [[process.stdout, 'out'], [process.stderr, 'err']]) {
  const original = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => {
    runLog.push(`${sink === 'err' ? '! ' : ''}${scrubCredentialText(String(chunk))}`);
    return original(chunk, ...rest);
  };
}
function flushRunLog() {
  try {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(runLogPath, runLog.join(''));
  } catch {
    // A log we cannot write must not become the reason an irreversible write half-happened.
  }
}
process.on('exit', flushRunLog);

function die(msg, code = 1) {
  console.error(scrubCredentialText(String(msg)));
  process.exit(code);
}

if (!slugFile) die('usage: publish-flip.mjs --slugs=<flip-slugs.json> [--serve-published] [--reverse --snapshot=<flip-pre-snapshot-*.json>]', 2);

// ── the slug list. Read LITERALLY. No predicate, ever. ────────────────────────────────────
// PUBLISH_FLIP.md:71-73 is explicit: the flip names its works. A predicate ("everything
// staged") would flip whatever happened to be staged at the moment it ran, which is not the
// set anybody adjudicated in A3.
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(slugFile, 'utf8'));
} catch (e) {
  die(`STOP: cannot read the slug file ${slugFile}: ${e.message}`, 2);
}
const slugs = Array.isArray(manifest?.slugs) ? manifest.slugs : null;
if (!slugs || slugs.length === 0) {
  die(`STOP: ${slugFile} carries no slugs. A4 has no payload until A3 adjudicates.`, 2);
}
if (!slugs.every((s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s))) {
  die('STOP: slug file contains a value that is not a slug. Refusing to guess.', 2);
}

// ── the manifest serve:false gate (forward only; a withdrawal is never blocked, M7) ─────────
// 2026-08-03 audit: the flip became the serving switch without inheriting any serving gate.
// Quarantine rulings live in the manifest as `serve:false` (thayers-lexicon is the standing
// example — staged because lexicons are served by nothing, pending the D4/A8 owner call), and before 044 they were enforced by the slug
// simply never being added to a routing list. That wall is gone; this is its replacement.
// Checked BEFORE any connection: it is pure repo state, and the answer cannot change mid-run.
if (!reverse) {
  // RULINGS COME FROM THE UNION OF HEAD AND THE WORKING TREE (bylaw-4 refuter, in two rounds:
  // the first cut read the working tree alone, so a concurrent session's uncommitted edit
  // silently decided what this gate blocks; a cleanliness STOP was tried next and blocked every
  // flip the moment the live concurrent session appended unrelated manifest entries — observed
  // within the hour). The union is fail-closed in BOTH directions: a ruling that exists only as
  // an uncommitted edit already blocks, and REMOVING a ruling takes effect only once the
  // removal is committed. Divergence between the two sources is printed, never silent.
  const parseRulings = (label, text) => {
    try {
      return new Set(JSON.parse(text).filter((e) => e?.serve === false).map((e) => e.slug));
    } catch (e) {
      die(`STOP: cannot parse ${label} ingest/sources.config.json (${e.message}). The serve:false gate refuses to publish blind.`, 2);
      return new Set(); // unreachable; keeps the shape obvious
    }
  };
  let headText;
  try {
    headText = execFileSync('git', ['show', 'HEAD:ingest/sources.config.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    die("STOP: cannot read HEAD:ingest/sources.config.json from git. Committed rulings are the gate's floor; refusing to publish without them.", 2);
  }
  const headRules = parseRulings('committed (HEAD)', headText);
  const treeRules = parseRulings('working-tree', fs.readFileSync('ingest/sources.config.json', 'utf8'));
  const noServe = new Set([...headRules, ...treeRules]);
  // Counts are PRINTED so a manifest that silently lost its serve fields is visible (absence
  // once passed indistinguishably from a clean check). Zero rulings is legal but loud.
  const drift = [...headRules].filter((s) => !treeRules.has(s)).concat([...treeRules].filter((s) => !headRules.has(s)));
  console.log(`serve:false  ${noServe.size} standing ruling(s) (HEAD ${headRules.size}, tree ${treeRules.size}${drift.length ? `; DIVERGENT: ${drift.join(', ')} — the union blocks` : ''})`);
  const blocked = slugs.filter((s) => noServe.has(s));
  if (blocked.length > 0) {
    die(`STOP: listed slug(s) are serve:false in the manifest (a standing quality/quarantine ruling): ${blocked.join(', ')}.\n` +
        '  Publishing now MEANS serving. Revisit the ruling in ingest/sources.config.json first, or drop the slug.', 2);
  }
}

const url = process.env.CUTOVER_DATABASE_URL;
let host;
try {
  host = assertPublishTarget(url, {
    allow: process.env.PUBLISH_ALLOW === '1',
    declared: process.env.PUBLISH_EXPECT_HOST,
    localOk,
  });
  // The URL wins over `ssl:{rejectUnauthorized:true}` below — see assertStrongTls.
  assertStrongTls(url, { localOk });
} catch (e) {
  die(e.message, 2);
}

const from = reverse ? 'published' : 'staged';
const to = reverse ? 'staged' : 'published';

// ── M6: --reverse INVERTS THE EXECUTED FLIP, NOT THE SLUG LIST ─────────────────────────────
// 2026-08-02 deep audit. The direction came from the flag alone and the UPDATE flipped every
// listed slug currently in `published`. It never read the snapshot. So any listed slug that was
// ALREADY published before the forward flip got un-published by a reverse — a work the flip never
// touched. It was exact for the 2026-08-01 run only because all seven rows were `staged` and
// `already` was empty: a property of the data on the day, not of the tool.
//
// The forward run writes a full pre-flip snapshot of every row's status. A reverse now REQUIRES
// it and reverses exactly the rows the forward flip moved — the ones the snapshot recorded as
// `staged`. No snapshot, no reverse: guessing which rows a past write touched is precisely the
// thing that made this unsafe.
let reverseSlugs = slugs;
// On a reverse: the slugs whose rows the FORWARD run served from zero (read from the snapshot's
// servedBefore record) — the exact inverse targets of the served write. Stays [] on forward runs.
let unserveSlugs = [];
if (reverse) {
  if (!snapshotFile) {
    let available = [];
    try {
      available = fs.readdirSync(evidenceDir).filter((f) => f.startsWith('flip-pre-snapshot-')).sort();
    } catch { /* the evidence dir may not exist on a red-proof target */ }
    die(
      'STOP: --reverse requires --snapshot=<flip-pre-snapshot-*.json>.\n' +
        '  Reversing from the slug list alone un-publishes any listed work that was ALREADY\n' +
        '  published before the forward flip — a work the flip never touched.\n' +
        (available.length
          ? `  Snapshots in ${evidenceDir}:\n${available.map((f) => `    ${f}`).join('\n')}`
          : `  No flip-pre-snapshot-*.json in ${evidenceDir}.`),
      2,
    );
  }
  let snap;
  try {
    snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  } catch (e) {
    die(`STOP: cannot read the snapshot ${snapshotFile}: ${e.message}`, 2);
  }
  if (snap?.host !== host) {
    die(`STOP: snapshot ${snapshotFile} was taken against '${snap?.host}', target is '${host}'. Refusing.`, 2);
  }
  const wasStaged = new Set((snap.sources ?? []).filter((r) => r.status === 'staged').map((r) => r.slug));
  reverseSlugs = slugs.filter((sl) => wasStaged.has(sl));
  const skipped = slugs.filter((sl) => !wasStaged.has(sl));
  console.log(`snapshot     ${snapshotFile} (${(snap.sources ?? []).length} rows, taken ${snap.direction ?? '?'})`);
  console.log(`reversing    ${reverseSlugs.length} of ${slugs.length} listed slug(s) — the ones the forward flip actually moved`);
  if (skipped.length > 0) {
    console.log(`  NOT reversed (already '${to === 'staged' ? 'published' : 'staged'}' before the flip): ${skipped.join(', ')}`);
  }

  // ── the served inverse comes from the snapshot too (audit finding 2, CONFIRMED) ──────────
  // The forward run records per-slug served-row counts BEFORE its write. The exact inverse of
  // "serve every row of these works" is "un-serve the works that had ZERO served rows before"
  // — un-serving a work that was partially or fully served pre-flip would destroy state the
  // forward run never created. The old code un-served `reverseSlugs` (the was-staged subset),
  // which (a) missed every already-published slug a mixed batch had served, and (b) could not
  // reverse a serve-only flip at all ("nothing to reverse" on the run whose whole point was
  // the served write).
  unserveSlugs = slugs.filter((sl) => {
    const sb = snap.servedBefore?.[sl];
    return sb && sb.rows > 0 && sb.served === 0;
  });
  if (snap.servedBefore === undefined) {
    console.log('  ⚠ snapshot predates the served record (pre-044): reversing status only, served untouched.');
  } else {
    console.log(`  un-serving   ${unserveSlugs.length} slug(s) the forward flip served from zero`);
  }
  if (reverseSlugs.length === 0 && unserveSlugs.length === 0) {
    die('STOP: the snapshot shows the forward flip moved no status rows and served no rows for these slugs. Nothing to reverse.', 2);
  }
}

console.log(`publish-flip — target ${host} (credentials redacted)`);
console.log(`direction    ${from} -> ${to}`);
console.log(`slugs        ${slugs.length} from ${slugFile}`);
if (manifest.sourceReport) console.log(`adjudicated  ${manifest.sourceReport}`);

// The TTY requirement is checked HERE, before any connection is opened — it is pure
// environment, and finding out after connect would mean having held a production connection
// for the sole purpose of refusing. Proven by red-proof case 13: without this, the refusal
// against an unreachable host came from DNS, not from the gate.
if (!localOk && !process.stdin.isTTY) {
  die(
    'STOP: stdin is not a terminal. The owner gate cannot be satisfied by a pipe, a heredoc ' +
      'or a CI job — that is the entire point of it. Run this from a terminal.',
    2,
  );
}

/** The owner gate. A HARD stop, and it must be a human at a terminal. */
async function ownerGate() {
  if (localOk) return; // red-proof path never prompts
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) =>
    rl.question(`\nType ${CONFIRM_WORD} to ${reverse ? 'REVERSE the flip on' : 'PUBLISH to'} ${host}: `, (a) => {
      rl.close();
      res(a);
    }),
  );
  if (answer.trim() !== CONFIRM_WORD) die('STOP: not confirmed. Nothing was written.', 2);
}

const client = new pg.Client({ connectionString: url, ssl: localOk ? false : { rejectUnauthorized: true } });
try {
  await client.connect();
} catch (e) {
  // Connect failures happen BEFORE any transaction exists — nothing to roll back, nothing
  // written. Scrubbed and reported as a stop, not an uncaught stack trace.
  die(`STOP: could not connect to ${host}: ${e.message}. Nothing was written.`, 2);
}

try {
  // ── role, asserted AT THE SERVER ────────────────────────────────────────────────────────
  // Not inferred from the connection string: the string can say anything. app_runtime has
  // INSERT/UPDATE/DELETE revoked on `sources`, so a flip attempted as app_runtime would fail
  // mid-transaction rather than up front, which is a worse place to find out.
  const who = (await client.query('SELECT current_user AS role')).rows[0]?.role;
  if (who !== OWNER_ROLE) {
    // Unconditional — the red-proof path asserts it too, which is what makes this check
    // provable at all: the throwaway cluster carries a neondb_owner role precisely so that
    // connecting as anything else can be watched refuse.
    die(`STOP: connected as '${who}', expected '${OWNER_ROLE}'. app_runtime cannot write sources (migration 010).`, 2);
  }
  console.log(`role         ${who} (asserted at the server)`);

  await ownerGate();

  await client.query('BEGIN');
  // Fail fast instead of hanging at the terminal if another writer already holds these rows. The
  // operator is standing at a prompt during an irreversible write; a silent block is the worst
  // possible feedback. 15s is far longer than any legitimate holder of a 7-row table.
  await client.query("SET LOCAL lock_timeout = '15s'");

  // ── the snapshot: EVERY row, not just the ones being flipped, and LOCKED ────────────────
  // The delta assertion below is only meaningful against a complete before-picture, and a
  // partial snapshot cannot prove that nothing else moved.
  //
  // FOR UPDATE — 2026-08-02 deep audit, M23. This transaction is a bare BEGIN, so it runs at READ
  // COMMITTED and every statement takes a NEW snapshot. The legality gate below asks "is the
  // PUBLISHED corpus legal" over the whole table, and it asked that of a picture that could change
  // underneath it: `barnes-notes` in particular is deliberately not flipped, so nothing else in
  // this transaction touched it, and a concurrent session could publish it between the gate's read
  // and this transaction's COMMIT. The gate would pass over a corpus that is not the one committed.
  //
  // Raising the isolation level was the obvious alternative and it is worse: under REPEATABLE READ
  // the whole transaction reads one snapshot, so the before/after delta check would compare a view
  // to itself and become a check that CANNOT FAIL — trading a real gap for an unearned green.
  // Locking gives the guarantee without blinding the delta.
  //
  // `sources` was 7 rows when this was written and is ~124 heading to ~900 — FOR UPDATE on the
  // whole table is still cheap in absolute terms, but it now serializes against any concurrent
  // copy/ingest session for the LIFE OF THIS TRANSACTION, which since 044 includes a served
  // UPDATE over every listed work's embeddings rows. Batch size bounds that duration; the filed
  // order requires timing a dev-scale flip before sizing prod batches. It also composes with the
  // re-ingest guard (src/ingest/reingest-guard.ts): that guard takes FOR UPDATE on the row it is
  // about to delete sections for, so a re-ingest and a flip mutually exclude — which is what
  // makes the `badSections` leg below trustworthy without locking every section row.
  const before = (await client.query('SELECT slug, status FROM sources ORDER BY slug FOR UPDATE')).rows;
  const beforeBy = new Map(before.map((r) => [r.slug, r.status]));

  // Both row decisions come from lib/publish-flip-delta.mjs, which is pure and has tests. They
  // were inline here, where the only way to exercise them was to run this script against a real
  // database — so the two defects the 2026-08-02 audit found in them were found by reading.
  // `reverseSlugs` is `slugs` on a forward run and the snapshot-narrowed set on a reverse (M6).
  const payload = reverseSlugs;
  const { missing, eligible, thirdStatus } = eligibility(payload, beforeBy, from, to);
  if (missing.length > 0) {
    if (reverse) {
      // M7's direction (bylaw-4 refuter): a withdrawal may only shrink the published set, and a
      // listed slug whose sources row no longer EXISTS cannot be un-published — blocking the
      // whole reverse on it would keep every OTHER listed work published during an emergency.
      // Report, drop, continue.
      console.error(`  ⚠ listed slug(s) not present in sources — nothing to withdraw for: ${missing.join(', ')}`);
    } else {
      await client.query('ROLLBACK');
      die(`STOP: slug(s) not present in sources: ${missing.join(', ')}`, 1);
    }
  }

  // ── does this target carry `embeddings.served` (migration 044)? ─────────────────────────
  // Forward: REQUIRED. Publishing now means serving; a forward flip on a pre-044 target would
  // silently recreate the published-but-unserved divergence this whole design exists to kill.
  // Reverse: proceeds WITHOUT it, loudly — an emergency withdrawal is never blocked on schema
  // (M7's direction), it just cannot touch a column that does not exist.
  const servedCol = (await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='embeddings' AND column_name='served'`,
  )).rowCount > 0;
  if (!servedCol && !reverse) {
    await client.query('ROLLBACK');
    die('STOP: embeddings.served does not exist on this target. Publishing now MEANS serving — ' +
        'apply db/migrations/044_embeddings_served_expand.sql first (the expand half; see the filed order).', 1);
  }
  if (!servedCol && reverse) {
    console.log('  ⚠ no served column on this target (pre-044): reversing status only.');
  }

  // ── per-slug served state BEFORE any write — the served inverse lives or dies here ──────
  // Recorded for ALL listed slugs (not just the payload): a --serve-published forward's whole
  // point is slugs outside the eligible set. `rows:0` marks a slug with no work-keyed
  // embeddings (the legacy author-admitted cohort) — served for those is untouchable by slug,
  // which the summary line states rather than hides.
  let servedBefore = null;
  if (servedCol) {
    const sb = await client.query(
      `SELECT metadata->>'work' AS work, count(*)::int AS rows, count(*) FILTER (WHERE served)::int AS served
         FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = ANY($1) GROUP BY 1`,
      [slugs],
    );
    servedBefore = Object.fromEntries(slugs.map((sl) => [sl, { rows: 0, served: 0 }]));
    for (const r of sb.rows) servedBefore[r.work] = { rows: r.rows, served: r.served };

    if (!reverse) {
      // A slug in a PARTIAL served state (some rows on, some off) has no exact inverse under a
      // per-slug record, and partial states are always a defect upstream (an interrupted write,
      // or a re-ingest that slipped a guard). Refuse and name it; reconciliation is a decision,
      // not a side effect of the next batch.
      const partial = slugs.filter((sl) => {
        const s = servedBefore[sl];
        return s.rows > 0 && s.served > 0 && s.served < s.rows;
      });
      if (partial.length > 0) {
        await client.query('ROLLBACK');
        die(`STOP: slug(s) in a PARTIAL served state (some rows served, some not): ` +
            `${partial.map((sl) => `${sl}=${servedBefore[sl].served}/${servedBefore[sl].rows}`).join(', ')}. ` +
            'Reconcile first; a flip over a partial state has no exact inverse.', 1);
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapPath = path.join(evidenceDir, `flip-pre-snapshot-${stamp}.json`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    snapPath,
    JSON.stringify({ host, direction: `${from}->${to}`, slugFile, slugs, payload, servedBefore, sources: before }, null, 2),
  );
  console.log(`snapshot     ${snapPath} (${before.length} rows${servedBefore ? ` + served state for ${slugs.length} slug(s)` : ''}, written before COMMIT)`);

  // A listed slug that is in NEITHER direction is a third status — 'quarantined' (migration 006)
  // or 'ingesting' (023). The old message asserted "the rest are already <to>" without checking,
  // so a quarantined work would be silently skipped by the UPDATE and reported as already done.
  if (thirdStatus.length > 0) {
    await client.query('ROLLBACK');
    die(`STOP: listed slug(s) in an unexpected status: ${thirdStatus.map((s) => `${s}=${beforeBy.get(s)}`).join(', ')}. Refusing.`, 1);
  }

  // ── already-published slugs on a FORWARD run need --serve-published (audit finding 2) ────
  // The old message here — "the rest are already 'published'" — described a no-op. Since 044 it
  // describes a SERVE: those works' rows flip served=true with zero status movement. That is
  // the deliberate mechanism for the 88 (serve-88.json), and it must never happen as a side effect of a stale
  // slug list, so without the flag it is a STOP, with the flag it is announced by name.
  const alreadyTo = payload.filter((sl) => beforeBy.get(sl) === to);
  if (!reverse && alreadyTo.length > 0 && !servePublished) {
    await client.query('ROLLBACK');
    die(`STOP: ${alreadyTo.length} listed slug(s) are already 'published': ${alreadyTo.slice(0, 8).join(', ')}${alreadyTo.length > 8 ? ', …' : ''}.\n` +
        '  A forward flip would SERVE their embeddings rows without moving status. If serving\n' +
        '  already-published works is what you mean (e.g. the 88), re-run with --serve-published.', 1);
  }
  if (!reverse && alreadyTo.length > 0) {
    console.log(`serve-published  ${alreadyTo.length} already-published slug(s) will be SERVED (status unchanged)`);
  }
  console.log(`eligible     ${eligible.length} of ${payload.length} are '${from}'${alreadyTo.length > 0 ? ` (${alreadyTo.length} already '${to}')` : ''}`);

  const upd = await client.query(
    `UPDATE sources SET status=$2 WHERE slug = ANY($1) AND status=$3 RETURNING slug`,
    [payload, to, from],
  );
  if (upd.rowCount !== eligible.length) {
    await client.query('ROLLBACK');
    die(`STOP: expected to flip ${eligible.length} row(s), flipped ${upd.rowCount}. Rolled back.`, 1);
  }

  // ── `embeddings.served` moves WITH the status, in this same transaction (migration 044) ──
  // Before 044 these were unrelated facts: retrieval read four hand-typed slug lists in
  // routing.ts, so publishing a work made it shelf-readable and left it invisible to /ask. 76 of
  // the 77 works published on 2026-08-03 landed in exactly that state. `served` is now the
  // switch, and this transaction is its ONLY writer.
  //
  // SAME TRANSACTION, NOT A FOLLOW-UP STEP: if either write fails, both roll back.
  //
  // TARGETS (audit finding 2, CONFIRMED — the old code used `payload` in both directions):
  //   forward   every LISTED slug (`slugs`) — including --serve-published ones the status
  //             UPDATE never touches. That asymmetry is the point of the flag.
  //   reverse   `unserveSlugs` — the slugs the snapshot proves the forward run served FROM
  //             ZERO. Un-serving anything else would destroy state the forward run never made.
  //             The legacy author-admitted cohort (no work key) is unreachable by slug in
  //             either direction; withdrawing those works moves status while /ask keeps
  //             serving their rows — a KNOWN, filed limit, printed below, never silent.
  const servedTo = to === 'published';
  const servedTargets = reverse ? unserveSlugs : slugs;
  let servedRows = 0;
  if (servedCol && servedTargets.length > 0) {
    const emb = await client.query(
      `UPDATE embeddings SET served=$2
        WHERE user_id IS NULL AND metadata->>'work' = ANY($1) AND served <> $2`,
      [servedTargets, servedTo],
    );
    servedRows = emb.rowCount;
    // The rowcount is ASSERTED against the servedBefore record, not just printed (bylaw-4
    // refuter: the exact-inverse claim rested on an unlocked read). After the partial-state
    // refusal, every target slug is all-on or all-off, so the expected count is exact:
    // forward serves each target's rows where served=0 before; reverse un-serves the same.
    // A mismatch means the served state moved between the snapshot read and this UPDATE
    // (a concurrent writer this transaction's sources lock does not cover) — roll back and
    // say so rather than committing a snapshot that no longer describes the write.
    if (servedBefore) {
      // Forward: a target serves all its rows iff none were served (post-refusal, states are
      // all-or-nothing; already-served slugs contribute 0 via `served <> $2`). Reverse: exactly
      // the currently-served rows flip off, partial or not — servedBefore here is THIS run's
      // fresh read, so s.served IS the count `served <> false` will touch.
      const expected = servedTargets.reduce((n, sl) => {
        const s = servedBefore[sl] ?? { rows: 0, served: 0 };
        return n + (servedTo ? (s.served === 0 ? s.rows : 0) : s.served);
      }, 0);
      if (servedRows !== expected) {
        await client.query('ROLLBACK');
        die(`STOP: served UPDATE moved ${servedRows} row(s), snapshot expected ${expected}. ` +
            'The served state changed under this transaction (concurrent writer?). Rolled back; re-run to re-snapshot.', 1);
      }
    }
  }
  if (servedCol) {
    const noRows = (reverse ? unserveSlugs : slugs).filter((sl) => servedBefore?.[sl]?.rows === 0);
    console.log(
      `served       ${servedRows} embedding row(s) -> served=${servedTo} across ${servedTargets.length} slug(s)` +
      (noRows.length > 0
        ? `\n             ⚠ ${noRows.length} slug(s) carry NO work-keyed rows (unreachable by slug): ${noRows.slice(0, 6).join(', ')}${noRows.length > 6 ? ', …' : ''}`
        : ''),
    );
  }

  // ── the serving gate: no must-not-serve author may enter the served set (forward only) ───
  // 2026-08-03 audit: the flip became the serving switch without inheriting any serving gate —
  // the old wall was the slug simply never being typed into a routing list. The list is
  // imported from served-corpus-authors.mjs (byte-equality-tested against the shipped
  // legal-corpus.ts), never re-typed here. Directional per M7: a reverse only shrinks the
  // served set and is never blocked.
  if (!reverse && servedCol && servedTargets.length > 0) {
    const authors = await client.query(
      `SELECT DISTINCT metadata->>'author' AS author FROM embeddings
        WHERE user_id IS NULL AND metadata->>'work' = ANY($1)`,
      [servedTargets],
    );
    const banned = authors.rows.map((r) => r.author).filter((a) => isMustNotServe(a ?? ''));
    // NULL/missing author FAILS CLOSED (bylaw-4 refuter): a row this gate cannot attribute is a
    // row the ruling cannot be checked against, and every manifest work carries an author — a
    // NULL here is upstream data damage, not a benign gap. Serving unattributable text also
    // breaks the product guarantee directly (quoted AND attributed).
    const unattributed = authors.rows.some((r) => r.author === null || String(r.author).trim() === '');
    if (banned.length > 0 || unattributed) {
      await client.query('ROLLBACK');
      die(`STOP: serving these works would serve ${banned.length > 0 ? `MUST_NOT_SERVE author(s): ${banned.join(', ')}` : ''}` +
          `${banned.length > 0 && unattributed ? ' AND ' : ''}${unattributed ? 'row(s) with NO author metadata (unattributable text cannot be gated or quoted)' : ''}. Rolled back.`, 1);
    }
  }

  // ── delta: nothing moved except what we named, in the direction we named ────────────────
  const after = (await client.query('SELECT slug, status FROM sources ORDER BY slug')).rows;
  const unexpected = flipDelta(before, after, eligible, from, to);
  if (unexpected.length > 0) {
    await client.query('ROLLBACK');
    die(`STOP: rows changed that were not the flip:\n  ${unexpected.join('\n  ')}\nRolled back.`, 1);
  }

  // ── the legal gates, INSIDE the transaction, over the whole published set ───────────────
  // Lists are IMPORTED. The whole published set is checked, not just the flipped rows: the
  // question at COMMIT time is "is the published corpus legal", not "were these rows legal".
  const badLicense = (
    await client.query(`SELECT slug, license FROM sources WHERE status='published'`)
  ).rows.filter((r) => !isAllowedLicense(r.license));

  const provRows = (
    await client.query(
      `SELECT s.slug, s.provenance->>'url' AS url FROM sources s
        WHERE s.status='published' AND s.provenance->>'url' IS NOT NULL`,
    )
  ).rows;
  const badProvenance = provRows
    .map((r) => ({ ...r, domain: forbiddenProvenanceDomain(r.url) }))
    .filter((r) => r.domain !== null);

  // sections.source_url too — publish-works.mjs only ever checked sources.provenance, so a
  // work whose provenance is clean while its sections cite an aggregator passed silently.
  let badSections = [];
  try {
    badSections = (
      await client.query(
        `SELECT DISTINCT s.slug, sec.source_url AS url FROM sections sec
           JOIN sources s ON s.id = sec.source_id
          WHERE s.status='published' AND sec.source_url IS NOT NULL`,
      )
    ).rows
      .map((r) => ({ ...r, domain: forbiddenProvenanceDomain(r.url) }))
      .filter((r) => r.domain !== null);
  } catch (e) {
    // A missing column is a schema difference, not a pass. Refuse rather than skip a legal leg.
    await client.query('ROLLBACK');
    die(`STOP: could not check sections.source_url (${e.message}). Refusing to publish without it.`, 1);
  }

  // ── M7: THE GATE IS DIRECTIONAL. IT MUST NOT BLOCK A WITHDRAWAL ────────────────────────
  // 2026-08-02 deep audit. These gates ran over `WHERE status='published'` in BOTH directions, so
  // ONE unrelated illegal published row made `--reverse` roll back and exit 1 — the only database
  // rollback this project has refused to run in precisely the corpus state where an emergency
  // withdrawal is most likely, and there is no second rollback path (PUBLISH_FLIP.md §5 has no
  // restore point, forks are forbidden, and the Neon rollback branch was measured unprotected).
  //
  // A reverse REMOVES rows from `published`. The post-reverse published set is a SUBSET of the
  // pre-reverse one, so it cannot introduce an illegality — every offender it reports was already
  // there and is one this run is reducing, not creating. Blocking on them keeps the illegal rows
  // published, which is the opposite of what the gate is for.
  //
  // So on reverse the gate REPORTS and proceeds, and the subset property is ASSERTED rather than
  // assumed: if a reverse somehow published something, that IS a stop.
  const offenders = badLicense.length + badProvenance.length + badSections.length;
  if (offenders > 0) {
    const label = reverse ? '\nGATE FINDINGS — reported, NOT blocking a withdrawal:' : '\nGATE FAILED — rolled back, nothing published:';
    console.error(label);
    for (const r of badLicense) console.error(`  bad licence: ${r.slug} "${r.license ?? '(none)'}" not in ${ALLOWED_LICENSES.join(' | ')}`);
    for (const r of badProvenance) console.error(`  forbidden provenance: ${r.slug} -> ${r.domain}`);
    for (const r of badSections) console.error(`  forbidden section source_url: ${r.slug} -> ${r.domain}`);
    if (!reverse) {
      await client.query('ROLLBACK');
      process.exit(1);
    }
    console.error('  ^ pre-existing on the published set; this reverse SHRINKS that set. Withdrawal continues.');
  }

  if (reverse) {
    const publishedBefore = new Set(before.filter((r) => r.status === 'published').map((r) => r.slug));
    const gained = after.filter((r) => r.status === 'published' && !publishedBefore.has(r.slug)).map((r) => r.slug);
    if (gained.length > 0) {
      await client.query('ROLLBACK');
      die(`STOP: a REVERSE published ${gained.join(', ')}. A withdrawal may only shrink the published set. Rolled back.`, 1);
    }
  }

  await client.query('COMMIT');
  // BOTH numbers, always (audit finding 2's logging leg): a serve-only run moves 0 status rows
  // and a summary that reports only status reads as a no-op while 300k rows just went live.
  console.log(`\nOK — gate held. ${upd.rowCount} status row(s) ${from} -> ${to}; ${servedRows} embedding row(s) -> served=${servedTo}.`);
  // The hint names the snapshot THIS run just wrote, because --reverse now requires one (M6)
  // and a hint that omits a required flag is a hint that fails. The same snapshot carries the
  // servedBefore record, so it reverses the served write too — including a --serve-published run.
  if (!reverse) {
    console.log(`Reverse with: node scripts/publish-flip.mjs --slugs=${slugFile} --reverse --snapshot=${snapPath}`);
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  die(`FAILED, rolled back: ${e.stack ?? e.message}`, 1);
} finally {
  await client.end();
}
