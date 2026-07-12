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
