// THE FOURTH RENDER PATH WEARS THE BELT — the static/mock leg.
//
// 2026-08-17 pre-deploy audit, domain lens #2 (HIGH): /search's "Your studies" group built its
// ts_headline over `concat_ws(' ', b.body, b.quote, …)` gated on nothing but
// `deleted_at IS NULL` — snapshotted corpus text rendered with NO servability re-check, on the
// one sibling of the study doc page / feed / export that had forgotten servability.ts's rule
// ("the re-check outranks the stored bytes; a render path that forgets to purge still shows
// nothing unlicensed", servability.ts:135-137).
//
// This suite drives the REAL searchStudies over a fake driver, so it runs with no DB and no
// credentials. What is faked is exactly two collaborators — runAsUser (the wire) and
// resolveServability (the DB-backed half of the belt) — and NOTHING under test: the phase
// wiring, the toServabilityKeyed bridge, and the shared blockRenderState (real, from
// servability.ts) all execute. The live-DB proof of the same properties is
// test/invariants/search-servability.test.ts; the rendered-row proof is
// test/components/search-studies-tombstone.test.tsx.
//
// The properties, each of which can go red (red-proof in the 2026-08-17 session report — the
// mutation `state: 'clipping' as const` in searchStudies's decide step, i.e. the exact defect
// the audit found, turns P2/P3/P4 red):
//   P1  Phase 1 builds NO snippet text: no ts_headline, no concat_ws, and the only mention of
//       `quote` is the `IS NOT NULL` flag — withdrawn bytes are never even fetched.
//   P2  The belt is BATCHED: resolveServability is called exactly once with every page block
//       (no N+1), and its verdict decides each row via the real blockRenderState.
//   P3  `b.quote` enters the phase-3 headline concat ONLY for confirmed-servable clippings:
//       a refused block's id appears NOWHERE in the phase-3 query's parameters.
//   P4  A refused row surfaces as the sibling paths' tombstone shape — attribution kept, no
//       snippet field at all — and a failed-closed resolution tombstones EVERY keyed clipping
//       while the user's own text blocks still render.
//   P5  A row the headline query cannot vouch for (vanished between phases) fails closed to
//       the tombstone shape.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runAsUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ runAsUser, getDb: vi.fn() }));

const resolveServability = vi.hoisted(() => vi.fn());
vi.mock('@/lib/servability', async (importOriginal) => ({
  // blockRenderState/isTombstone stay REAL — faking the rule under test would assert against
  // this file's own copy of the licensing logic (the watchlist's tautology shape).
  ...(await importOriginal<typeof import('@/lib/servability')>()),
  resolveServability,
}));

import { searchStudies, toServabilityKeyed, type StudyRankedRow } from '@/lib/search-personal';
import type { ServabilityResolution } from '@/lib/servability';

/** What the fake driver captured for one sql`` call. */
interface SentQuery {
  text: string;
  values: unknown[];
}

/** All batches sent through the fake runAsUser, in call order. */
let sent: SentQuery[][] = [];

/** Install a fake runAsUser returning the given result sets per call, capturing every query. */
function fakeRunAsUser(resultsPerCall: unknown[][][]): void {
  let call = 0;
  runAsUser.mockImplementation(async (_userId: unknown, build: (sql: unknown) => unknown[]) => {
    const batch: SentQuery[] = [];
    const tag = (strings: TemplateStringsArray, ...values: unknown[]): SentQuery => {
      const q = { text: strings.join(' ${…} '), values };
      batch.push(q);
      return q;
    };
    build(tag as never);
    sent.push(batch);
    const results = resultsPerCall[call] ?? [];
    call += 1;
    return results;
  });
}

const B1 = '00000000-0000-4000-8000-000000000001'; // servable section-keyed clipping
const B2 = '00000000-0000-4000-8000-000000000002'; // WITHDRAWN source-keyed clipping
const B3 = '00000000-0000-4000-8000-000000000003'; // the user's own text block

const PAGE: StudyRankedRow[] = [
  {
    studyId: 'st-1', title: 'Grace and mercy', blockId: B1, kind: 'clipping',
    sectionId: '42', sourceId: null, hasQuote: true,
    attribution: { author: 'Matthew Henry', work_title: 'Commentary on the Whole Bible' },
  },
  {
    studyId: 'st-2', title: 'Withdrawn work notes', blockId: B2, kind: 'clipping',
    sectionId: null, sourceId: 'commentary:jhn:1:1:QA', hasQuote: true,
    attribution: { author: 'QA Author', work_title: 'Withdrawn Work' },
  },
  {
    studyId: 'st-3', title: 'My own words', blockId: B3, kind: 'text',
    sectionId: null, sourceId: null, hasQuote: false, attribution: null,
  },
];
const COUNT = [{ total: 3 }];

const MIXED_RESOLUTION: ServabilityResolution = {
  servableSectionIds: new Set(['42']),
  servableSourceIds: new Set(),
  failedClosed: false,
};

const FAILED_CLOSED: ServabilityResolution = {
  servableSectionIds: new Set(),
  servableSourceIds: new Set(),
  failedClosed: true,
};

beforeEach(() => {
  sent = [];
  runAsUser.mockReset();
  resolveServability.mockReset();
});

