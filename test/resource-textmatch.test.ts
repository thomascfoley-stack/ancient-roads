// Unit tests for the reusable re-source matcher core (drives helloao now, Schaff
// next). Pins the match/truncated/differ decision that splits $0 provenance-repair
// from re-embed/drop.

import { describe, expect, it } from 'vitest';
import { tokens, classify, tallyMatch, repairOf, repairPct, shingleSet, containment, tallyContainment } from '../src/ingest/resource-textmatch';

describe('tokens', () => {
  it('lowercases, folds punctuation, strips entities/tags', () => {
    expect([...tokens('The Word, was God!')]).toEqual(['the', 'word', 'was', 'god']);
    expect(tokens('a &#x3b8; <b>b</b>').has('b')).toBe(true);
    expect(tokens('a &#x3b8; b').has('3b8')).toBe(false); // entity stripped, not tokenized
    expect(tokens('   ').size).toBe(0);
  });
});

describe('classify', () => {
  const t = (s: string) => tokens(s);
  it('identical text → match', () => {
    expect(classify(t('the word was god'), t('the Word, was God'))).toBe('match');
  });
  it('same text one side truncated → truncated (still a $0 repair)', () => {
    const full = t('in the beginning was the word and the word was with god and the word was god');
    const cut = t('in the beginning was the word');
    expect(classify(cut, full)).toBe('truncated');
  });
  it('different text → differ (re-embed / drop)', () => {
    expect(classify(t('alpha beta gamma'), t('delta epsilon zeta'))).toBe('differ');
  });
});

describe('tallyMatch', () => {
  it('splits a source against stored text by verseId', () => {
    const stored = new Map<number, Set<string>>([
      [1, tokens('the lord is my shepherd i shall not want')],
      [2, tokens('short verse text here')],
      [3, tokens('alpha beta gamma delta')],
    ]);
    const source = [
      { verseId: 1, text: 'the Lord is my shepherd; I shall not want' },              // match
      { verseId: 2, text: 'short verse text here plus a lot more words that were cut from our copy indeed' }, // truncated
      { verseId: 3, text: 'completely different unrelated wording entirely' },        // differ
      { verseId: 9, text: 'a verse we do not store' },                               // sourceOnly
    ];
    const s = tallyMatch(stored, source);
    expect(s).toEqual({ compared: 3, match: 1, truncated: 1, differ: 1, sourceOnly: 1 });
    expect(repairOf(s)).toBe(2);
    expect(repairPct(s)).toBeCloseTo(66.67, 1);
  });
});

describe('shingle containment (patristic translation discrimination)', () => {
  const srcText = 'in the beginning was the word and the word was with god and the word was god the same was in the beginning with god';
  const src = shingleSet(srcText);

  it('same translation (even truncated) → high containment; different wording → near zero', () => {
    const same = shingleSet('in the beginning was the word and the word was with god and the word'); // a prefix
    const diff = shingleSet('at the outset there existed the divine reason which coexisted eternally alongside the deity himself before all');
    expect(containment(same, src)).toBeGreaterThan(0.8);
    expect(containment(diff, src)).toBeLessThan(0.2);
  });

  it('tallyContainment splits repair (same translation) vs drop (different)', () => {
    const same = shingleSet('the word was with god and the word was god the same was in the beginning');
    const diff = shingleSet('the logos abided with the almighty and the logos shared the very essence of divinity from eternity past');
    const s = tallyContainment([same, diff], src, 0.5);
    expect(s.repair).toBe(1);
    expect(s.drop).toBe(1);
  });
});
