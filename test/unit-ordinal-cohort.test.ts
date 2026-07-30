// PROPERTY (Work Order v2 Tranche 1): the instrument measures an EXPLICITLY NAMED status
// cohort, and its positive control asserts that THAT cohort is non-empty.
//
// The defect this closes: every query said `WHERE src.status = 'published'` and the
// positive control counted published sources. Production has 7 sources, all `staged`, and
// 0 published. So the tool built to check the ordering of the works ABOUT TO BE published
// could only ever report on the works already published — of which there are none — and
// the operator reading `POSITIVE CONTROL: published sources = 0` learns nothing about the
// staged corpus that is the actual subject.
//
// Three legs, each with a seed:
//   1. cohort is named and travels into every measurement and message
//   2. an EMPTY cohort aborts, naming the cohort — never "0 problems found"
//   3. an INVALID cohort selector is REFUSED — never a silently-zero result set
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCohort,
  measureUnitOrdinalForCohort,
  measurePublishedUnitOrdinal,
  sourceStatusCohorts,
  COHORT_NULLS_SQL,
  COHORT_POSITIVE_CONTROL_SQL,
  COHORT_DIGEST_SQL,
  COHORT_DUP_PAIRS_SQL,
  COHORT_ORDER_BREAKS_SQL,
  renderReportText,
} from '../scripts/lib/unit-ordinal-instrument.mjs';
import { renderExcerptLines } from '../scripts/lib/excerpt-sample-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A pg-shaped stand-in that records what it was asked, and answers by cohort. It lets the
 * cohort property be exercised without a database — the thing the old inline code could
 * not do, which is why the assertion only ever ran against production.
 */
function fakeClient(worksByCohort: Record<string, number>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const cohort = String(params[0] ?? '');
      const n = worksByCohort[cohort] ?? 0;
      if (/count\(\*\)::int AS n FROM sources/.test(sql)) return { rows: [{ n }] };
      if (/FILTER \(WHERE sec\.unit_ordinal IS NULL\)/.test(sql)) return { rows: [{ nulls: 0, total: n * 10 }] };
      return { rows: [] };
    },
  };
}

describe('the cohort list comes from the migration, not from memory', () => {
  it('is parsed out of 023_sources_status_ingesting.sql', () => {
    expect(sourceStatusCohorts()).toEqual(['staged', 'published', 'quarantined', 'ingesting']);
  });

  it('matches the CHECK constraint the database will actually enforce', () => {
    // Rail: import the predicate, never mirror it. If 023's constraint is edited, this
    // reads the new value — and a cohort the DB would reject stays rejected here.
    const sql = readFileSync(path.join(ROOT, 'db/migrations/023_sources_status_ingesting.sql'), 'utf8');
    for (const cohort of sourceStatusCohorts()) {
      expect(sql).toContain(`'${cohort}'::text`);
    }
  });
});

describe('an invalid cohort selector is REFUSED, not silently zero', () => {
  it('refuses a typo', () => {
    expect(() => assertCohort('publsihed')).toThrow(/is not a source status this schema admits/);
  });

  it('refuses an unnamed cohort', () => {
    expect(() => assertCohort(undefined)).toThrow(/no status cohort named/);
    expect(() => assertCohort('')).toThrow(/no status cohort named/);
  });

  it('names the valid cohorts in the refusal, so the operator can fix it', () => {
    expect(() => assertCohort('live')).toThrow(/staged, published, quarantined, ingesting/);
  });

  it('refuses BEFORE any query is issued', async () => {
    const c = fakeClient({ staged: 7 });
    await expect(measureUnitOrdinalForCohort(c, { cohort: 'publsihed' })).rejects.toThrow(/not a source status/);
    expect(c.calls, 'a bad cohort must not reach the server at all').toEqual([]);
  });
});

describe('an empty cohort ABORTS, naming the cohort', () => {
  it('does not report a clean run over nothing', async () => {
    // Production shape: staged has rows, published has none.
    const c = fakeClient({ staged: 7, published: 0 });
    const result = await measureUnitOrdinalForCohort(c, { cohort: 'published' });
    expect(result.ok).toBe(false);
    expect(result.cohortWorks).toBe(0);
    expect(result.errors.join(' ')).toMatch(/zero sources in cohort 'published'/);
    expect(result.errors.join(' ')).toMatch(/ABORTING/);
  });

  it('the abort names the cohort that was empty, not a generic message', async () => {
    const c = fakeClient({ staged: 0, published: 5 });
    const result = await measureUnitOrdinalForCohort(c, { cohort: 'staged' });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain("cohort 'staged'");
    expect(result.errors.join(' ')).not.toContain("cohort 'published'");
  });
});

