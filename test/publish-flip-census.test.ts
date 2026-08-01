// PROPERTY (Work Order v2 Tranche 2): the publish-flip preflight REFUSES rather than
// describes. Two conditions must stop the flip:
//   - a work that is `published` but not admitted by the predicates that actually serve
//   - any serving count that is literally zero
//
// These are exercised here, not against a database, because a STOP rule that has only ever
// been watched on a target that happened not to trip it is a rule nobody has seen work.
// The runner (scripts/publish-flip-census.mts) measures and imports the real predicates;
// everything below decides.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NOT_MEASURED,
  admissionFindings,
  censusVerdict,
  forbiddenExposure,
  servingFindings,
  voiceFloorFindings,
} from '../scripts/lib/publish-flip-census.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HEALTHY_SERVING = servingFindings({
  worksByRegister: { commentary: 20, sermon: 8, theology: 7 },
  entriesByCatalog: { sections: 84_292, commentary_entries: 45_390, embeddings_served: 190_635 },
});
const HEALTHY_VOICES = voiceFloorFindings({ versesWithZero: 12, versesWithOne: 340, versesMeasured: 31_102 });
const NO_FORBIDDEN = forbiddenExposure([]);

describe('§1 published-but-not-admitted STOPS the flip', () => {
  it('a published work outside the serving predicates is a STOP', () => {
    const findings = admissionFindings([
      { slug: 'john-gill', status: 'published', register: 'commentary', admitted: true },
      { slug: 'poole-tcp', status: 'published', register: 'commentary', admitted: false },
    ]);
    expect(findings.find((f) => f.slug === 'poole-tcp')?.verdict).toBe('STOP');
    expect(findings.find((f) => f.slug === 'poole-tcp')?.note).toMatch(/PUBLISHED BUT NOT ADMITTED/);

    const v = censusVerdict({ admission: findings, forbidden: NO_FORBIDDEN, voices: HEALTHY_VOICES, serving: HEALTHY_SERVING });
    expect(v.stop).toBe(true);
    expect(v.exitCode).toBe(1);
    expect(v.stops.join(' ')).toContain('poole-tcp');
  });

  it('a NOT-admitted work that is merely staged is consistent, not a STOP', () => {
    // The seed must be aimed at the actual defect. A staged work being unadmitted is the
    // normal state of the world; only the published-and-unadmitted combination is wrong.
    const findings = admissionFindings([
      { slug: 'poole-tcp', status: 'staged', register: 'commentary', admitted: false },
    ]);
    expect(findings[0]?.verdict).toBe('OK');
    expect(censusVerdict({ admission: findings, forbidden: NO_FORBIDDEN, voices: HEALTHY_VOICES, serving: HEALTHY_SERVING }).stop).toBe(false);
  });

  it('an all-admitted cohort does not stop', () => {
    const findings = admissionFindings([
      { slug: 'john-gill', status: 'published', register: 'commentary', admitted: true },
      { slug: 'spurgeon-sermons', status: 'published', register: 'sermon', admitted: true },
    ]);
    expect(censusVerdict({ admission: findings, forbidden: NO_FORBIDDEN, voices: HEALTHY_VOICES, serving: HEALTHY_SERVING }).stop).toBe(false);
  });
});

describe('§4 a serving literal count of zero STOPS the flip', () => {
  const admission = admissionFindings([{ slug: 'john-gill', status: 'published', register: 'commentary', admitted: true }]);

  it('zero published works across every register', () => {
    const serving = servingFindings({ worksByRegister: {}, entriesByCatalog: { sections: 10 } });
    expect(serving.verdict).toBe('STOP');
    expect(censusVerdict({ admission, forbidden: NO_FORBIDDEN, voices: HEALTHY_VOICES, serving }).stop).toBe(true);
  });

  it('a single register that would serve zero works', () => {
    const serving = servingFindings({
      worksByRegister: { commentary: 20, sermon: 0 },
      entriesByCatalog: { sections: 100, commentary_entries: 100, embeddings_served: 100 },
    });
    expect(serving.verdict).toBe('STOP');
    expect(serving.note).toMatch(/register 'sermon' would serve 0 works/);
  });

  it('a catalog that would serve zero entries', () => {
    const serving = servingFindings({
      worksByRegister: { commentary: 20 },
      entriesByCatalog: { sections: 100, commentary_entries: 0 },
    });
    expect(serving.verdict).toBe('STOP');
    expect(serving.note).toMatch(/catalog 'commentary_entries' would serve 0 entries/);
  });

  it('a healthy serving surface does not stop', () => {
    expect(HEALTHY_SERVING.verdict).toBe('OK');
    expect(censusVerdict({ admission, forbidden: NO_FORBIDDEN, voices: HEALTHY_VOICES, serving: HEALTHY_SERVING }).stop).toBe(false);
  });
});

