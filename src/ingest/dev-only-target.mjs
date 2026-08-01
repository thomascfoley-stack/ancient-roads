// THE ONE GUARD FOR EVERY DESTRUCTIVE INGEST WRITER.
//
// WHY THIS FILE EXISTS (2026-08-02 deep audit, C5). Five scripts in this repo delete or truncate
// rows, and each carried its own guard, or none:
//
//   src/ingest/migrate-sections-slice.ts   NO GUARD AT ALL. DELETEs sections/anchors/embeddings
//                                          for a source and re-inserts. Exposed as
//                                          `pnpm migrate:sections-slice`. This is the script that
//                                          wrote all 72,863 production sections at the cutover.
//                                          Every guard lived in the OPTIONAL wrapper
//                                          scripts/cutover-e4-slice-all.mjs.
//   src/ingest/ingest-commentary-fts.ts    TRUNCATE commentary_entries, gated on NEON_BRANCH only.
//   src/ingest/ingest-sermon.ts            DELETE FROM sections, gated on NEON_BRANCH only.
//   src/ingest/ingest-historian.ts         DELETE FROM sections, gated on NEON_BRANCH only.
//   src/ingest/register-writer.ts          The ONLY one that got it right — and its own comment
//                                          says why: "The label alone is self-attested — also
//                                          require the URL to point at a known non-prod endpoint,
//                                          so a prod DATABASE_URL with a stale NEON_BRANCH=dev
//                                          cannot pass (A6 audit)."
//
// That fix was written once and never propagated. `NEON_BRANCH=dev` exported alongside a
// production `DATABASE_URL` truncated the 371,406-row serving FTS corpus, and nothing objected.
// Six works went live on 2026-08-01, so a re-ingest that lands on production is no longer a
// recoverable dev mistake.
//
// This is the propagation, as ONE function rather than a fifth copy — because "a hand-maintained
// set that nothing enforces" is the defect class this repo has paid for most often, and five
// hand-copied guards is that shape with a destructive DELETE behind it.

/** Endpoints a destructive ingest may touch. Production (`ep-odd-fog`) is not on it, ever. */
const DEV_ENDPOINT_MARKERS = ['ep-tiny-hat', 'ep-holy-rice-athhpp5z'];

/** Host of a postgres URL, lowercased. `new URL()` does not parse `postgresql:` hosts reliably. */
function hostOf(url) {
  const m = /^[a-z+]+:\/\/(?:[^@/]*@)?([^/?#]+)/i.exec(String(url).trim());
  return (m?.[1] ?? '').toLowerCase();
}

function isTrulyLocal(host) {
  const h = host.split(':')[0];
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

/**
 * Refuse to run a destructive write unless BOTH the self-attested label and the actual endpoint
 * say non-production. Either alone is insufficient, and that is the whole point:
 *
 *   - the label alone (`NEON_BRANCH=dev`) is a string the operator types, and a stale one
 *     alongside a production URL was the live hole;
 *   - the URL alone would let an unlabelled run proceed against a dev box the operator did not
 *     mean to rewrite.
 *
 * Anchored, not substring: `isTrulyLocal` rejects `localhost.attacker.example`, and the endpoint
 * markers are matched against the host's first label rather than anywhere in the URL — a database
 * NAME or password containing "ep-tiny-hat" must not satisfy a production guard.
 *
 * @param {string|undefined} url   the connection string. Never logged, never returned.
 * @param {string|undefined} branch the NEON_BRANCH label.
 * @param {string} what            what is about to be destroyed, for the message.
 * @returns {string} the host, safe to print.
 */
export function assertDevOnlyTarget(url, branch, what = 'this destructive write') {
  if (!url || !String(url).trim()) {
    throw new Error(`STOP: no DATABASE_URL. ${what} refuses to guess a target.`);
  }
  if (branch !== 'dev' && branch !== 'test') {
    throw new Error(
      `STOP: NEON_BRANCH="${branch ?? '(unset)'}" — export NEON_BRANCH=dev|test alongside ` +
        `DATABASE_URL to run ${what}.`,
    );
  }
  const host = hostOf(url);
  if (!host) throw new Error('STOP: connection string is not a parseable postgres URL.');

  if (isTrulyLocal(host)) return host;

  const label = host.split('.')[0] ?? '';
  if (DEV_ENDPOINT_MARKERS.some((d) => label.startsWith(d))) return host;

  throw new Error(
    `STOP: ${host} is not a dev endpoint. NEON_BRANCH said "${branch}", but the label alone is ` +
      `self-attested — ${what} requires the URL to point at ${DEV_ENDPOINT_MARKERS.join(' / ')} ` +
      'or localhost. A production URL with a stale NEON_BRANCH=dev must never pass.',
  );
}
