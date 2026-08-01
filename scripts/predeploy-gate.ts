/**
 * PRE-DEPLOY GATE — the licensing ratchet, enforced where the artifact actually is.
 *
 * WHY THIS EXISTS (and why CI cannot do this job):
 *   web/public/commentaries/ is GITIGNORED and has NO build step. It is written by
 *   offline ingest scripts and lives only on the operator's machine. `vercel --prod`
 *   uploads the local working directory, so those ~380MB of commentary JSON ship to
 *   production WITHOUT ever passing through git or CI. CI literally cannot see them.
 *
 *   Therefore the ONLY point in the pipeline where the artifact being shipped is
 *   visible is right here — on this machine, immediately before the upload.
 *
 * WHAT IT ENFORCES:
 *   - The corpus must be present (you cannot ship a reader with no content, and you
 *     cannot ship content that was never counted).
 *   - Forbidden-provenance entries (biblehub / studylight / historicalchristian.faith)
 *     may only ever go DOWN. Any increase fails the deploy.
 *   - Once the baseline reaches 0, ANY forbidden entry fails the deploy.
 *
 * Run: npx tsx scripts/predeploy-gate.ts   (deploy.sh calls this before building)
 * Reuses the single canonical domain check (src/ingest/license-manifest) via the
 * same scanner the QA suite uses — no second implementation.
 */
import { assertServedAssetsScannable, missingServedAssetDirs, servedAssetCountRatchet } from './lib/served-assets.mjs';
import { scanServedCorpusAuthors } from './lib/served-corpus-authors.mjs';
import {
  COMMENTARIES_DIR,
  countStaticForbiddenProvenanceEntries,
  loadForbiddenProvenanceBaseline,
  blockedBibleTranslations,
} from '../web/test/helpers/corpus-scan';
import {
  collapseByAuthor,
  eligibleAuthorCount,
  forbiddenServedEntries,
  loadCorpusEntries,
  verseKeyOffenders,
} from '../web/test/helpers/verse-key-scan';
import {
  buildCorpusInventory,
  evaluateCorpusRatchet,
  loadLatestManifest,
} from './lib/corpus-manifest.mjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FAIL = (msg: string): never => {
  console.error(`\n\x1b[31m✗ PRE-DEPLOY GATE FAILED\x1b[0m\n${msg}\n`);
  process.exit(1);
};

// deploy.sh sets DEPLOYING=1. This same gate also runs on every pre-commit, where the
// corpus may legitimately be mid-regeneration — so the corpus-identity legs below WARN on
// commit and HARD-FAIL on deploy. The distinction is the whole point of Stage 3.1: the
// artifact is only provably present at deploy, which is exactly when a skip is inexcusable.
const DEPLOYING = process.env.DEPLOYING === '1';
const gateFail = (msg: string): void => {
  if (DEPLOYING) FAIL(msg);
  console.warn(`\n\x1b[33m⚠  ${msg}\n   (WARNING only — will HARD-FAIL the actual deploy.)\x1b[0m`);
};

