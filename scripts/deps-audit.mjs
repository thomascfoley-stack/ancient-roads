/**
 * DEPS AUDIT — the real CVE gate (C3 fix, 2026-07-14).
 *
 * Preflight: installed prod closure must match pnpm-lock.yaml (N-1). The bulk scan
 * reads the installed tree; a stale node_modules produces false reds or false greens.
 *
 * Run: node scripts/deps-audit.mjs [--expect-red GHSA-...]
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { selectFindings, compareExpectRed, resolvedInLockfile } from './deps-audit-core.mjs';

const BULK = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const ROOT = new URL('..', import.meta.url).pathname;

/** Package names commonly tied to declared/ignored GHSA ids when not in findings. */
const GHSA_CARRIER_PACKAGES = {
  'GHSA-qq9h-g4jm-xgf3': 'better-auth',
};

function parseExpectRed(argv) {
  const i = argv.indexOf('--expect-red');
  if (i === -1) return null;
  const val = argv[i + 1];
  if (!val || val.startsWith('-')) {
    console.error('\n\x1b[31m✗ deps-audit: --expect-red requires a comma-separated GHSA list\x1b[0m');
    process.exit(2);
  }
  return new Set(val.split(',').map((s) => s.trim()).filter(Boolean));
}

const expectRed = parseExpectRed(process.argv);

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const IGNORE = new Set(pkg.pnpm?.auditConfig?.ignoreGhsas ?? []);

// --- package.json ↔ lockfile must be in sync ---
try {
  execSync('corepack pnpm install --frozen-lockfile --ignore-scripts', {
    encoding: 'utf8',
    stdio: 'pipe',
    cwd: ROOT,
  });
} catch (e) {
  console.error(
    '\n\x1b[31m✗ deps-audit: REFUSING — pnpm install --frozen-lockfile failed.\x1b[0m\n' +
      '  package.json and pnpm-lock.yaml are out of sync. Fix the lockfile before auditing.',
  );
  process.exit(2);
}

const lockPath = `${ROOT}/pnpm-lock.yaml`;
if (!existsSync(lockPath)) {
  console.error('\n\x1b[31m✗ deps-audit: REFUSING — pnpm-lock.yaml missing\x1b[0m');
  process.exit(2);
}
const lockText = readFileSync(lockPath, 'utf8');

// --- collect the prod dependency closure { name -> Set<version> } ---
const raw = execSync('corepack pnpm list -r --prod --depth Infinity --json', {
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
  cwd: ROOT,
});
const projects = JSON.parse(raw);
const pkgs = new Map();
const add = (name, version) => {
  if (!version) return;
  const v = String(version).split('(')[0].trim();
  if (!/^\d/.test(v)) return;
  if (!pkgs.has(name)) pkgs.set(name, new Set());
  pkgs.get(name).add(v);
};
const walk = (deps) => {
  for (const [name, info] of Object.entries(deps ?? {})) {
    if (!info || typeof info !== 'object') continue;
    add(name, info.version);
    walk(info.dependencies);
    walk(info.optionalDependencies);
  }
};
for (const p of projects) walk(p.dependencies);

// --- installed tree must match lockfile resolutions (read-only check) ---
const incoherent = [];
for (const [name, versions] of pkgs) {
  for (const v of versions) {
    if (!resolvedInLockfile(lockText, name, v)) {
      incoherent.push(`${name}@${v}`);
    }
  }
}
if (incoherent.length > 0) {
  console.error(
    '\n\x1b[31m✗ deps-audit: REFUSING — installed prod closure incoherent with pnpm-lock.yaml:\x1b[0m',
  );
  for (const m of incoherent.slice(0, 20)) console.error(`  ${m} installed but not resolved in lockfile`);
  if (incoherent.length > 20) console.error(`  … and ${incoherent.length - 20} more`);
  console.error('\nRun `pnpm install --frozen-lockfile` to resync node_modules with the lockfile.');
  process.exit(2);
}

// --- query the bulk endpoint in batches ---
const entries = [...pkgs].map(([name, vs]) => [name, [...vs]]);
const BATCH = 200;
const findings = [];
for (let i = 0; i < entries.length; i += BATCH) {
  const body = Object.fromEntries(entries.slice(i, i + BATCH));
  const res = await fetch(BULK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`\n\x1b[31m✗ deps-audit: bulk endpoint returned ${res.status} — cannot verify advisories.\x1b[0m`);
    process.exit(2);
  }
  const data = await res.json();
  findings.push(...selectFindings(data, IGNORE));
}

const observed = [...new Set(findings.map((f) => f.ghsa))].sort();
const counts = { total: pkgs.size, ignored: IGNORE.size };

function printScannedCarrierVersions() {
  const ghsas = new Set([...(expectRed ?? []), ...IGNORE]);
  for (const f of findings) ghsas.add(f.ghsa);
  const printed = new Set();
  for (const ghsa of ghsas) {
    const pkgName = findings.find((x) => x.ghsa === ghsa)?.name ?? GHSA_CARRIER_PACKAGES[ghsa];
    if (!pkgName || printed.has(pkgName) || !pkgs.has(pkgName)) continue;
    printed.add(pkgName);
    console.log(`  scanned ${pkgName}: ${[...pkgs.get(pkgName)].sort().join(', ')}`);
  }
}

function reportExpectRedMismatch(result, findingsList) {
  if (result.extra.length > 0) {
    console.error(`\n\x1b[31m✗ deps-audit: observed red set has EXTRA advisory(ies) not in --expect-red:\x1b[0m`);
    for (const g of result.extra) {
      const f = findingsList.find((x) => x.ghsa === g);
      console.error(`  ${g}${f ? ` — ${f.name} [${f.severity}]` : ''}`);
    }
  }
  if (result.missing.length > 0) {
    console.error(`\n\x1b[31m✗ deps-audit: declared --expect-red id(s) no longer observed (set changed):\x1b[0m`);
    for (const g of result.missing) console.error(`  ${g}`);
  }
  console.error('\nUpdate --expect-red in scripts/audit.sh and docs/SECURITY.md together, with owner approval.');
}

if (expectRed) {
  const result = compareExpectRed(observed, expectRed);
  console.log('deps-audit scanned package versions (expect-red / ignore carriers):');
  printScannedCarrierVersions();
  if (result.ok) {
    console.log(
      `✓ deps-audit: observed red set matches --expect-red exactly (${observed.length} GHSA(s): ${observed.join(', ') || '(none)'}).`,
    );
    process.exit(0);
  }
  reportExpectRedMismatch(result, findings);
  process.exit(1);
}

console.log('deps-audit scanned package versions (findings):');
printScannedCarrierVersions();

if (findings.length === 0) {
  console.log(`✓ deps-audit: no un-ignored high/critical advisories across ${counts.total} prod packages (bulk endpoint; ${counts.ignored} ignored per SECURITY.md).`);
  process.exit(0);
}
console.error(`\n\x1b[31m✗ deps-audit: ${findings.length} un-ignored high/critical advisory(ies):\x1b[0m`);
for (const f of findings) console.error(`  [${f.severity}] ${f.name} — ${f.ghsa} — ${f.title} (${f.range})`);
console.error(`\nFix the dependency, or (if lawful + accepted) add the GHSA id to package.json → pnpm.auditConfig.ignoreGhsas with a note in docs/SECURITY.md, or declare it in scripts/audit.sh --expect-red.`);
process.exit(1);
