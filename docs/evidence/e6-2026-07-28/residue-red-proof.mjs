// Red-proof for scripts/check-test-residue.mjs. Seeds the two residue classes the widened
// gate must see, asserts RED, hard-deletes, asserts GREEN. Dev only.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const ROOT = '/Users/tfoley/theology-study-app';
const require = createRequire(`${ROOT}/package.json`);
const { Client } = require('pg');

const url = readFileSync(`${ROOT}/web/.env.local`, 'utf8').match(/^DATABASE_URL=(.*)/m)[1].trim().replace(/^"|"$/g, '');
if (!/ep-tiny-hat|localhost/.test(url)) throw new Error('not dev — refusing');

const gate = () => {
  try { execFileSync('node', ['scripts/check-test-residue.mjs'], { cwd: ROOT, stdio: 'pipe', env: process.env }); return { red: false, out: '' }; }
  catch (e) { return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; }
};

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const results = [];
async function proof(name, seed, clean) {
  await seed();
  const bad = gate();
  await clean();
  const good = gate();
  const verdict = bad.red && !good.red ? 'PROVEN' : `FAILED (red-on-seed=${bad.red}, green-after-clean=${!good.red})`;
  console.log(`${verdict.padEnd(8)} ${name}`);
  console.log(`         red line: ${bad.out.split('\n').filter((l) => l.includes('survived')).slice(0, 1).join('') || '(none)'}\n`);
  results.push(verdict);
}

// 1. The EXACT class that reached prod: a SOFT-deleted qa-hl-a-<epoch> highlight.
const qaUser = `qa-hl-a-${Date.now()}`;
await proof('qa-hl-a-<epoch> soft-deleted highlight (the class that reached PROD)',
  () => c.query(`INSERT INTO highlights (user_id, verse_id, color, deleted_at) VALUES ($1, 43003016, 'yellow', now())`, [qaUser]),
  () => c.query(`DELETE FROM highlights WHERE user_id = $1`, [qaUser]));

// 2. A cutover E6 probe row left behind by a crashed gate run.
const probeUser = `__cutover_e6_probe__leftover`;
await proof('__cutover_e6_probe__ row left behind by a crashed gate run',
  () => c.query(`INSERT INTO notes (user_id, verse_id, body) VALUES ($1, 43010011, 'leftover')`, [probeUser]),
  () => c.query(`DELETE FROM notes WHERE user_id = $1`, [probeUser]));

// 3. NEGATIVE CONTROL: a row that is NOT residue must not trip the gate. Otherwise "red" proves
//    only that the gate reacts to any insert, which is a different and useless property.
const realUser = `a-real-person-${Date.now()}`;
await c.query(`INSERT INTO highlights (user_id, verse_id, color) VALUES ($1, 43003016, 'yellow')`, [realUser]);
const control = gate();
await c.query(`DELETE FROM highlights WHERE user_id = $1`, [realUser]);
console.log(`${(!control.red ? 'PROVEN' : 'FAILED').padEnd(8)} negative control — a NON-prefixed user row does NOT trip the gate`);
results.push(!control.red ? 'PROVEN' : 'FAILED');

await c.end();
console.log(`\n${results.every((r) => r === 'PROVEN') ? 'ALL PROVEN' : 'SOME FAILED'}`);
process.exit(results.every((r) => r === 'PROVEN') ? 0 : 1);