// SERVED-ASSET COMPLETENESS — derived from the client, not typed here.
// Until 2026-08-01 this gate validated `commentaries` and `bible` and nothing else, while the app
// also served `concordance/`, `lexicon/`, `original/` and `devotional/`. Three were ABSENT from the
// deploying machine and the gate said nothing (ninth instance of the hand-maintained expected set).
// servedAssetDirs() reads which directories the client fetches a .json from, so a newly served
// directory is accounted for without touching any list here.
{
  const scan = assertServedAssetsScannable();
  if (!scan.ok) {
    FAIL(
      `Cannot derive the served-asset set: ${scan.offenders.join(', ')} build a root-absolute path from a variable.\n` +
      `The scan would under-read, and an under-reading completeness check is worse than none.`,
    );
  }
  const served = missingServedAssetDirs();
  console.log('\n=== Pre-deploy gate: served static asset directories (derived from web/src) ===');
  console.log(`  serves: ${served.served.join(', ')}`);
  if (!served.ok) {
    FAIL(
      `Directories the application SERVES but which are absent from web/public:\n  ${served.missing.join('\n  ')}\n\n` +
      `vercel --prod uploads the working tree, so these would ship missing and their pages would\n` +
      `404 or throw at runtime. Restore them (docs/RECOVERY.md §3a) or stop serving them.`,
    );
  }
  console.log('  \x1b[32m✓ every served asset directory is present.\x1b[0m');

  // PRESENT is not INTACT (DEPLOY_PREFLIGHT §2: "the real remaining gap"). The presence check
  // above refuses a directory that vanished; this refuses one that is present but half-empty.
  // The reader cannot report the difference - fetchJson returns null on a non-ok response, so a
  // partial loss ships as blank panels, not as an error. Counts are ratcheted against the
  // committed baseline (docs/evidence/served-assets-baseline.json); the ratchet itself refuses
  // on a missing or garbled baseline rather than skipping, and absence stays the presence
  // check's finding - only an undercount is this leg's.
  const counted = servedAssetCountRatchet();
  if (!counted.ok) {
    const findings = [
      ...counted.failures,
      ...counted.absent.map(
        (d) => `${d}: in the baseline but absent from web/public - no longer served? re-record the baseline.`,
      ),
    ];
    FAIL(
      `SERVED-ASSET COUNT RATCHET - a served directory carries FEWER files than the committed\n` +
      `baseline, or the baseline itself is unusable:\n${findings.map((f) => `  • ${f}`).join('\n')}\n\n` +
      `A half-empty directory passes the presence check, exits 0, and fails silently in the UI.\n` +
      `Restore the files (docs/RECOVERY.md §3a), or - if the smaller count is intended - say so\n` +
      `on the record:\n  node scripts/update-served-assets-baseline.mjs --yes   (then commit the baseline)`,
    );
  }
  const unbaselined = served.served.filter((d) => !(d in counted.baseline));
  if (unbaselined.length > 0) {
    FAIL(
      `Served directories with NO count baseline: ${unbaselined.join(', ')}.\n` +
      `A directory the ratchet has no number for is one it silently cannot defend. Record it:\n` +
      `  node scripts/update-served-assets-baseline.mjs --yes   (then commit the baseline)`,
    );
  }
  for (const inc of counted.increases) {
    console.log(`  note: ${inc} - record it: node scripts/update-served-assets-baseline.mjs --yes`);
  }
  console.log('  \x1b[32m✓ every served directory meets its committed file-count baseline.\x1b[0m');
}

console.log('\n=== Pre-deploy gate: licensing ratchet ===');

if (!existsSync(COMMENTARIES_DIR)) {
  FAIL(
    `The static commentary corpus is missing:\n  ${COMMENTARIES_DIR}\n\n` +
      `Refusing to deploy. Either the reader will ship with no content, or content is\n` +
      `about to be uploaded that this gate never counted. Both are unacceptable.\n` +
      `Regenerate it (src/ingest/merge-commentaries.ts) and re-run.`,
  );
}

const baseline = loadForbiddenProvenanceBaseline();
const current = countStaticForbiddenProvenanceEntries();

console.log(`  forbidden-provenance entries : ${current.toLocaleString()}`);
console.log(`  committed baseline           : ${baseline.count.toLocaleString()}`);

if (baseline.count === 0 && current > 0) {
  FAIL(
    `Baseline is 0 — the corpus is supposed to be clean, but ${current.toLocaleString()} ` +
      `forbidden-provenance entries are about to be uploaded to production.`,
  );
}

if (current > baseline.count) {
  FAIL(
    `RATCHET VIOLATION — forbidden-provenance content INCREASED.\n` +
      `  was ${baseline.count.toLocaleString()} → now ${current.toLocaleString()} ` +
      `(+${(current - baseline.count).toLocaleString()})\n\n` +
      `Something added content sourced from a forbidden aggregator. The number may only\n` +
      `go down. Fix the content, or if this increase is intentional and lawful, you must\n` +
      `say so explicitly by updating web/test/baselines/static-forbidden-provenance.json.`,
  );
}

