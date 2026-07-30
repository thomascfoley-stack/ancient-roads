// Red-first (ADR-026): seed a mis-ordered chunk set, run migration 024's OWN
// backfill UPDATE, and prove the reader's (unit_ordinal, ordinal) ordering
// reassembles each reading unit gaplessly. Before the migration is applied the
// UPDATE fails (no `unit_ordinal` column) — the suite is RED; after, GREEN.
//
// The backfill under test is extracted from the migration file itself (the
// --SPLIT-- part carrying `UPDATE sections`) — never a re-implementation that
// could drift green while the committed SQL is wrong.
//
// Owner-only: the seed inserts/deletes throwaway sources/sections, and
// app_runtime is SELECT-only on the corpus (006/010). The dev-endpoint guard is
// the same one db/apply-migration.mjs enforces — the suite SKIPS unless an
// owner DATABASE_URL pointing at the dev branch (ep-tiny-hat | ep-holy-rice-athhpp5z | localhost) is
// available, so it can never seed or delete on prod.
//
// ⚠ THIS SUITE DOES **NOT** RUN IN CI TODAY. The previous header asserted the opposite — that
// the db-invariants job held an owner connection string and executed this suite. That was FALSE:
// commit `f229a93` parked the workflow edit for lack of the `workflow` token scope, so
// `db-invariants` still targets exactly two files (`licensing`, `tenancy`) and short-circuits to
// green when the `APP_DATABASE_URL_TEST` secret is absent — which it is. Measured under CI
// conditions (no `web/.env.local`): **75 of 200 web tests skip, including every test here.**
// Tracked in `docs/OWNER_ACTIONS.md` §1; enforced by `test/invariants/ci-claims-match-reality.test.ts`.
// (That guard matches claim-phrases anywhere in a file, so describe the old claim — do not
// reproduce its wording verbatim, or the guard will read the quotation as a fresh assertion.)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const MIGRATION = fileURLToPath(new URL('../../../db/migrations/024_sections_unit_ordinal.sql', import.meta.url));

function ownerUrl(): string | undefined {
  // ONE definition, in helpers/env.ts: refuses production LOUDLY, allows dev/localhost,
  // and allows any other endpoint only when declared by exact id in SEED_TEST_ENDPOINT.
  // Was a hardcoded dev-endpoint regex, which made this suite un-runnable in CI.
  return seedOwnerUrl();
}

function backfillSql(): string {
  const parts = readFileSync(MIGRATION, 'utf8').split(/^--SPLIT--$/m);
  const hit = parts.find((p) => /UPDATE\s+sections/i.test(p));
  if (!hit) throw new Error('024 migration has no UPDATE sections part — backfill missing?');
  return hit;
}

const SLUG_PREFIX = 'qa-unit-ordinal-seed-';
const RUN_ID = process.env.GITHUB_RUN_ID ?? String(process.pid);
const SLUG = `${SLUG_PREFIX}${RUN_ID}`;

// The deliberately mis-ordered seed (storage order ≠ reading order):
//  - Sermon A's three chunks "Sermon A — ref (1|2|3/3)" interleaved with
//    Sermon B's two "Sermon B — ref (1|2/2)" (the sermon shape);
//  - two consecutive identical "To Maecenas" chunks + a singleton "On
//    Friendship" (the register shape);
//  - a NULL-heading verse-anchored pair stored chapter 3 THEN chapter 1 — the
//    backfill must order the units by chapter, so canonical order wins.
const SEED: Array<{ ordinal: number; heading: string | null; vstart?: number }> = [
  { ordinal: 1, heading: 'Sermon A — ref (1/3)' },
  { ordinal: 2, heading: 'Sermon B — ref (1/2)' },
  { ordinal: 3, heading: 'Sermon A — ref (2/3)' },
  { ordinal: 4, heading: 'Sermon B — ref (2/2)' },
  { ordinal: 5, heading: 'Sermon A — ref (3/3)' },
  { ordinal: 6, heading: 'To Maecenas' },
  { ordinal: 7, heading: 'To Maecenas' },
  { ordinal: 8, heading: 'On Friendship' },
  { ordinal: 9, heading: null, vstart: 1003001 }, // book 1, chapter 3, verse 1
  { ordinal: 10, heading: null, vstart: 1001001 }, // book 1, chapter 1, verse 1
];

// What ORDER BY unit_ordinal, ordinal must reconstruct: each unit's chunks
// contiguous, units dense 1..6, and chapter 1 re-sorted before chapter 3.
const EXPECTED = [
  { unit_ordinal: 1, ordinal: 1 },
  { unit_ordinal: 1, ordinal: 3 },
  { unit_ordinal: 1, ordinal: 5 },
  { unit_ordinal: 2, ordinal: 2 },
  { unit_ordinal: 2, ordinal: 4 },
  { unit_ordinal: 3, ordinal: 6 },
  { unit_ordinal: 3, ordinal: 7 },
  { unit_ordinal: 4, ordinal: 8 },
  { unit_ordinal: 5, ordinal: 10 },
  { unit_ordinal: 6, ordinal: 9 },
];

