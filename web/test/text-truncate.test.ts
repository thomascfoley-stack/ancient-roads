// truncateCodePoints — the shared title/label cap helper (bug #120, BUG_SWEEP B2).
//
// String.prototype.slice counts UTF-16 CODE UNITS, so a cap that lands between the halves of a
// surrogate pair stores a lone surrogate — which every downstream UTF-8 encoder (Postgres text,
// Buffer.from) rewrites to U+FFFD. The truncated title is corrupted at REST, not just on screen.
//
// RED-PROOF: this suite fails against `.slice(0, n)` semantics — `'a'.repeat(76) + '\u{1F600}'
// + 'tail'` sliced at 77 code units keeps the high surrogate alone and the round-trip assertion
// goes red on U+FFFD.
import { describe, expect, it } from 'vitest';
import { truncateCodePoints } from '@/lib/text';

/** UTF-8 round-trip: a lone surrogate comes back as U+FFFD, so equality fails on corruption. */
const roundTrip = (s: string): string => Buffer.from(s, 'utf8').toString('utf8');

describe('truncateCodePoints', () => {
  it('never splits a surrogate pair at the boundary (#120)', () => {
    const s = `${'a'.repeat(76)}\u{1F600}tail`;
    const t = truncateCodePoints(s, 77);
    expect(roundTrip(t)).toBe(t);
    expect(roundTrip(t)).not.toContain('�');
    // The pair survives whole — 76 ASCII + the emoji is exactly 77 code points.
    expect(t).toBe(`${'a'.repeat(76)}\u{1F600}`);
  });

  it('drops the pair rather than orphaning half of it when the cap falls inside', () => {
    // Cap at 76 code points: the emoji (point 77) does not fit, so nothing of it survives.
    const s = `${'a'.repeat(76)}\u{1F600}tail`;
    const t = truncateCodePoints(s, 76);
    expect(t).toBe('a'.repeat(76));
    expect(roundTrip(t)).toBe(t);
  });

  it('returns strings at or under the cap verbatim', () => {
    expect(truncateCodePoints('short title', 80)).toBe('short title');
    expect(truncateCodePoints('', 80)).toBe('');
  });

  it('counts code points, not code units', () => {
    const s = '\u{1F600}'.repeat(5); // 10 code units, 5 code points
    expect(truncateCodePoints(s, 3)).toBe('\u{1F600}'.repeat(3));
  });
});
