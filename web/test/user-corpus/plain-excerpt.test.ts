// plainExcerpt — markdown syntax out of the search excerpt, and nothing else out.
//
// The defect this exists for was SEEN, not theorised: a .md sermon uploaded through the real
// picker came back from text search rendered as
//   "# The Good Shepherd and the Hireling *Preached on a Lord's Day morning* **Text: John 10:11**"
// The first case below is that exact string, so this suite fails the moment the observed bug
// returns rather than the moment some abstraction of it does.
//
// The second half is the half that matters more. Stripping markup is easy; stripping it WITHOUT
// eating a preacher's prose is the actual requirement, and every case there is drawn from things
// people genuinely write in sermons — 2 * 7, an emphasised aside, a hash before a number. A
// stripper that passes only the first half would be a regression dressed as a fix.

import { describe, expect, it } from 'vitest';
import { plainExcerpt } from '@/components/my-works';

/** The chunk as it reached the browser: newlines intact, headings mid-string after packing. */
const OBSERVED =
  '# The Good Shepherd and the Hireling\n\n*Preached on a Lord’s Day morning*\n\n' +
  '**Text: John 10:11**\n\nI am the good shepherd: the good shepherd giveth his life for the ' +
  'sheep.\n\n## I. The Shepherd who owns the sheep';

describe('plainExcerpt — the markup a reader must never see', () => {
  it('strips the exact excerpt the browser showed', () => {
    const out = plainExcerpt(OBSERVED);
    expect(out).toContain('The Good Shepherd and the Hireling');
    expect(out).toContain('Preached on a Lord’s Day morning');
    expect(out).toContain('Text: John 10:11');
    expect(out).toContain('I. The Shepherd who owns the sheep');
    // The whole point: no syntax survives anywhere in the result.
    expect(out).not.toMatch(/[#*`]/);
  });

  it('strips headings wherever a chunk boundary left them, not only at the start', () => {
    expect(plainExcerpt('for the sheep. ## I. The Shepherd')).toBe('for the sheep. I. The Shepherd');
    expect(plainExcerpt('###### deep heading')).toBe('deep heading');
  });

  it('strips bold, emphasis and code spans', () => {
    expect(plainExcerpt('**Text: John 10:11**')).toBe('Text: John 10:11');
    expect(plainExcerpt('*Preached on a Sunday*')).toBe('Preached on a Sunday');
    expect(plainExcerpt('the word `hesed` here')).toBe('the word hesed here');
  });
});

describe('plainExcerpt — the prose it must NOT eat', () => {
  it('leaves ordinary sermon prose byte-identical', () => {
    const prose =
      'The hireling fleeth, because he is an hireling, and careth not for the sheep. ' +
      'That is the whole of it. He careth not.';
    expect(plainExcerpt(prose)).toBe(prose);
  });

  it('leaves arithmetic and lone asterisks alone', () => {
    // A lone `*` has no partner, so the emphasis rule must not fire on it.
    expect(plainExcerpt('the seventy weeks: 7 * 70 is the reckoning')).toBe(
      'the seventy weeks: 7 * 70 is the reckoning',
    );
  });

  it('does not pair two UNRELATED asterisks across a sentence', () => {
    // The one that caught the first cut of this function. Two lone `*` in the same excerpt read
    // as one emphasis span to a lazy `\*(.+?)\*`, and everything between them loses its markers:
    // "7  70, and 3  4" — arithmetic silently rewritten. Real markdown emphasis never opens with
    // a space after the `*` nor closes with one before it, and that is what separates the cases.
    expect(plainExcerpt('7 * 70, and 3 * 4, are the numbers')).toBe('7 * 70, and 3 * 4, are the numbers');
  });

  it('does not treat a hash glued to a word as a heading', () => {
    // `#` only opens an ATX heading when whitespace follows it. "#1" is a number, not markup.
    expect(plainExcerpt('sermon #1 in the series')).toBe('sermon #1 in the series');
  });

  it('is a no-op on text with no markup at all', () => {
    expect(plainExcerpt('Amen.')).toBe('Amen.');
    expect(plainExcerpt('')).toBe('');
  });
});
