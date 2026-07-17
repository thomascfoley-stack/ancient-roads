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
//   - Cambridge/Poole/Pulpit/Benson/Bengel/MacLaren/Darby/Lange/Geneva have no clean
//     per-verse source yet (Geneva's module carries NO license grant — fail closed) and
//     are QUARANTINED out of the static corpus (data/quarantine/, reversible hold).
// The 0.20 threshold is unchanged — it is the point.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isPublishedAuthor } from '@/lib/legal-corpus';

const CORPUS_DIR = fileURLToPath(new URL('../../public/commentaries', import.meta.url));
const MIN_ENTRIES = 200;
const COLLAPSE_MAX = 0.2;
const FORBIDDEN_HOST = /biblehub\.com|studylight\.org/i;

interface RawEntry { verseStart: number; verseEnd: number; author: string; sourceUrl?: string }
interface Entry extends RawEntry { chapter: number }

function loadEntries(): Entry[] {
  const out: Entry[] = [];
  if (!existsSync(CORPUS_DIR)) return out; // gitignored/absent in CI — the suite is skipped anyway
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!f.endsWith('.json') || f === '_manifest.json') continue;
      let j: { chapter?: number; entries?: RawEntry[] };
      try { j = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }
      if (!j || !Array.isArray(j.entries) || typeof j.chapter !== 'number') continue;
      for (const e of j.entries) out.push({ ...e, chapter: j.chapter });
    }
  };
  walk(CORPUS_DIR);
  return out;
}

describe('§3 verse-key distribution (live gate; skips only when the gitignored corpus is absent, e.g. CI)', () => {
  // loadEntries() is called INSIDE each `it` (not at describe-body level) so the suite
  // never touches the filesystem at collection time — web/public/commentaries is
  // gitignored and absent in CI, where loadEntries() returns [] and the suite passes
  // vacuously (the corpus gate runs where the corpus lives: pnpm gate:ingest).
  it('no author (≥200 entries) has >20% of entries keyed verse_start=verse_end=chapter', () => {
    const entries = loadEntries();
    const byAuthor = new Map<string, { n: number; collapsed: number }>();
    for (const e of entries) {
      const rec = byAuthor.get(e.author) ?? { n: 0, collapsed: 0 };
      rec.n++;
      if (e.verseStart === e.verseEnd && e.verseStart === e.chapter) rec.collapsed++;
      byAuthor.set(e.author, rec);
    }
    const offenders = [...byAuthor.entries()]
      .filter(([, v]) => v.n >= MIN_ENTRIES && v.collapsed / v.n >= COLLAPSE_MAX)
      .map(([a, v]) => `${a} ${(100 * v.collapsed / v.n).toFixed(1)}% (n=${v.n})`);
    expect(offenders, `authors whose verse keys collapse to the chapter number:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no SERVED (published) entry carries a biblehub.com / studylight.org sourceUrl', () => {
    const entries = loadEntries();
    const served = entries.filter((e) => isPublishedAuthor(e.author) && FORBIDDEN_HOST.test(e.sourceUrl ?? ''));
    const byAuthor = [...new Set(served.map((e) => e.author))];
    expect(served.length, `served entries with forbidden aggregator provenance (${byAuthor.join(', ')})`).toBe(0);
  });
});
