// §3 — the verse-key distribution guard (2026-07-13). `verse_start = verse_end = chapter`
// is a PLAUSIBLE value: it's in range, satisfies every per-row constraint, and renders
// fine — so no row-level check catches it. Only a DISTRIBUTIONAL assertion does. The
// threshold is measured, not guessed: every clean author sits at 0.9–6.9% collapsed (the
// genuine rate of "a comment on verse N of chapter N"); every biblehub-sourced author sits
// at 99.9–100%. 0.20 separates the two populations with an order-of-magnitude margin.
//
// ⚠️ THIS SUITE IS `.skip`ped AND RED — it is the honest baseline, not a passing gate.
// Measured 2026-07-13 over web/public/commentaries/** (371,406 entries):
//   COLLAPSE ≥ 20%: 14 authors, all biblehub-sourced —
//     Barnes' Notes 100% (21,036) · Cambridge 100% (26,666) · Geneva 100% (31,096) ·
//     Poole 100% (31,080) · Pulpit 100% (25,796) · Benson 100% (15,363) · Wesley 100%
//     (18,184) · Bengel 100% · B.W. Johnson 100% · MacLaren 100% · Scofield 100% · Darby
//     100% · Lange 100% · Calvin 99.9% (6,170).
//   FORBIDDEN PROVENANCE: 200,385 entries carry a biblehub.com / studylight.org sourceUrl.
// TODO(2026-07-13, docs/CORPUS_VERSE_KEY_REPAIR.md): re-source these from CCEL/Wikisource
//   with a per-verse parser, then FLIP THIS TO `describe(` (un-skip). Do NOT raise 0.20 to
//   make it pass — the threshold is the point.

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

// SKIPPED + RED by design — see the header. Flip `describe.skip` → `describe` after the repair.
describe.skip('§3 verse-key distribution (RED baseline until the biblehub corpus is repaired)', () => {
  // loadEntries() is called INSIDE each `it` (not at describe-body level) so the skipped
  // suite never touches the filesystem at collection time — web/public/commentaries is
  // gitignored and absent in CI.
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
