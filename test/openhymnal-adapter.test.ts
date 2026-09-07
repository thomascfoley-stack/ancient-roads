// adapter-openhymnal.ts unit checks — the licence gate fails closed per file,
// and w:/W: verse extraction reproduces known hymn text exactly.
import { describe, it, expect } from 'vitest';
import { wordsArePublicDomain, extractVerses, parseHymn } from '../src/ingest/adapter-openhymnal.js';

const ABIDE_WITH_ME = `%OHSCRIP Lk 24:29, Ps 63:6-8, 73:23-26, 1Cor 10:13
%OHMETRICAL 10 10 10 10
%OHCATEGORY CROSS AND COMFORT
%OHAUTHOR Lyte, Henry F. (1793-1847)
%OHTRANSLATOR none
X: 1
T: Abide With Me
C: Words: Henry F. Lyte, 1847.  Music: 'Eventide' William H. Monk, 1861.
C: copyright: public domain.  This score is a part of the Open Hymnal Project, 2008 Revision.
V: S1V1 clef=treble
V: S1V2
K: Eb
[V: S1V1] G2 G F | E2 B2 |
w: 1.~A- bide with me; fast falls the ev- en- tide; The dark- ness
w: 2.~Swift to its close ebbs out life's lit- tle day; Earth's joys grow
[V: S1V2] E2 D D | E2 E2 |
[V: S1V1] c2 B2 | B4 |
w: deep- ens; Lord with me a- bide. When o- ther help- ers
w: dim; its glor- ies pass a- way; Change and de- cay in
[V: S1V1] B A A G | E4 !eintro!|]
w: fail and com- forts flee, Help of the help- less, O a- bide with me.
w: all a- round I see; O Thou who chan- gest not, a- bide with me.
W: 6.I need Thy presence every passing hour.
W: What but Thy grace can foil the tempter's power?
W: Who, like Thyself, my guide and stay can be?
W: Through cloud and sunshine, Lord, abide with me.
`;

describe('wordsArePublicDomain — the licence gate', () => {
  it('passes flat public domain', () => {
    expect(wordsArePublicDomain('copyright: public domain.  This score is a part of the Open Hymnal Project, 2008 Revision.')).toBe(true);
  });
  it('passes "Words and Music, public domain"', () => {
    expect(wordsArePublicDomain('copyright: Words and Music, public domain.  Setting: Copyright 2009 Brian J. Dumont.')).toBe(true);
  });
  it('passes "Words, public domain"', () => {
    expect(wordsArePublicDomain('copyright: Words, public domain.  Adaptation released into public domain by Hope Publishing Company.')).toBe(true);
  });
  it('passes "Music & Lyrics public domain"', () => {
    expect(wordsArePublicDomain('copyright: Music & Lyrics public domain. Setting: CPDL (see file).')).toBe(true);
  });
  it('REFUSES a worship-use words licence', () => {
    expect(wordsArePublicDomain('copyright: Words: Copyright 2009, Brian J. Dumont. These lyrics may be freely reproduced or published for Christian worship.')).toBe(false);
  });
  it('REFUSES tune/setting-only PD with copyrighted words', () => {
    expect(wordsArePublicDomain('copyright: music and setting public domain.  Words: Copyright 2010, Anthony Robertson.')).toBe(false);
    expect(wordsArePublicDomain('copyright: Tune public domain.  Lyrics and Setting Copyright 2012, Bola Omodun Ilori.')).toBe(false);
  });
  it('REFUSES a missing copyright line (missing config denies)', () => {
    expect(wordsArePublicDomain(null)).toBe(false);
  });
});

describe('extractVerses', () => {
  it('reconstructs w: column verses with exact known text', () => {
    const verses = extractVerses(ABIDE_WITH_ME);
    const v1 = verses.find(([n]) => n === 1);
    expect(v1?.[1]).toBe(
      'Abide with me; fast falls the eventide; The darkness deepens; Lord with me abide. ' +
      'When other helpers fail and comforts flee, Help of the helpless, O abide with me.',
    );
  });
  it('merges clean W: block verses', () => {
    const verses = extractVerses(ABIDE_WITH_ME);
    const v6 = verses.find(([n]) => n === 6);
    expect(v6?.[1]).toContain('I need Thy presence every passing hour.');
    expect(verses.map(([n]) => n)).toEqual([1, 2, 6]);
  });
  it('ignores w: lines under non-lyric voices', () => {
    const dup = ABIDE_WITH_ME.replace('[V: S1V2] E2 D D | E2 E2 |', '[V: S1V2] E2 D D |\nw: GARBAGE duplicate lyric |');
    const verses = extractVerses(dup);
    expect(verses.find(([n]) => n === 1)?.[1]).not.toContain('GARBAGE');
  });
});

describe('parseHymn', () => {
  it('returns null (excluded) for a worship-use licence', () => {
    const tainted = ABIDE_WITH_ME.replace(
      'copyright: public domain.',
      'copyright: Words: Copyright 2009, Brian J. Dumont. These lyrics may be freely reproduced for Christian worship only.',
    );
    expect(parseHymn(tainted, 'x.abc')).toBeNull();
  });
  it('fails closed when a gated file yields no verses', () => {
    expect(() => parseHymn('T: Empty\nC: copyright: public domain.\nX: 1\n', 'x.abc')).toThrow(/FAIL CLOSED/);
  });
  it('carries scripture and meter tags into the section text', () => {
    const rec = parseHymn(ABIDE_WITH_ME, 'Abide_With_Me-Eventide.abc');
    expect(rec?.key).toBe('Abide With Me');
    expect(rec?.text).toContain('Scripture: Lk 24:29');
    expect(rec?.text).toContain('Meter: 10 10 10 10');
  });
});
