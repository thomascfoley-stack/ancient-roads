// Scanner invariants for the topical-index ingest (src/ingest/topical-refs.ts).
// Every case here is a shape MEASURED in the decoded SWORD modules (probe
// 2026-08-02) — not hypothetical grammar. The three ambiguity rules in the
// module header each get a case that fails against the naive reading.

import { describe, expect, it } from 'vitest';
import { scanTopicalRefs } from '../src/ingest/topical-refs.js';

const ids = (text: string) => scanTopicalRefs(text).refs.map((r) => [r.verseIdStart, r.verseIdEnd]);
const v = (book: number, ch: number, vs: number) => book * 1_000_000 + ch * 1000 + vs;

describe('scanTopicalRefs — concordance context inheritance', () => {
  it('semicolon inherits the book, comma inherits the chapter', () => {
    // Nave AARON, verbatim shape. SEED: drop the ctx.chapter rebind after a
    // ";" continuation and the ", 10" case resolves in the wrong chapter.
    expect(ids('Ex 4:14-16, 27-31; 7:1, 2')).toEqual([
      [v(2, 4, 14), v(2, 4, 16)],
      [v(2, 4, 27), v(2, 4, 31)],
      [v(2, 7, 1), v(2, 7, 1)],
      [v(2, 7, 2), v(2, 7, 2)],
    ]);
  });

  it('space-separated refs inherit the book (Daily Light)', () => {
    expect(ids('Isa 44:22 43:25 1:18')).toEqual([
      [v(23, 44, 22), v(23, 44, 22)],
      [v(23, 43, 25), v(23, 43, 25)],
      [v(23, 1, 18), v(23, 1, 18)],
    ]);
  });

  it('"with" is a same-book connector (Nave)', () => {
    expect(ids('1Sa 22:20-23; with 22:6-19')).toEqual([
      [v(9, 22, 20), v(9, 22, 23)],
      [v(9, 22, 6), v(9, 22, 19)],
    ]);
  });

  it('a bare chapter is a whole-chapter range', () => {
    const [only] = ids('Nu 17');
    expect(only).toEqual([v(4, 17, 1), v(4, 17, 999)]);
  });

  it('a colon continuation survives trailing prose', () => {
    // SEED: re-add a blanket (?!\s*[A-Za-z]) lookahead on CONT and the
    // "; 23:13" ref is silently dropped (the 2026-08-02 regression).
    expect(ids('1Ch 6:2, 3; 23:13 and more prose')).toEqual([
      [v(13, 6, 2), v(13, 6, 2)],
      [v(13, 6, 3), v(13, 6, 3)],
      [v(13, 23, 13), v(13, 23, 13)],
    ]);
  });
});

describe('scanTopicalRefs — measured ambiguities (module header §§1-3)', () => {
  it('§1 Jud is Judges, never Jude', () => {
    // SEED: remove the override and this resolves to Jude (book 65) — the
    // silent mis-anchor parseRef alone produces on ~1,500 refs.
    expect(ids('Jud 12:13-15')).toEqual([[v(7, 12, 13), v(7, 12, 15)]]);
    // Spelled-out Jude still reaches Jude.
    expect(ids('Jude 1:17')).toEqual([[v(65, 1, 17), v(65, 1, 17)]]);
  });

  it('§2 a bare number opening a numbered book belongs to the book', () => {
    // Nave CORINTH: "Titus" is the man; "2 Co 8:16" is 2 Corinthians.
    // SEED: drop the BOOK_AFTER_BARE check on the REF_START side and this
    // emits a fabricated whole-chapter "Titus 2" plus an unresolvable "Co".
    expect(ids('By Titus 2 Co 8:16, 17')).toEqual([
      [v(47, 8, 16), v(47, 8, 16)],
      [v(47, 8, 17), v(47, 8, 17)],
    ]);
    // Daily 02.05: ",12" is a verse of 1Jo 5; "Joh 3:17" is John.
    expect(ids('1Jo 5:11,12 Joh 3:17')).toEqual([
      [v(62, 5, 11), v(62, 5, 11)],
      [v(62, 5, 12), v(62, 5, 12)],
      [v(43, 3, 17), v(43, 3, 17)],
    ]);
    // Glued numeral after a semicolon: "; 1Co 5:7" must not fabricate a
    // whole-chapter ref from the "1". SEED: require SP+ in BOOK_AFTER_BARE.
    expect(ids('Ro 12:1; 1Co 5:7')).toEqual([
      [v(45, 12, 1), v(45, 12, 1)],
      [v(46, 5, 7), v(46, 5, 7)],
    ]);
  });

  it('§3 a range dangling into another book yields two point refs', () => {
    // Torrey KINGS: "2Sa 2:4-1Ki 2:11". SEED: let CHUNK's range tail match
    // digits that abut letters and this becomes "Backwards range: 4-1".
    expect(ids('2Sa 2:4-1Ki 2:11')).toEqual([
      [v(10, 2, 4), v(10, 2, 4)],
      [v(11, 2, 11), v(11, 2, 11)],
    ]);
  });

  it('a prose word must not swallow the digit of the ref after it', () => {
    // Nave ACHAICUS: "Corinth 1Co 16:17". SEED: on a failed book resolve,
    // advance lastIndex past the whole match instead of one char and the
    // "1" is consumed — "Co 16:17" then fails on Colossians bounds.
    expect(ids('A citizen of Corinth 1Co 16:17, 18')).toEqual([
      [v(46, 16, 17), v(46, 16, 17)],
      [v(46, 16, 18), v(46, 16, 18)],
    ]);
  });
});

describe('scanTopicalRefs — fail-closed reporting', () => {
  it('an impossible chapter on a real book is a FAILURE, not a skip', () => {
    // Torrey misprint "Ob 3:2" (Obadiah has one chapter). SEED: return null
    // from resolve without recording and the misprint vanishes silently.
    const { refs, failures } = scanTopicalRefs('Proud Ps 59:12; Ob 3:2');
    expect(refs).toEqual([
      expect.objectContaining({ verseIdStart: v(19, 59, 12) }),
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.token).toBe('Ob 3:2');
  });

  it('pure prose yields nothing at all', () => {
    const r = scanTopicalRefs('A judge of Israel, in the time of the judges');
    expect(r.refs).toEqual([]);
    expect(r.failures).toEqual([]);
  });
});
