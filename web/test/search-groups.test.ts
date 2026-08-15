import { describe, expect, it } from 'vitest';
import {
  buildSearchHref,
  CORPUS_GROUPS,
  EMPTY_SEARCH_STATE,
  escapeLike,
  excerpt,
  GROUP_PAGE_SIZE,
  isSearchGroupId,
  pagedGroup,
  parseSearchState,
  PERSONAL_GROUPS,
  SEARCH_GROUP_IDS,
  SEARCH_MAX_OFFSET,
  toggledCollapse,
  type SearchState,
} from '../src/lib/search-groups';

// The merged search surface's group model and URL state (docs/STUDY_DOCS_DESIGN.md §7.3). These
// tests pin the parts a pure unit test CAN pin — group order and labels, the catalog-fence
// mapping, URL parsing/building, and the text helpers. The per-group query fan-out itself
// (S-12) is pinned against the real engine by test/invariants/search-register-groups.test.ts.
//
// Red-proofed by mutation (docs/evidence/study-docs-p2/w5.log):
//   M1 PERSONAL_GROUPS reversed + default includePersonal flipped to true → order/E8 tests red;
//   M2 offset clamp removed + collapsed id filter dropped → parsing tests red.

describe('§7.3 group model', () => {
  it('lists the groups in the design’s order: personal first, then the library by register', () => {
    expect(PERSONAL_GROUPS.map((g) => g.id)).toEqual(['studies', 'works', 'prayers', 'notes']);
    expect(CORPUS_GROUPS.map((g) => g.id)).toEqual(['commentaries', 'sermons', 'hymns-poetry', 'theology', 'lexicons']);
    expect(SEARCH_GROUP_IDS).toEqual([
      'studies', 'works', 'prayers', 'notes',
      'commentaries', 'sermons', 'hymns-poetry', 'theology', 'lexicons',
    ]);
  });

  it('carries the design’s labels', () => {
    expect(PERSONAL_GROUPS.map((g) => g.label)).toEqual(['Your studies', 'Your works', 'Your prayers', 'Your notes']);
    expect(CORPUS_GROUPS.map((g) => g.label)).toEqual(['Commentaries', 'Sermons', 'Hymns & Poetry', 'Theology', 'Lexicons']);
  });

  it('fences every corpus group through a catalog — except lexicons, pinned as its own register query', () => {
    // S-12's wiring: each catalog-backed group names exactly one catalog of the existing fence.
    for (const g of CORPUS_GROUPS) {
      if (g.id === 'lexicons') {
        expect(g.via).toBe('lexicon-register');
      } else {
        expect(g.via).toBe('catalog');
        expect(g.via === 'catalog' && g.catalog === g.id).toBe(true);
      }
    }
  });
});

describe('parseSearchState', () => {
  it('parses an empty URL to the default state (include-personal OFF — E8 is explicit opt-in)', () => {
    expect(parseSearchState({})).toEqual(EMPTY_SEARCH_STATE);
    expect(parseSearchState({}).includePersonal).toBe(false);
  });

  it('reads q and the E8 checkbox; only personal=1 counts', () => {
    expect(parseSearchState({ q: 'rahab' }).q).toBe('rahab');
    expect(parseSearchState({ q: 'rahab', personal: '1' }).includePersonal).toBe(true);
    expect(parseSearchState({ personal: 'true' }).includePersonal).toBe(false);
    expect(parseSearchState({ personal: '0' }).includePersonal).toBe(false);
    expect(parseSearchState({ personal: ['1', '0'] }).includePersonal).toBe(true);
  });

  it('parses per-group offsets, clamped to [0, SEARCH_MAX_OFFSET]; garbage is page one, never a 500', () => {
    expect(parseSearchState({ off_sermons: '10' }).offsets).toEqual({ sermons: 10 });
    expect(parseSearchState({ off_sermons: '-5' }).offsets).toEqual({ sermons: 0 });
    expect(parseSearchState({ off_sermons: 'abc' }).offsets).toEqual({ sermons: 0 });
    expect(parseSearchState({ off_sermons: '1e21' }).offsets).toEqual({ sermons: SEARCH_MAX_OFFSET });
    expect(parseSearchState({ off_sermons: '7.9' }).offsets).toEqual({ sermons: 7 });
  });

  it('ignores off_ params for ids that are not groups', () => {
    expect(parseSearchState({ off_nope: '10', off_also_nope: '3' }).offsets).toEqual({});
  });

  it('keeps only known collapsed ids, deduped, in canonical group order (stable URLs)', () => {
    expect(parseSearchState({ collapsed: 'theology,studies,nope,studies' }).collapsed).toEqual(['studies', 'theology']);
    expect(parseSearchState({ collapsed: '' }).collapsed).toEqual([]);
  });
});

