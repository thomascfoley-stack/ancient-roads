#!/usr/bin/env node
// Does the credential file in my hand name the database I think it does?
//
// WHY THIS EXISTS AS A SCRIPT AND NOT A ONE-LINER: the first version of this check was a `node -e`
// that re-implemented the endpoint rule as `hostname.includes('ep-odd-fog-atnykudm')`. That is
// LOOSER than the rule corpus-copy.mjs actually enforces - a POOLED prod host contains that
// substring but resolves to the endpoint id `ep-odd-fog-atnykudm-pooler`, which `declaredMatches`
// rejects. The check would have said GOOD and the tool would then have refused, which is this
// repo's most-repeated defect: a verdict computed separately from the thing it claims to verify.
// So the verdict below is delegated to the SAME functions the copier calls. It cannot drift.
//
// It prints host, role and database. It NEVER prints the password, and it never prints the caught
// URL parse error, because Node's ERR_INVALID_URL carries the whole offending string in `.input`.
//
// Usage:  node scripts/check-copy-credentials.mjs ~/.neon_prod_url ep-odd-fog-atnykudm neondb_owner

import { readFileSync } from 'node:fs';
import { declaredMatches, endpointId, hostOf, isProdHost } from './lib/target-guard.mjs';

const [file, declared, wantRole = 'neondb_owner'] = process.argv.slice(2);

if (!file || !declared) {
  console.error('usage: node scripts/check-copy-credentials.mjs <file> <endpoint-id> [role]');
  process.exit(2);
}

let raw;
try {
  raw = readFileSync(file, 'utf8').trim();
} catch {
  console.log(`BAD: cannot read ${file} - the file does not exist yet.`);
  process.exit(1);
}

let u;
try {
  u = new URL(raw);
} catch {
  // Deliberately swallowing the error object: printing it would print the credential.
  console.log(`BAD: ${file} does not contain a valid connection URL.`);
  console.log('     Its value is not shown here, deliberately.');
  console.log('     The usual cause is pasting a placeholder instead of the real string.');
  process.exit(1);
}

const host = hostOf(raw);
console.log('host :', host);
console.log('role :', u.username);
console.log('db   :', u.pathname.slice(1) || '(none)');
console.log('id   :', endpointId(host) ?? '(not a Neon endpoint)');

const problems = [];
// The SAME predicate corpus-copy.mjs uses for its destination declaration.
if (!declaredMatches(raw, declared)) {
  problems.push(`endpoint is not exactly '${declared}' (a -pooler host is a DIFFERENT id - use the direct string)`);
}
if (u.username !== wantRole) {
  problems.push(`role is '${u.username}', need '${wantRole}'`);
}
if (!u.password) {
  problems.push('no password in the URL');
}

if (problems.length) {
  for (const p of problems) console.log('  !', p);
  console.log('==> WRONG');
  process.exit(1);
}
console.log(isProdHost(raw) ? '==> GOOD (this is production)' : '==> GOOD');
