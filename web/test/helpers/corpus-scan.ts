import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { forbiddenProvenanceDomain } from '../../../src/ingest/license-manifest';

const WEB_ROOT = path.join(__dirname, '../..');
export const COMMENTARIES_DIR = path.join(WEB_ROOT, 'public/commentaries');
export const BIBLE_DIR = path.join(WEB_ROOT, 'public/bible');

// Translation directory ids that must NEVER ship — copyrighted/commercial-capped per
// docs/ACQUISITION_MANIFEST.md:28. MUST match FORBIDDEN_TRANSLATION_IDS in web/src/lib/bible.ts
// (the picker guard); this is the file-side twin, enforced at deploy by predeploy-gate.ts.
// The picker guard (translation-licensing.test.ts) can't see a copyrighted dir that ships
// without being in the picker — this can. (LONG_NIGHT finding C1/H5, 2026-07-14.)
export const FORBIDDEN_TRANSLATION_DIRS = ['leb', 'litv', 'mkjv', 'lsv', 'nasb', 'niv', 'esv', 'nlt', 'csb'];

/** Forbidden Bible-translation directories present under `dir` (default public/bible/, about to ship). */
export function findForbiddenBibleTranslations(dir: string = BIBLE_DIR): string[] {
  if (!existsSync(dir)) return [];
  const present = new Set(readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isDirectory()));
  return FORBIDDEN_TRANSLATION_DIRS.filter((id) => present.has(id));
}
const BASELINE_PATH = path.join(__dirname, '../baselines/static-forbidden-provenance.json');

export interface ForbiddenProvenanceBaseline {
  count: number;
  recordedAt: string;
  description?: string;
}

export function loadForbiddenProvenanceBaseline(): ForbiddenProvenanceBaseline {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as ForbiddenProvenanceBaseline;
}

/** Count static JSON entries whose sourceUrl points at a forbidden aggregator domain. */
export function countStaticForbiddenProvenanceEntries(): number {
  if (!existsSync(COMMENTARIES_DIR)) return -1;

  let count = 0;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      const data = JSON.parse(readFileSync(full, 'utf-8')) as {
        entries?: Array<{ sourceUrl?: string }>;
      };
      for (const entry of data.entries ?? []) {
        if (forbiddenProvenanceDomain(entry.sourceUrl ?? '')) count += 1;
      }
    }
  };
  walk(COMMENTARIES_DIR);
  return count;
}

/**
 * Ratchet: count may only go down until baseline hits 0 (then hard-fail on any).
 * Returns { current, baseline, mode } for assertion messages.
 */
export function evaluateForbiddenProvenanceRatchet(): {
  current: number;
  baseline: number;
  corpusPresent: boolean;
  mode: 'ratchet' | 'zero' | 'ci-baseline-only';
} {
  const baseline = loadForbiddenProvenanceBaseline().count;
  const corpusPresent = existsSync(COMMENTARIES_DIR);
  if (!corpusPresent) {
    return { current: -1, baseline, corpusPresent: false, mode: 'ci-baseline-only' };
  }
  const current = countStaticForbiddenProvenanceEntries();
  return { current, baseline, corpusPresent: true, mode: baseline === 0 ? 'zero' : 'ratchet' };
}
