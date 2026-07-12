import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { forbiddenProvenanceDomain } from '../../../src/ingest/license-manifest';

const WEB_ROOT = path.join(__dirname, '../..');
export const COMMENTARIES_DIR = path.join(WEB_ROOT, 'public/commentaries');
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
