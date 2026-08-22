// RED-PROOF + GREEN for the rebuilt ADR-024 v4 label anchor-check
// (web/src/scripts/check-heldout-v4-anchors.mts — the script the 2026-07-18 freeze cited
// but never committed; STATE_OF_TRUTH §1 caveat 4). A check that has never been seen red
// proves nothing (THE_LOOP rule 4), so the red legs seed the three defect classes the
// checker exists to catch and watch it catch them; the green leg runs the REAL frozen set
// against the REAL in-repo KJV and asserts the check is non-vacuous.
import { describe, expect, it } from 'vitest';
import { checkAnchors, kjvChapterText } from '../web/src/scripts/check-heldout-v4-anchors.mts';
import { FROZEN_V4 } from '../web/src/scripts/heldout-v4-queries.mjs';

// Rom 12:13 KJV, verbatim (the real verse text the genuine anchor below matches).
const ROM_12_13 = 'Distributing to the necessity of saints; given to hospitality.';
const fakeCorpus = (text: string) => () => text;

describe('held-out v4 label anchor-check — red-proof', () => {
  it('RED: a quoted phrase NOT in the anchored KJV verse is reported as a failure', () => {
    const r = checkAnchors(
      [{ id: 'seed-bad-phrase', cat: 'epistle', expected: ['Romans 12'], source: 'KJV Rom 12:13 "hospitality is whatever you want it to be"' }],
      fakeCorpus(ROM_12_13),
    );
    expect(r.anchors).toBe(1);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]!.reason).toMatch(/NOT found verbatim/);
  });

  it('RED: an anchor whose chapter is NOT among the labeled chapters is reported', () => {
    const r = checkAnchors(
      [{ id: 'seed-off-label', cat: 'topical', expected: ['Romans 12'], source: 'KJV Gen 1:1' }],
      fakeCorpus('In the beginning God created the heaven and the earth.'),
    );
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]!.reason).toMatch(/not among the labeled chapters/);
  });

  it('RED: an unparseable anchor ref is reported, never silently skipped', () => {
    const r = checkAnchors(
      [{ id: 'seed-bad-ref', cat: 'epistle', expected: ['Romans 12'], source: 'KJV Narnia 3:16' }],
      fakeCorpus('whatever'),
    );
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]!.reason).toMatch(/unparseable ref/);
  });

  it('GREEN (control): the same harness passes a genuine anchor', () => {
    const r = checkAnchors(
      [{ id: 'seed-good', cat: 'epistle', expected: ['Romans 12'], source: 'KJV Rom 12:13 "given to hospitality"' }],
      fakeCorpus(ROM_12_13),
    );
    expect(r.failures).toHaveLength(0);
    expect(r.phraseAnchors).toBe(1);
  });
});

describe('held-out v4 label anchor-check — the frozen set against the real KJV', () => {
  it('GREEN: every v4 doctrinal anchor verifies against web/public/bible/kjv', () => {
    const r = checkAnchors(FROZEN_V4, kjvChapterText);
    // Non-vacuity: if the parser ever stops seeing anchors, this fails instead of passing at 0/0.
    expect(r.queries).toBe(45); // 25 epistle + 20 topical
    expect(r.anchors).toBeGreaterThan(100);
    expect(r.phraseAnchors).toBeGreaterThan(0);
    expect(r.failures, JSON.stringify(r.failures, null, 2)).toHaveLength(0);
  });
});
