// Declared-primary-book anchoring in the CCEL adapter (acquire.primary_book).
//
// A single-book commentary's first scripRef is usually a CROSS-REFERENCE, not
// the text under exposition — measured on gill-song 2026-08-12: 105 of 107
// first-scripRef anchors landed off-book (Psalms, John, 1 Kings), a false-
// attribution sweep across the canon. With primary_book declared, the anchor
// comes from the work's OWN unit headings ("Chapter 1 Verse 1"); a scripRef is
// kept only when it lands on the declared book.

import { describe, expect, it } from 'vitest';
import { buildCcelSections } from '../src/ingest/adapter-ccel.js';

const SNG = 22;
const v = (ch: number, vs: number) => SNG * 1_000_000 + ch * 1000 + vs;

// Minimal ThML: three verse units whose first scripRefs are cross-references
// (Psalms / John), exactly the gill-song failure shape.
const WORK = `<ThML><body>
<div2 title="Chapter 1 Verse 1"><p><i>The Song of Songs, which is Solomon's.</i> The Jews had a
venerable esteem of it, calling it the holy of holies, and forbidding their children the reading
of it, as well as <scripRef passage="Ps 19:7">Ps 19:7</scripRef> shews; enough body text here to
pass the forty character minimum for a content unit.</p></div2>
<div2 title="Chapter 4 Verse 12"><p>A garden inclosed is my sister, my spouse; as
<scripRef passage="Joh 20:15">Joh 20:15</scripRef> hints; enough body text here to pass the
forty character minimum for a content unit as well.</p></div2>
<div2 title="Chapter 8 Verse 6"><p>Set me as a seal upon thine heart. An on-book self-reference
<scripRef osisRef="Bible:Song.8.7">Song 8:7</scripRef> follows the verse text, with enough body
to pass the forty character minimum for a content unit.</p></div2>
</body></ThML>`;

describe('buildCcelSections with a declared primary book', () => {
  it('anchors verse units by heading, not by the cross-reference scripRef', () => {
    // RED-PROOF: without the third argument (pre-patch signature) these anchors
    // come out as Ps 19:7 / Joh 20:15 / Song 8:7 — the first two off-book.
    const secs = buildCcelSections(WORK, undefined, SNG);
    expect(secs).toHaveLength(3);
    expect(secs[0]!.anchors).toEqual([{ verseIdStart: v(1, 1), verseIdEnd: v(1, 1) }]);
    expect(secs[1]!.anchors).toEqual([{ verseIdStart: v(4, 12), verseIdEnd: v(4, 12) }]);
  });

  it('keeps a scripRef anchor only when it lands ON the declared book', () => {
    // A heading that does NOT match "Chapter N Verse M" falls through to the
    // scripRef path; the on-book scripRef must survive.
    const noHead = WORK.replace('Chapter 8 Verse 6', 'Exposition');
    const secs2 = buildCcelSections(noHead, undefined, SNG);
    const last = secs2.find((s) => s.body.includes('seal upon thine heart'))!;
    expect(last.anchors).toEqual([{ verseIdStart: v(8, 7), verseIdEnd: v(8, 7) }]);
  });

  it('drops off-book scripRefs instead of mis-attributing them', () => {
    const noHead = WORK.replace('Chapter 1 Verse 1', 'Exposition');
    const secs = buildCcelSections(noHead, undefined, SNG);
    const first = secs.find((s) => s.body.includes('holy of holies'))!;
    // SEED: keep the old precedence (scripRef first) and this anchor is Ps 19:7.
    expect(first.anchors).toBeUndefined();
  });

  it('anchors a bare "Chapter N" unit to the whole chapter (sentinel end)', () => {
    const chapterUnit = WORK.replace('Chapter 1 Verse 1', 'Chapter 1.');
    const secs = buildCcelSections(chapterUnit, undefined, SNG);
    const first = secs.find((s) => s.body.includes('holy of holies'))!;
    expect(first.anchors).toEqual([{ verseIdStart: v(1, 1), verseIdEnd: SNG * 1_000_000 + 1000 + 999 }]);
  });

  it('is inert without a declared book — legacy precedence untouched', () => {
    const secs = buildCcelSections(WORK);
    expect(secs[0]!.anchors).toEqual([{ verseIdStart: 19_019_007, verseIdEnd: 19_019_007 }]);
  });

  it('expands a range osisRef to the whole stated span (not just its first verse)', () => {
    // jamieson-jfb's Song chapters carry osisRef="Bible:Song.1.1-Song.1.17";
    // the 3-part match anchored each 17-verse unit to verse 1 (measured 2026-08-12).
    // RED-PROOF: pre-patch this comes out 22001001–22001001.
    const unit = (ch: number, last: number) => `<div2 title="Chapter ${ch}"><p>The bridegroom's
praise of the bride in chapter ${ch}, from
<scripRef passage="So ${ch}:1-${last}" osisRef="Bible:Song.${ch}.1-Song.${ch}.${last}">So ${ch}:1-${last}</scripRef>
onward, with enough body text here to pass the forty character minimum.</p></div2>`;
    const ranged = `<ThML><body>${unit(1, 17)}${unit(2, 17)}${unit(3, 11)}</body></ThML>`;
    const secs = buildCcelSections(ranged);
    expect(secs.map((s) => s.anchors![0])).toEqual([
      { verseIdStart: v(1, 1), verseIdEnd: v(1, 17) },
      { verseIdStart: v(2, 1), verseIdEnd: v(2, 17) },
      { verseIdStart: v(3, 1), verseIdEnd: v(3, 11) },
    ]);
  });
});
