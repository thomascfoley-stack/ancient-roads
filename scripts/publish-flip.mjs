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
import { ALLOWED_LICENSES, isAllowedLicense } from '../src/ingest/allowed-licenses.mjs';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';
import { eligibility, flipDelta } from './lib/publish-flip-delta.mjs';
import { assertPublishTarget, assertStrongTls } from './lib/publish-flip-guard.mjs';
import { scrubCredentialText } from './lib/neon-connection.mjs';

const OWNER_ROLE = 'neondb_owner';
const CONFIRM_WORD = 'publish';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => args.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);

const reverse = has('--reverse');
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

if (!slugFile) die('usage: publish-flip.mjs --slugs=<flip-slugs.json> [--reverse --snapshot=<flip-pre-snapshot-*.json>]', 2);

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
  if (reverseSlugs.length === 0) {
    die('STOP: the snapshot shows the forward flip moved none of these slugs. Nothing to reverse.', 2);
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
  // `sources` is 7 rows, so this costs nothing. It also composes with the re-ingest guard added the
  // same day (src/ingest/reingest-guard.ts): that guard takes FOR UPDATE on the row it is about to
  // delete sections for, so a re-ingest and a flip now mutually exclude — which is what makes the
  // `badSections` leg below trustworthy without locking 72,863 section rows.
  const before = (await client.query('SELECT slug, status FROM sources ORDER BY slug FOR UPDATE')).rows;
  const beforeBy = new Map(before.map((r) => [r.slug, r.status]));

  // Both row decisions come from lib/publish-flip-delta.mjs, which is pure and has tests. They
  // were inline here, where the only way to exercise them was to run this script against a real
  // database — so the two defects the 2026-08-02 audit found in them were found by reading.
  // `reverseSlugs` is `slugs` on a forward run and the snapshot-narrowed set on a reverse (M6).
  const payload = reverseSlugs;
  const { missing, eligible, thirdStatus } = eligibility(payload, beforeBy, from, to);
  if (missing.length > 0) {
    await client.query('ROLLBACK');
    die(`STOP: slug(s) not present in sources: ${missing.join(', ')}`, 1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapPath = path.join(evidenceDir, `flip-pre-snapshot-${stamp}.json`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    snapPath,
    JSON.stringify({ host, direction: `${from}->${to}`, slugFile, slugs, payload, sources: before }, null, 2),
  );
  console.log(`snapshot     ${snapPath} (${before.length} rows, written before COMMIT)`);

  // A listed slug that is in NEITHER direction is a third status — 'quarantined' (migration 006)
  // or 'ingesting' (023). The old message asserted "the rest are already <to>" without checking,
  // so a quarantined work would be silently skipped by the UPDATE and reported as already done.
  if (thirdStatus.length > 0) {
    await client.query('ROLLBACK');
    die(`STOP: listed slug(s) in an unexpected status: ${thirdStatus.map((s) => `${s}=${beforeBy.get(s)}`).join(', ')}. Refusing.`, 1);
  }
  console.log(`eligible     ${eligible.length} of ${payload.length} are '${from}' (the rest are already '${to}')`);

  const upd = await client.query(
    `UPDATE sources SET status=$2 WHERE slug = ANY($1) AND status=$3 RETURNING slug`,
    [payload, to, from],
  );
  if (upd.rowCount !== eligible.length) {
    await client.query('ROLLBACK');
    die(`STOP: expected to flip ${eligible.length} row(s), flipped ${upd.rowCount}. Rolled back.`, 1);
  }

  // ── `embeddings.served` moves WITH the status, in this same transaction (migration 039) ──
  // Before 039 these were unrelated facts: retrieval read four hand-typed slug lists in
  // routing.ts, so publishing a work made it shelf-readable and left it invisible to /ask. 76 of
  // the 77 works published on 2026-08-03 landed in exactly that state. `served` is now the switch,
  // and this is its ONLY writer — which is what makes the licensing argument hold, because a row
  // is reachable here only by a slug that survived admission.
  //
  // SAME TRANSACTION, NOT A FOLLOW-UP STEP. A commit that moved `status` without `served` would
  // leave the two facts disagreeing again, which is the whole defect. If either fails, both roll
  // back. The count is asserted rather than trusted: `sources.status` and the flat table are
  // joined only by `metadata->>'work'`, and a work whose rows carry no work key (the legacy
  // author-admitted cohort) legitimately moves ZERO rows — so a mismatch is reported, not fatal,
  // and the number is printed so a silent zero cannot pass as success.
  const servedTo = to === 'published';
  const emb = await client.query(
    `UPDATE embeddings SET served=$2
      WHERE user_id IS NULL AND metadata->>'work' = ANY($1) AND served <> $2`,
    [payload, servedTo],
  );
  const workKeyed = await client.query(
    `SELECT count(DISTINCT metadata->>'work')::int AS works, count(*)::int AS rows
       FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = ANY($1)`,
    [payload],
  );
  console.log(
    `served       ${emb.rowCount} embedding row(s) -> served=${servedTo} ` +
    `(${workKeyed.rows[0].works}/${payload.length} listed slug(s) carry work-keyed rows, ${workKeyed.rows[0].rows} total)`,
  );

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
  console.log(`\nOK — gate held. ${upd.rowCount} row(s) ${from} -> ${to}.`);
  // The hint names the snapshot THIS run just wrote, because --reverse now requires one (M6)
  // and a hint that omits a required flag is a hint that fails.
  if (!reverse) {
    console.log(`Reverse with: node scripts/publish-flip.mjs --slugs=${slugFile} --reverse --snapshot=${snapPath}`);
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  die(`FAILED, rolled back: ${e.stack ?? e.message}`, 1);
} finally {
  await client.end();
}
