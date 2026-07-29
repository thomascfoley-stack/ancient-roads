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
import {
  COMMENTARIES_DIR,
  countStaticForbiddenProvenanceEntries,
  loadForbiddenProvenanceBaseline,
  blockedBibleTranslations,
} from '../web/test/helpers/corpus-scan';
import { existsSync } from 'node:fs';

const FAIL = (msg: string): never => {
  console.error(`\n\x1b[31m✗ PRE-DEPLOY GATE FAILED\x1b[0m\n${msg}\n`);
  process.exit(1);
};

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
