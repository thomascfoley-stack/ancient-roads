// The desk's pane state comes from a USER-EDITABLE URL, so the parser is a trust boundary and it
// is tested like one. The cap especially: three panes is a layout constraint enforced in the
// parser, because `?p=` repeated ten times must be truncated before it reaches the layout rather
// than by whatever CSS happens to do with ten columns.

import { describe, expect, it } from 'vitest';
import {
  MAX_PANES,
  decodeDesk,
  decodePane,
  deskHref,
  encodePane,
  paneRegisterLabel,
  replacePane,
  withPane,
  withoutPane,
  type Pane,
} from '@/lib/desk';

const scripture = (book: string, chapter: number): Pane => ({ kind: 'scripture', book, chapter });
const work = (slug: string): Pane => ({ kind: 'work', slug });

describe('pane encoding round-trips', () => {
  it('a scripture pane survives encode → decode', () => {
    expect(decodePane(encodePane(scripture('john', 3)))).toEqual(scripture('john', 3));
  });

  it('a work pane survives encode → decode', () => {
    expect(decodePane(encodePane(work('spurgeon-sermons')))).toEqual(work('spurgeon-sermons'));
  });

  it('a book slug containing a hyphen and a digit round-trips (1-john, song-of-solomon)', () => {
    expect(decodePane('scripture:1-john/2')).toEqual(scripture('1-john', 2));
    expect(decodePane('scripture:song-of-solomon/8')).toEqual(scripture('song-of-solomon', 8));
  });
});

describe('the parser refuses malformed panes rather than guessing', () => {
  const bad = [
    '',
    '   ',
    'work',
    'work:',
    ':john/3',
    'scripture:john',
    'scripture:john/',
    'scripture:john/0', // chapters are 1-based
    'scripture:john/-1',
    'scripture:john/3.5',
    'scripture:john/abc',
    'scripture:john/999', // beyond any real book, and beyond the parser's sanity bound
    'notakind:john/3',
    'work:../../etc/passwd',
    'work:Spurgeon', // slugs are lowercase
    'work:sp urgeon',
  ];
  for (const v of bad) {
    it(`rejects ${JSON.stringify(v)}`, () => {
      expect(decodePane(v)).toBeNull();
    });
  }
});

describe('the three-pane cap is enforced in the parser', () => {
  it('never returns more than MAX_PANES', () => {
    const many = ['work:a', 'work:b', 'work:c', 'work:d', 'work:e'];
    expect(decodeDesk(many)).toHaveLength(MAX_PANES);
    expect(decodeDesk(many).map(encodePane)).toEqual(['work:a', 'work:b', 'work:c']);
  });

  it('dedupes BEFORE truncating, so a,a,b,c still fills three distinct panes', () => {
    // Truncating first would yield [a, b] from a,a,b,c and waste a slot on a duplicate.
    const panes = decodeDesk(['work:a,work:a,work:b,work:c']);
    expect(panes.map(encodePane)).toEqual(['work:a', 'work:b', 'work:c']);
  });

  it('drops malformed entries without dropping the valid ones around them', () => {
    const panes = decodeDesk(['work:a', 'garbage', 'scripture:john/3']);
    expect(panes.map(encodePane)).toEqual(['work:a', 'scripture:john/3']);
  });

  it('accepts repeated params and comma-joined values alike', () => {
    const repeated = decodeDesk(['scripture:john/3', 'work:a']);
    const joined = decodeDesk(['scripture:john/3,work:a']);
    expect(joined).toEqual(repeated);
  });
});

