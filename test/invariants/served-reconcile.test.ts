// Red-proofs for scripts/lib/served-reconcile-core.mjs — every violation kind
// is seeded and watched trip; the E3-deferred and inert-orphan classifications
// are watched NOT trip; a clean state is watched pass. (THE_LOOP rule 4.)
import { describe, it, expect } from 'vitest';
import { reconcile } from '../../scripts/lib/served-reconcile-core.mjs';

const sources = [
  { slug: 'alpha', status: 'published' },
  { slug: 'beta', status: 'staged' },
  { slug: 'gamma', status: 'quarantined' },
  { slug: 'e3-work', status: 'published' },
  { slug: 'legacy-cohort', status: 'published' }, // no work-keyed rows
];

describe('served-reconcile core', () => {
  it('clean agreement passes and reports the cohorts on their own lines', () => {
    const works = [
      { work: 'alpha', rows: 100, served: 100 },
      { work: 'beta', rows: 50, served: 0 },
    ];
    const r = reconcile(works, sources);
    expect(r.violations).toEqual([]);
    expect(r.ok).toEqual({ publishedServed: 1, unpublishedUnserved: 1 });
    expect(r.publishedWorkless).toEqual(['e3-work', 'legacy-cohort']);
    expect(r.e3Deferred).toEqual([]);
    expect(r.inertOrphans).toEqual([]);
  });

  it('RED: a published work with CLEAN-provenance rows unserved is caught', () => {
    const r = reconcile(
      [{ work: 'alpha', rows: 100, served: 60, unservedClean: 40, unservedForbidden: 0 }],
      sources,
    );
    expect(r.violations.map((v) => v.kind)).toEqual(['published-not-fully-served']);
  });

  it('RED: a published work served by NOTHING is caught (the A3 divergence)', () => {
    const r = reconcile(
      [{ work: 'alpha', rows: 100, served: 0, unservedClean: 100, unservedForbidden: 0 }],
      sources,
    );
    expect(r.violations.map((v) => v.kind)).toEqual(['published-not-fully-served']);
  });

  it('FAILS CLOSED: unserved rows with NO provenance split count as clean (a violation, not a pass)', () => {
    const r = reconcile([{ work: 'alpha', rows: 100, served: 42 }], sources);
    expect(r.violations.map((v) => v.kind)).toEqual(['published-not-fully-served']);
  });

  it('a published work whose only unserved rows are FORBIDDEN provenance is E3-deferred, NOT a violation', () => {
    const r = reconcile(
      [{ work: 'e3-work', rows: 6215, served: 5088, unservedClean: 0, unservedForbidden: 1127 }],
      sources,
    );
    expect(r.violations).toEqual([]);
    expect(r.e3Deferred).toEqual([{ work: 'e3-work', rows: 1127 }]);
    expect(r.ok.publishedServed).toBe(1);
  });

  it('RED: a staged work serving even one row is caught (gate bypass)', () => {
    const r = reconcile([{ work: 'beta', rows: 50, served: 1 }], sources);
    expect(r.violations).toEqual([
      { kind: 'unpublished-serving', work: 'beta', status: 'staged', detail: "1/50 served while 'staged'" },
    ]);
  });

  it('RED: keyed rows SERVED with no sources row are caught (ungoverned serving)', () => {
    const r = reconcile([{ work: 'ghost', rows: 5, served: 5 }], sources);
    expect(r.violations.map((v) => v.kind)).toEqual(['no-sources-row-serving']);
  });

  it('keyed rows with no sources row and ZERO served are inert inventory, NOT a violation', () => {
    const r = reconcile([{ work: 'poole-tcp', rows: 1308, served: 0 }], sources);
    expect(r.violations).toEqual([]);
    expect(r.inertOrphans).toEqual([{ work: 'poole-tcp', rows: 1308 }]);
  });
});
