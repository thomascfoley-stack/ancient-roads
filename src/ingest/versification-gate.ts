// Versification gate for Bible translations (the Bible fork of the per-type
// ingest gate): every web/public/bible/<id> is structurally checked against the
// KJV v11n canon before it may ship. Catches truncated books, mis-split
// chapters, and wrong-canon editions — the class of defect a license record
// cannot see.
//
// Tolerance is principled, not loose: every translation we host is in the KJV
// tradition, where real editions differ from the canon by AT MOST one verse in a
// small set of chapters (3 John 14/15, Rev 12:17/18, a few Psalm-title offsets).
// So: a chapter differing by ±1 verse is a recorded VARIANT (allowed, counted,
// capped); |Δ| ≥ 2, a missing chapter, or an extra chapter is a structural ERROR
// (red). NT-only translations (Tyndale 1526, Anderson 1864) are legitimate:
// absent BOOKS are coverage notes, never errors — but a PRESENT book must be
// structurally complete.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadKjvCanon } from './sword-zverse.js';

const BIBLE_DIR = 'web/public/bible';
const MAX_VARIANT_CHAPTERS = 25; // ±1 chapters tolerated per translation before it reds

// Named, curated chapter-level deltas that are REAL editions, not corruption.
// Verified against the actual texts on disk (2026-07-16):
//  - Critical-text editions (ASV, BSB) omit BOTH Mark 9:44 and 9:46 ("where their
//    worm dieth not" repetitions) → Δ = −2 in one chapter; every other standard
//    critical-text omission (Matt 17:21 … Rom 16:24) is a −1 already inside the
//    ±1 variant band.
//  - The WEB places the Romans doxology at 14:24–26 instead of 16:25–27
//    (Byzantine placement) → rom 14 Δ = +3, rom 16 Δ = −2.
const KNOWN_CHAPTER_VARIANTS: Record<string, number[]> = {
  'mrk 9': [-2],   // critical text omits vv. 44 + 46
  'rom 14': [3],   // WEB doxology placement
  'rom 16': [-2],  // WEB doxology placement
};

export interface VersificationResult {
  id: string;
  booksPresent: number;
  variants: string[];   // ±1 or known-named deltas — allowed, recorded
  emptyBooks: string[]; // books present as skeletons with (near-)all-empty text — coverage warning
  errors: string[];     // structural failures — any entry = red
}

export function checkTranslationDir(dir: string, id: string): VersificationResult {
  const canon = loadKjvCanon();
  const bySlug = new Map(canon.map((b) => [b.slug, b]));
  const res: VersificationResult = { id, booksPresent: 0, variants: [], emptyBooks: [], errors: [] };

  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let j: { book?: number; slug?: string; chapters?: Record<string, Array<{ text?: string }>> };
    try { j = JSON.parse(readFileSync(path.join(dir, f), 'utf8')); } catch { res.errors.push(`${f}: unparseable JSON`); continue; }
    const slug = j.slug ?? f.replace(/\.json$/, '');
    const cb = bySlug.get(slug);
    if (!cb) { res.errors.push(`${f}: unknown book slug "${slug}"`); continue; }
    if (!j.chapters || typeof j.chapters !== 'object') { res.errors.push(`${slug}: no chapters object`); continue; }
    res.booksPresent++;

    // Skeleton detection: a book whose verses are (near-)all empty is a coverage
    // hole stored as structure (tyndale's untranslated OT ships this way).
    let vTotal = 0, vEmpty = 0;
    for (const vs of Object.values(j.chapters)) for (const v of vs) { vTotal++; if (!v.text?.trim()) vEmpty++; }
    if (vTotal > 0 && vEmpty / vTotal > 0.9) { res.emptyBooks.push(slug); continue; }

    const chNums = Object.keys(j.chapters).map(Number).sort((a, b) => a - b);
    if (chNums.length !== cb.verses.length) {
      res.errors.push(`${slug}: ${chNums.length} chapters vs canon ${cb.verses.length}`);
      continue;
    }
    for (const ch of chNums) {
      if (ch < 1 || ch > cb.verses.length) { res.errors.push(`${slug} ${ch}: chapter outside canon`); continue; }
      const got = j.chapters[String(ch)]!.length;
      const want = cb.verses[ch - 1]!;
      const d = got - want;
      if (d === 0) continue;
      if (Math.abs(d) === 1 || KNOWN_CHAPTER_VARIANTS[`${slug} ${ch}`]?.includes(d)) {
        res.variants.push(`${slug} ${ch}: ${got} vs ${want}`);
      } else {
        res.errors.push(`${slug} ${ch}: ${got} verses vs canon ${want} (|Δ|≥2, unrecognized)`);
      }
    }
  }
  if (res.booksPresent === 0) res.errors.push('no book files at all');
  if (res.variants.length > MAX_VARIANT_CHAPTERS) {
    res.errors.push(`${res.variants.length} ±1-variant chapters exceeds cap ${MAX_VARIANT_CHAPTERS} — not a KJV-tradition edition?`);
  }
  return res;
}

export function checkAllTranslations(bibleDir = BIBLE_DIR): VersificationResult[] {
  if (!existsSync(bibleDir)) return [];
  return readdirSync(bibleDir)
    .filter((d) => statSync(path.join(bibleDir, d)).isDirectory())
    .sort()
    .map((id) => checkTranslationDir(path.join(bibleDir, id), id));
}

if (process.argv[1] && /versification-gate/.test(process.argv[1])) {
  const results = checkAllTranslations();
  let red = 0;
  for (const r of results) {
    const ok = r.errors.length === 0;
    if (!ok) red++;
    const empty = r.emptyBooks.length ? ` ⚠ ${r.emptyBooks.length} empty-skeleton books` : '';
    console.log(`${ok ? '✓' : '✗'} ${r.id.padEnd(10)} ${r.booksPresent} books, ${r.variants.length} known/±1 variants${empty}${r.errors.length ? ' — ' + r.errors.slice(0, 4).join(' · ') : ''}`);
  }
  if (red > 0) { console.error(`✗ versification: ${red} translation(s) failed`); process.exit(1); }
  console.log('✓ versification: every hosted translation is structurally canonical');
}
