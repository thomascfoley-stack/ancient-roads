#!/usr/bin/env node
// Re-count static forbidden-provenance rows and update the ratchet baseline when (and
// only when) the count has decreased. Refuses to raise the baseline.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(__dirname, '../..');
const COMMENTARIES_DIR = path.join(WEB_ROOT, 'public/commentaries');
const BASELINE_PATH = path.join(__dirname, '../baselines/static-forbidden-provenance.json');

const FORBIDDEN = ['biblehub.com', 'studylight.org', 'historicalchristian.faith'];

// MUST stay in sync with web/src/lib/legal-corpus.ts MUST_NOT_SERVE_AUTHORS + isMustNotServeAuthor.
// (This .mjs runs under plain node and cannot import the .ts; the gate + invariant test use the
// canonical corpus-scan.ts. Baseline written here MUST be the same UNION the gate ratchets, or a
// stale domain-only recount would silently lower the baseline and re-hide Tyndale.)
const MUST_NOT_SERVE = ['Tyndale Study Notes','Tyndale Open Study Notes','Theophylact','Bonaventure','Oecumenius','Origen','Aquinas-Larcher'];
const isMustNotServe = (a) => (a && (MUST_NOT_SERVE.includes(a) || a.startsWith("Jerome's")));

function forbiddenDomain(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const host = new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase();
    for (const d of FORBIDDEN) {
      if (host === d || host.endsWith(`.${d}`)) return d;
    }
  } catch {
    return null;
  }
  return null;
}

function countEntries() {
  if (!existsSync(COMMENTARIES_DIR)) return -1;
  let count = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      const data = JSON.parse(readFileSync(full, 'utf-8'));
      for (const entry of data.entries ?? []) {
        if (forbiddenDomain(entry.sourceUrl ?? '') || isMustNotServe(entry.author ?? '')) count += 1;
      }
    }
  };
  walk(COMMENTARIES_DIR);
  return count;
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
const current = countEntries();

if (current < 0) {
  console.error('web/public/commentaries not present — cannot recount.');
  process.exit(1);
}

if (current > baseline.count) {
  console.error(`Refusing to update: current ${current} > baseline ${baseline.count} (ratchet violation).`);
  process.exit(1);
}

if (current === baseline.count) {
  console.log(`Unchanged at ${current}.`);
  process.exit(0);
}

const next = {
  ...baseline,
  count: current,
  recordedAt: new Date().toISOString().slice(0, 10),
};
writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Baseline lowered: ${baseline.count} → ${current}. Commit web/test/baselines/static-forbidden-provenance.json`);
