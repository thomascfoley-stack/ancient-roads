// The Book Reader's section-body query carries the forbidden-provenance belt — pinned statically,
// so an edit that drops it goes red without a database.
//
// WHY (2026-08-17 deep-audit, domain lens finding B / MEDIUM): getWorkSectionsPage served section
// BODIES gated only by `publishedSourceId` — the one body-serving path with no provenance belt,
// while every sibling carries one at serve time: search-sections.ts (H6), studies.ts's clipping
// INSERT…SELECT, servability.ts's section leg. `status='published'` is a one-shot admission
// check; the belt is the second lock, evaluated on every query, so an admission mistake cannot
// outlive the mistake (the H6 rationale, verbatim).
//
// FORM MATTERS — the three-valued-logic trap (MASTER watchlist, instance fourteen's corollary):
// SQL `NOT predicate` over a NULL-evaluating row yields NULL, not TRUE. A belt written as a bare
// `NOT (source_url LIKE …)` silently drops every NULL-source_url row from THIS query (clean rows
// with no recorded host stop serving), and the identical trap in a check of the opposite
// polarity fails OPEN — the watchlist's "a licensing predicate that can evaluate NULL fails
// open". The siblings all NAME the NULL case — `(source_url IS NULL OR NOT EXISTS (...))` —
// admitting a host-less row by decision rather than by the engine's NULL arithmetic; this pin
// asserts presence of the belt AND that form. Semantics verified on the live engine 2026-08-17:
// a VALUES probe showed the shipped form serving {clean, null} and refusing the forbidden row,
// while the bare negation dropped the NULL row.
//
// A static pin, not a DB case, because that is what can honestly be tested here: the suites that
// drive this query against a real DB (work-reader.test.ts, register-end-to-end.test.ts) skip
// without credentials, and a seeded forbidden-provenance work needs owner writes. The pin is
// written to fail LOUDLY on refactor: it first asserts the query is FOUND (so moving or
// rewording the SQL cannot silently vacate the content checks), then asserts the belt inside
// the matched text.
//
// Red-proof: watched RED against the pre-fix lib/work.ts (query found, belt absent), then the
// belt landed and every leg went green. See the 2026-08-17 fix session report.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const WORK_TS = path.join(__dirname, '..', '..', 'src', 'lib', 'work.ts');
const stripComments = (s: string) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');

describe('work sections — forbidden-provenance belt (static pin)', () => {
  const src = stripComments(readFileSync(WORK_TS, 'utf8'));

  // Step 1 — FIND the query. This match existing is itself an assertion: if the section-body
  // SELECT is refactored (renamed table, split query, moved file), this goes red HERE rather
  // than the content checks below silently matching nothing.
  const queryMatch = src.match(/SELECT[^`]*?FROM sections\s+WHERE source_id = \$1 AND ordinal > \$2[^`]*?LIMIT \$3/);

  it('the section-body query is where this pin expects it (anti-refactor tripwire)', () => {
    expect(
      queryMatch,
      'getWorkSectionsPage\'s body query was not found — if the SQL was refactored, move this ' +
        'pin WITH it; the belt must follow the query wherever it goes',
    ).not.toBeNull();
  });

  it('the query carries the belt, in the positive/coalesced form the siblings use', () => {
    const query = queryMatch![0];
    // The belt exists…
    expect(query, 'the body query must filter forbidden-provenance rows at serve time').toContain('source_url IS NULL OR NOT EXISTS');
    // …binds the domain list as a parameter (never re-typed — the verse-key-scan defect)…
    expect(query, 'the domain list must be bound as a parameter, $4').toMatch(/unnest\(\$4::text\[\]\)/);
    // …and is the case-normalised substring match every sibling uses.
    expect(query, 'the host match must be the siblings\' lower(...) LIKE form').toMatch(
      /lower\(source_url\) LIKE '%' \|\| d \|\| '%'/,
    );
    // FORM: the NULL case is named POSITIVELY. A bare negated LIKE fails open on NULL rows
    // (FALSE OR NULL = NULL) — assert the guard clause precedes the NOT EXISTS.
    expect(query).toMatch(/\(source_url IS NULL OR NOT EXISTS/);
  });

  it('the bound parameter is the CANONICAL constant, imported from forbidden-provenance.mjs', () => {
    expect(
      src,
      'work.ts must import FORBIDDEN_PROVENANCE_DOMAINS from the canonical module',
    ).toMatch(/import \{[^}]*FORBIDDEN_PROVENANCE_DOMAINS[^}]*\} from '\.\/forbidden-provenance\.mjs'/);
    expect(
      src,
      'the query must bind the canonical constant as its 4th parameter',
    ).toMatch(/\[sourceId, after, limit, FORBIDDEN_PROVENANCE_DOMAINS\]/);
  });
});
