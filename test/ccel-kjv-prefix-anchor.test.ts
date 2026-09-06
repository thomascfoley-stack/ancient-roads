// Regression: CCEL OSIS version-qualified osisRef prefixes ("Bible.kjv:").
//
// 22 of John Owen's CCEL works tag 100% of their <scripRef> with the OSIS
// version-qualified form `Bible.kjv:` (KJV-tagged) — zero use the plain `Bible:`
// form the adapter's regex historically accepted. The old prefix group
// `(?:Bible:)?` could not match `Bible.kjv:`, so `unitAnchor`'s osis arm missed
// every such tag; the roman-numeral `passage=` fallback also failed `parseRef`,
// and the section fell to `titleAnchor` (Psalm-N headings only) — leaving 451
// of 506 Owen section anchors missing (12/506 → 463/506 after the fix).
//
// Without this test the regression returns silently: the existing
// ccel-primary-book-anchor.test.ts corpus uses only the plain `Bible:` form.

import { describe, expect, it } from 'vitest';
import { buildCcelSections } from '../src/ingest/adapter-ccel.js';

// A content unit whose first <scripRef> is the test target. Non-Psalm heading
// so titleAnchor does not fire; body clears the 40-char minimum. Shape modelled
// on owen_sermons.xml / owen_pneum.xml — the roman-numeral passage attrs fail
// parseRef, so the osisRef is the sole anchor source (a defined anchor is
// proof the prefix group matched).
function unit(heading: string, scripRefAttrs: string, display: string): string {
  return `<div2 title="${heading}"><p>Opening body text long enough to pass the
forty-character minimum for a content unit; the citation
<scripRef ${scripRefAttrs}>${display}</scripRef> appears here in running prose
and continues with more than enough surrounding text to qualify.</p></div2>`;
}

function work(...units: string[]): string {
  return `<ThML><body>${units.join('')}</body></ThML>`;
}

// Two filler units so chooseUnitSelector returns a selector (it requires
// MIN_UNITS=3 title-bearing divs); no scripRef, non-Psalm heading.
const FILLER = [
  '<div2 title="Filler I."><p>Enough body text here to pass the forty character minimum for a content unit, with no scripRef and a non-Psalm heading.</p></div2>',
  '<div2 title="Filler II."><p>Enough body text here to pass the forty character minimum for a content unit, with no scripRef and a non-Psalm heading.</p></div2>',
];

const MATT28_19 = 40 * 1_000_000 + 28 * 1000 + 19;

describe('buildCcelSections anchors Bible.<version>: osisRefs', () => {
  it('extracts Matt 28:19 from osisRef="Bible.kjv:Matt.28.19"', () => {
    const xml = work(
      unit('Sermon II. The Great Commission.', 'passage="Matt. xxviii. 19" parsed="kjv|Matt|28|19|0|0" osisRef="Bible.kjv:Matt.28.19"', 'Matt. xxviii. 19'),
      ...FILLER,
    );
    const focal = buildCcelSections(xml).find((s) => s.heading?.includes('Great Commission'))!;
    expect(focal.anchors, 'anchors must be defined — the gap existed without the prefix fix').toBeDefined();
    expect(focal.anchors!.at(0)).toEqual({ verseIdStart: MATT28_19, verseIdEnd: MATT28_19 });
  });

  it('expands a Bible.kjv: range osisRef to the whole stated span', () => {
    // The range form is a separate code path; the existing range test
    // (ccel-primary-book-anchor.test.ts) uses the plain Bible: form only.
    const xml = work(
      unit('Exposition A.', 'passage="Rom viii. 28-30" osisRef="Bible.kjv:Rom.8.28-Rom.8.30"', 'Rom. viii. 28-30'),
      ...FILLER,
    );
    const focal = buildCcelSections(xml).find((s) => s.heading?.includes('Exposition A'))!;
    expect(focal.anchors!.at(0)).toEqual({ verseIdStart: 45_008_028, verseIdEnd: 45_008_030 });
  });

  it('accepts non-kjv version qualifiers (Bible.web:, Bible.nrsv:)', () => {
    // The fix targets OSIS version qualifiers generally, not kjv specifically.
    const xml = work(
      unit('Sermon A.', 'passage="Gen i. 1" osisRef="Bible.web:Gen.1.1"', 'Gen i. 1'),
      unit('Sermon B.', 'passage="Exod iii. 14" osisRef="Bible.nrsv:Exod.3.14"', 'Exod iii. 14'),
      ...FILLER,
    );
    const secs = buildCcelSections(xml);
    expect(secs.find((s) => s.heading?.includes('Sermon A'))!.anchors!.at(0))
      .toEqual({ verseIdStart: 1_001_001, verseIdEnd: 1_001_001 });
    expect(secs.find((s) => s.heading?.includes('Sermon B'))!.anchors!.at(0))
      .toEqual({ verseIdStart: 2_003_014, verseIdEnd: 2_003_014 });
  });
});
