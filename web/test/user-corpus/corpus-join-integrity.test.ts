// Corpus-join integrity — the statements the three user↔corpus joins actually issue.
//
// Two audited defects (uploader deep-dive 2026-08-20, H9 + D9) are properties of the SQL the
// modules submit, so these legs capture the real statement batches through a mocked `@/lib/db`
// and assert on them. TRIPWIRES, stated plainly:
//
//  - H9: asserting the sweep batch carries `set_config('hnsw.ef_search', …)` proves the GUC
//    SHIPS in the same transaction as the sweeps — it cannot prove which plan production's
//    planner picks. The `EXPLAIN (ANALYZE)` at the owner's terminal is still owed (the audit
//    order records it) and this test does not discharge it.
//  - D9: asserting the forbidden-provenance leg is present, with the CANONICAL
//    `FORBIDDEN_PROVENANCE_DOMAINS` bound as the parameter, proves the fence is in the statement.
//    The behavioural proof — a seeded forbidden-provenance row that must not surface — runs
//    against a real database in tradition-gap.test.ts (the one module whose fixture can be
//    seeded onto a verse the document anchors; the vector sweeps cannot be steered that way
//    without controlling the embedding space).
//
// The expected ef value below is FROZEN by hand, deliberately not imported from the module —
// a check whose expectation is derived from the artifact under test is the watchlist's
// fourteenth failure shape.

import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeQuery = { text: string; params: unknown[] };

const capture = vi.hoisted(() => ({
  batches: [] as FakeQuery[][],
  respond: null as ((q: FakeQuery) => unknown[]) | null,
}));

vi.mock('@/lib/db', () => ({
  runAsUser: async (_userId: string, build: (sql: unknown) => unknown[]): Promise<unknown[][]> => {
    const tag = Object.assign(
      (strings: TemplateStringsArray, ...vals: unknown[]): FakeQuery => ({
        text: strings.raw.join(' $? '),
        params: vals,
      }),
      { query: (text: string, params: unknown[] = []): FakeQuery => ({ text, params }) },
    );
    const qs = build(tag) as FakeQuery[];
    capture.batches.push(qs);
    return qs.map((q) => (capture.respond ? capture.respond(q) : []));
  },
}));

import { FORBIDDEN_PROVENANCE_DOMAINS } from '@/lib/forbidden-provenance.mjs';
import { __resetCorpusModelCache } from '@/lib/user-corpus/model';
import { relatedVoices } from '@/lib/user-corpus/related-voices';
import { computeSuggestedReadings } from '@/lib/user-corpus/suggested-readings';
import { corpusPredicate, traditionGap, traditionGapForRanges } from '@/lib/user-corpus/tradition-gap';

/** Everything the three modules ask of the database, answered with the minimum to keep walking. */
function respondForWalk(q: FakeQuery): unknown[] {
  if (q.text.includes("metadata->>'model'")) return [{ model: 'BAAI/bge-large-en-v1.5' }];
  if (q.text.includes('AVG(')) return [{ v: '[0.05,0.1]' }];
  if (q.text.includes('user_section_embeddings')) return [{ model_slug: 'bge-large-en-v1.5' }];
  if (q.text.includes('count(*)')) return [{ n: 7 }];
  return []; // sweeps, near CTEs, SET LOCAL / set_config
}

/** The one provenance-belt shape every serving surface uses (servability.ts / studies.ts). */
function expectProvenanceLeg(q: FakeQuery, where: string): void {
  expect(q.text, `${where}: missing the sourceUrl provenance leg`).toContain(
    "lower(e.metadata->>'sourceUrl') LIKE",
  );
  // The bound parameter must BE the canonical denylist — never a re-typed copy (the module's
  // own charter: "Do not re-type it anywhere"). The biblehub witness pins non-emptiness
  // without restating the list.
  expect(
    q.params.some((p) => Array.isArray(p) && p.includes('biblehub.com')),
    `${where}: FORBIDDEN_PROVENANCE_DOMAINS is not bound as a parameter`,
  ).toBe(true);
  expect(q.params, `${where}: bound domains differ from the canonical list`).toContainEqual([
    ...FORBIDDEN_PROVENANCE_DOMAINS,
  ]);
}

beforeEach(() => {
  capture.batches.length = 0;
  capture.respond = respondForWalk;
  __resetCorpusModelCache();
});

describe('relatedVoices — the three corpus sweeps (H9 + D9)', () => {
  it('runs the sweeps under an explicit hnsw.ef_search, in the SAME transaction', async () => {
    await relatedVoices('u-integrity', 'd-integrity', corpusPredicate('true'));
    const sweepBatch = capture.batches.find((b) => b.some((q) => q.text.includes('WITH near AS')));
    expect(sweepBatch, 'no sweep batch was issued').toBeDefined();
    const sweeps = sweepBatch!.filter((q) => q.text.includes('WITH near AS'));
    expect(sweeps.length, 'expected the three register sweeps in one batch').toBe(3);
    // The GUC must ride the SAME runAsUser batch: runAsUser wraps its queries in one
    // sql.transaction, and `set_config(…, true)` is transaction-local — a GUC set anywhere
    // else is a no-op on the stateless driver (routing.ts:311-315 records exactly this).
    const guc = sweepBatch!.find((q) => q.text.includes('hnsw.ef_search'));
    expect(guc, 'the sweeps run at the default ef_search=40 — H9, the starvation the sibling module measured').toBeDefined();
    // 400 is FROZEN here on purpose (see header). Rationale for the value lives at the call site.
    expect(guc!.params).toContain('400');
  });

  it('every sweep carries the forbidden-provenance leg with the canonical denylist bound', async () => {
    await relatedVoices('u-integrity', 'd-integrity', corpusPredicate('true'));
    const sweeps = capture.batches.flat().filter((q) => q.text.includes('WITH near AS'));
    expect(sweeps.length).toBe(3);
    for (const q of sweeps) expectProvenanceLeg(q, 'relatedVoices sweep');
  });
});

describe('computeSuggestedReadings — the per-category exact scans (D9)', () => {
  it('the near CTE carries the forbidden-provenance leg with the canonical denylist bound', async () => {
    await computeSuggestedReadings(
      'u-integrity',
      'd-integrity',
      ['sermons'],
      corpusPredicate('true'),
      async () => {},
    );
    const near = capture.batches.flat().filter((q) => q.text.includes('WITH near AS'));
    expect(near.length, 'no category scan was issued').toBeGreaterThan(0);
    for (const q of near) expectProvenanceLeg(q, 'suggested-readings scan');
  });
});

describe('traditionGap — the verse-anchored corpus join (D9)', () => {
  it('the hits CTE carries the forbidden-provenance leg with the canonical denylist bound', async () => {
    // Since the 2026-08-21 draft-check refactor the ONE join body lives in traditionGapForRanges
    // (traditionGap reads a document's ranges and delegates; an empty mock read short-circuits
    // before the join, which is correct behaviour, not a missing statement). The tripwire drives
    // the body directly with one range — the same statement both callers share.
    await traditionGapForRanges('u-integrity', [{ start: 45008028, end: 45008028 }], corpusPredicate('true'));
    const hits = capture.batches
      .flat()
      .find((q) => q.text.includes('doc_anchors') && q.text.includes('FROM embeddings'));
    expect(hits, 'the join statement was not issued').toBeDefined();
    expectProvenanceLeg(hits!, 'tradition-gap hits CTE');
  });
});