// ── SERVED AUTHORS: what the static files DELIVER, not what the UI renders ─────────────────
//
// The ratchet above scans `entry.sourceUrl` against three domains, and `forbiddenProvenanceDomain('')`
// returns null — so an entry with an empty sourceUrl counts as clean. That is why it reported
// "ratchet holds" over 16,480 entries by authors this repo's own MUST_NOT_SERVE_AUTHORS list
// forbids, plus 1,843 by 20th-century authors including a living one (2026-08-02 deep audit, C2).
//
// The licence filter for these files runs in the BROWSER (web/src/lib/bible.ts:132), after Next
// has served them. It governs rendering, not delivery. This leg governs delivery.
//
// It does NOT delete anything: content quarantine is an owner call (AGENTS.md). It refuses the
// deploy while the count is non-zero, which is the correct division — the bytes stay put, and
// they stay put on this machine rather than on the internet.
const servedAuthors = scanServedCorpusAuthors(COMMENTARIES_DIR);
console.log(`  served commentary entries    : ${servedAuthors.entries.toLocaleString()} in ${servedAuthors.files.toLocaleString()} files`);
if (servedAuthors.offenders.length > 0) {
  const rows = servedAuthors.offenders
    .map((o) => `    ${String(o.entries).padStart(6)} entries  ${(o.chars / 1e6).toFixed(2)} MB  [${o.kind}]  ${o.author}   e.g. ${o.sample}`)
    .join('\n');
  const total = servedAuthors.offenders.reduce((n, o) => n + o.entries, 0);
  // gateFail, not FAIL: this HARD-FAILS the deploy and WARNS on pre-commit, like every other
  // corpus-identity leg. A pre-existing condition that blocks every commit stops being a gate
  // and starts being an obstacle people route around with --no-verify — and the thing it is
  // guarding is DELIVERY, which only happens at deploy.
  gateFail(
    `${total.toLocaleString()} SERVED entries carry an author that must not be delivered.\n${rows}\n\n` +
      `These files are unauthenticated static assets. The filter in bible.ts runs in the browser,\n` +
      `AFTER delivery — it decides what is rendered, not what is sent. Fetching the file directly\n` +
      `returns every entry in it.\n\n` +
      `This is an OWNER decision (content quarantine, AGENTS.md), so the gate refuses rather than\n` +
      `editing the corpus. Options: remove these entries from the served files, move the corpus\n` +
      `behind a filtering route handler, or — if a licence record covers one of the in-copyright\n` +
      `names — record it in web/src/lib/licensing.ts and take the name off the suspects list in\n` +
      `scripts/lib/served-corpus-authors.mjs.`,
  );
}

if (current < baseline.count) {
  console.log(
    `\n\x1b[32m✓ Debt reduced by ${(baseline.count - current).toLocaleString()}.\x1b[0m ` +
      `Run \`pnpm qa:baseline\` to commit the new lower baseline.`,
  );
}

console.log(
  `\n\x1b[32m✓ Ratchet holds.\x1b[0m Shipping ${current.toLocaleString()} known forbidden-provenance ` +
    `entries (≤ baseline).\n` +
    `  This is DEBT, not approval. It is visible, it is capped, and it may only shrink.\n` +
    `  Reduce it via docs/CONTENT_RECOVERY_PIPELINE.md.\n`,
);

// Bible-translation licensing (LONG_NIGHT C1/H5): the reader ships raw Scripture from
// public/bible/<id>/. Copyrighted translations (LEB/LITV/MKJV/LSV, …) were stored full-text
// AND deployed because this gate only ever scanned commentaries/. Refuse to ship any
// translation dir the manifest forbids — the file-side twin of the picker guard.
// Bible-translation licensing (T1§3). The gate reads the per-work LICENSE RECORD
// (web/src/lib/licensing.ts), block-by-default: a translation dir ships only if its record
// says commercial_use=allow, or conditional AND acknowledged (LICENSE_ACK). deny / unknown /
// no-record all block. This replaced the old hardcoded denylist so the decision rests on a
// license, not a blocklist — and a translation with NO record blocks instead of slipping.
console.log('\n=== Pre-deploy gate: Bible-translation licensing (per-work record) ===');
const blockedTranslations = blockedBibleTranslations();
if (blockedTranslations.length > 0) {
  const lines = blockedTranslations.map((b) => `  ${b.id} — ${b.reason}`).join('\n');
  const msg =
    `Bible translations present in public/bible/ that the license record does not permit:\n` +
    `${lines}\n\n` +
    `Each must ship only on a license record (web/src/lib/licensing.ts) with commercial_use=allow,\n` +
    `or conditional + its id in LICENSE_ACK. Remove web/public/bible/<id>/ for the ones you can't\n` +
    `license, set LICENSE_ACK for conditional ones, or add a verified allow record — then re-run.`;
  // FAIL only when actually deploying (deploy.sh sets DEPLOYING=1); this same gate runs on every
  // pre-commit, and must not block all commits while a file purge is pending. Commit: WARNING.
  if (process.env.DEPLOYING === '1') FAIL(msg);
  console.warn(`\n\x1b[33m⚠  ${msg}\n   (WARNING only — will HARD-FAIL the actual deploy.)\x1b[0m`);
} else {
  console.log(`  ✓ Every translation dir present has a shipping license record (allow, or conditional+ack).`);
}

