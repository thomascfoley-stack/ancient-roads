import { describe, it, expect } from 'vitest';
import {
  shingleHashSet, shingleHashSetOcr, containment,
  extractGospelVolume, titleGuardAgrees,
} from '../src/ingest/resource-textmatch';

// ─────────────────────────────────────────────────────────────────────────────
// Cross-copy match CALIBRATION — derive the "same printed work?" bar from a
// positive control, not from intuition. Last night's 55% bar was unachievable and
// last night's 9.3% "failure" was a Ryle-on-JOHN vs Ryle-on-LUKE comparison (two
// different Gospels). This locks four bands with SELF-CONTAINED fixtures (no network,
// no 1 MB scans) so the bar can never again be guessed, and so tokenListOcr can never
// silently regress. Real-scan numbers (John Vol I twin 43.5% vs different-work 9%) are
// recorded in docs/CONTENT_RECOVERY_PIPELINE.md.
// ─────────────────────────────────────────────────────────────────────────────

// A clean base text (public-domain Ryle, Expository Thoughts on John, 1857).
const CLEAN = `In the beginning was the Word. The plain meaning of these words is that
our Lord Jesus Christ existed from all eternity, long before He was born of the Virgin
Mary. He did not begin to exist when He was conceived and born. He had glory with the
Father before the world was made. He was the eternal Word who was with God and was God.
The same was in the beginning with God. This verse contains an emphatic repetition of the
second clause of the preceding verse. Saint John anticipates the possible objection of
some perverse mind, that perhaps there was a time when Christ, the Word, was not a distinct
Person in the Trinity. In reply to this objection he declares that the same Word who was
eternal and was God, was also from all eternity a Person in the Godhead distinct from God
the Father, and yet with Him by a most intimate and ineffable union. In short there never
was a time when Christ was not with God. All things were made by Him. This sentence means
that creation was the work of our Lord Jesus Christ, no less than of God the Father. Now
He that made all things must needs be God. The expression we must carefully remember does
not imply any inferiority of God the Son to God the Father, as if the Son was only the
agent and workman under another. In Him was life, and the life was the light of men. The
life which was in Christ was intended before the fall to be the guide of man's soul to
heaven, and since the fall it has been the salvation and the comfort of all who are saved.`;

// A DIFFERENT work (Ryle on Luke would share vocabulary but not phrasing — use distinct prose).
const DIFFERENT = `The parable of the sower stands first among the parables of our Lord.
It describes the different ways in which the word of God is received by different hearers.
Some seed fell by the wayside, and the fowls of the air devoured it. Some fell upon stony
ground, where it had not much earth, and it withered away because it had no root. Some fell
among thorns, and the thorns sprang up and choked it. But other seed fell into good ground,
and brought forth fruit, some a hundredfold, some sixtyfold, some thirtyfold. Let us take
heed how we hear. The heart of man is like the ground, and the preaching of the gospel is
like the sowing of seed. The great question for us all is the state of our own hearts.`;

// Deterministic pseudo-OCR corruption: common character confusions at a fixed rate,
// seeded so the test is reproducible. Models what a scanner+OCR does to a page WITHOUT
// changing the wording — it changes characters, exactly the signal we must NOT normalize.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CONFUSE: Record<string, string> = { o: 'e', e: 'c', n: 'u', c: 'e', l: 'i', i: 'l', s: 'a', h: 'b', a: 's', t: 'f' };
function ocrCorrupt(text: string, seed: number, rate = 0.04): string {
  const rnd = mulberry32(seed);
  return text.split('').map((ch) => {
    const low = ch.toLowerCase();
    if (CONFUSE[low] && rnd() < rate) {
      const rep = CONFUSE[low]!;
      return ch === low ? rep : rep.toUpperCase();
    }
    return ch;
  }).join('');
}

// Inject LAYOUT artifacts (no character errors): line-break hyphenation, all-caps running
// headers, page-number lines. This is what tokenListOcr exists to strip.
function injectLayout(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && i % 40 === 0) out.push('\nEXPOSITORY THOUGHTS ON THE GOSPELS\nST. JOHN\n120\n');
    const w = words[i]!;
    if (i % 9 === 8 && w.length > 4) {
      // split the word across a line break with a hyphen
      const k = Math.floor(w.length / 2);
      out.push(w.slice(0, k) + '-\n' + w.slice(k));
    } else {
      out.push(w);
    }
  }
  return out.join(' ');
}

const pct = (a: Set<number>, b: Set<number>) => 100 * Math.min(containment(a, b), containment(b, a));
const N = 3;

