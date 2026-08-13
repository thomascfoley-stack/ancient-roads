// S-11 — every SQL verb the studies data layer issues against studies / study_blocks /
// study_block_revisions is GRANTED to app_runtime, with the verb list DERIVED from
// web/src/lib/studies.ts at run time, never hand-listed.
//
// THE OUTAGE THIS PINS (UX_REMEDIATION.md §9 — the check was filed there and never built):
// migration 039 created plans/plan_days citing a "no GRANT needed" comment that 032 had
// already invalidated. INSERT and SELECT worked, so the missing UPDATE/DELETE grants hid
// until a user pressed the button — POST /api/plans/<id> 500'd "permission denied for table
// plan_days", and 106 had to repair live tables. §9's queue entry asks for exactly this:
// "A CI test deriving required grants from the code's write verbs … derived from source,
// never hand-listed." A point-in-time human audit cannot drift-proof the next op; this
// check re-derives the verb set from the source on every run, so a new op using an
// ungranted verb fails HERE (at worst in the db-invariants CI job), not in a session.
//
// RED-PROOF (docs/evidence/study-docs-p2/studies-grants-red.log): an op appended to
// studies.ts issuing `DELETE FROM study_blocks` — a verb 110 deliberately withholds —
// turned this suite RED, naming `DELETE ON study_blocks`; reverting the op restored green.
//
// Scope notes, stated plainly:
//   - One direction only: issued ⇒ granted. The deliberate ABSENCES (no DELETE anywhere,
//     revisions append-only by grant) are the other direction of least privilege and are
//     pinned by 110's own self-verifying DO block, red-proofed at apply time
//     (docs/evidence/study-docs-p1/110-grant-redproof.log) — not re-asserted here.
//   - Read-only: has_table_privilege is executable by any role, so this suite writes
//     nothing, needs no owner connection, and has no teardown.
//   - The corpus reads (sections/sources/embeddings) inside clipping writes ride grants
//     pinned by the published-boundary and servability invariants; only the three tables
//     migration 110 owns are derived here.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { requireDbInCi } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const dbUrl = requireDbInCi();
const SKIP = announceSkip(
  'S-11 studies grants (verbs derived from lib/studies.ts ⇔ app_runtime privileges)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'grant coverage of every SQL verb the studies data layer issues — the 039/106 outage shape',
);

const TABLES = ['studies', 'study_blocks', 'study_block_revisions'] as const;
type Table = (typeof TABLES)[number];
type Verb = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

// The SQL in studies.ts is literal text inside neon tagged templates (interpolation is
// always a bind parameter, never a fragment — the module's own comment says so), so a
// source scan sees exactly the verbs the DB will.
const TABLE_ALT = TABLES.join('|');
const VERB_PATTERNS: readonly [Verb, RegExp][] = [
  ['INSERT', new RegExp(`\\bINSERT\\s+INTO\\s+(${TABLE_ALT})\\b`, 'g')],
  ['UPDATE', new RegExp(`\\bUPDATE\\s+(${TABLE_ALT})\\s+SET\\b`, 'g')],
  ['DELETE', new RegExp(`\\bDELETE\\s+FROM\\s+(${TABLE_ALT})\\b`, 'g')],
  ['SELECT', new RegExp(`\\b(?:FROM|JOIN)\\s+(${TABLE_ALT})\\b`, 'g')],
];

/** The (table, verb) set lib/studies.ts issues, read out of its source — not a hand-list. */
export function deriveIssuedVerbs(source: string): Map<Table, Set<Verb>> {
  const out = new Map<Table, Set<Verb>>(TABLES.map((t) => [t, new Set<Verb>()]));
  for (const [verb, re] of VERB_PATTERNS) {
    for (const m of source.matchAll(re)) out.get(m[1] as Table)!.add(verb);
  }
  return out;
}

describe.skipIf(SKIP)('S-11 — every SQL verb lib/studies.ts issues on the studies tables is granted', () => {
  const source = readFileSync(path.join(__dirname, '../../src/lib/studies.ts'), 'utf-8');
  const derived = deriveIssuedVerbs(source);

  it('the derivation is not vacuous — all three tables yield verbs (deriver rot fails loudly)', () => {
    // A deriver that silently matched nothing would make the grant check below pass on zero
    // evidence — the unearned-green shape THE_LOOP §6 names. Pin the floor: each table
    // contributes at least one verb, and the two 106 verbs (INSERT and UPDATE) both appear.
    for (const t of TABLES) {
      expect(derived.get(t)!.size, `${t}: no verbs derived — the deriver, not the DB, is suspect`).toBeGreaterThan(0);
    }
    const total = [...derived.values()].reduce((n, s) => n + s.size, 0);
    expect(total, 'implausibly few (table, verb) pairs — deriver rot').toBeGreaterThanOrEqual(5);
    const all = new Set([...derived.values()].flatMap((s) => [...s]));
    expect(all.has('INSERT'), 'no INSERT derived — deriver rot').toBe(true);
    expect(all.has('UPDATE'), 'no UPDATE derived — deriver rot').toBe(true);
  });

  it('every derived verb is granted to app_runtime on the live DB', async () => {
    const pairs = [...derived].flatMap(([table, verbs]) => [...verbs].map((verb) => ({ table, verb })));
    const sql = getDb();
    const rows = (await sql`SELECT p.table_name, p.verb,
        has_table_privilege('app_runtime', p.table_name, p.verb) AS granted
      FROM (SELECT unnest(${pairs.map((p) => p.table)}::text[]) AS table_name,
                   unnest(${pairs.map((p) => p.verb)}::text[]) AS verb) p`) as {
      table_name: string;
      verb: string;
      granted: boolean;
    }[];
    expect(rows).toHaveLength(pairs.length);
    const missing = rows.filter((r) => !r.granted).map((r) => `${r.verb} ON ${r.table_name}`);
    expect(
      missing,
      `lib/studies.ts issues verbs app_runtime lacks (the 039/106 outage shape): ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
