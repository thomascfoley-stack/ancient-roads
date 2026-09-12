// decodeMorph — Hebrew morphology caption regression guards.
//
// The Hebrew verb branch of decodeHebrewMorpheme once dropped the person digit of every finite
// verb and dropped/misidentified the trailing state char of every participle (a construct-state
// `c` was misread as the gender "common"). These tests guard the three footguns a future refactor
// could reintroduce: the person branch, the state branch, and the gender/number-vs-state
// disambiguation that keeps `c` (gender "common" vs state "construct") and `d` (number "dual" vs
// state "determined") in the right slot. The decoder is a pure string-in/string-out function, so
// this runs without the gitignored original-language corpus.

import { describe, expect, it } from 'vitest';
import { decodeMorph } from '@/lib/original';

describe('decodeMorph — Hebrew verb person and state', () => {
  it('decodes the person digit of a finite verb (Gen 1:1, בָּרָא)', () => {
    expect(decodeMorph('HVqp3ms', 'hebrew')).toBe('verb qal perfect 3rd person masculine singular');
  });

  it('decodes each person digit distinctly', () => {
    expect(decodeMorph('HVqp1ms', 'hebrew')).toContain('1st person');
    expect(decodeMorph('HVqp2ms', 'hebrew')).toContain('2nd person');
    expect(decodeMorph('HVqp3ms', 'hebrew')).toContain('3rd person');
  });

  it('decodes participle absolute state (Gen 1:11, עֹשֶׂה)', () => {
    expect(decodeMorph('HVqrmsa', 'hebrew')).toBe('verb qal participle masculine singular absolute');
  });

  it('decodes participle construct state, not gender "common" (Gen 4:2, רֹעֵה)', () => {
    expect(decodeMorph('HVqrmsc', 'hebrew')).toBe('verb qal participle masculine singular construct');
    expect(decodeMorph('HVqrmsc', 'hebrew')).not.toContain('common');
  });
});

describe('decodeMorph — the `c`/`d` slot disambiguation', () => {
  // `c` is gender "common" AND state "construct"; `d` is number "dual" AND state "determined".
  // The decoder must read them as gender/number when those slots are open (finite verb) and as
  // state once gender and number are consumed (participle). This pair is the proof.

  it('reads `c` as gender "common" in a finite verb before number is taken', () => {
    expect(decodeMorph('HVpp3cs', 'hebrew')).toBe('verb piel perfect 3rd person common singular');
  });

  it('reads `c` as state "construct" in a participle after gender and number are taken', () => {
    expect(decodeMorph('HVqrmsc', 'hebrew')).toBe('verb qal participle masculine singular construct');
  });

  it('reads `d` as number "dual" before state when the number slot is open', () => {
    expect(decodeMorph('HVqp3md', 'hebrew')).toBe('verb qal perfect 3rd person masculine dual');
  });

  it('reads a trailing `d` as state "determined" once gender and number are taken', () => {
    expect(decodeMorph('HVqrmsd', 'hebrew')).toBe('verb qal participle masculine singular determined');
  });
});

describe('decodeMorph — non-finite verbs add no person or state', () => {
  // Infinitives carry neither person nor a trailing state char. Exact equality guards against
  // over-matching once the person/state branches exist. (The tense label "construct" is part of
  // "infinitive construct"; only an EXTRA trailing state token would be a bug.)

  it('decodes an infinitive without inventing a person or state token', () => {
    expect(decodeMorph('HVqa', 'hebrew')).toBe('verb qal infinitive absolute');
    expect(decodeMorph('HVqc', 'hebrew')).toBe('verb qal infinitive construct');
  });
});

describe('decodeMorph — adjacent decoders are unchanged', () => {
  it('Greek and Hebrew noun branches still decode as before', () => {
    expect(decodeMorph('V- 3IAI-S--', 'greek')).toBe('verb · 3rd person imperfect active indicative singular');
    expect(decodeMorph('HNcfsa', 'hebrew')).toBe('noun common feminine singular absolute');
  });

  it('returns an empty caption for an empty code', () => {
    expect(decodeMorph('', 'hebrew')).toBe('');
    expect(decodeMorph('', 'greek')).toBe('');
  });
});
