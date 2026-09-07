// The desk's pane state comes from a USER-EDITABLE URL, so the parser is a trust boundary and it
// is tested like one. The ceiling especially: sixteen panes (the 4x4 grid) is a layout constraint
// enforced in the parser, because `?p=` repeated a hundred times must be truncated before it
// reaches the layout rather than by whatever CSS happens to do with a hundred grid cells.

import { describe, expect, it } from 'vitest';
import {
  MAX_PANES,
  decodeDesk,
  decodePane,
  deskHref,
  encodePane,
  paneKey,
  paneRegisterLabel,
  replacePane,
  withPane,
  withoutPane,
  type Pane,
} from '@/lib/desk';

const scripture = (book: string, chapter: number): Pane => ({ kind: 'scripture', book, chapter });
const work = (slug: string): Pane => ({ kind: 'work', slug });
const workAt = (slug: string, ordinal: number): Pane => ({ kind: 'work', slug, ordinal });

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

  it('a work pane with an ordinal survives encode → decode', () => {
    expect(decodePane(encodePane(workAt('adam-clarke', 8075)))).toEqual(workAt('adam-clarke', 8075));
  });

  it('paneKey is the work IDENTITY — it ignores the ordinal encodePane round-trips', () => {
    // The renderer keys React children on paneKey and the parser dedupes on it; ordinal is a
    // landing position, not which work the pane is, so it must not distinguish two same-work panes.
    expect(paneKey(work('adam-clarke'))).toBe('work:adam-clarke');
    expect(paneKey(workAt('adam-clarke', 8075))).toBe('work:adam-clarke');
    expect(paneKey(scripture('john', 3))).toBe('scripture:john/3');
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

describe('the pane ceiling is enforced in the parser', () => {
  it('never returns more than MAX_PANES', () => {
    const many = Array.from({ length: 20 }, (_, i) => `work:w${i}`);
    expect(decodeDesk(many)).toHaveLength(MAX_PANES);
    expect(decodeDesk(many).map(encodePane)).toEqual(many.slice(0, MAX_PANES));
  });

  it('dedupes BEFORE truncating, so a duplicate never wastes a slot', () => {
    // 18 entries, 17 distinct: truncating first would yield 15 panes (a,a,w0..w13 deduped),
    // so this case distinguishes the order the two steps run in.
    const values = ['work:a,work:a', ...Array.from({ length: 16 }, (_, i) => `work:w${i}`)];
    const panes = decodeDesk(values);
    expect(panes).toHaveLength(MAX_PANES);
    expect(panes.map(encodePane)).toEqual(['work:a', ...Array.from({ length: 15 }, (_, i) => `work:w${i}`)]);
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

describe('the same work never occupies two panes — ordinal is a landing position, not identity', () => {
  // The pre-ordinal dedup keyed on encodePane, which folds the ordinal into the string. Two panes
  // for the SAME work that differed only in ordinal (or where one carried one and the other did
  // not) were treated as DISTINCT and never collapsed — a second cell, and (because the renderer
  // keys children by paneKey, no ordinal) a React duplicate-key warning. Dedup now keys on paneKey.

  it('decodeDesk dedupes a bare work against the same work with an ordinal (first wins)', () => {
    const out = decodeDesk(['work:adam-clarke', 'work:adam-clarke:8075']);
    expect(out).toHaveLength(1);
    expect(encodePane(out[0]!)).toBe('work:adam-clarke');
  });

  it('decodeDesk dedupes regardless of order — the ordinal-bearing entry wins when it comes first', () => {
    const out = decodeDesk(['work:adam-clarke:8075', 'work:adam-clarke']);
    expect(out).toHaveLength(1);
    expect(encodePane(out[0]!)).toBe('work:adam-clarke:8075');
  });

  it('withPane collapses a re-add of an open work across the ordinal boundary, adopting the new ordinal', () => {
    // Mirrors the library "+" producer: openDesk has `work:adam-clarke` (no ordinal); the re-add
    // carries an ordinal because a Scripture pane is now open. withPane must NOT add a second cell.
    const open: Pane[] = [scripture('jhn', 3), work('adam-clarke')];
    const next = withPane(open, workAt('adam-clarke', 8075));
    expect(next).toHaveLength(2);
    expect(next.map(encodePane)).toEqual(['scripture:jhn/3', 'work:adam-clarke:8075']);
  });

  it('withPane keeps the pane in its place (no reshuffle) when collapsing across ordinals', () => {
    const open: Pane[] = [work('a'), scripture('jhn', 3), work('adam-clarke')];
    const next = withPane(open, workAt('adam-clarke', 8075));
    // adam-clarke stays at index 2; nothing else moves.
    expect(next.map(encodePane)).toEqual(['work:a', 'scripture:jhn/3', 'work:adam-clarke:8075']);
  });

  it('the library-producer chain emits a single same-work href, not two', () => {
    // decodeDesk + withPane + deskHref is exactly what library/[catalog]/page.tsx calls, in that
    // order. With a Scripture pane open and the work re-added with an ordinal, the href must name
    // the work once — this is the href the reader's "+" click would land on.
    const openDesk = decodeDesk(['work:adam-clarke,scripture:jhn/3']);
    const href = deskHref(withPane(openDesk, workAt('adam-clarke', 8075)));
    const pValues = new URLSearchParams(href.slice('/desk?'.length)).getAll('p');
    expect(pValues.filter((v) => v.startsWith('work:adam-clarke'))).toEqual(['work:adam-clarke:8075']);
    expect(pValues).toHaveLength(2);
  });
});

describe('adding and removing panes', () => {
  it('adds up to the cap', () => {
    let d: Pane[] = [];
    d = withPane(d, scripture('john', 3));
    d = withPane(d, work('calvin-institutes'));
    d = withPane(d, work('spurgeon-sermons'));
    d = withPane(d, work('olney-hymns'));
    expect(d).toHaveLength(4);
  });

  it('at the cap it evicts the OLDEST, keeping what the reader just asked for', () => {
    const full: Pane[] = [scripture('john', 3), ...Array.from({ length: 15 }, (_, i) => work(`w${i}`))];
    const next = withPane(full, work('z'));
    expect(next).toHaveLength(MAX_PANES);
    // the newly requested pane is present; the first one opened is the one that left
    expect(next.map(encodePane)).toContain('work:z');
    expect(next.map(encodePane)).not.toContain('scripture:john/3');
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

  it('replacing with a work already open collapses across the ordinal boundary', () => {
    // The collapse is by paneKey (work identity), so an ordinal-bearing pane still matches its bare
    // counterpart and the desk never shows the same work twice — even at different landing spots.
    const next = replacePane(desk, 0, workAt('spurgeon-sermons', 42));
    expect(next.map(encodePane)).toEqual(['work:spurgeon-sermons:42', 'work:matthew-henry']);
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
