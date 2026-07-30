/**
 * DEPS AUDIT — the real CVE gate (C3 fix, 2026-07-14).
 *
 * `pnpm audit` (v9, v10, AND v11) POSTs to npm's legacy /-/npm/v1/security/audits endpoint,
 * which npm RETIRED (410). No reachable pnpm version fixes it, so the version bump can't
 * restore the gate. This queries the endpoint npm told us to use instead — the version-aware
 * BULK advisory endpoint (/-/npm/v1/security/advisories/bulk) — over the prod dependency
 * closure, fails on any un-ignored high/critical, and honors the SAME ignore list
 * (package.json → pnpm.auditConfig.ignoreGhsas, single source of truth). A real advisory fails
 * the build again; the ignore list is documented in docs/SECURITY.md.
 *
 * --expect-red GHSA-a,GHSA-b: enumerated acceptable-red set (work-order v2 Stage 1.4). The
 * observed un-ignored high/critical GHSA set must match EXACTLY — an extra advisory or a
 * disappearance from the declared set both fail the gate.
 *
 * Run: node scripts/deps-audit.mjs [--expect-red GHSA-...]
 *      (wired into scripts/audit.sh)
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { selectFindings } from './deps-audit-core.mjs';

const BULK = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';

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

// --- collect the prod dependency closure { name -> Set<version> } ---
const raw = execSync('corepack pnpm list -r --prod --depth Infinity --json', {
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
});
const projects = JSON.parse(raw);
const pkgs = new Map();
const add = (name, version) => {
  if (!version) return;
  const v = String(version).split('(')[0].trim(); // strip pnpm peer suffix e.g. 1.2.3(react@19)
  if (!/^\d/.test(v)) return; // skip link:/workspace: specifiers
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
for (const p of projects) walk(p.dependencies); // --prod already excludes devDependencies

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
    process.exit(2); // an unreachable advisory DB is a hard error here (the whole point is a real gate)
  }
  const data = await res.json();
  findings.push(...selectFindings(data, IGNORE)); // pure decision — unit-tested in deps-audit-core.test.ts
}

const observed = [...new Set(findings.map((f) => f.ghsa))].sort();
const counts = { total: pkgs.size, ignored: IGNORE.size };

function compareExpectRed(observedGhsas, declared) {
  const obs = new Set(observedGhsas);
  const extra = [...obs].filter((g) => !declared.has(g));
  const missing = [...declared].filter((g) => !obs.has(g));
  if (extra.length === 0 && missing.length === 0) return true;
  if (extra.length > 0) {
    console.error(`\n\x1b[31m✗ deps-audit: observed red set has EXTRA advisory(ies) not in --expect-red:\x1b[0m`);
    for (const g of extra) {
      const f = findings.find((x) => x.ghsa === g);
      console.error(`  ${g}${f ? ` — ${f.name} [${f.severity}]` : ''}`);
    }
  }
  if (missing.length > 0) {
    console.error(`\n\x1b[31m✗ deps-audit: declared --expect-red id(s) no longer observed (set changed):\x1b[0m`);
    for (const g of missing) console.error(`  ${g}`);
  }
  console.error('\nUpdate --expect-red in scripts/audit.sh and docs/SECURITY.md together, with owner approval.');
  return false;
}

if (expectRed) {
  if (compareExpectRed(observed, expectRed)) {
    console.log(
      `✓ deps-audit: observed red set matches --expect-red exactly (${observed.length} GHSA(s): ${observed.join(', ') || '(none)'}).`,
    );
    process.exit(0);
  }
  process.exit(1);
}

if (findings.length === 0) {
  console.log(`✓ deps-audit: no un-ignored high/critical advisories across ${counts.total} prod packages (bulk endpoint; ${counts.ignored} ignored per SECURITY.md).`);
  process.exit(0);
}
console.error(`\n\x1b[31m✗ deps-audit: ${findings.length} un-ignored high/critical advisory(ies):\x1b[0m`);
for (const f of findings) console.error(`  [${f.severity}] ${f.name} — ${f.ghsa} — ${f.title} (${f.range})`);
console.error(`\nFix the dependency, or (if lawful + accepted) add the GHSA id to package.json → pnpm.auditConfig.ignoreGhsas with a note in docs/SECURITY.md, or declare it in scripts/audit.sh --expect-red.`);
process.exit(1);
