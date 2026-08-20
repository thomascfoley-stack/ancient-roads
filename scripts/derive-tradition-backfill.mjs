// Derive which `tradition: unassigned` works belong to a person the manifest ALREADY assigns a
// tradition to elsewhere — and emit the mapping. Report-only by default.
//
// WHY THIS EXISTS. The bulk ingest declared 840 manifest entries `tradition: unassigned` using a
// "Surname, Firstname" author convention, while the same people's earlier works use "Firstname
// Surname" with a real tradition. The verifier's diversity gate counts DISTINCT traditions among
// the voices an answer used (verifier/v1.ts, normalizeForMatch on both sides), so one man served
// under both `baptist` and `unassigned` satisfies a floor that exists to require TWO traditions.
// Measured on production 2026-08-19: Spurgeon ~63 unassigned works, Calvin ~48, Schaff ~25.
//
// WHY NAME MATCHING IS CONSERVATIVE AND STAYS THAT WAY. Matching on SURNAME finds 16 people and
// three of them are different human beings: Gerard Manley Hopkins vs Samuel Hopkins, Jonathan
// Edwards vs Thomas Charles Edwards, Thomas Watson vs Robert Alexander Watson. A surname rule
// would have rewritten a Catholic poet's tradition to match an unrelated Congregationalist. So the
// key is the FULL SET of name tokens, order-insensitive: {calvin, john} matches "Calvin, John" and
// "John Calvin"; {hopkins, samuel} never matches {gerard, manley, hopkins}. This deliberately
// MISSES real cases — "B.W. Johnson" vs "Johnson, Barton Warren" is one person and is skipped,
// because initials cannot be expanded safely. A miss leaves a work `unassigned`, which is the
// status quo; a false match rewrites an attribution, which is the thing this product must never do.
//
// AND UNANIMITY IS REQUIRED. If a person's assigned works disagree about their tradition, the
// group is REPORTED and SKIPPED rather than resolved by majority — picking one is a judgement,
// and judgements belong to the owner, not to a backfill script.
import { readFileSync, writeFileSync } from 'node:fs';

const UNASSIGNED = new Set(['unassigned', 'unknown', '']);
const norm = (s) => (s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
const key = (author) => norm(author).slice().sort().join(' ');

const raw = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8'));
const entries = Array.isArray(raw) ? raw : (raw.sources ?? raw);

const people = new Map();
for (const e of entries) {
  if (!e?.author || !e?.slug) continue;
  const k = key(e.author);
  if (!k) continue;
  if (!people.has(k)) people.set(k, { assigned: new Map(), unassigned: [] });
  const p = people.get(k);
  const t = String(e.tradition ?? '').toLowerCase();
  if (UNASSIGNED.has(t)) p.unassigned.push({ slug: e.slug, author: e.author });
  else p.assigned.set(t, (p.assigned.get(t) ?? 0) + 1);
}

const plan = [], conflicts = [];
for (const [k, p] of people) {
  if (p.unassigned.length === 0 || p.assigned.size === 0) continue;
  if (p.assigned.size > 1) { conflicts.push({ person: k, traditions: [...p.assigned.keys()], works: p.unassigned.length }); continue; }
  const tradition = [...p.assigned.keys()][0];
  for (const w of p.unassigned) plan.push({ slug: w.slug, author: w.author, tradition });
}
plan.sort((a, b) => a.slug.localeCompare(b.slug));

console.log(`  people in manifest: ${people.size}`);
console.log(`  UNANIMOUS people with both assigned and unassigned works: ${new Set(plan.map((p) => key(p.author))).size}`);
console.log(`  works this would assign: ${plan.length}`);
console.log(`  CONFLICTED people (reported, NOT changed): ${conflicts.length}`);
for (const c of conflicts) console.log(`    ${c.person} -> ${c.traditions.join(' / ')} (${c.works} unassigned works left alone)`);
const byTrad = {};
for (const p of plan) byTrad[p.tradition] = (byTrad[p.tradition] ?? 0) + 1;
console.log('  by tradition:', JSON.stringify(byTrad));
writeFileSync('/tmp/tradition-backfill-plan.json', JSON.stringify(plan, null, 2));
console.log('  plan written to /tmp/tradition-backfill-plan.json');
