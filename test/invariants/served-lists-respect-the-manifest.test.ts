// A SERVED LIST MAY NOT NAME A WORK THE MANIFEST WITHHOLDS — A8, 2026-08-02.
//
// `ingest/sources.config.json` is the source of truth for what may be ingested and served
// (AGENTS.md). Rail 6 of the A8 draft order states the consequence: "Quarantine is law. The
// `serve:false` works never ingest to prod and never appear in any flip list."
//
// Today that is law BY COINCIDENCE. Nothing checks it. The chain is:
//
//     routing.ts SERVED_*_WORKS  ->  ALL_SERVED_WORKS  ->  admission  ->  `admitted && staged`
//                                                                     ->  the flip list  ->  published
//
// so a quarantined slug typed into a served list is published content, and the only thing standing
// in the way is that nobody has typed one. That was an acceptable risk while the admission set
// covered 14 works; the A8/B2 fix widened it to 29 by wiring in SERVED_SONG_VERSE_WORKS, and the
// song/verse register is exactly where the quarantine rulings live (bramley-carols,
// donne-divine-poems, herrick-noble-numbers were all quarantined out of it). Widening the door and
// leaving the lock unenforced is the wrong half of the job.
//
// MEASURED AT THE TIME OF WRITING: 60 manifest entries, 8 carrying `serve: false`, 29 served works,
// 0 breaches, 0 served slugs missing from the manifest. Both properties below are green on arrival.
// That is the point — this pins something that is TRUE and unprotected, rather than reporting a bug.
//
// `serve: false` deliberately conflates two different reasons — quarantined for quality/licensing
// (donne-divine-poems/herrick-noble-numbers: secular volumes under sacred titles;
// whitefield-works: no clean sermon boundaries) and staged
// because no read path exists yet (the three historians, thayers-lexicon). The flag cannot tell
// them apart and this test does not try to: BOTH reasons mean "not served", and a served list
// naming either one is wrong. If a historian is later meant to serve, the manifest entry is what
// changes, and it changes deliberately.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_SERVED_WORKS, SERVED_WORK_LISTS } from '../../web/src/lib/teacher/routing';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface ManifestEntry {
  slug?: string;
  serve?: boolean;
  source_type?: string;
}

// The manifest is a JSON object keyed by index, not an array — Object.values, not a cast to [].
const MANIFEST = Object.values(
  JSON.parse(readFileSync(path.join(REPO, 'ingest/sources.config.json'), 'utf8')) as Record<string, ManifestEntry>,
).filter((e) => typeof e?.slug === 'string');

const BY_SLUG = new Map(MANIFEST.map((e) => [e.slug!, e]));
const WITHHELD = MANIFEST.filter((e) => e.serve === false).map((e) => e.slug!).sort();

describe('the manifest and the served lists are both really there', () => {
  it('read a populated manifest and a populated served set — an anti-vacuity floor', () => {
    // Every case below is a "no member of X is in Y" shape, which passes trivially over an empty X
    // or an empty Y. If the manifest key shape ever changes, this is what says so.
    expect(MANIFEST.length).toBeGreaterThan(40);
    expect(ALL_SERVED_WORKS.length).toBeGreaterThan(20);
    expect(WITHHELD.length, 'no serve:false entry found — the flag was renamed or the parse broke').toBeGreaterThan(0);
    // The three quality/licensing quarantines named in the A8 draft's STOP list and still in the
    // manifest (bramley-carols was the fourth — terminally excluded 2026-08-13, block deleted).
    // If a rename or a manifest edit removes one, that is a decision someone must have made on
    // purpose.
    for (const slug of ['whitefield-works', 'donne-divine-poems', 'herrick-noble-numbers']) {
      expect(WITHHELD, `${slug} is no longer serve:false in the manifest`).toContain(slug);
    }
  });
});

describe('no withheld work reaches a served list', () => {
  // SEED: add 'whitefield-works' to SERVED_SERMON_WORKS, or 'donne-divine-poems' to
  // SERVED_SONG_VERSE_WORKS -> RED, naming the slug and the list it entered through.
  it.each(Object.keys(SERVED_WORK_LISTS))('%s names no serve:false work', (listName) => {
    const list = SERVED_WORK_LISTS[listName as keyof typeof SERVED_WORK_LISTS];
    const breach = list.filter((slug) => BY_SLUG.get(slug)?.serve === false);
    expect(
      breach,
      `SERVED ${listName} names ${breach.length} work(s) the manifest withholds: ${breach.join(', ')}. ` +
        'A served work is admitted, an admitted+staged work reaches the flip list, and a flipped ' +
        'work is published — so this is quarantined content one flip away from readers.',
    ).toEqual([]);
  });

  it('the derived union is clean too, not just each list separately', () => {
    // Belt and braces: the per-list cases go green if a list is deleted from SERVED_WORK_LISTS.
    const breach = ALL_SERVED_WORKS.filter((slug) => BY_SLUG.get(slug)?.serve === false);
    expect(breach, `withheld work(s) in ALL_SERVED_WORKS: ${breach.join(', ')}`).toEqual([]);
  });
});

describe('every served work is a work the manifest actually knows', () => {
  // A served slug with no manifest entry is admitted by routing and refusable by the ingest writer
  // (the A8 draft's B1 red-proof: "a slug not in sources.config.json -> refuse"). It would sit in
  // the admission set forever, never ingestable, and read as coverage the corpus does not have.
  // SEED: add 'not-a-real-work' to any served list -> RED.
  it('no served slug is missing from ingest/sources.config.json', () => {
    const missing = ALL_SERVED_WORKS.filter((slug) => !BY_SLUG.has(slug));
    expect(missing, `served slug(s) with no manifest entry: ${missing.join(', ')}`).toEqual([]);
  });
});