describe('buildSearchHref', () => {
  it('omits defaults so URLs stay short', () => {
    expect(buildSearchHref(EMPTY_SEARCH_STATE)).toBe('/search');
    expect(buildSearchHref({ ...EMPTY_SEARCH_STATE, q: 'rahab' })).toBe('/search?q=rahab');
  });

  it('round-trips with parseSearchState for any parsed state', () => {
    const cases = [
      {},
      { q: 'rahab' },
      { q: 'rahab', personal: '1' },
      { q: 'grace', personal: '1', collapsed: 'sermons,studies', off_commentaries: '5', off_notes: '20' },
      { q: 'a & b', off_lexicons: String(SEARCH_MAX_OFFSET) },
    ];
    for (const raw of cases) {
      const s = parseSearchState(raw);
      const href = buildSearchHref(s);
      const [path, query = ''] = href.split('?');
      expect(path).toBe('/search');
      expect(parseSearchState(Object.fromEntries(new URLSearchParams(query)))).toEqual(s);
    }
  });
});

describe('URL-state transitions', () => {
  const base: SearchState = { q: 'rahab', includePersonal: true, collapsed: ['sermons'], offsets: { commentaries: 5 } };

  it('toggledCollapse flips one group and preserves everything else', () => {
    const off = toggledCollapse(base, 'studies');
    expect(off.collapsed).toEqual(['studies', 'sermons']);
    expect(off.offsets).toEqual({ commentaries: 5 });
    expect(off.includePersonal).toBe(true);
    const back = toggledCollapse(off, 'studies');
    expect(back.collapsed).toEqual(['sermons']);
  });

  it('pagedGroup pages THAT group only (S-12’s UI face) and clamps like the parser', () => {
    const paged = pagedGroup(base, 'sermons', 10);
    expect(paged.offsets).toEqual({ commentaries: 5, sermons: 10 });
    expect(pagedGroup(base, 'sermons', -1).offsets.sermons).toBe(0);
    expect(pagedGroup(base, 'sermons', Number.MAX_SAFE_INTEGER).offsets.sermons).toBe(SEARCH_MAX_OFFSET);
  });

  it('isSearchGroupId admits exactly the nine groups', () => {
    for (const id of SEARCH_GROUP_IDS) expect(isSearchGroupId(id)).toBe(true);
    expect(isSearchGroupId('')).toBe(false);
    expect(isSearchGroupId('lexicon')).toBe(false); // the register is a type; the group is 'lexicons'
  });
});

describe('text helpers', () => {
  it('escapeLike neutralizes ILIKE metacharacters', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
    expect(escapeLike('plain words')).toBe('plain words');
  });

  it('excerpt bounds plain-text snippets and marks the cut', () => {
    expect(excerpt('short')).toBe('short');
    const long = 'x'.repeat(500);
    const out = excerpt(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(280);
    expect(excerpt('  padded  ')).toBe('padded');
  });

  it('GROUP_PAGE_SIZE is small — nine groups share one screen', () => {
    expect(GROUP_PAGE_SIZE).toBeLessThanOrEqual(10);
    expect(GROUP_PAGE_SIZE).toBeGreaterThanOrEqual(3);
  });
});
