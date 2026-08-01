// THE publish-flip target guard. Pure, no I/O, no database — so every refusal below can be
// driven red in a unit test rather than discovered during the one legally irreversible write
// this project makes.
//
// WHY NOT USE assertCutoverTarget DIRECTLY. Two reasons, both material:
//
//   1. It returns early for ANY dev host with no declaration at all (target-guard.mjs:99,
//      `if (isDevHost(url)) return host;`). That is right for a cutover step, which is
//      rehearsed on dev constantly. It is wrong for publishing: the flip is the legal act,
//      and "I thought I was on dev" is exactly the mistake that must cost a declaration.
//      Here, EVERY target needs the allow flag — dev included.
//   2. It cannot express localhost. `declaredMatches` runs through `endpointId`, which only
//      matches /^ep-[a-z0-9]+(-[a-z0-9]+)+$/, so a throwaway local Postgres can never satisfy
//      it. Without a local mode the writer's gates could only ever be exercised against a real
//      Neon endpoint — i.e. the red-proof would require the thing it is protecting.
//
// The primitives are still imported, never re-implemented: hostOf, endpointId, isDevHost,
// isLocalHost and declaredMatches all come from target-guard.mjs.
import { declaredMatches, endpointId, hostOf, isDevHost, isLocalHost } from './target-guard.mjs';

/**
 * Decide whether a publish flip may run against `url`.
 *
 * @param {string|undefined} url  connection string; never logged, never returned
 * @param {{allow: boolean, declared?: string, localOk?: boolean}} opts
 *   allow    — the explicit override (PUBLISH_ALLOW=1). Required for EVERY target.
 *   declared — PUBLISH_EXPECT_HOST, the exact endpoint id. Required for every non-local target.
 *   localOk  — permit localhost/127.0.0.1. Red-proof only; never set by the operator path.
 * @returns {string} the host, for logging. Hosts are safe to print; connection strings are not.
 */
export function assertPublishTarget(url, { allow, declared, localOk = false } = {}) {
  if (url === undefined || url === null || String(url).trim() === '') {
    throw new Error('STOP: no connection string. Set CUTOVER_DATABASE_URL in the environment.');
  }

  let host;
  try {
    host = hostOf(url);
  } catch {
    // Deliberately does not echo the value — a malformed connection string is still a
    // connection string, and it may carry a password.
    throw new Error('STOP: connection string is not a parseable URL.');
  }

  if (isLocalHost(url)) {
    if (!localOk) {
      throw new Error(`STOP: ${host} is local, and the local path is red-proof only. Refusing.`);
    }
    return host;
  }

  // Beyond here, a real endpoint. The override is required even for dev: see the header.
  if (!allow) {
    throw new Error(
      `STOP: ${host} requires an explicit override. Publishing is the legally irreversible act; ` +
        'set PUBLISH_ALLOW=1 deliberately, per occasion.',
    );
  }

  if (!declaredMatches(url, declared)) {
    throw new Error(
      `STOP: ${host} is not the declared endpoint (PUBLISH_EXPECT_HOST=${declared ?? '(unset)'}). ` +
        'It must name the endpoint id exactly — not a substring, not a prefix.',
    );
  }

  // A declared dev endpoint is fine (that is the rehearsal). Recorded, not refused.
  if (isDevHost(url)) return host;

  // Any other declared endpoint — production included — is permitted only by having been
  // named exactly, on top of the override. Prod is not special-cased: being unremarkable here
  // is the point, because a special case is a thing someone can look for and work around.
  if (endpointId(host) === null) {
    throw new Error(`STOP: ${host} does not look like a Neon endpoint. Refusing to guess.`);
  }
  return host;
}
