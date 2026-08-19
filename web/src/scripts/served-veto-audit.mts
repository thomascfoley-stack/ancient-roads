// READ-ONLY audit: is any work SERVING whose author looks like a MUST_NOT_SERVE name?
//
// The test beside this (test/invariants/must-not-serve-format-agnostic.test.ts) guards the CODE.
// This guards the DATABASE, which is where the 2026-08-19 incident actually lived: the constant
// was correct, the guard was correct for its own surface, and a vetoed author was serving anyway.
//
//   cd web && APP_DATABASE_URL=$(cat ~/.neon_prod_url) npx tsx src/scripts/served-veto-audit.mts
//
// Exit 0 = clean · 1 = something is serving that should not be · 2 = could not run.
import { neon } from '@neondatabase/serverless';
import { auditServedWorks, authorLooksMustNotServe, isRulingAdmittedWork } from '../lib/must-not-serve-audit.js';

const url = (process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
if (!url) { console.error('STOP: APP_DATABASE_URL is unset.'); process.exit(2); }
const sql = neon(url);

const rows = (await sql`
  SELECT s.slug, s.author, s.status,
         (SELECT count(*)::int FROM embeddings e
           WHERE e.user_id IS NULL AND e.metadata->>'work' = s.slug AND e.served) AS served
  FROM sources s ORDER BY s.slug
`) as { slug: string; author: string | null; status: string; served: number }[];

const candidates = rows.filter((r) => authorLooksMustNotServe(r.author));
const violations = auditServedWorks(rows);

console.log(`  scanned ${rows.length} works`);
console.log(`  name-matched candidates: ${candidates.length}`);
for (const c of candidates) {
  const verdict = c.served === 0 ? 'not serving' : isRulingAdmittedWork(c.slug) ? 'ADMITTED by ruling' : '*** VIOLATION ***';
  console.log(`     ${c.slug.padEnd(30)} "${c.author}" [${c.status}] served=${String(c.served).padEnd(6)} ${verdict}`);
}

// CONTROL. If the instrument matches nothing at all it is not clean, it is BLIND — which is exactly
// how the first sweep of this incident produced a false all-clear. A corpus with zero name-matched
// candidates is possible but suspicious, so it is reported rather than silently passing.
if (candidates.length === 0) console.log('\n  NOTE: zero candidates matched. Verify the instrument is not blind before reading this as clean.');

if (violations.length) {
  console.log(`\n  FAIL — ${violations.length} work(s) serving against the ruling:`);
  violations.forEach((v) => console.log(`     ${v.slug}  "${v.author}"  ${v.served} served row(s)`));
  process.exit(1);
}
console.log('\n  PASS — nothing is serving against a MUST_NOT_SERVE ruling.');
