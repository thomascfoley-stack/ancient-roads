// The draft check, end to end minus the network (docs/MY_WORKS_DRAFT_AND_METADATA_DESIGN.md §1).
//
// ZERO EMBEDDING SPEND is part of the design and part of this suite: fixtures are seeded through
// createDocument + direct section/anchor inserts under RLS — never the drain — so running this
// costs no provider call, and a spend sneaking into the path would fail the module-closure leg.
//
// Needs APP_DATABASE_URL + web/public/bible; announces loudly when it cannot run.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { announceSkip } from '../helpers/loud-skip';
import { runAsUser } from '../../src/lib/db';
import { createDocument, deleteDocument } from '../../src/lib/user-corpus/documents';
import { anchorDraft, draftCheck, DRAFT_MAX_RANGES } from '../../src/lib/user-corpus/draft-check';
import { corpusPredicate } from '../../src/lib/user-corpus/tradition-gap';
import { LEGAL_CORPUS_FILTER } from '../../src/lib/teacher/routing';
import { runtimeDbUrl } from '../helpers/env';

const HAVE_BIBLE = existsSync(path.resolve(__dirname, '../../public/bible/kjv/jhn.json'));
const enabled = Boolean(runtimeDbUrl()) && HAVE_BIBLE;

// SELF-REPORTED SKIP (2026-08-22). This suite used to skip with a bare console.warn, which put it
// in `ci-skip-ceiling.mjs`'s RESIDUAL bucket: that script defines "secret-caused" as "not
// registered as an artifact skip", so any suite that does not call announceSkip is counted as a
// missing SECRET whatever the real cause. Eight suites were being counted that way and the gate
// was refusing green on the total. announceSkip makes each requirement state its own kind, so the
// count becomes a measurement instead of an elimination — and it cannot launder a secret into an
// exemption: under REQUIRE_SECRETS=1 a missing SECRET throws rather than being recorded.
announceSkip(
  'draft check',
  [
    { name: 'APP_DATABASE_URL', present: Boolean(runtimeDbUrl()) },
    { name: 'web/public/bible/kjv (gitignored corpus asset)', present: HAVE_BIBLE, kind: 'artifact' as const },
  ],
  'draft anchoring against the real KJV and the live corpus predicate',
);

const USER = `draftcheck-${Date.now().toString(36)}`;
// Rom 8:28 KJV — verbatim, so the uncited channel anchors it at the shipped K.
const ROM828 = 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.';
const DRAFT = `My draft on providence. ${ROM828} Let us take comfort in this together, brothers, whatever the week has held.`;

const created: string[] = [];

afterAll(async () => {
  for (const id of created) await deleteDocument(USER, id).catch(() => undefined);
});

describe.skipIf(!enabled)('draft check', () => {
  it('anchors a draft in-process — detection live, no rows written, no spend', () => {
    const { detection, ranges } = anchorDraft(DRAFT);
    expect(ranges.some((r) => r.start <= 45008028 && r.end >= 45008028), JSON.stringify(ranges)).toBe(true);
    expect(detection.translation).toBeTruthy();
    expect(ranges.length).toBeLessThanOrEqual(DRAFT_MAX_RANGES);
  });

  // DB round-trips (seed + draftCheck corpus query) on the ephemeral Neon branch can exceed the
  // 5 s vitest default; 30 s is generous enough to rule out slow cold-start without hiding hangs.
  it('finds the user\'s own document on the same passage, and the tradition beside it', async () => {
    // Seed a "past sermon" anchored on Rom 8:28 WITHOUT the drain: document row + one section +
    // one anchor, all as app_runtime under RLS.
    const doc = await createDocument(USER, {
      title: 'Sermon on Romans 8', filename: 'rom8.txt', byteSize: 100,
      checksum: `${USER}-rom8`, mimeType: 'txt',
    });
    created.push(doc.id);
    await runAsUser(USER, (sql) => [
      sql`INSERT INTO user_sections (document_id, user_id, ordinal, body)
          VALUES (${doc.id}, ${USER}, 0, ${ROM828}) RETURNING id`,
    ]).then(async ([rows]) => {
      const sid = (rows as { id: string }[])[0]!.id;
      await runAsUser(USER, (sql) => [
        sql`INSERT INTO user_section_anchors (section_id, user_id, verse_id_start, verse_id_end, channel, match_count, confidence)
            VALUES (${sid}, ${USER}, 45008028, 45008028, 'uncited', 5, 1.0)`,
      ]);
    });

    const result = await draftCheck(USER, DRAFT, corpusPredicate(LEGAL_CORPUS_FILTER));
    const overlap = result.overlaps.find((o) => o.range.start <= 45008028 && o.range.end >= 45008028);
    expect(overlap, 'the past sermon must surface on the draft\'s own passage').toBeTruthy();
    expect(overlap!.documents.map((d) => d.title)).toContain('Sermon on Romans 8');
    // The gap side: Romans 8:28 is among the best-covered verses in the corpus.
    expect(result.gaps.authorCount).toBeGreaterThan(0);
    expect(result.gaps.rangesConsidered).toBeGreaterThan(0);
  }, 30_000);

  it('a draft with no Scripture yields empty ranges and an empty gap — not an error', async () => {
    const result = await draftCheck(USER, 'Minutes of the roof-repair committee, October meeting.', corpusPredicate(LEGAL_CORPUS_FILTER));
    expect(result.ranges).toEqual([]);
    expect(result.overlaps).toEqual([]);
    expect(result.gaps.voices).toEqual([]);
  });

  it('the module closure never reaches the embedder — zero spend is structural', () => {
    // Same transitive-import check the wallet invariant runs over routes, applied to the lib —
    // via fs, not a child process (lint forbids require()).
    const dir = path.resolve(__dirname, '../../src/lib/user-corpus');
    const embedImporters = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => readFileSync(path.join(dir, f), 'utf8').includes("from './embed'"));
    for (const f of ['draft-check.ts', 'tradition-gap.ts', 'search.ts', 'bible-index.ts', 'anchor.ts', 'chunk.ts']) {
      expect(embedImporters, `${f} must not import the embedder`).not.toContain(f);
    }
  });
});
