// S-5 / S-6 / S-12 — THE REGISTER GROUPS on the merged search surface (docs/STUDY_DOCS_DESIGN.md
// §7.3): one capped query PER GROUP over the fenced engine, so every row is register-labelled,
// withdrawn works never surface, and an empty group is its own query's zero — never a truncation
// artefact of somebody else's group.
//
// What this suite guarantees (at the engine layer the surface is built on — lib/search-sections.ts
// with its catalog fence; the W5 page is a presentation of exactly these per-group queries):
//   S-5  Every row in every register-group query carries its register label, and a hit is filed
//        ONLY under its own register's group — a hymn is never presented among the Commentaries.
//        EXTENDS test/invariants/register-wall-surfaces.test.ts (which pins the taxonomy and the
//        cross-corpus query) into the per-group fan-out the merged surface performs.
//   S-6  Staged/quarantined works never surface — not cross-corpus, not in their own register
//        group, not in the pooled multi-group query. EXTENDS the published-boundary pattern: the
//        seeded rows are proven to EXIST with the token and the withdrawn status, so absence is
//        the predicate working, not missing data.
//   S-12 An empty register group is its OWN query's zero. Seeded: a hymn match and a
//        higher-ranked commentary match for the same token. A single globally-ranked page at
//        limit=1 hides the hymn (the artefact, asserted as the precondition); the per-group
//        hymns query at limit=1 still returns the hymn row.
//
// Pins S-5/S-6/S-12 (§8). Motivated by review S-C: the engine is GLOBALLY ranked, so grouping one
// truncated result set renders register groups as a partition of the top-N, with empty groups
// lying about the library — and by the register wall itself (A5): sermon/hymn content is never
// presented as exegesis.
//
// Red-proof: docs/evidence/study-docs-p2/search-register-groups.log — (a) the S-12 case first ran
// against the ANTI-PATTERN (hymn group = partition of the truncated global page) and was watched
// RED; (b) `s.source_type AS "sourceType"` removed from the engine's SELECT → S-5 RED;
// (c) `AND s.status = 'published'` removed from the shared predicate → S-6 RED. All reverted;
// suite then green.
//
// Owner-seeded + dev-guarded. Every seeded row is prefix-swept in afterAll, sources forced out of
// 'published' before deletion (the 2026-07-19 Gate B lesson); license is an ALLOWED_LICENSES
// value so even residue cannot fail the shared licensing gate.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_IDS, CATALOGS } from '@/lib/catalog';
import { searchSections } from '@/lib/search-sections';
import { ensureDbEnv, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const TS = Date.now();
const HYMN_SLUG = `qa-reggrp-hymn-${TS}`;
const COMM_SLUG = `qa-reggrp-comm-${TS}`;
const STAGED_SLUG = `qa-reggrp-staged-${TS}`;
const QUAR_SLUG = `qa-reggrp-quar-${TS}`;
const GROUP_TOKEN = `zzqareggrp${TS}`;
const STAGED_TOKEN = `zzqastaged${TS}`;
const QUAR_TOKEN = `zzqaquar${TS}`;

ensureDbEnv();
const ownerConn = seedOwnerUrl();
const appConn = process.env.APP_DATABASE_URL;

let owner: pg.Client | undefined;

const SKIP = announceSkip(
  'S-5/S-6/S-12 — the register groups: labelled, fenced, honestly empty',
  [
    { name: 'APP_DATABASE_URL (app_runtime via requireDbInCi)', present: Boolean(appConn) },
    { name: 'DATABASE_URL (owner seed connection via seedOwnerUrl)', present: Boolean(ownerConn) },
  ],
  'register-group search: per-group labels and fences (S-5), staged/quarantined absence (S-6), per-group zeros (S-12)',
);

async function seedWork(slug: string, sourceType: string, status: string, body: string): Promise<void> {
  const { rows } = await owner!.query<{ id: string }>(
    `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
     VALUES ($1, $2, 'QA RegGroup', $3, 'qa', 'qa', 'Public Domain', '{}', $4)
     RETURNING id`,
    [slug, `QA ${slug}`, sourceType, status],
  );
  await owner!.query(
    `INSERT INTO sections (source_id, ordinal, unit_ordinal, heading, body) VALUES ($1, 1, 1, 'QA heading', $2)`,
    [rows[0]!.id, body],
  );
}

describe.skipIf(SKIP)('S-5/S-6/S-12 — the register groups: labelled, fenced, honestly empty', () => {
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: ownerConn!, ssl: { rejectUnauthorized: false } });
    await owner.connect();
    // The S-12 fixture: the hymn says the token ONCE; the commentary says it forty times, so the
    // commentary outranks it globally (asserted as a precondition below — if ranking ever
    // surprises, the suite fails loudly at the precondition, not silently vacuous).
    await seedWork(HYMN_SLUG, 'hymn', 'published', `A hymn stanza mentioning ${GROUP_TOKEN} exactly once.`);
    await seedWork(
      COMM_SLUG,
      'commentary',
      'published',
      `A commentary paragraph. ${Array.from({ length: 40 }, () => GROUP_TOKEN).join(' ')}.`,
    );
    // The S-6 fixtures: real rows, real tokens, withdrawn statuses.
    await seedWork(STAGED_SLUG, 'hymn', 'staged', `A staged hymn mentioning ${STAGED_TOKEN}.`);
    await seedWork(QUAR_SLUG, 'commentary', 'quarantined', `A quarantined commentary mentioning ${QUAR_TOKEN}.`);
  }, 60_000);

  afterAll(async () => {
    if (!owner) return;
    const attempt = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.error(`[teardown] ${label} failed: ${(e as Error).message}`);
      }
    };
    await attempt('quarantine seeded sources', () =>
      owner!.query(`UPDATE sources SET status = 'quarantined' WHERE slug LIKE 'qa-reggrp-%'`),
    );
    await attempt('sections', () =>
      owner!.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-reggrp-%')`),
    );
    await attempt('sources', () => owner!.query(`DELETE FROM sources WHERE slug LIKE 'qa-reggrp-%'`));
    await attempt('close', () => owner!.end());
  }, 60_000);

  it('S-5: every register-group row is register-LABELLED, and a hit is filed ONLY under its own register', async () => {
    for (const id of CATALOG_IDS) {
      const { results } = await searchSections({ query: GROUP_TOKEN, catalog: id, limit: 10 });
      for (const r of results) {
        expect(typeof r.sourceType === 'string' && r.sourceType.length > 0, `group "${id}" row "${r.slug}" has no register label`).toBe(true);
        expect(
          CATALOGS[id].types.includes(r.sourceType),
          `group "${id}" surfaced "${r.slug}" of register "${r.sourceType}" — outside its fence`,
        ).toBe(true);
      }
      // The wall, in the group dimension: never presented as another register.
      if (id !== 'hymns-poetry') {
        expect(results.map((r) => r.slug), `a hymn must never be filed under "${id}"`).not.toContain(HYMN_SLUG);
      }
      if (id !== 'commentaries') {
        expect(results.map((r) => r.slug), `a commentary must never be filed under "${id}"`).not.toContain(COMM_SLUG);
      }
    }
    // Precondition (a fence over an empty shelf proves nothing): the hits DO land in their own
    // groups, labelled as what they are.
    const hymns = await searchSections({ query: GROUP_TOKEN, catalog: 'hymns-poetry', limit: 10 });
    const hymnRow = hymns.results.find((r) => r.slug === HYMN_SLUG);
    expect(hymnRow?.sourceType, 'the hymn lands in Hymns & Poetry, labelled hymn').toBe('hymn');
    const comms = await searchSections({ query: GROUP_TOKEN, catalog: 'commentaries', limit: 10 });
    const commRow = comms.results.find((r) => r.slug === COMM_SLUG);
    expect(commRow?.sourceType, 'the commentary lands in Commentaries, labelled commentary').toBe('commentary');
    // The pooled multi-group query the merged surface issues: both hits, each self-labelled.
    const pooled = await searchSections({ query: GROUP_TOKEN, catalogs: CATALOG_IDS, limit: 10 });
    expect(pooled.results.map((r) => r.slug)).toEqual(expect.arrayContaining([HYMN_SLUG, COMM_SLUG]));
    for (const r of pooled.results) {
      expect(typeof r.sourceType === 'string' && r.sourceType.length > 0, `pooled row "${r.slug}" has no register label`).toBe(true);
    }
  }, 120_000);

  it('S-6: staged/quarantined works never surface — cross-corpus, per-group, or pooled', async () => {
    // Precondition: the rows EXIST, carry the tokens, and hold the withdrawn statuses — absence
    // below is the licensing predicate working, not missing data (the published-boundary pattern).
    const raw = await owner!.query<{ slug: string; status: string }>(
      `SELECT s.slug, s.status FROM sections sec JOIN sources s ON s.id = sec.source_id
       WHERE sec.body LIKE '%' || $1 || '%' OR sec.body LIKE '%' || $2 || '%' ORDER BY s.slug`,
      [STAGED_TOKEN, QUAR_TOKEN],
    );
    expect(raw.rows).toEqual([
      { slug: QUAR_SLUG, status: 'quarantined' },
      { slug: STAGED_SLUG, status: 'staged' },
    ]);

    for (const [label, scope] of [
      ['cross-corpus', {}],
      ['its own register group', { catalog: 'hymns-poetry' as const }],
      ['the pooled multi-group query', { catalogs: CATALOG_IDS }],
    ] as const) {
      const staged = await searchSections({ query: STAGED_TOKEN, ...scope });
      expect(staged.results, `a staged work must not surface in ${label}`).toEqual([]);
      expect(staged.total, `the count must not leak the staged work's existence (${label})`).toBe(0);
    }
    for (const [label, scope] of [
      ['cross-corpus', {}],
      ['its own register group', { catalog: 'commentaries' as const }],
      ['the pooled multi-group query', { catalogs: CATALOG_IDS }],
    ] as const) {
      const quar = await searchSections({ query: QUAR_TOKEN, ...scope });
      expect(quar.results, `a quarantined work must not surface in ${label}`).toEqual([]);
      expect(quar.total, `the count must not leak the quarantined work's existence (${label})`).toBe(0);
    }
  }, 120_000);

  it('S-12: an empty register group is its OWN query’s zero — never a truncation artefact', async () => {
    // Precondition — the artefact is real at the global layer: one globally-ranked page at
    // limit=1 returns the higher-ranked commentary and hides the hymn entirely. If the engine's
    // ranking ever stops putting the commentary first, THIS line fails loudly and the property
    // below is re-fixtured, not silently vacuous.
    const globalPage = await searchSections({ query: GROUP_TOKEN, limit: 1 });
    expect(globalPage.results).toHaveLength(1);
    expect(globalPage.results[0]!.slug, 'fixture: the commentary must outrank the hymn globally').toBe(COMM_SLUG);
    expect(globalPage.results.map((r) => r.slug)).not.toContain(HYMN_SLUG);

    // The property: each group is its OWN capped query (design §2.5/§7.3), so the hymn group
    // shows its row at the same limit that hid it globally.
    const hymnGroup = await searchSections({ query: GROUP_TOKEN, catalog: 'hymns-poetry', limit: 1 });
    expect(hymnGroup.results.map((r) => r.slug), 'the hymn group must show its own row').toContain(HYMN_SLUG);
    expect(hymnGroup.total, 'the group count is its own query’s truth').toBeGreaterThanOrEqual(1);
    const commGroup = await searchSections({ query: GROUP_TOKEN, catalog: 'commentaries', limit: 1 });
    expect(commGroup.results.map((r) => r.slug)).toContain(COMM_SLUG);
  }, 60_000);
});
