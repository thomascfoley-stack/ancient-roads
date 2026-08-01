// §3 verse-key distribution — the scan, in ONE place.
//
// It used to live only inside web/test/invariants/verse-keys.test.ts, which is
// `describe.skipIf(corpus absent)`. That is right for CI, where the gitignored corpus does
// not exist. It is WRONG at deploy: `vercel --prod` uploads the working directory, so the
// one moment the corpus is provably present and about to ship is the one moment the guard
// was allowed to announce a skip. scripts/predeploy-gate.ts now imports these functions and
// runs them with no artifact exemption at all.
//
// The test and the gate share this module rather than each carrying a copy — a second
// implementation of the threshold is how the two drift and the deploy-side one silently
// stops matching what CI believes it enforces.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isPublishedAuthor } from '../../src/lib/legal-corpus';
import { FORBIDDEN_PROVENANCE_DOMAINS } from '../../../src/ingest/forbidden-provenance.mjs';

/** `verse_start = verse_end = chapter` at or above this share of an author's entries is the
 *  ADR-020 collapse signature. Clean authors sit at 0.9–6.9%; biblehub-sourced at 99.9–100%. */
export const COLLAPSE_MAX = 0.2;
/** Below this an author's rate is noise, not a distribution. */
export const MIN_ENTRIES = 200;
/**
 * DERIVED, never re-typed. This was `/biblehub\.com|studylight\.org/i` — a hand-typed copy that
 * had drifted to TWO domains where the canonical list has three, omitting `historicalchristian.faith`,
 * the one added most recently and the one still live in the ask pool (2026-08-02 deep audit, H8).
 * It backs the deploy gate's served-entry check at predeploy-gate.ts, so the drift sat on the
 * legal rail, and `forbidden-provenance.mjs:10-11` says in as many words: "Do not re-type it
 * anywhere."
 *
 * Built from FORBIDDEN_PROVENANCE_DOMAINS, so a domain added there is covered here by existing.
 * Escaped, because a domain is a string and `.` in a regex is not.
 */
export const FORBIDDEN_HOST = new RegExp(
  FORBIDDEN_PROVENANCE_DOMAINS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
);

export interface CorpusEntry {
  verseStart: number;
  verseEnd: number;
  author: string;
  sourceUrl?: string;
  chapter: number;
}

export function loadCorpusEntries(corpusDir: string): CorpusEntry[] {
  const out: CorpusEntry[] = [];
  if (!existsSync(corpusDir)) return out;
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!f.endsWith('.json') || f === '_manifest.json') continue;
      let j: { chapter?: number; entries?: Array<Omit<CorpusEntry, 'chapter'>> };
      try {
        j = JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        continue;
      }
      if (!j || !Array.isArray(j.entries) || typeof j.chapter !== 'number') continue;
      for (const e of j.entries) out.push({ ...e, chapter: j.chapter });
    }
  };
  walk(corpusDir);
  return out;
}

export function collapseByAuthor(entries: CorpusEntry[]): Map<string, { n: number; collapsed: number }> {
  const byAuthor = new Map<string, { n: number; collapsed: number }>();
  for (const e of entries) {
    const rec = byAuthor.get(e.author) ?? { n: 0, collapsed: 0 };
    rec.n++;
    if (e.verseStart === e.verseEnd && e.verseStart === e.chapter) rec.collapsed++;
    byAuthor.set(e.author, rec);
  }
  return byAuthor;
}

/** Authors whose verse keys have collapsed to the chapter number. */
export function verseKeyOffenders(byAuthor: Map<string, { n: number; collapsed: number }>): string[] {
  return [...byAuthor.entries()]
    .filter(([, v]) => v.n >= MIN_ENTRIES && v.collapsed / v.n >= COLLAPSE_MAX)
    .map(([a, v]) => `${a} ${((100 * v.collapsed) / v.n).toFixed(1)}% (n=${v.n})`);
}

/** SERVED entries carrying forbidden aggregator provenance. */
export function forbiddenServedEntries(entries: CorpusEntry[]): CorpusEntry[] {
  return entries.filter((e) => isPublishedAuthor(e.author) && FORBIDDEN_HOST.test(e.sourceUrl ?? ''));
}

/** How many authors clear MIN_ENTRIES — zero means the scan could not have failed. */
export function eligibleAuthorCount(byAuthor: Map<string, { n: number; collapsed: number }>): number {
  return [...byAuthor.values()].filter((v) => v.n >= MIN_ENTRIES).length;
}