// ── Corpus identity + loss ratchet (Stage 3.1) ───────────────────────────────
// Git identifies the CODE that ships. Until now nothing identified the CONTENT: the corpus
// is gitignored, has no build step, and is uploaded straight from the working directory, so
// two deploys from one sha could carry different content with no record of the difference.
console.log('\n=== Pre-deploy gate: corpus identity (file count + per-work presence) ===');
const inventory = buildCorpusInventory(COMMENTARIES_DIR);
const EVIDENCE_DIR = path.resolve(COMMENTARIES_DIR, '../../../docs/evidence');
const previousManifest = loadLatestManifest(EVIDENCE_DIR, (p) => JSON.parse(readFileSync(p, 'utf-8')));
const ratchet = evaluateCorpusRatchet(inventory, previousManifest, { deploying: DEPLOYING });

console.log(`  works (authors) present      : ${Object.keys(inventory.works).length.toLocaleString()}`);
console.log(`  books present                : ${Object.keys(inventory.books).length.toLocaleString()}`);
console.log(`  chapter files present        : ${inventory.fileCount.toLocaleString()}`);
console.log(`  entries present              : ${inventory.entryCount.toLocaleString()}`);
console.log(`  corpusHash                   : ${inventory.corpusHash ?? '(no corpus)'}`);

// CORPUS HASH, COMPARED — not merely printed (2026-08-02 deep audit, M10).
//
// DEPLOY_PREFLIGHT.md checklist item 4 says "corpusHash matches the committed manifest (step 3
// prints and checks it)" and §3 repeats it, while §9 says the opposite — and the UNCORRECTED
// copy is the line the operator ticks. Measured: `corpusHash` appeared in no comparison anywhere
// in scripts/. The ratchet compares fileCount, entryCount, works and books, all of which are
// SHAPE. A corpus whose CONTENT changed with unchanged shape — entries rewritten, text swapped,
// sourceUrl provenance edited in place — passed every leg. The one value that detects it was
// computed and discarded.
//
// WHAT IT ACTUALLY DETECTS, stated precisely, because both the audit finding and the first
// version of this comment overclaimed it. `corpusHash` hashes the INVENTORY, not the bytes —
// corpus-manifest.mjs:68 says so: books with file counts and works with per-author entry counts,
// in a stable order. So it catches COMPOSITION drift that the totals cannot: author A losing 100
// entries while author B gains 100 leaves fileCount and entryCount identical and changes this
// hash. It does NOT detect a rewritten body or an edited sourceUrl — verified by seeding one
// trailing space into an entry's text and watching the hash stay identical. That gap is real and
// is not closed here; a content digest would be a different value and a different slice.
//
// A CHANGE is not automatically a failure: the corpus legitimately grows, and the ratchet exists
// to allow that. So this reports a mismatch loudly and fails only when DEPLOYING, and the message
// says exactly what to do — because "hash differs" on a grown corpus means the manifest is stale,
// which is itself worth knowing before shipping.
if (previousManifest && inventory.corpusHash && previousManifest.corpusHash !== inventory.corpusHash) {
  const shapeSame =
    previousManifest.fileCount === inventory.fileCount && previousManifest.entryCount === inventory.entryCount;
  gateFail(
    `corpusHash MISMATCH against the committed manifest.\n` +
      `  committed : ${previousManifest.corpusHash} (sha ${previousManifest.sha}, ${previousManifest.fileCount.toLocaleString()} files / ${previousManifest.entryCount.toLocaleString()} entries)\n` +
      `  on disk   : ${inventory.corpusHash} (${inventory.fileCount.toLocaleString()} files / ${inventory.entryCount.toLocaleString()} entries)\n\n` +
      (shapeSame
        ? `  File and entry TOTALS are identical, so every counting leg above passed. The\n` +
          `  composition changed underneath them — an author or a book traded for another. That\n` +
          `  is the case the totals cannot see, and the reason this comparison exists.\n` +
          `  (Note: this hash covers composition, NOT bodies. A rewritten passage or an edited\n` +
          `  sourceUrl does not move it — see the comment at this check.)\n\n`
        : `  The shape also changed, so this is most likely an ingest the manifest predates.\n\n`) +
      `  If the corpus on disk is the intended one, regenerate and commit the manifest:\n` +
      `    node scripts/build-corpus-manifest.mjs`,
  );
} else if (previousManifest && inventory.corpusHash) {
  console.log(`  corpusHash vs manifest       : MATCH (${previousManifest.sha})`);
}
if (previousManifest) {
  console.log(
    `  last manifest                : ${previousManifest.sha} v${previousManifest.version ?? 1} ` +
      `(${previousManifest.workCount} works, ${previousManifest.fileCount.toLocaleString()} files, ${(previousManifest.entryCount ?? 0).toLocaleString()} entries)`,
  );
} else {
  console.log('  last manifest                : NONE');
}

