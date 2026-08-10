// Red-proofs for the Ryle sectionizer (src/ingest/adapter-archive-ryle.ts) —
// the parse that must never attribute one author's words to the wrong verse.
import { describe, it, expect } from 'vitest';
import { sectionizeRyle, CALIBRATED_SECTION_THRESHOLD } from '../../src/ingest/adapter-archive-ryle.js';

const body = (n: number) => Array.from({ length: n }, (_, i) => `line ${i} of genuine expository prose about the passage`).join('\n');

describe('sectionizeRyle', () => {
  it('parses the real header shape with trailing period and double spaces', () => {
    const text = `front matter\nMATTHEW  I.  1—17. \n${body(20)}\nMATTHEW  I.  18—25. \n${body(20)}`;
    const s = sectionizeRyle(text, 'MATTHEW');
    expect(s.map((x) => [x.chapter, x.vStart, x.vEnd])).toEqual([[1, 1, 17], [1, 18, 25]]);
  });

  it('skips TOC entries — a header with <200 chars of body before the next header', () => {
    const text = `MATTHEW  I.  1—17.\nMATTHEW  I.  18—25.\nMATTHEW  II.  1—12. \n${body(20)}`;
    const s = sectionizeRyle(text, 'MATTHEW');
    expect(s.map((x) => [x.chapter, x.vStart])).toEqual([[2, 1]]);
  });

  it('running headers (MATTHEW,  CHAP.  I.) never open a section', () => {
    const text = `MATTHEW,  CHAP.  I.  3 \n${body(20)}\nMATTHEW  III.  13—17. \n${body(20)}`;
    const s = sectionizeRyle(text, 'MATTHEW');
    expect(s.map((x) => [x.chapter, x.vStart, x.vEnd])).toEqual([[3, 13, 17]]);
  });

  it('the "Ill" OCR heuristic reads as chapter III, and a garbage roman drops the section', () => {
    const good = `MATTHEW  Ill.  1—12. \n${body(20)}`;
    expect(sectionizeRyle(good, 'MATTHEW').map((x) => x.chapter)).toEqual([3]);
    const bad = `MATTHEW  QZ.  1—12. \n${body(20)}`;
    expect(sectionizeRyle(bad, 'MATTHEW')).toEqual([]);
  });

  it('hyphen and em-dash ranges both parse', () => {
    const text = `MATTHEW  IV.  1-11. \n${body(20)}\nMATTHEW  IV.  12—25. \n${body(20)}`;
    expect(sectionizeRyle(text, 'MATTHEW').map((x) => [x.vStart, x.vEnd])).toEqual([[1, 11], [12, 25]]);
  });

  it('a duplicated header keeps the first body (later repeat is the running-header echo)', () => {
    const text = `MATTHEW  I.  1—17. \n${body(20)}\nMATTHEW  I.  1—17. \nshort echo`;
    expect(sectionizeRyle(text, 'MATTHEW')).toHaveLength(1);
  });

  it('the calibrated threshold is the measured 29.1%, not a round number someone typed', () => {
    expect(CALIBRATED_SECTION_THRESHOLD).toBeCloseTo(0.291, 3);
  });
});