describe('cross-copy match calibration', () => {
  it('BAND 1 — identity: a scan contains itself at 100%', () => {
    const s = shingleHashSetOcr(CLEAN, N);
    expect(containment(s, s)).toBe(1);
  });

  it('BAND 2 — layout-only damage: tokenListOcr recovers to >=95% (and beats raw tokenList)', () => {
    const damaged = injectLayout(CLEAN);
    const ocr = pct(shingleHashSetOcr(CLEAN, N), shingleHashSetOcr(damaged, N));
    const raw = pct(shingleHashSet(CLEAN, N), shingleHashSet(damaged, N));
    expect(ocr).toBeGreaterThanOrEqual(95);
    expect(ocr).toBeGreaterThan(raw + 5); // the normalizer must materially help
  });

  it('BAND 3 — synthetic double-OCR (same words, independent char errors): a stable band', () => {
    const a = shingleHashSetOcr(ocrCorrupt(CLEAN, 1), N);
    const b = shingleHashSetOcr(ocrCorrupt(CLEAN, 2), N);
    const band = pct(a, b);
    // Same wording survives char errors well above the different-work floor.
    expect(band).toBeGreaterThan(30);
    expect(band).toBeLessThan(90);
  });

  it('BAND 4 — different work: containment stays below 15%', () => {
    const diff = pct(shingleHashSetOcr(CLEAN, N), shingleHashSetOcr(DIFFERENT, N));
    expect(diff).toBeLessThan(15);
  });

  it('DERIVED BAR separates same-work from different-work, and the John twin passes it', () => {
    const doubleOcr = pct(shingleHashSetOcr(ocrCorrupt(CLEAN, 1), N), shingleHashSetOcr(ocrCorrupt(CLEAN, 2), N));
    const diff = pct(shingleHashSetOcr(CLEAN, N), shingleHashSetOcr(DIFFERENT, N));
    // Derive the bar from the controls: halfway between the different-work ceiling and
    // the same-work (double-OCR) floor. NOT guessed.
    const bar = Math.round((diff + doubleOcr) / 2);
    expect(bar).toBeGreaterThan(diff);
    expect(bar).toBeLessThan(doubleOcr);
    // The measured real John Vol I twin (archive.org vs Google OCR) = 43.5% min containment
    // (docs/CONTENT_RECOVERY_PIPELINE.md). It must clear this derived bar with margin.
    const REAL_JOHN_TWIN_MIN = 43.5;
    const REAL_DIFFERENT_WORK = 9.3;
    expect(REAL_JOHN_TWIN_MIN).toBeGreaterThan(bar);
    expect(REAL_DIFFERENT_WORK).toBeLessThan(bar);
  });
});

describe('title-page guard', () => {
  const HEAD = (g: string, v: string) => `EXPOSITORY THOUGHTS ON THE GOSPELS.\nST. ${g}. VOL. ${v}.\nI send forth the volume now in the reader's hands.`;

  it('extracts gospel + volume from a clean-ish title region', () => {
    expect(extractGospelVolume(HEAD('JOHN', 'I'))).toEqual({ gospel: 'JOHN', volume: 1 });
    expect(extractGospelVolume(HEAD('LUKE', 'II'))).toEqual({ gospel: 'LUKE', volume: 2 });
  });

  it('tolerates the OCR mangling seen in real scans (JOHlSr, VOXi)', () => {
    // real archive.org: "ST. JOHlSr. VOL. I." ; real Google: "ST. JOHN. VOXi. I."
    expect(extractGospelVolume('EXPOSITORY THOUGHTS\nST. JOHlSr. VOL. I.\nGospel of St. John')?.gospel).toBe('JOHN');
    expect(extractGospelVolume('EXPOSITORY THOUGHTS\nST. JOHN. VOXi. I.\nGospel of St. John')?.gospel).toBe('JOHN');
  });

  it('FAILS CLOSED on a Gospel mismatch — the check that would have saved two nights', () => {
    const johnI = HEAD('JOHN', 'I');
    const lukeII = HEAD('LUKE', 'II');
    expect(titleGuardAgrees(johnI, johnI).ok).toBe(true);
    expect(titleGuardAgrees(johnI, lukeII).ok).toBe(false); // JOHN vs LUKE — never match these
  });

  it('FAILS CLOSED on a volume mismatch of the same Gospel', () => {
    expect(titleGuardAgrees(HEAD('JOHN', 'I'), HEAD('JOHN', 'II')).ok).toBe(false);
  });
});