if (!ratchet.ok) {
  gateFail(
    `CORPUS RATCHET VIOLATION — content is about to ship that is SMALLER than the last\n` +
      `manifest, or cannot be compared to one:\n\n${ratchet.failures.map((f) => `  • ${f}`).join('\n')}\n\n` +
      `A missing work is invisible in the reader: it renders whatever it finds, so a\n` +
      `half-finished regeneration ships as a quietly smaller library. Either restore the\n` +
      `content, or — if the reduction is intended — run\n` +
      `  node scripts/build-corpus-manifest.mjs\n` +
      `and COMMIT the new manifest, which is how you say so on the record.`,
  );
} else if (ratchet.baselining) {
  console.log('  \x1b[33m⚠ BASELINING — no previous manifest to compare against (this is a survey, not a ratchet).\x1b[0m');
} else {
  console.log('  \x1b[32m✓ No work lost since the last committed manifest.\x1b[0m');
}

// ── §3 verse-key distribution, enforced AT DEPLOY (Stage 3.1) ────────────────
// This ran only in web/test/invariants/verse-keys.test.ts, guarded by `describe.skipIf`
// on the gitignored corpus — correct in CI, and precisely backwards here. THE ARTIFACT-SKIP
// EXEMPTION DOES NOT APPLY AT DEPLOY: if the corpus is missing at this point there is
// nothing to ship, and if it is present the guard has no excuse not to run.
console.log('\n=== Pre-deploy gate: §3 verse-key distribution (no artifact exemption) ===');
if (!existsSync(COMMENTARIES_DIR)) {
  gateFail(`The corpus is absent at ${COMMENTARIES_DIR}, so the ADR-020 verse-key gate cannot run.\nAt deploy time that is a refusal, not a skip.`);
} else {
  const entries = loadCorpusEntries(COMMENTARIES_DIR);
  const byAuthor = collapseByAuthor(entries);
  const eligible = eligibleAuthorCount(byAuthor);
  console.log(`  entries scanned              : ${entries.length.toLocaleString()}`);
  console.log(`  authors over the n floor     : ${eligible}`);

  if (eligible === 0) {
    // Same anti-vacuity floor the test carries: with no author above MIN_ENTRIES the
    // check below could not have failed, so a green here would be unearned.
    gateFail('VACUOUS GATE: no author reached the entry floor, so the verse-key check could not have failed.\nThe corpus is empty or partial — fix the corpus, do not trust this green.');
  } else {
    const offenders = verseKeyOffenders(byAuthor);
    if (offenders.length > 0) {
      gateFail(`Authors whose verse keys collapse to the chapter number (ADR-020):\n${offenders.map((o) => `  • ${o}`).join('\n')}`);
    } else {
      console.log('  \x1b[32m✓ No author collapsed to the chapter number.\x1b[0m');
    }

    const served = forbiddenServedEntries(entries);
    if (served.length > 0) {
      const authors = [...new Set(served.map((e) => e.author))];
      gateFail(`${served.length.toLocaleString()} SERVED entry/entries carry biblehub/studylight provenance (${authors.join(', ')}).`);
    } else {
      console.log('  \x1b[32m✓ No served entry carries forbidden aggregator provenance.\x1b[0m');
    }
  }
}
