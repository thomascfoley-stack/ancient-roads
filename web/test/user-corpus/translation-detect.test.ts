// Per-document translation detection (ADR-100, built 2026-08-21).
//
// Pre-registration: docs/evidence/uploader-deep-dive-2026-08-20/translation-detect-PRE-REGISTRATION.md.
// This file carries the DETERMINISTIC legs — the mechanism and pre-registered bar 3 (synthetic
// BSB documents must detect bsb, 10/10, confidence > 0.6). Bars 1/2/4 run through the shipped
// drain against the dev DB in the held-out probe; their numbers land in the evidence log.
//
// Needs web/public/bible (gitignored): skips visibly without it, like the anchor suites.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DETECT_MIN_HITS,
  FALLBACK_CONFIDENCE,
  FALLBACK_TRANSLATION,
  KJV_FAMILY,
  buildDetectionIndex,
  detectTranslation,
  familyOf,
} from '../../src/lib/user-corpus/translation-detect';
import {
  availableTranslations,
  detectDocumentTranslation,
} from '../../src/lib/user-corpus/bible-index';

const BIBLE = path.resolve(__dirname, '../../public/bible');
const HAVE_BIBLE = existsSync(path.join(BIBLE, 'kjv', 'jhn.json'));
if (!HAVE_BIBLE) console.warn('⚠ SKIPPED (visibly): translation-detect verse legs need web/public/bible.');

function versesOf(translation: string, book = 'jhn'): { verse: number; text: string }[] {
  const j = JSON.parse(readFileSync(path.join(BIBLE, translation, `${book}.json`), 'utf8')) as {
    chapters: Record<string, { verse: number; text: string }[]>;
  };
  return Object.values(j.chapters).flat();
}

/** A synthetic sermon: N verse texts embedded in neutral connective prose. */
function syntheticSermon(texts: string[]): string {
  return texts
    .map((t, i) => `And so we come, dear friends, to the ${i + 1} point of our meditation. ${t} Let us dwell on this together.`)
    .join('\n\n');
}

describe('familyOf', () => {
  it('the KJV family is the measured five; everything else is a singleton', () => {
    expect(familyOf('kjv')).toEqual(KJV_FAMILY);
    expect(familyOf('webster')).toEqual(KJV_FAMILY);
    expect(familyOf('bsb')).toEqual(['bsb']);
  });
});

describe('detectTranslation — mechanism, no fs', () => {
  const idx = buildDetectionIndex(
    [
      { translation: 'aaa', texts: ['the quick brown fox jumps over the lazy dog by the river bank today'] },
      { translation: 'bbb', texts: ['a swift auburn fox leaps across the sleepy hound near the water meadow'] },
    ],
    6,
  );

  it('below the floor: falls back with the RECORDED fallback confidence, never silently', () => {
    const d = detectTranslation('no scripture here at all, just prose about the weather', idx);
    expect(d.translation).toBe(FALLBACK_TRANSLATION);
    expect(d.confidence).toBe(FALLBACK_CONFIDENCE);
    expect(d.totalHits).toBeLessThan(DETECT_MIN_HITS);
  });

  it('refuses more than 30 translations rather than silently truncating the bitmask', () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ translation: `t${i}`, texts: ['x y z w v u q'] }));
    expect(() => buildDetectionIndex(many, 6)).toThrow(/bitmask/);
  });
});

describe.skipIf(!HAVE_BIBLE)('detection over the real shipped indexes', () => {
  it('BAR 3 (pre-registered): 10 synthetic BSB sermons detect bsb, each with confidence > 0.6', () => {
    const bsb = versesOf('bsb');
    // Ten disjoint windows of 16 verses each — enough quotation to clear the floor, embedded in
    // prose so the detector sees a document, not a verse list.
    let detectedBsb = 0;
    const results: string[] = [];
    for (let i = 0; i < 10; i++) {
      const texts = bsb.slice(i * 16, i * 16 + 16).map((v) => v.text);
      const d = detectDocumentTranslation(syntheticSermon(texts));
      results.push(`${i}: ${d.translation} conf=${d.confidence.toFixed(2)} hits=${d.totalHits}`);
      if (d.translation === 'bsb' && d.confidence > 0.6) detectedBsb++;
    }
    expect(detectedBsb, results.join(' | ')).toBe(10);
  });

  it('a KJV-quoting document detects into the KJV family', () => {
    const kjv = versesOf('kjv');
    const d = detectDocumentTranslation(syntheticSermon(kjv.slice(40, 56).map((v) => v.text)));
    expect(KJV_FAMILY as readonly string[]).toContain(d.translation);
    expect(d.confidence).toBeGreaterThan(0.5);
  });

  it('confidence 1.0 is unreachable below the floor — the floor binds', () => {
    const kjv = versesOf('kjv');
    // Two verses: real quotation but far under DETECT_MIN_HITS total hits.
    const d = detectDocumentTranslation(syntheticSermon(kjv.slice(0, 2).map((v) => v.text)));
    if (d.totalHits < DETECT_MIN_HITS) {
      expect(d.confidence).toBe(FALLBACK_CONFIDENCE);
    } else {
      // If two verses somehow clear the floor the leg is vacuous — fail loud so the floor test
      // gets a smaller fixture rather than silently passing.
      throw new Error(`fixture cleared the floor (${d.totalHits} hits) — shrink it`);
    }
  });

  it('availableTranslations derives the shipped set from disk and includes the known members', () => {
    const t = availableTranslations();
    expect(t).toContain('kjv');
    expect(t).toContain('bsb');
    expect(t.length).toBeGreaterThanOrEqual(15);
  });
});
