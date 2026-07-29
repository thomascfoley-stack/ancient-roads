// ONE target guard. Every script that can reach a database imports from here.
//
// Why this file exists (deep-audit 2026-07-27): the same "is this prod?" logic had been
// hand-copied into four scripts, and the copies had drifted into two distinct fail-OPEN
// defects:
//
//   1. CASE. Endpoint ids are DNS labels and DNS is case-insensitive, but `new URL()`
//      only normalizes the host for *special* schemes (http/https/ws/wss/ftp/file). For
//      `postgresql:` the host is preserved verbatim, so `host.includes('ep-odd-fog')`
//      returned false for an UPPERCASE prod URL and the guard waved it through — into,
//      among others, a script whose own header says it DELIBERATELY CORRUPTS ITS TARGET.
//   2. SUBSTRING. `declared.length >= 6 && host.includes(declared)` let an operator
//      set CUTOVER_EXPECT_HOST=neon.tech and thereby authorize every endpoint in the
//      account, production included. The length floor only blocked the empty string.
//
// The rule: compare LOWERCASED, and compare the ENDPOINT ID exactly — never a substring.
// Adding a new allowed target is a change here, in one place, with tests.

/** Production and dev endpoint ids. Lowercase; every comparison lowercases its input. */
export const PROD_ENDPOINT = 'ep-odd-fog';
export const DEV_ENDPOINT = 'ep-tiny-hat';

/** Lowercased host of a connection string. `new URL()` will not do this for postgresql:. */
export function hostOf(url) {
  return new URL(String(url)).host.toLowerCase();
}

/**
 * The Neon endpoint id (the first DNS label) of a host, connection string, or bare id.
 * Returns null for anything that is not an endpoint id — so a generic domain such as
 * "neon.tech" or "aws.neon.tech" can never stand in for a target.
 */
export function endpointId(s) {
  if (s === undefined || s === null) return null;
  const first = String(s).toLowerCase().replace(/^.*@/, '').split('/')[0].split('.')[0].trim();
  return /^ep-[a-z0-9]+(-[a-z0-9]+)+$/.test(first) ? first : null;
}

export function isProdHost(url) {
  return hostOf(url).startsWith(PROD_ENDPOINT);
}

export function isDevHost(url) {
  return hostOf(url).startsWith(DEV_ENDPOINT);
}

/**
 * Does the operator's declared target name THIS endpoint, exactly?
 * The operator may pass the bare id or the whole host; both resolve to the same id.
 */
export function declaredMatches(url, declared) {
  const actual = endpointId(hostOf(url));
  const want = endpointId(declared);
  return actual !== null && want !== null && actual === want;
}

/**
 * The allow rule shared by the cutover's delegate scripts: dev is always fine; a
 * non-dev target requires BOTH the cutover override AND an exactly-declared endpoint.
 * Prod is not special-cased here — it is reachable only by being declared exactly,
 * on top of the override, which is the conscious friction the design asks for.
 */
export function assertCutoverTarget(url, { allow, declared, what = 'target' }) {
  const host = hostOf(url);
  if (isDevHost(url)) return host;
  if (!allow) throw new Error(`STOP: ${what} ${host} is not dev and no cutover override is set`);
  if (!declaredMatches(url, declared)) {
    throw new Error(
      `STOP: ${what} ${host} is not the declared endpoint ` +
      `(CUTOVER_EXPECT_HOST=${declared ?? '(unset)'}). It must name the endpoint id exactly.`);
  }
  return host;
}

/**
 * For scripts that destroy their target on purpose. Refuses prod and dev outright —
 * a refusal that no declared string can override.
 */
export function assertThrowawayTarget(url, declared) {
  const host = hostOf(url);
  if (!declaredMatches(url, declared)) {
    throw new Error(`STOP: host ${host} is not the declared target '${declared ?? '(unset)'}' ` +
      `(must be the exact endpoint id)`);
  }
  if (isProdHost(url) || isDevHost(url)) {
    throw new Error(`REFUSING: ${host} is production or dev — this script corrupts its target`);
  }
  return host;
}
