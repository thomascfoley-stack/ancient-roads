// D3 (DEEP_SWEEP.md) + its sibling found while fixing it.
//
// CLAUDE.md: "Never scrape ToS-protected aggregators (BibleHub/StudyLight)", and
// historicalchristian.faith joined FORBIDDEN_PROVENANCE_DOMAINS on 2026-07-10. Two scripts
// in src/ingest/ read those sources with ZERO gate:
//   - ingest-commentaries.ts  (packaged as `pnpm ingest:commentaries`) → data/commentaries
//     → merge-commentaries → web/public/commentaries
//   - ingest-biblehub.ts      (not packaged) → wrote web/public/commentaries DIRECTLY
// Both deleted 2026-08-23 on the owner's ruling (DECISIONS.md).
//
// This guard is deliberately NOT keyed on the domain strings: `ingest-commentaries.ts` never
// contained "historicalchristian.faith" — it said "HistoricalChristianFaith". A domain-only
// grep would have missed the very file that prompted this test. It matches the squashed name,
// case-insensitively, so both spellings trip it.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const IN = join(ROOT, 'src', 'ingest');

// The URL form is the one that matters: fetching FROM an aggregator is the banned act.
// Naming one is not — seven files in src/ingest legitimately say "biblehub" or
// "historicalchristian" in SQL predicates over OUR OWN rows, to classify, measure or repair
// what a prior ingest left behind (regen-crosswire-static, resource-classify-*, verse-key-gate,
// measure-embedding-gap, ingest-sword-commentaries). A first draft of this guard keyed on the
// bare name and flagged all seven — a check whose match set is wider than the property it
// claims. Narrowed to the fetch, which today has exactly one instance and it is being deleted.
// The guard module itself names them, and the remediation script exists to REMOVE their rows.
const ALLOWED = new Set(['forbidden-provenance.mjs', 'b2-remove-forbidden-provenance.ts']);

const AGGREGATOR_URL = /https?:\/\/[^\s'"`]*(biblehub|studylight|historicalchristian)/i;

describe('no ungated aggregator ingest', () => {
  it('the two deleted scripts stay deleted', () => {
    expect(existsSync(join(IN, 'ingest-commentaries.ts'))).toBe(false);
    expect(existsSync(join(IN, 'ingest-biblehub.ts'))).toBe(false);
  });

  it('no packaged script resurrects them', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    const bad = Object.entries(pkg.scripts ?? {}).filter(([, v]) => /ingest-commentaries|ingest-biblehub/.test(v));
    expect(bad).toEqual([]);
  });

  it('no src/ingest file fetches from a forbidden aggregator', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(IN)) {
      if (ALLOWED.has(f) || !/\.(ts|mts|mjs)$/.test(f)) continue;
      if (AGGREGATOR_URL.test(readFileSync(join(IN, f), 'utf8'))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
