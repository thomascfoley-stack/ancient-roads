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
import { declaredMatches, endpointId, hostOf, isDevHost } from './target-guard.mjs';

/**
 * Is this host REALLY local? target-guard's isLocalHost uses an unanchored startsWith, so it
 * accepts `localhost.attacker.example` and even `localhostage.evil.io` — found by the 2026-08-02
 * audit. Anchored here rather than there because target-guard is on other tools' paths and this
 * file is the one that gates a production write: `--local-redproof` skips the owner gate, the TTY
 * requirement and the role assert, so a host that merely BEGINS with `localhost` must never reach
 * that branch. Port is allowed; anything else after the host is not.
 */
function isTrulyLocal(url) {
  const h = hostOf(url).split(':')[0];
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

/** sslmode values that weaken or disable certificate verification. */
const WEAK_SSLMODES = new Set(['disable', 'allow', 'prefer', 'no-verify']);

/**
 * Refuse a connection string that would silently downgrade TLS.
 *
 * WHY THIS IS NOT REDUNDANT WITH `ssl: {rejectUnauthorized:true}`. It is the opposite of
 * redundant: pg's connection-parameters.js does
 *   `Object.assign({}, config, parse(config.connectionString))`
 * so **the parsed URL wins over the explicit config object** (2026-08-02 deep audit, C4).
 * Measured on the installed pg:
 *   (no sslmode)        -> {rejectUnauthorized:true}   as written
 *   ?sslmode=require    -> {}                          Node default true — safe by accident
 *   ?sslmode=no-verify  -> {rejectUnauthorized:false}  verification OFF
 *   ?sslmode=disable    -> false                       no TLS at all
 * The URL is deliberately never printed or inspected, so nothing in the committed artifact set
 * recorded what TLS was actually in force during the flip — the host-pinning guard was pinning a
 * DNS name whose certificate may never have been verified.
 *
 * Forward hazard, which is why this refuses rather than silently re-forcing the config:
 * pg-connection-string warns that v3 changes `sslmode=require` to libpq semantics, moving today's
 * safe-by-accident row into the unsafe column with no code change here.
 *
 * @param {string} url
 * @param {{localOk?: boolean}} opts  local red-proof runs against a non-TLS throwaway; exempt.
 */
export function assertStrongTls(url, { localOk = false } = {}) {
  if (localOk) return;
  let mode;
  try {
    mode = new URL(url).searchParams.get('sslmode');
  } catch {
    throw new Error('STOP: connection string is not a parseable URL.');
  }
  if (mode !== null && WEAK_SSLMODES.has(mode.toLowerCase())) {
    throw new Error(
      `STOP: connection string carries sslmode=${mode}, which pg applies OVER the explicit ` +
        'ssl config — certificate verification would be weakened or off on a production write. ' +
        'Use sslmode=verify-full, or omit sslmode entirely.',
    );
  }
}

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

  // localOk REQUIRES local. It does not merely permit it.
  //
  // This was the other way round, and it was the worst defect in the toolchain (2026-08-02 deep
  // audit, C3). The check lived only inside the `isTrulyLocal` branch, so a PRODUCTION url never
  // entered that branch, fell through to the ordinary checks, and passed them — verified by
  // execution against the real production host. Downstream, `--local-redproof` skips the non-TTY
  // refusal (publish-flip.mjs:105), returns from `ownerGate()` immediately (:115) and disables TLS
  // verification (:126). One argv token turned the one legally irreversible write in this project
  // into an unattended one, on a flag whose own docstring says "never set by the operator path".
  //
  // Stated as an invariant rather than a branch: the red-proof path and a real endpoint are
  // mutually exclusive, and the refusal is symmetric so neither direction can drift back.
  const local = isTrulyLocal(url);
  if (localOk && !local) {
    throw new Error(
      `STOP: --local-redproof was set but ${host} is not local. The red-proof path skips the owner ` +
        'gate, the TTY requirement and TLS verification; it may never point at a real endpoint.',
    );
  }
  if (local) {
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
  // Pin the DOMAIN, not just the first label. `endpointId` takes split('.')[0], so
  // `ep-odd-fog-atnykudm.attacker.example` yields the real endpoint id and satisfies
  // `declaredMatches` — declaring the full production host still accepted an attacker domain
  // (2026-08-02 audit). A production write target must be a Neon host.
  if (endpointId(host) === null) {
    throw new Error(`STOP: ${host} does not look like a Neon endpoint. Refusing to guess.`);
  }
  if (!/\.neon\.tech(:\d+)?$/.test(host)) {
    throw new Error(
      `STOP: ${host} is not a *.neon.tech host. The endpoint id matching it is not enough — ` +
        'the domain must be Neon too.',
    );
  }
  return host;
}

// ── THAYER'S SOURCE-VERIFICATION GATE (owner ruling 2026-08-21) ───────────────────────────
// Publishing thayers-lexicon requires committed evidence that the TARGET database's copy was
// verified against the CC0 source (checksum/shingle-diff) — prod may hold the dead OCR copy,
// and a citation pointing at corrupted data is worse than no citation. Pure: the caller reads
// the evidence file and passes its text (or null when absent), so every refusal is unit-testable.
// Returns an error string to die with, or null when the flip may proceed.
export const THAYERS_EVIDENCE_PATH = 'docs/evidence/thayers-source-verification.md';
export function thayersEvidenceError(slugs, { reverse, evidenceText }) {
  if (reverse) return null; // un-publishing carries no fidelity risk
  if (!slugs.includes('thayers-lexicon')) return null;
  const hasSha = typeof evidenceText === 'string' && /\b[0-9a-f]{64}\b/i.test(evidenceText);
  if (hasSha) return null;
  return (
    'STOP: thayers-lexicon may not be published without source verification.\n' +
    `  Required: ${THAYERS_EVIDENCE_PATH} — the record of a checksum/shingle-diff of the TARGET\n` +
    "  database's copy against the CC0 source edition, containing the sha256 value(s) compared.\n" +
    (evidenceText != null
      ? '  The file exists but carries no sha256 — a placeholder does not satisfy the gate.'
      : '  The file does not exist.')
  );
}