const url = ownerUrl();
let client: pg.Client | undefined;
let seeded = false;

const deleteSeed = async (c: pg.Client, slug: string) => {
  await c.query(
    `DELETE FROM section_anchors sa USING sections s
     WHERE sa.section_id = s.id AND s.source_id IN (SELECT id FROM sources WHERE slug = $1)`,
    [slug],
  );
  await c.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug = $1)`, [slug]);
  await c.query(`DELETE FROM sources WHERE slug = $1`, [slug]);
};

/** Delete stale qa-unit-ordinal-seed-* fixtures from interrupted runs (not the current slug). */
const sweepStaleSeeds = async (c: pg.Client) => {
  const { rows } = await c.query<{ slug: string }>(
    `SELECT slug FROM sources WHERE slug LIKE $1 AND slug <> $2`,
    [`${SLUG_PREFIX}%`, SLUG],
  );
  for (const r of rows) await deleteSeed(c, r.slug);
};

// A DB-less run must READ as NOT RUN, not as coverage — see helpers/loud-skip.ts.
const SKIP = announceSkip(
  'ADR-026 red-first — 024 backfill reassembles mis-ordered chunks in (unit_ordinal, ordinal) order',
  [{ name: 'DATABASE_URL (owner seed connection via seedOwnerUrl)', present: Boolean(url) }],
  'the 024 backfill reassembly of mis-ordered chunks in (unit_ordinal, ordinal) order',
);

describe.skipIf(SKIP)('ADR-026 red-first — 024 backfill reassembles mis-ordered chunks in (unit_ordinal, ordinal) order', () => {
  beforeAll(async () => {
    client = new pg.Client({ connectionString: url!, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await sweepStaleSeeds(client);
    await deleteSeed(client, SLUG); // clear any leftover from a crashed run
    // license is 'Public Domain' (an ALLOWED_LICENSES value), changed 2026-07-19 from
    // 'public-domain'. The old literal was safe ONLY because this seed is status='staged' and
    // Gate B inspects published rows — a latent landmine that would arm itself the moment this
    // status changed. The sibling library-published-boundary test tripped exactly that on a
    // published seed and failed Gate B repo-wide. scripts/check-test-residue.mjs is the
    // class-level guard; this is defence in depth.
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA unit-ordinal seed', 'QA', 'sermon', 'qa', 'qa', 'Public Domain', '{}', 'staged')
       RETURNING id`,
      [SLUG],
    );
    const sourceId = rows[0]!.id;
    for (const r of SEED) {
      const { rows: sec } = await client.query<{ id: string }>(
        `INSERT INTO sections (source_id, ordinal, heading, body) VALUES ($1, $2, $3, $4) RETURNING id`,
        [sourceId, r.ordinal, r.heading, `qa seed body ${r.ordinal}`],
      );
      if (r.vstart !== undefined) {
        await client.query(
          `INSERT INTO section_anchors (section_id, verse_id_start, verse_id_end) VALUES ($1, $2, $2)`,
          [sec[0]!.id, r.vstart],
        );
      }
    }
    seeded = true;
  }, 60_000);

  afterAll(async () => {
    if (!client || !seeded) return;
    await deleteSeed(client, SLUG);
    await sweepStaleSeeds(client);
    await client.end();
  }, 60_000);

  it('assigns dense gapless units; (unit_ordinal, ordinal) reconstructs every unit in reading order', async () => {
    await client!.query(backfillSql());
    const { rows } = await client!.query<{ unit_ordinal: number | null; ordinal: number }>(
      `SELECT s.unit_ordinal, s.ordinal FROM sections s
       JOIN sources w ON w.id = s.source_id
       WHERE w.slug = $1
       ORDER BY s.unit_ordinal, s.ordinal`,
      [SLUG],
    );
    expect(rows.every((r) => r.unit_ordinal !== null)).toBe(true);
    expect(rows).toEqual(EXPECTED);
    // dense, gapless 1..N — exactly six units, numbered 1..6
    expect([...new Set(rows.map((r) => r.unit_ordinal))]).toEqual([1, 2, 3, 4, 5, 6]);
  }, 60_000);

  it('is idempotent — a second backfill run changes nothing', async () => {
    await client!.query(backfillSql());
    const { rows } = await client!.query<{ unit_ordinal: number | null; ordinal: number }>(
      `SELECT s.unit_ordinal, s.ordinal FROM sections s
       JOIN sources w ON w.id = s.source_id
       WHERE w.slug = $1
       ORDER BY s.unit_ordinal, s.ordinal`,
      [SLUG],
    );
    expect(rows).toEqual(EXPECTED);
  }, 60_000);
});
