// The excerpt sample policy, exercised IN PROCESS.
//
// This suite replaces a `pnpm exec tsx scripts/lib/excerpt-sample-policy.mts --self-test`
// shell-out whose only assertion was that the child printed "self-test: OK". That proved
// two things it should not have: that the assertions inside the child were meaningful
// (they were not — see the fixture guards below), and that a transpiler was reachable.
// The module is plain .mjs now, so the assertions live here where vitest can see them
// fail, and the production CLI imports the very same functions.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildExcerptReport,
  excerptEligibility,
  formatExcerptLine,
  loadManifestById,
  renderExcerptLines,
} from '../scripts/lib/excerpt-sample-policy.mjs';
import { renderReportText } from '../scripts/lib/unit-ordinal-instrument.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLEAN_SCAN = { rows: [], truncated: false };

describe('manifest fixtures the eligibility assertions depend on', () => {
  // WITHOUT THESE, the two assertions below are vacuous. `excerptEligibility` returns
  // ineligible for a work with NO manifest entry ("cannot certify") for exactly the same
  // reason it returns ineligible for one flagged `skip`. So if these ids were ever
  // renamed or dropped from ingest/sources.config.json, "expected skip to be ineligible"
  // would keep passing while testing nothing at all. Pin the fixture, not just the verdict.
  const manifest = loadManifestById();

  it('barnes-crosswire-nt is present and is the forbidden_provenance=skip case', () => {
    const entry = manifest.get('barnes-crosswire-nt');
    expect(entry, 'manifest entry vanished — the skip assertion would pass vacuously').toBeDefined();
    expect(entry?.backfill?.forbidden_provenance).toBe('skip');
  });

  it('wesley-crosswire is present and is not itself forbidden-domain or quarantined', () => {
    const entry = manifest.get('wesley-crosswire');
    expect(entry, 'manifest entry vanished — the laundering assertion would pass vacuously').toBeDefined();
    expect(entry?.quarantine ?? '').toBe('');
  });
});

describe('excerptEligibility', () => {
  const manifest = loadManifestById();

  it('a forbidden_provenance=skip work is ineligible FOR THAT REASON', () => {
    const verdict = excerptEligibility(
      { slug: 'barnes-crosswire-nt', source_type: 'commentary', status: 'published' },
      manifest.get('barnes-crosswire-nt'),
      0,
    );
    expect(verdict.eligible).toBe(false);
    // The reason, not just the verdict: "no manifest entry" is also ineligible and would
    // otherwise satisfy this test while proving the flag is never read.
    expect(verdict.reason).toMatch(/forbidden_provenance=skip/);
  });

  it('forbidden section source_url rows exclude a work whose own provenance looks clean', () => {
    const verdict = excerptEligibility(
      { slug: 'wesley-crosswire', source_type: 'commentary', status: 'published', provenance: { url: 'https://crosswire.org/x' } },
      manifest.get('wesley-crosswire'),
      2,
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/2 section row\(s\) with forbidden source_url/);
  });
});

describe('buildExcerptReport header', () => {
  const manifest = loadManifestById();

  it('never claims cleanliness it did not check', () => {
    const report = buildExcerptReport(
      [{ slug: 'john-gill', source_type: 'commentary', status: 'published', provenance: { url: 'https://helloao.org/x' } }],
      CLEAN_SCAN,
      manifest,
    );
    expect(report.header).not.toMatch(/clean-provenance works only/i);
    expect(report.header).toContain('body not inspected');
  });
});

describe('bounded section scan fails closed', () => {
  const manifest = loadManifestById();
  const sources = [
    { slug: 'john-gill', source_type: 'commentary', status: 'published', provenance: { url: 'https://bible.helloao.org/x' } },
  ];

  it('certifies a work when the scan saw the whole population', () => {
    const report = buildExcerptReport(sources, CLEAN_SCAN, manifest);
    expect(report.scanTruncated).toBe(false);
    expect(report.sampleSlugs).toEqual(['john-gill']);
  });

  it('certifies NOTHING when the scan was truncated at its LIMIT', () => {
    const report = buildExcerptReport(sources, { rows: [], truncated: true }, manifest);
    expect(report.sampleSlugs).toEqual([]);
    expect(report.eligibility[0]?.eligible).toBe(false);
    expect(report.eligibility[0]?.reason).toMatch(/truncated/);
    expect(report.header).toMatch(/SECTION SCAN TRUNCATED/);
  });

  it('refuses a caller that will not say whether it read every row', () => {
    // @ts-expect-error deliberately passing the pre-Tranche-0 shape (a bare row array)
    expect(() => buildExcerptReport(sources, [], manifest)).toThrow(/must be \{ rows/);
  });
});

describe('one excerpt line formatter (Tranche 0.2)', () => {
  it('does not truncate asymmetrically', () => {
    const line = formatExcerptLine({ unit_ordinal: 1, ordinal: 1, heading: 'x'.repeat(90) });
    expect(line.length).toBeGreaterThan(60);
  });

  it('pins the bytes that reach the committed log', () => {
    // The assertion below (renderExcerptLines === rows.map(formatExcerptLine)) proves
    // single-sourcing but is RELATIVE: change the shared function and both sides move
    // together, so it stays green. This literal is what makes the movement visible.
    expect(formatExcerptLine({ unit_ordinal: 1, ordinal: 2, heading: 'h' })).toBe('u1.2\th');
    expect(formatExcerptLine({ unit_ordinal: 4, ordinal: 1, heading: null })).toBe('u4.1\t');
  });

  it('renderExcerptLines is formatExcerptLine applied per row — no second format', () => {
    const rows = [
      { unit_ordinal: 3, ordinal: 7, heading: 'On the Mount' },
      { unit_ordinal: 4, ordinal: 1, heading: null },
    ];
    expect(renderExcerptLines(rows)).toEqual(rows.map((r) => formatExcerptLine(r)));
  });

  it('the production CLI defines no formatter of its own and renders through the shared one', () => {
    // The CLI's terminal output and its committed --out log used to call a LOCAL copy of
    // formatExcerptLine. A "self-test" that exercised the library copy could then pass
    // while the bytes production actually wrote came from somewhere else entirely.
    const cli = readFileSync(path.join(ROOT, 'scripts/unit-ordinal-instrument.mjs'), 'utf8');
    expect(cli).not.toMatch(/function\s+formatExcerptLine/);
    expect(cli).toMatch(/import\s*\{[^}]*renderExcerptLines[^}]*\}\s*from\s*'\.\/lib\/excerpt-sample-policy\.mjs'/);
    // Both write paths reach the shared formatter: the terminal `say` loop calls it
    // directly, and the --out body is rendered by renderReportText, which is handed the
    // same function rather than being allowed to format rows itself.
    expect(cli, 'terminal path').toMatch(/for \(const line of renderExcerptLines\(/);
    expect(cli, '--out path').toMatch(/renderReportText\(report,\s*renderExcerptLines\)/);
  });

  it('the committed report body is built from the shared formatter', () => {
    // Behavioural companion to the static check above: change formatExcerptLine and this
    // moves, because the bytes below came out of it.
    const row = { unit_ordinal: 2, ordinal: 5, heading: 'Of Faith' };
    const body = renderReportText(
      {
        cohort: 'staged',
        ts: '2026-07-30T18:00:00.000Z',
        ok: true,
        excerpts: { 'john-gill': [row] },
      },
      renderExcerptLines,
    );
    expect(body).toContain(formatExcerptLine(row));
    expect(body).toContain('u2.5\tOf Faith');
  });
});