describe('searchStudies wears the servability belt (audit 2026-08-17, domain lens #2)', () => {
  it('P1+P2+P3+P4: one batched re-check decides every row; a refused block reaches neither the headline query nor the hit', async () => {
    fakeRunAsUser([
      [PAGE, COUNT],
      [[
        { blockId: B1, snippet: 'mercy and <mark>grace</mark> from Henry' },
        { blockId: B3, snippet: 'my own <mark>grace</mark> words' },
      ]],
    ]);
    resolveServability.mockResolvedValue(MIXED_RESOLUTION);

    const { rows, total } = await searchStudies('user-1', 'grace');
    expect(total).toBe(3);

    // P1 — phase 1 builds no snippet text and never fetches quote bytes.
    const phase1 = sent[0]!;
    for (const q of phase1) {
      expect(q.text, 'phase 1 must not build headlines').not.toContain('ts_headline');
      expect(q.text, 'phase 1 must not concatenate stored text').not.toContain('concat_ws');
    }
    // The ONLY reference to the quote column is the null-test flag.
    expect(phase1[0]!.text).toContain('quote IS NOT NULL');
    expect(phase1[0]!.text.split('quote').length, 'exactly one mention of quote in the page query').toBe(2);

    // P2 — one batched call carrying every page block, keyed through the exported bridge.
    expect(resolveServability).toHaveBeenCalledTimes(1);
    expect(resolveServability).toHaveBeenCalledWith(PAGE.map(toServabilityKeyed));

    // P3 — the refused block's id appears NOWHERE in the phase-3 parameters, so its quote
    // bytes cannot enter the concat; the CASE gate carries ONLY the confirmed clipping.
    const phase3 = sent[1]!;
    expect(phase3).toHaveLength(1);
    const flatValues = phase3[0]!.values.flat();
    expect(flatValues).not.toContain(B2);
    expect(flatValues).toContain(B1);
    expect(flatValues).toContain(B3);
    expect(phase3[0]!.values[0], 'the quote CASE gate holds exactly the servable clippings').toEqual([B1]);

    // P4 — the refused row is the sibling paths' tombstone: attribution kept, no snippet field.
    expect(rows).toEqual([
      { studyId: 'st-1', title: 'Grace and mercy', state: 'snippet', snippet: 'mercy and <mark>grace</mark> from Henry' },
      { studyId: 'st-2', title: 'Withdrawn work notes', state: 'tombstone', attribution: { author: 'QA Author', work_title: 'Withdrawn Work' } },
      { studyId: 'st-3', title: 'My own words', state: 'snippet', snippet: 'my own <mark>grace</mark> words' },
    ]);
    expect(JSON.stringify(rows[1]), 'a tombstone hit carries no snippet at all').not.toContain('snippet');
  });

  it('P4: a failed-closed resolution tombstones EVERY keyed clipping — and the quote gate is empty', async () => {
    fakeRunAsUser([
      [PAGE, COUNT],
      [[{ blockId: B3, snippet: 'my own <mark>grace</mark> words' }]],
    ]);
    resolveServability.mockResolvedValue(FAILED_CLOSED);

    const { rows } = await searchStudies('user-1', 'grace');
    expect(rows.map((r) => r.state)).toEqual(['tombstone', 'tombstone', 'snippet']);

    // No unvouched text can render because the check path broke — and no clipping id reaches
    // the headline query at all (only the user's own text block).
    const phase3 = sent[1]!;
    expect(phase3[0]!.values[0], 'failed closed ⇒ empty quote gate').toEqual([]);
    const flatValues = phase3[0]!.values.flat();
    expect(flatValues).not.toContain(B1);
    expect(flatValues).not.toContain(B2);
  });

  it('P4 (data-state leg): a purged clipping tombstones even when its key is servable', async () => {
    const purged: StudyRankedRow = {
      studyId: 'st-9', title: 'Purged clipping', blockId: B1, kind: 'clipping',
      sectionId: '42', sourceId: null, hasQuote: false,
      attribution: { author: 'QA Author' },
    };
    fakeRunAsUser([[[purged], [{ total: 1 }]]]);
    resolveServability.mockResolvedValue(MIXED_RESOLUTION); // '42' IS servable

    const { rows } = await searchStudies('user-1', 'grace');
    // isTombstone (quote NULL + attribution) outranks the servable key — the doc page's exact
    // behaviour (clipping-tombstone.test.ts, data-state case). Everything tombstoned ⇒ no
    // phase-3 call at all.
    expect(rows).toEqual([{ studyId: 'st-9', title: 'Purged clipping', state: 'tombstone', attribution: { author: 'QA Author' } }]);
    expect(sent).toHaveLength(1);
  });

  it('P5: a row the headline query cannot vouch for fails closed to a tombstone', async () => {
    fakeRunAsUser([
      [PAGE, COUNT],
      [[{ blockId: B3, snippet: 'my own <mark>grace</mark> words' }]], // B1 vanished mid-request
    ]);
    resolveServability.mockResolvedValue(MIXED_RESOLUTION);

    const { rows } = await searchStudies('user-1', 'grace');
    expect(rows[0]).toEqual({
      studyId: 'st-1', title: 'Grace and mercy', state: 'tombstone',
      attribution: { author: 'Matthew Henry', work_title: 'Commentary on the Whole Bible' },
    });
  });

  it('an empty page short-circuits: no servability call, no headline call', async () => {
    fakeRunAsUser([[[], [{ total: 0 }]]]);
    const { rows, total } = await searchStudies('user-1', 'grace');
    expect(rows).toEqual([]);
    expect(total).toBe(0);
    expect(resolveServability).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  it('toServabilityKeyed never carries quote bytes — only their null-ness', () => {
    const withQuote = toServabilityKeyed(PAGE[0]!);
    const without = toServabilityKeyed(PAGE[2]!);
    expect(withQuote.quote).not.toBeNull();
    expect(without.quote).toBeNull();
    // The sentinel is a fixed marker, not data from the row — no path exists for stored text.
    expect(withQuote.quote).toBe('[bytes withheld — never fetched on the search path]');
  });
});
