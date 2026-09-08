// adapter-vincent-shorter.ts checks — the catechism-anchored segmentation
// holds on the real OCR text, and a corrupted anchor backbone aborts
// (red-proof for the fail-closed path: no anchor sequence, no output).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { convert, WSC_QUESTIONS } from '../src/ingest/adapter-vincent-shorter.js';

const REAL = readFileSync('data/raw/archive/explanationofass00vinc_djvu.txt', 'utf8');

describe('vincent-shorter catechism-anchored splitter', () => {
  it('holds the full 107-anchor sequence on the real text, in order', () => {
    const recs = convert(REAL);
    // 1 dedication + 107 catechism sections
    expect(recs.length).toBe(108);
    expect(recs[0]!.key).toContain('Masters and Governors of Families');
    for (let k = 1; k <= 107; k++) {
      expect(recs[k]!.key).toBe(`Q. ${k}. ${WSC_QUESTIONS[k - 1]!}`);
    }
    // anchor content sanity: first and last bodies carry their catechism text
    expect(recs[1]!.text).toContain('chief  end');
    expect(recs[107]!.text).toContain('Amen');
    // no running-head furniture survives in any body
    expect(JSON.stringify(recs)).not.toMatch(/EXPLANATION\s+O[F P]\s+THE/);
  });

  it('aborts when the anchor order is corrupted (red-proof)', () => {
    const swapped = [...WSC_QUESTIONS];
    [swapped[40], swapped[41]] = [swapped[41]!, swapped[40]!]; // Q41 <-> Q42
    expect(() => convert(REAL, swapped)).toThrow(/FAIL CLOSED: anchor 41\b/);
  });

  it('aborts when an anchor is missing (truncated scan)', () => {
    const cut = REAL.slice(0, REAL.indexOf('THE    END'));
    expect(() => convert(cut)).toThrow(/FAIL CLOSED/);
  });

  it('aborts on a short bogus input', () => {
    expect(() => convert('Q. 1. What is the chief end of man?\nA. Something.\n')).toThrow(/FAIL CLOSED/);
  });
});
