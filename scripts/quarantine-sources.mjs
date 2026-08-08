// P0.1 register cleanup — quarantine a NAMED, fixed list of aggregate/duplicate works.
//
//   PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=ep-odd-fog-atnykudm CUTOVER_DATABASE_URL=<owner url> \
//     node scripts/quarantine-sources.mjs --slugs=docs/evidence/register-cleanup/quarantine-slugs.json
//
// This is publish-flip.mjs's `--reverse` shape, narrowed to a third status. `published ->
// quarantined` shrinks the served set exactly like a withdrawal (never introduces anything
// illegal), so this reuses publish-flip's tested pure helpers (eligibility, flipDelta) and its
// guard/credential-scrub infrastructure rather than re-deriving them, and skips the license/
// provenance legality gates entirely — those exist to keep bad content OUT of `published`, not
// to gate its removal.
//
// WHY A NEW SCRIPT AND NOT A THIRD MODE ON publish-flip.mjs. That tool's `from`/`to` are fixed
// to staged<->published by its own `--reverse` flag and its `--serve-published` logic assumes
// `to==='published'`. Bolting a third status onto that would touch the one legally irreversible
// write's own logic for an unrelated, much smaller act. Small, single-purpose, reads clearly.
//
// Slugs are LITERAL, from a committed file — never a predicate — same discipline as publish-flip.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { eligibility, flipDelta } from './lib/publish-flip-delta.mjs';
import { assertPublishTarget, assertStrongTls } from './lib/publish-flip-guard.mjs';
import { scrubCredentialText } from './lib/neon-connection.mjs';

const OWNER_ROLE = 'neondb_owner';
const CONFIRM_WORD = 'quarantine';
const FROM = 'published';
const TO = 'quarantined';

const args = process.argv.slice(2);
const val = (f) => args.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const has = (f) => args.includes(f);
const localOk = has('--local-redproof');
const slugFile = val('--slugs');
const evidenceDir = val('--evidence') ?? 'docs/evidence/register-cleanup';

const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const runLogPath = path.join(evidenceDir, `quarantine-run-${runStamp}.log`);
const runLog = [];
for (const [stream, sink] of [[process.stdout, 'out'], [process.stderr, 'err']]) {
  const original = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => {
    runLog.push(`${sink === 'err' ? '! ' : ''}${scrubCredentialText(String(chunk))}`);
    return original(chunk, ...rest);
  };
}
process.on('exit', () => {
  try {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(runLogPath, runLog.join(''));
  } catch {
    // A log we cannot write must not become the reason a write half-happened.
  }
});

function die(msg, code = 1) {
  console.error(scrubCredentialText(String(msg)));
  process.exit(code);
}

if (!slugFile) die('usage: quarantine-sources.mjs --slugs=<quarantine-slugs.json>', 2);

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

const url = process.env.CUTOVER_DATABASE_URL;
let host;
try {
  host = assertPublishTarget(url, {
    allow: process.env.PUBLISH_ALLOW === '1',
    declared: process.env.PUBLISH_EXPECT_HOST,
    localOk,
  });
  assertStrongTls(url, { localOk });
} catch (e) {
  die(e.message, 2);
}

console.log(`quarantine-sources — target ${host} (credentials redacted)`);
console.log(`direction    ${FROM} -> ${TO}`);
console.log(`slugs        ${slugs.join(', ')} (from ${slugFile})`);

if (!localOk && !process.stdin.isTTY) {
  die('STOP: stdin is not a terminal. This gate cannot be satisfied by a pipe or a heredoc. Run this from a terminal.', 2);
}