describe('adding and removing panes', () => {
  it('adds up to the cap', () => {
    let d: Pane[] = [];
    d = withPane(d, scripture('john', 3));
    d = withPane(d, work('calvin-institutes'));
    d = withPane(d, work('spurgeon-sermons'));
    expect(d).toHaveLength(3);
  });

  it('at the cap it evicts the OLDEST, keeping what the reader just asked for', () => {
    const full = [scripture('john', 3), work('a'), work('b')];
    const next = withPane(full, work('c'));
    expect(next.map(encodePane)).toEqual(['work:a', 'work:b', 'work:c']);
    // the newly requested pane is present; the first one opened is the one that left
    expect(next.map(encodePane)).toContain('work:c');
  });

  it('adding an already-open pane is a no-op, not a reshuffle', () => {
    const d = [scripture('john', 3), work('a')];
    expect(withPane(d, work('a')).map(encodePane)).toEqual(['scripture:john/3', 'work:a']);
  });

  it('removes by index, and out-of-range does nothing', () => {
    const d = [scripture('john', 3), work('a'), work('b')];
    expect(withoutPane(d, 1).map(encodePane)).toEqual(['scripture:john/3', 'work:b']);
    expect(withoutPane(d, 9)).toEqual(d);
    expect(withoutPane(d, -1)).toEqual(d);
  });

  it('deskHref round-trips through decodeDesk', () => {
    const d = [scripture('john', 3), work('olney-hymns')];
    const qs = new URL(deskHref(d), 'https://x.test').searchParams.getAll('p');
    expect(decodeDesk(qs)).toEqual(d);
  });

  it('an empty desk has a bare href', () => {
    expect(deskHref([])).toBe('/desk');
  });
});

describe('every pane is register-labelled (the wall)', () => {
  it('labels each corpus type the catalogs can produce', () => {
    expect(paneRegisterLabel('commentary')).toBe('Commentary');
    expect(paneRegisterLabel('father')).toBe('Church Father');
    expect(paneRegisterLabel('sermon')).toBe('Sermon');
    expect(paneRegisterLabel('hymn')).toBe('Hymn');
    expect(paneRegisterLabel('poetry')).toBe('Poetry');
    expect(paneRegisterLabel('historian')).toBe('History');
  });

  it('an UNKNOWN type looks unknown — it never degrades to a plausible label', () => {
    // A hymn mislabelled "Commentary" is the register breach the wall forbids. An unrecognised
    // type must therefore surface as itself, never as a friendly default.
    expect(paneRegisterLabel('newthing')).toBe('newthing');
    expect(paneRegisterLabel(null)).toBe('Unlabelled');
    expect(paneRegisterLabel(undefined)).toBe('Unlabelled');
    expect(paneRegisterLabel('')).toBe('Unlabelled');
  });

  it('no label is ever empty', () => {
    for (const t of ['commentary', 'hymn', 'zzz', '', null, undefined]) {
      expect(paneRegisterLabel(t).length).toBeGreaterThan(0);
    }
  });
});

describe('replacePane — a pane navigates itself without touching its neighbours', () => {
  const desk = [scripture('psa', 23), work('matthew-henry'), work('spurgeon-sermons')];

  it('replaces in place, keeping position', () => {
    const next = replacePane(desk, 0, scripture('isa', 40));
    expect(next.map(encodePane)).toEqual(['scripture:isa/40', 'work:matthew-henry', 'work:spurgeon-sermons']);
  });

  it('out-of-range is a no-op', () => {
    expect(replacePane(desk, -1, scripture('isa', 40)).map(encodePane)).toEqual(desk.map(encodePane));
    expect(replacePane(desk, 3, scripture('isa', 40)).map(encodePane)).toEqual(desk.map(encodePane));
  });

  it('replacing with a pane already open elsewhere collapses the duplicate', () => {
    // Same rule decodeDesk and withPane apply: the desk never shows the same thing twice.
    const next = replacePane(desk, 0, work('spurgeon-sermons'));
    expect(next.map(encodePane)).toEqual(['work:spurgeon-sermons', 'work:matthew-henry']);
  });

  it('replacing a pane with itself is stable', () => {
    expect(replacePane(desk, 1, work('matthew-henry')).map(encodePane)).toEqual(desk.map(encodePane));
  });

  it('never mutates the input', () => {
    const before = desk.map(encodePane);
    replacePane(desk, 0, scripture('gen', 1));
    expect(desk.map(encodePane)).toEqual(before);
  });
});
