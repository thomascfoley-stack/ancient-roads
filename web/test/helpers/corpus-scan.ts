import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { forbiddenProvenanceDomain } from '../../../src/ingest/license-manifest';
import { isMustNotServeAuthor } from '../../src/lib/legal-corpus';

// An entry must NOT ship if EITHER its provenance is a forbidden aggregator domain
// (biblehub/studylight/…) OR its author is quarantined (MUST_NOT_SERVE — e.g. the
// copyrighted "Tyndale Study Notes", whose sourceUrl is bible.helloao.org, NOT a
// forbidden domain — so the domain-only check was blind to 15,161 copyrighted entries).
// Both checks below (forbiddenProvenanceDomain, isMustNotServeAuthor) are the canonical
// single-sources; scanMustNotShip() takes their union, it does not re-implement them.

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

// (The old domain-only counter was removed 2026-07-14 — its number is now
// scanMustNotShip().domainForbidden, and the gate ratchets the author-aware union.)

export interface MustNotShipBreakdown {
  total: number; // all entries scanned
  mustNotShip: number; // union: forbidden domain OR quarantined author
  domainForbidden: number; // sourceUrl on a forbidden aggregator domain
  authorQuarantined: number; // author is MUST_NOT_SERVE (e.g. Tyndale)
  both: number;
  driftSuspects: Record<string, number>; // authors that LOOK quarantined but the exact matcher misses (naming drift)
}

/**
 * Count + break down entries that MUST NOT ship = forbidden provenance OR quarantined
 * author. This is the number the pre-deploy gate ratchets. `driftSuspects` surfaces
 * authors whose name CONTAINS a MUST_NOT_SERVE token but is not exact-matched by
 * `isMustNotServeAuthor` (e.g. "Theophylact of Ohrid" vs "Theophylact") — a matcher gap
 * the gate cannot close on its own; the owner must reconcile MUST_NOT_SERVE to the corpus
 * naming (see docs/AUTHOR_TRIAGE.md).
 */
export function scanMustNotShip(): MustNotShipBreakdown {
  const b: MustNotShipBreakdown = { total: 0, mustNotShip: 0, domainForbidden: 0, authorQuarantined: 0, both: 0, driftSuspects: {} };
  if (!existsSync(COMMENTARIES_DIR)) return b;
  const tokens = ['Tyndale', 'Theophylact', 'Bonaventure', 'Oecumenius', 'Origen', 'Aquinas-Larcher'];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.json')) continue;
      const data = JSON.parse(readFileSync(full, 'utf-8')) as { entries?: Array<{ author?: string; sourceUrl?: string }> };
      for (const e of data.entries ?? []) {
        b.total += 1;
        const d = forbiddenProvenanceDomain(e.sourceUrl ?? '');
        const a = isMustNotServeAuthor(e.author ?? '');
        if (d) b.domainForbidden += 1;
        if (a) b.authorQuarantined += 1;
        if (d && a) b.both += 1;
        if (d || a) b.mustNotShip += 1;
        else if (e.author && !a && tokens.some((t) => e.author!.includes(t))) {
          b.driftSuspects[e.author] = (b.driftSuspects[e.author] ?? 0) + 1;
        }
      }
    }
  };
  walk(COMMENTARIES_DIR);
  return b;
}

/** The ratcheted number: entries that must not ship (forbidden domain OR quarantined author). */
export function countStaticMustNotShipEntries(): number {
  if (!existsSync(COMMENTARIES_DIR)) return -1;
  return scanMustNotShip().mustNotShip;
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
  // Ratchet on the UNION (forbidden domain OR quarantined author), not domain alone —
  // otherwise 15,161 copyrighted Tyndale entries (sourceUrl bible.helloao.org) ship green.
  const current = countStaticMustNotShipEntries();
  return { current, baseline, corpusPresent: true, mode: baseline === 0 ? 'zero' : 'ratchet' };
}