describe('§2 forbidden provenance is COUNTED and reported, not silently folded in', () => {
  it('separates what exists from what becomes reachable', () => {
    const f = forbiddenExposure([
      { slug: 'barnes-crosswire-nt', count: 120, willBePublished: true },
      { slug: 'held-back-work', count: 7, willBePublished: false },
    ]);
    expect(f.totalRows).toBe(127);
    expect(f.reachableRows).toBe(120);
    expect(f.reachableWorks.map((w) => w.slug)).toEqual(['barnes-crosswire-nt']);
    expect(f.verdict).toBe('WARN');
  });

  it('is a WARN, not a STOP — the ratchet is the legal gate, this is visibility', () => {
    const f = forbiddenExposure([{ slug: 'x', count: 5, willBePublished: true }]);
    const v = censusVerdict({
      admission: admissionFindings([{ slug: 'john-gill', status: 'published', register: 'commentary', admitted: true }]),
      forbidden: f,
      voices: HEALTHY_VOICES,
      serving: HEALTHY_SERVING,
    });
    expect(v.stop).toBe(false);
    expect(v.warnings.join(' ')).toMatch(/READER-REACHABLE/);
  });
});

describe('§3 a voice floor measured over nothing is blind, not clean', () => {
  it('zero verses measured is a STOP', () => {
    const v = voiceFloorFindings({ versesWithZero: 0, versesWithOne: 0, versesMeasured: 0 });
    expect(v.verdict).toBe('STOP');
    expect(v.note).toMatch(/blind, not clean/);
  });

  it('reports both thresholds separately', () => {
    expect(HEALTHY_VOICES.note).toMatch(/12 verse\(s\) with 0 distinct served authors/);
    expect(HEALTHY_VOICES.note).toMatch(/340 with exactly 1/);
  });
});

describe('one STOP is enough — a later green section never downgrades it', () => {
  it('keeps the STOP even when everything else is healthy', () => {
    const admission = admissionFindings([{ slug: 'orphan', status: 'published', register: 'commentary', admitted: false }]);
    const v = censusVerdict({ admission, forbidden: NO_FORBIDDEN, voices: HEALTHY_VOICES, serving: HEALTHY_SERVING });
    expect(v.stop).toBe(true);
    expect(v.exitCode).toBe(1);
  });
});

describe('the runner imports the serving predicates rather than restating them', () => {
  const runner = readFileSync(path.join(ROOT, 'scripts/publish-flip-census.mts'), 'utf8');

  it('imports LEGAL_CORPUS_FILTER, SERVED_PROSE_WORKS and SERVED_LANE_WORKS from web/src', () => {
    expect(runner).toMatch(/import\s*\{[^}]*LEGAL_CORPUS_FILTER[^}]*\}\s*from\s*'\.\.\/web\/src\/lib\/teacher\/routing'/s);
    expect(runner).toMatch(/SERVED_PROSE_WORKS/);
    expect(runner).toMatch(/SERVED_LANE_WORKS/);
  });

  it('does not hand-copy the author allowlist that LEGAL_CORPUS_FILTER carries', () => {
    // The exact defect ADR-034 and the cutover gate's header exist to prevent: a census
    // aimed at a population the product does not actually serve.
    const code = runner.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(code).not.toContain("'Jamieson, Fausset & Brown'");
    expect(code).not.toContain("'Matthew Henry'");
  });

  it('refuses production outright', () => {
    expect(runner).toMatch(/isProdHost\(url\)/);
    expect(runner).toMatch(/REFUSING/);
  });
});

// ── "not measured" must never read as "measured clean" (2026-08-02 deep audit, M4) ──────────
describe('a partial census says so, and cannot be mistaken for a full one', () => {
  const clean = admissionFindings([
    { slug: 'john-gill', status: 'published', register: 'commentary', admitted: true },
  ]);

  it('REFUSES an absent leg rather than treating it as clean', () => {
    // The shipped adjudicator passed `undefined` for three of four legs, and the optional
    // chaining in censusVerdict treated that as not-a-STOP — so the return value was
    // byte-identical to all four weighed and clean. `undefined` is now an error, not a verdict.
    // SEED: restore `value === undefined` to the not-a-STOP path -> RED.
    for (const bad of [undefined, null]) {
      expect(() =>
        censusVerdict({ admission: clean, forbidden: bad as never, voices: NOT_MEASURED, serving: NOT_MEASURED }),
      ).toThrow(/Pass the measurement, or NOT_MEASURED/);
    }
  });

  it('REPORTS which legs were not taken, so a one-leg verdict cannot pass as four', () => {
    const v = censusVerdict({
      admission: clean,
      forbidden: NOT_MEASURED,
      voices: NOT_MEASURED,
      serving: NOT_MEASURED,
    });
    expect(v.stop).toBe(false);
    expect(v.notMeasured).toEqual(['§2 forbidden provenance', '§3 voice floor', '§4 serving surface']);
  });

  it('a FULL census reports nothing not-measured, and still STOPs on a real finding', () => {
    const full = censusVerdict({
      admission: clean,
      forbidden: NO_FORBIDDEN,
      voices: HEALTHY_VOICES,
      serving: HEALTHY_SERVING,
    });
    expect(full.notMeasured).toEqual([]);
    expect(full.stop).toBe(false);

    // And a measured leg still fires — the declaration mechanism must not have disarmed anything.
    const zeroServing = servingFindings({
      worksByRegister: { commentary: 0 },
      entriesByCatalog: { sections: 0, commentary_entries: 0, embeddings_served: 0 },
    });
    const stopped = censusVerdict({
      admission: clean,
      forbidden: NO_FORBIDDEN,
      voices: HEALTHY_VOICES,
      serving: zeroServing,
    });
    expect(stopped.stop).toBe(true);
    expect(stopped.notMeasured).toEqual([]);
  });
});
