// THE PUBLISH ADMISSION SET COVERS EVERY SERVED WORK LIST — A8/B2, 2026-08-02.
//
// The A3 rule (MASTER.md #a3-rule) STOPS the flip on a work that is `published` but not admitted
// by "the predicates that actually serve". Two tools answer that question — the census runner
// (scripts/publish-flip-census.mts) and the offline adjudicator (scripts/publish-flip-adjudicate.mts)
// — and each of them built its admission set by HAND-COMPOSING `SERVED_PROSE_WORKS ∪
// SERVED_LANE_WORKS`. routing.ts exports FOUR served work lists. The fourth,
// SERVED_SONG_VERSE_WORKS (15 hymn/poetry works), was in neither union, while
// SONG_VERSE_CORPUS_FILTER serves exactly those 15. Consequences, both silent:
//
//   * a published hymn STOPS the flip with "served by nothing" — which is false; and
//   * the adjudicator emits `admitted && staged`, so no hymn or poem can ever reach a flip list.
//     A8's "publish registers" step would have narrowed to sermons/theology with nobody deciding
//     that, which is exactly what the A8 draft order predicted (build item B2).
//
// The test that was supposed to catch this (publish-flip-census.test.ts) asserted the runner
// mentions `SERVED_PROSE_WORKS` and `SERVED_LANE_WORKS` — the same two lists, typed by hand a
// third time. It certified the gap. This file does not name a single list: it derives the set from
// routing.ts's own source, so a FIFTH list added tomorrow and not wired turns this red.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeOnly } from '../../scripts/lib/source-scan.mjs';
import {
  ALL_SERVED_WORKS,
  SERVED_WORK_LISTS,
  SERVED_SONG_VERSE_WORKS,
} from '../../web/src/lib/teacher/routing';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROUTING_REL = 'web/src/lib/teacher/routing.ts';
const ROUTING_SRC = codeOnly(readFileSync(path.join(REPO, ROUTING_REL), 'utf8'));

// Every `export const SERVED_<something>_WORKS` in routing.ts, derived from the source. Comments
// are stripped first so the prose in the header — which necessarily discusses these names — cannot
// manufacture a match.
const DECLARED_LISTS = [...ROUTING_SRC.matchAll(/export\s+const\s+(SERVED_[A-Z0-9_]*_WORKS)\b/g)]
  .map((m) => m[1]!)
  .sort();

// The routing module, indexed by name, so a derived list name can be looked up without naming it.
const ROUTING = (await import('../../web/src/lib/teacher/routing')) as Record<string, unknown>;

const ADMISSION_CONSUMERS = ['scripts/publish-flip-census.mts', 'scripts/publish-flip-adjudicate.mts'];

describe('routing.ts declares its served work lists in a form this test can derive', () => {
  it('found the four known lists — an anti-vacuity floor', () => {
    // Without this the derivation could match nothing and every case below would pass over an
    // empty set, which is how a "coverage" test becomes decoration.
    expect(DECLARED_LISTS).toContain('SERVED_PROSE_WORKS');
    expect(DECLARED_LISTS).toContain('SERVED_SERMON_WORKS');
    expect(DECLARED_LISTS).toContain('SERVED_THEOLOGY_WORKS');
    // The one that was missing from both admission sets. Named here deliberately: it is the
    // regression, and a derivation that silently stopped finding it must fail.
    expect(DECLARED_LISTS).toContain('SERVED_SONG_VERSE_WORKS');
    expect(DECLARED_LISTS.length).toBeGreaterThanOrEqual(4);
  });

  it('every declared list is a non-empty array of slugs', () => {
    for (const name of DECLARED_LISTS) {
      const list = ROUTING[name];
      expect(Array.isArray(list), `${name} is not an array`).toBe(true);
      expect((list as readonly string[]).length, `${name} is empty`).toBeGreaterThan(0);
    }
  });
});

describe('ALL_SERVED_WORKS covers every served work list', () => {
  const admitted = new Set(ALL_SERVED_WORKS);

  // SEED: drop `songVerse` from SERVED_WORK_LISTS -> RED here, listing all 15 orphaned slugs.
  it.each(DECLARED_LISTS)('%s is fully inside ALL_SERVED_WORKS', (name) => {
    const missing = (ROUTING[name] as readonly string[]).filter((slug) => !admitted.has(slug));
    expect(
      missing,
      `${name} has ${missing.length} work(s) no admission set covers: ${missing.join(', ')}. ` +
        `Add the list to SERVED_WORK_LISTS in ${ROUTING_REL}, or state in that record's comment ` +
        'why the works it names are deliberately unserved.',
    ).toEqual([]);
  });

  it('SERVED_WORK_LISTS is what ALL_SERVED_WORKS is built from, with no duplicates', () => {
    const fromRecord = Object.values(SERVED_WORK_LISTS).flat();
    expect([...ALL_SERVED_WORKS].sort()).toEqual([...fromRecord].sort());
    expect(new Set(ALL_SERVED_WORKS).size, 'a slug appears in two served lists').toBe(ALL_SERVED_WORKS.length);
  });

  it('the 15 song/verse works are admitted — the exact regression, stated as itself', () => {
    // Not redundant with the derived case above: that one goes green if someone deletes the list.
    // This one says the works themselves are admitted, and 15 is the count the config carries.
    expect(SERVED_SONG_VERSE_WORKS.length).toBe(15);
    for (const slug of SERVED_SONG_VERSE_WORKS) {
      expect(admitted.has(slug), `${slug} is served by SONG_VERSE_CORPUS_FILTER but not admitted`).toBe(true);
    }
  });
});

describe('the admission consumers derive, they do not re-compose', () => {
  // The property is not "they import routing" — the old test asserted that and stayed green
  // through the whole defect. It is that they reference NO INDIVIDUAL served list, because any
  // reference to one is a hand-composed union waiting to go stale.
  it.each(ADMISSION_CONSUMERS)('%s builds admission from ALL_SERVED_WORKS alone', (rel) => {
    const code = codeOnly(readFileSync(path.join(REPO, rel), 'utf8'));
    expect(code, `${rel} does not use ALL_SERVED_WORKS`).toMatch(/\bALL_SERVED_WORKS\b/);

    // SEED: put `[...SERVED_PROSE_WORKS, ...SERVED_LANE_WORKS]` back -> RED, naming both.
    const handComposed = [...DECLARED_LISTS, 'SERVED_LANE_WORKS'].filter((name) =>
      new RegExp(`\\b${name}\\b`).test(code),
    );
    expect(
      handComposed,
      `${rel} references ${handComposed.join(', ')} directly. Admission must come from ` +
        'ALL_SERVED_WORKS so a new served list cannot be forgotten here.',
    ).toEqual([]);
  });
});
