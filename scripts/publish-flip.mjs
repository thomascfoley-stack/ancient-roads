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
const localOk = has('--local-redproof');
const evidenceDir = val('--evidence') ?? 'docs/evidence/work-order-v2-stage2';

function die(msg, code = 1) {
  console.error(scrubCredentialText(String(msg)));
  process.exit(code);
}

if (!slugFile) die('usage: publish-flip.mjs --slugs=<flip-slugs.json> [--reverse]', 2);

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

  // ── the snapshot: EVERY row, not just the ones being flipped ────────────────────────────
  // The delta assertion below is only meaningful against a complete before-picture, and a
  // partial snapshot cannot prove that nothing else moved.
  const before = (await client.query('SELECT slug, status FROM sources ORDER BY slug')).rows;
  const beforeBy = new Map(before.map((r) => [r.slug, r.status]));

  // Both row decisions come from lib/publish-flip-delta.mjs, which is pure and has tests. They
  // were inline here, where the only way to exercise them was to run this script against a real
  // database — so the two defects the 2026-08-02 audit found in them were found by reading.
  const { missing, eligible, thirdStatus } = eligibility(slugs, beforeBy, from, to);
  if (missing.length > 0) {
    await client.query('ROLLBACK');
    die(`STOP: slug(s) not present in sources: ${missing.join(', ')}`, 1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapPath = path.join(evidenceDir, `flip-pre-snapshot-${stamp}.json`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    snapPath,
    JSON.stringify({ host, direction: `${from}->${to}`, slugFile, slugs, sources: before }, null, 2),
  );
  console.log(`snapshot     ${snapPath} (${before.length} rows, written before COMMIT)`);

  // A listed slug that is in NEITHER direction is a third status — 'quarantined' (migration 006)
  // or 'ingesting' (023). The old message asserted "the rest are already <to>" without checking,
  // so a quarantined work would be silently skipped by the UPDATE and reported as already done.
  if (thirdStatus.length > 0) {
    await client.query('ROLLBACK');
    die(`STOP: listed slug(s) in an unexpected status: ${thirdStatus.map((s) => `${s}=${beforeBy.get(s)}`).join(', ')}. Refusing.`, 1);
  }
  console.log(`eligible     ${eligible.length} of ${slugs.length} are '${from}' (the rest are already '${to}')`);

  const upd = await client.query(
    `UPDATE sources SET status=$2 WHERE slug = ANY($1) AND status=$3 RETURNING slug`,
    [slugs, to, from],
  );
  if (upd.rowCount !== eligible.length) {
    await client.query('ROLLBACK');
    die(`STOP: expected to flip ${eligible.length} row(s), flipped ${upd.rowCount}. Rolled back.`, 1);
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

  if (badLicense.length || badProvenance.length || badSections.length) {
    await client.query('ROLLBACK');
    console.error('\nGATE FAILED — rolled back, nothing published:');
    for (const r of badLicense) console.error(`  bad licence: ${r.slug} "${r.license ?? '(none)'}" not in ${ALLOWED_LICENSES.join(' | ')}`);
    for (const r of badProvenance) console.error(`  forbidden provenance: ${r.slug} -> ${r.domain}`);
    for (const r of badSections) console.error(`  forbidden section source_url: ${r.slug} -> ${r.domain}`);
    process.exit(1);
  }

  await client.query('COMMIT');
  console.log(`\nOK — gate held. ${upd.rowCount} row(s) ${from} -> ${to}.`);
  console.log(`Reverse with: node scripts/publish-flip.mjs --slugs=${slugFile} --reverse`);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  die(`FAILED, rolled back: ${e.stack ?? e.message}`, 1);
} finally {
  await client.end();
}
