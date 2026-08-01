// §3 — the verse-key distribution guard (2026-07-13). `verse_start = verse_end = chapter`
// is a PLAUSIBLE value: it's in range, satisfies every per-row constraint, and renders
// fine — so no row-level check catches it. Only a DISTRIBUTIONAL assertion does. The
// threshold is measured, not guessed: every clean author sits at 0.9–6.9% collapsed (the
// genuine rate of "a comment on verse N of chapter N"); every biblehub-sourced author sits
// at 99.9–100%. 0.20 separates the two populations with an order-of-magnitude margin.
//
// LIVE GATE since 2026-07-17 (was `.skip`ped RED baseline from 2026-07-13, measured at
// 14 authors 99.9–100% collapsed, 200,385 biblehub/studylight rows). Repaired by CLEANING
// THE CORPUS, not the threshold (docs/CORPUS_VERSE_KEY_REPAIR.md §4):
//   - Barnes/Wesley/Calvin/Scofield/B.W. Johnson re-sourced per-verse from CrossWire
//     SWORD modules (src/ingest/sword-zverse.ts; DistributionLicense=Public Domain
//     verified per .conf) — collapse now in the clean 0.9–6.9% band.
//   - Poole re-sourced per-verse the same night from the EEBO-TCP CC0 transcription
//     (src/ingest/poole-tcp.ts). Cambridge/Pulpit/Benson/Bengel/MacLaren/Darby/Lange/
//     Geneva have no clean per-verse source yet (Geneva's module carries NO license
//     grant — fail closed) and are QUARANTINED out of the static corpus
//     (data/quarantine/, reversible hold).
// The 0.20 threshold is unchanged — it is the point.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { announceSkip } from '../helpers/loud-skip';
import {
  COLLAPSE_MAX,
  MIN_ENTRIES,
  collapseByAuthor,
  eligibleAuthorCount,
  forbiddenServedEntries,
  loadCorpusEntries,
  verseKeyOffenders,
} from '../helpers/verse-key-scan';

// The scan itself lives in ../helpers/verse-key-scan.ts because scripts/predeploy-gate.ts
// runs the SAME functions at deploy time, where the artifact-skip below must not apply:
// `vercel --prod` uploads the working directory, so deploy is the one moment the corpus is
// provably present. Two copies of the threshold would let the deploy-side check drift away
// from what this suite believes it enforces.
const CORPUS_DIR = fileURLToPath(new URL('../../public/commentaries', import.meta.url));
const loadEntries = () => loadCorpusEntries(CORPUS_DIR);

// VACUOUS-PASS FIX (2026-07-19). This suite's title claimed it "skips" when the corpus is
// absent, but nothing skipped: `web/public/commentaries` is gitignored and absent in CI, so
// loadEntries() returned [], `offenders` was [], and `expect([]).toEqual([])` went GREEN with
// zero assertions. Demonstrated by pointing CORPUS_DIR at a missing directory: "2 passed" in
// 2ms. That is worse than no test — it guards the ADR-020 scar (verse keys collapsing to the
// chapter number, 200,385 biblehub rows) and CI reported it enforced while it enforced nothing.
//
// Now: a VISIBLE skip when the corpus is absent (never a green pass), a LOUD throw in a job
// that declares the corpus required (REQUIRE_CORPUS=1 — same idiom as requireDbInCi), and an
// in-test floor so a present-but-empty/partial corpus cannot pass vacuously either.
const CORPUS_AVAILABLE = existsSync(CORPUS_DIR);
if (!CORPUS_AVAILABLE && process.env.REQUIRE_CORPUS === '1') {
  throw new Error(
    `REQUIRE_CORPUS=1 but no corpus at ${CORPUS_DIR}. This job must run against the real static ` +
      'corpus (the ADR-020 verse-key gate is meaningless without it). Run `pnpm gate:ingest` where the corpus lives.',
  );
}

const SKIP = announceSkip(
  '§3 verse-key distribution',
  [{
    name: 'web/public/commentaries (gitignored static corpus)',
    present: CORPUS_AVAILABLE,
    kind: 'artifact',
  }],
  'verse-key collapse (>20% chapter-keyed) and forbidden biblehub/studylight provenance on served entries',
);

/** The guard can only catch anything if some author clears MIN_ENTRIES. Asserting that turns a
 *  vacuous green (empty/partial corpus) into a failure. */
function assertGuardIsLive(byAuthor: Map<string, { n: number; collapsed: number }>): void {
  expect(
    eligibleAuthorCount(byAuthor),
    `VACUOUS GUARD: no author reached MIN_ENTRIES=${MIN_ENTRIES}, so this assertion could not have failed. ` +
      'The corpus is empty or partial — fix the corpus, do not trust this green.',
  ).toBeGreaterThan(0);
}

describe.skipIf(SKIP)('§3 verse-key distribution (live gate; announces NOT RUN when the gitignored corpus is absent, e.g. CI)', () => {
  it('no author (≥200 entries) has >20% of entries keyed verse_start=verse_end=chapter', () => {
    const byAuthor = collapseByAuthor(loadEntries());
    assertGuardIsLive(byAuthor);
    const offenders = verseKeyOffenders(byAuthor);
    expect(offenders, `authors whose verse keys collapse to the chapter number:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no SERVED (published) entry carries a biblehub.com / studylight.org sourceUrl', () => {
    const entries = loadEntries();
    // Same anti-vacuity floor: with zero entries loaded, `served.length === 0` is trivially true
    // and proves nothing about provenance.
    expect(
      entries.length,
      'VACUOUS GUARD: zero corpus entries loaded, so the forbidden-provenance assertion could not have failed.',
    ).toBeGreaterThan(MIN_ENTRIES);
    const served = forbiddenServedEntries(entries);
    const byAuthor = [...new Set(served.map((e) => e.author))];
    expect(served.length, `served entries with forbidden aggregator provenance (${byAuthor.join(', ')})`).toBe(0);
  });
});
