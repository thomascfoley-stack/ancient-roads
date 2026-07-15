import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { forbiddenProvenanceDomain } from '../../../src/ingest/license-manifest';
import { translationShipDecision } from '../../src/lib/licensing';

const WEB_ROOT = path.join(__dirname, '../..');
export const COMMENTARIES_DIR = path.join(WEB_ROOT, 'public/commentaries');
export const BIBLE_DIR = path.join(WEB_ROOT, 'public/bible');

/** All Bible-translation directory ids present under `dir` (each is a corpus work about to ship). */
export function presentBibleTranslations(dir: string = BIBLE_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isDirectory());
}

// Translation dirs present that the LICENSE RECORD does not permit to ship — the file-side
// twin of the picker guard, enforced at deploy by predeploy-gate.ts. Reads
// web/src/lib/licensing.ts (block-by-default): allow ships, conditional ships only if
// acknowledged, deny/unknown/no-record block. This replaced the old hardcoded denylist so the
// gate decides on a per-work license, not a blocklist (T1§3, 2026-07-14).
export function blockedBibleTranslations(dir: string = BIBLE_DIR): Array<{ id: string; reason: string }> {
  return presentBibleTranslations(dir)
    .map((id) => ({ id, decision: translationShipDecision(id) }))
    .filter((x) => !x.decision.ship)
    .map((x) => ({ id: x.id, reason: x.decision.reason }));
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