describe('the positive control asserts THIS cohort, not published', () => {
  it('a non-empty staged cohort passes its control even with zero published works', async () => {
    // The exact production situation. Before Tranche 1 this could not be measured at all:
    // the control counted published sources, found 0, and aborted — while the staged
    // corpus it was supposed to be reporting on sat there unmeasured.
    const c = fakeClient({ staged: 7, published: 0 });
    const result = await measureUnitOrdinalForCohort(c, { cohort: 'staged' });
    expect(result.cohortWorks).toBe(7);
    expect(result.errors.join(' ')).not.toMatch(/probe is blind/);
    expect(result.cohort).toBe('staged');
  });

  it('binds the cohort as a parameter to the control query — not interpolated', () => {
    const c = fakeClient({ staged: 7 });
    return measureUnitOrdinalForCohort(c, { cohort: 'staged' }).then(() => {
      const control = c.calls.find((call) => /count\(\*\)::int AS n FROM sources/.test(call.sql));
      expect(control?.params).toEqual(['staged']);
      expect(control?.sql).not.toContain("'staged'");
    });
  });
});

describe('no statement is wired permanently to published', () => {
  it('every cohort statement takes $1', () => {
    for (const sql of [
      COHORT_NULLS_SQL,
      COHORT_POSITIVE_CONTROL_SQL,
      COHORT_DIGEST_SQL,
      COHORT_DUP_PAIRS_SQL,
      COHORT_ORDER_BREAKS_SQL,
    ]) {
      expect(sql).toMatch(/status = \$1/);
      expect(sql).not.toMatch(/status = 'published'/);
    }
  });

  it('the CLI hardcodes no cohort and requires one to be named', () => {
    const cli = readFileSync(path.join(ROOT, 'scripts/unit-ordinal-instrument.mjs'), 'utf8');
    const code = cli.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(code).not.toMatch(/status = 'published'/);
    expect(code).toMatch(/assertCohort\(cohortArg\)/);
  });

  it('every cohort-bearing log line in the CLI carries the cohort marker', () => {
    const cli = readFileSync(path.join(ROOT, 'scripts/unit-ordinal-instrument.mjs'), 'utf8');
    const sayLines = [...cli.matchAll(/^\s*say\(`([^`]*)`\)/gm)].map((m) => m[1]!);
    expect(sayLines.length).toBeGreaterThan(5);
    const unmarked = sayLines.filter((l) => !l.includes('${CO}') && !l.includes('cohort'));
    expect(unmarked, 'these log lines do not name the cohort they describe').toEqual([]);
  });
});

describe('two cohort reports are distinguishable by CONTENT, not by filename', () => {
  // The work order asks for this to be shown by running over staged AND published on dev.
  // Dev credentials are not available in this environment (see the Tranche 1 evidence log),
  // so the property is discharged here instead — and this is the stronger form: rendering
  // is a pure function of the report, so the two bodies can be compared directly rather
  // than by an operator opening two files and forming an impression.
  const base = {
    ts: '2026-07-30T18:00:00.000Z',
    target: 'ep-tiny-hat',
    ok: true,
    rollupDigest: 'abc123',
    excerptSampleSlugs: ['john-gill'],
    errors: [] as string[],
    excerpts: { 'john-gill': [{ unit_ordinal: 1, ordinal: 1, heading: 'Genesis 1' }] },
  };
  const staged = renderReportText(
    { ...base, cohort: 'staged', cohortWorks: 7, excerptHeader: 'excerpt sample [cohort=staged]: 1 …' },
    renderExcerptLines,
  );
  const published = renderReportText(
    { ...base, cohort: 'published', cohortWorks: 0, excerptHeader: 'excerpt sample [cohort=published]: 1 …' },
    renderExcerptLines,
  );

  it('the bodies differ even with identical timestamps, target and digest', () => {
    expect(staged).not.toEqual(published);
  });

  it('each body states its own cohort on its first line', () => {
    expect(staged.split('\n')[0]).toContain("cohort 'staged'");
    expect(published.split('\n')[0]).toContain("cohort 'published'");
  });

  it('the cohort is repeated on the works line and every excerpt heading', () => {
    expect(staged).toContain("cohort: staged   (sources.status = 'staged')");
    expect(staged).toContain('worksInCohort: 7');
    expect(staged).toContain('## [cohort=staged] john-gill');
    expect(published).toContain('## [cohort=published] john-gill');
  });

  it('neither body depends on the output path to identify itself', () => {
    // Nothing in the rendered text comes from --out; the same file name carrying either
    // body is still unambiguous about what was measured.
    expect(staged).not.toMatch(/\.log|--out/);
    expect(published).not.toMatch(/\.log|--out/);
  });
});

describe('measurePublishedUnitOrdinal is just the published cohort', () => {
  it('delegates and keeps publishedWorks for the cutover gate', async () => {
    const c = fakeClient({ published: 3 });
    const result = await measurePublishedUnitOrdinal(c);
    expect(result.cohort).toBe('published');
    expect(result.publishedWorks).toBe(3);
    expect(result.cohortWorks).toBe(3);
  });
});