async function ownerGate() {
  if (localOk) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) =>
    rl.question(`\nType ${CONFIRM_WORD} to QUARANTINE these ${slugs.length} slug(s) on ${host}: `, (a) => {
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
  die(`STOP: could not connect to ${host}: ${e.message}. Nothing was written.`, 2);
}

try {
  const who = (await client.query('SELECT current_user AS role')).rows[0]?.role;
  if (who !== OWNER_ROLE) {
    die(`STOP: connected as '${who}', expected '${OWNER_ROLE}'. app_runtime cannot write sources.`, 2);
  }
  console.log(`role         ${who} (asserted at the server)`);

  await ownerGate();

  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '15s'");

  // Snapshot + lock only the named rows — this tool's scope is fixed by the slug file, not the
  // whole corpus, so the delta check below only has to prove these rows moved as declared and
  // nothing named moved unexpectedly. It is not claiming the rest of `sources` was untouched.
  const before = (await client.query('SELECT slug, status FROM sources WHERE slug = ANY($1) ORDER BY slug FOR UPDATE', [slugs])).rows;
  const beforeBy = new Map(before.map((r) => [r.slug, r.status]));

  const { missing, eligible, already, thirdStatus } = eligibility(slugs, beforeBy, FROM, TO);
  if (missing.length > 0) {
    await client.query('ROLLBACK');
    die(`STOP: slug(s) not present in sources: ${missing.join(', ')}`, 1);
  }
  if (thirdStatus.length > 0) {
    await client.query('ROLLBACK');
    die(`STOP: slug(s) in an unexpected status: ${thirdStatus.map((s) => `${s}=${beforeBy.get(s)}`).join(', ')}. Refusing to guess.`, 1);
  }
  if (already.length > 0) {
    console.log(`already      ${already.length} slug(s) already 'quarantined': ${already.join(', ')} — no-op for these`);
  }
  console.log(`eligible     ${eligible.length} of ${slugs.length} are 'published'`);

  const upd = eligible.length > 0
    ? await client.query(`UPDATE sources SET status=$2 WHERE slug = ANY($1) AND status=$3 RETURNING slug`, [eligible, TO, FROM])
    : { rowCount: 0 };
  if (upd.rowCount !== eligible.length) {
    await client.query('ROLLBACK');
    die(`STOP: expected to flip ${eligible.length} row(s), flipped ${upd.rowCount}. Rolled back.`, 1);
  }

  // ── unserve: the exact inverse of the served write, scoped to THESE slugs only ────────────
  const sb = await client.query(
    `SELECT metadata->>'work' AS work, count(*)::int AS rows, count(*) FILTER (WHERE served)::int AS served
       FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = ANY($1) GROUP BY 1`,
    [slugs],
  );
  const servedBefore = Object.fromEntries(slugs.map((sl) => [sl, { rows: 0, served: 0 }]));
  for (const r of sb.rows) servedBefore[r.work] = { rows: r.rows, served: r.served };
  const expectedUnserve = slugs.reduce((n, sl) => n + servedBefore[sl].served, 0);

  const emb = expectedUnserve > 0
    ? await client.query(
        `UPDATE embeddings SET served=false WHERE user_id IS NULL AND metadata->>'work' = ANY($1) AND served`,
        [slugs],
      )
    : { rowCount: 0 };
  if (emb.rowCount !== expectedUnserve) {
    await client.query('ROLLBACK');
    die(`STOP: unserve UPDATE moved ${emb.rowCount} row(s), expected ${expectedUnserve}. Served state changed under this transaction. Rolled back; re-run to re-snapshot.`, 1);
  }
  const noRows = slugs.filter((sl) => servedBefore[sl].rows === 0);
  console.log(
    `unserved     ${emb.rowCount} embedding row(s) -> served=false across ${slugs.length} slug(s)` +
    (noRows.length > 0 ? `\n             ⚠ ${noRows.length} slug(s) carry NO work-keyed rows (unreachable by slug): ${noRows.join(', ')}` : ''),
  );

  const after = (await client.query('SELECT slug, status FROM sources WHERE slug = ANY($1) ORDER BY slug', [slugs])).rows;
  const unexpected = flipDelta(before, after, eligible, FROM, TO);
  if (unexpected.length > 0) {
    await client.query('ROLLBACK');
    die(`STOP: rows changed that were not the quarantine:\n  ${unexpected.join('\n  ')}\nRolled back.`, 1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapPath = path.join(evidenceDir, `quarantine-pre-snapshot-${stamp}.json`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(snapPath, JSON.stringify({ host, direction: `${FROM}->${TO}`, slugFile, slugs, servedBefore, sources: before }, null, 2));
  console.log(`snapshot     ${snapPath} (written before COMMIT)`);

  await client.query('COMMIT');
  console.log(`\nOK — ${upd.rowCount} status row(s) ${FROM} -> ${TO}; ${emb.rowCount} embedding row(s) -> served=false.`);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  die(`FAILED, rolled back: ${e.stack ?? e.message}`, 1);
} finally {
  await client.end();
}
