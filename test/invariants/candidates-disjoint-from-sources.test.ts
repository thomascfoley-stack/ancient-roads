// `ingest/candidates.config.json` is a research artifact, NOT an ingestion source.
//
// The whole risk of keeping candidates in a second file is DRIFT: a candidate gets
// acquired, lands in `ingest/sources.config.json`, and nobody removes it from the
// candidates file. The ceiling count is then silently wrong in the direction that
// looks like progress — the same shape as the false-done census bug (LAUNCH_BLOCKERS
// #14) and the never-ingested backlog conflation, both of which cost real time in
// 2026-09. This test is the reason that trade is acceptable.
//
// It also enforces the harder rule: an EXCLUDED work may never appear in the
// ingestion manifest. Exclusions are decisions not to acquire — several of them
// ("no PD English exists", "copyright renewed 1970s", the Turretin 'PD 1900' claim
// that is false) exist precisely so the research is not silently redone and a
// copyrighted edition ingested on the second pass. A slug in both files means that
// guard has already failed.
//
// Static (no DB, no network), so it runs everywhere `npm run test` runs and fails
// the moment either file is edited into the drifted shape.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface SourceEntry {
  id: string;
  slug?: string;
}

interface Candidate {
  slug: string;
  title: string;
  author: string;
  source_type: string;
  target_edition: string | null;
  target_source: string | null;
  adapter: string | null;
  blocked_on: string | null;
}

interface Exclusion {
  slug: string;
  title: string;
  excluded_reason: string;
  verified_on: string;
}

interface CandidatesFile {
  schema_version: number;
  candidates: Candidate[];
  exclusions: Exclusion[];
  judgment_calls?: { slug: string; question: string }[];
}

const sources = JSON.parse(
  readFileSync(path.join(ROOT, 'ingest/sources.config.json'), 'utf8'),
) as SourceEntry[];

const file = JSON.parse(
  readFileSync(path.join(ROOT, 'ingest/candidates.config.json'), 'utf8'),
) as CandidatesFile;

const sourceSlugs = new Set(sources.map((e) => e.slug ?? e.id));

// The adapters that actually exist. `adapter-loop.ts` dispatches ccel|gutenberg;
// sword and structured are hand-run paths; archive needs a per-work OCR profile.
const KNOWN_ADAPTERS = new Set(['ccel', 'gutenberg', 'archive', 'sword', 'structured']);

// Forbidden by rule, wider than the enforced gate in forbidden-provenance.mjs.
// A candidate must never name one of these as its target source.
const FORBIDDEN_HOSTS = [
  'biblehub',
  'studylight',
  'historicalchristian.faith',
  'monergism',
  'sermonaudio',
  'blueletterbible',
  'desiringgod',
  'ligonier',
];

describe('candidates.config.json is disjoint from the ingestion manifest', () => {
  it('no candidate slug is already an acquired source', () => {
    const collisions = file.candidates.filter((c) => sourceSlugs.has(c.slug)).map((c) => c.slug);
    expect(
      collisions,
      `these candidates were acquired and never removed from candidates.config.json — ` +
        `promote-and-delete, or the ceiling count is wrong: ${collisions.join(', ')}`,
    ).toEqual([]);
  });

  it('no EXCLUDED slug appears in the ingestion manifest', () => {
    const leaked = file.exclusions.filter((e) => sourceSlugs.has(e.slug)).map((e) => e.slug);
    expect(
      leaked,
      `a work ruled out for licensing reasons is in the ingestion manifest: ${leaked.join(', ')}`,
    ).toEqual([]);
  });

  it('slugs are unique across candidates, exclusions and judgment calls', () => {
    const all = [
      ...file.candidates.map((c) => c.slug),
      ...file.exclusions.map((e) => e.slug),
      ...(file.judgment_calls ?? []).map((j) => j.slug),
    ];
    const dupes = all.filter((s, i) => all.indexOf(s) !== i);
    expect(dupes, `duplicate slugs: ${dupes.join(', ')}`).toEqual([]);
  });
});

describe('candidate entries carry what a promotion needs', () => {
  it('every candidate names a target edition and a target source', () => {
    // The edition trap: an author being PD does not make every edition PD. A candidate
    // that does not name WHICH edition is not actionable — it is a wish.
    const vague = file.candidates
      .filter((c) => !c.target_edition || !c.target_source)
      .map((c) => c.slug);
    expect(vague, `candidates missing target_edition/target_source: ${vague.join(', ')}`).toEqual([]);
  });

  it('every candidate declares a known adapter', () => {
    const bad = file.candidates
      .filter((c) => !c.adapter || !KNOWN_ADAPTERS.has(c.adapter))
      .map((c) => `${c.slug}=${c.adapter}`);
    expect(bad, `unknown adapter values: ${bad.join(', ')}`).toEqual([]);
  });

  it('archive-adapter candidates are marked blocked, and non-archive ones are not', () => {
    // The silent-skip trap: an entry whose adapter does not exist is passed over by
    // adapter-loop.ts, which reads as success. Anything on the archive lane must say so.
    const mismarked = file.candidates
      .filter((c) =>
        c.adapter === 'archive' ? c.blocked_on !== 'archive-adapter' : c.blocked_on !== null,
      )
      .map((c) => `${c.slug}(adapter=${c.adapter},blocked_on=${c.blocked_on})`);
    expect(mismarked, `blocked_on does not match adapter: ${mismarked.join(', ')}`).toEqual([]);
  });

  it('no candidate names a forbidden aggregator as its source', () => {
    const dirty = file.candidates
      .filter((c) => FORBIDDEN_HOSTS.some((h) => (c.target_source ?? '').toLowerCase().includes(h)))
      .map((c) => c.slug);
    expect(dirty, `forbidden host named as target_source: ${dirty.join(', ')}`).toEqual([]);
  });
});

describe('exclusions are recorded with a reason and a date', () => {
  it('every exclusion states why and when it was verified', () => {
    const thin = file.exclusions
      .filter((e) => !e.excluded_reason || !e.verified_on)
      .map((e) => e.slug);
    expect(thin, `exclusions missing reason/verified_on: ${thin.join(', ')}`).toEqual([]);
  });
});
