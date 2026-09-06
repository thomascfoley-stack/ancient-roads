// Per-work acquire profile in the CCEL adapter (acquire.min_units / acquire.matter_allow).
//
// The triage of the 79 absent-from-prod CCEL works (2026-09-06, /tmp/ap-triage-plan.json)
// found 38 works whose text is REAL but whose structure is one or two genuine units —
// law-clergy's entire 271k-char treatise is a single untyped div1; kronstadt-christlife
// is two parts totalling 1.4M chars. The fail-closed MIN_UNITS=3 floor exists to refuse
// works whose structure we failed to find; here the structure WAS found and is honestly
// small, so the floor — not the parser — is what refuses them. register-writer chunks
// big bodies at word boundaries, so a single giant unit is safe.
//
// Two works need more than the floor:
//   charnock-nat-regen — the 331k-char discourse is nested INSIDE the div1 titled
//     "Title Page", which MATTER_RE drops even at min_units=1. acquire.matter_allow
//     exempts the heading, and the div's own h1 becomes the section heading (serving
//     "Title Page" as a heading would be the front-matter bug MATTER_RE prevents).
//   luther-prefacetoromans — the preface lives in a div1 titled "Preface to the
//     Letter of St. Paul to the Romans"; MATTER_RE's ^preface branch drops the work's
//     actual content. Same override, different pattern.

import { describe, expect, it } from 'vitest';
import { buildCcelSections } from '../src/ingest/adapter-ccel.js';

// Shape taken from law_clergy.xml: the whole treatise is ONE title-bearing div1;
// the only sibling is back-matter "Indexes".
const ONE_UNIT_WORK = `<ThML><body>
<div1 title="An Humble, Affectionate, and Earnest Address to the Clergy" id="i">
<p>[Addr-1] The reason of my humbly and affectionately addressing this discourse to the
clergy, is my earnest desire of their welfare, and my deep sense of the importance of
their calling, with enough body text here to pass the forty character minimum.</p>
</div1>
<div1 title="Indexes" id="ii"><p>Abbot, Ezra, citations of, with enough body text here
to pass the forty character minimum for a content unit if it were ever kept.</p></div1>
</body></ThML>`;

// Shape taken from charnock_nat_regen.xml: the entire discourse is nested inside the
// div1 titled "Title Page"; the only other divs are the two index divs.
const NESTED_TITLE_PAGE = `<ThML><body>
<div1 title="Title Page" id="i">
<h1>Discourse of the Nature of Regeneration</h1>
<p>Therefore if any man be in Christ, he is a new creature: old things are passed away;
behold, all things are become new.—<scripRef passage="2 Cor. v. 17" osisRef="Bible:2Cor.5.17">2
Cor. v. 17</scripRef>. The apostle in those words defends his speaking so much of his
integrity, with enough body text here to pass the forty character minimum.</p>
</div1>
<div1 title="Indexes" id="ii"><p>Abbot, Ezra, citations of, with enough body text here
to pass the forty character minimum for a content unit if it were ever kept.</p></div1>
</body></ThML>`;

describe('buildCcelSections with acquire.min_units', () => {
  it('default floor (MIN_UNITS=3) still refuses a one-unit work — no profile, no change', () => {
    // RED-PROOF: pre-patch this is also [] — but so is every profile call below,
    // which is what the other tests' failures pin.
    expect(buildCcelSections(ONE_UNIT_WORK)).toEqual([]);
  });

  it('minUnits=1 unlocks the real-text single-unit work', () => {
    const secs = buildCcelSections(ONE_UNIT_WORK, undefined, undefined, { minUnits: 1 });
    expect(secs).toHaveLength(1);
    expect(secs[0]!.heading).toBe('An Humble, Affectionate, and Earnest Address to the Clergy');
    expect(secs[0]!.body).toContain('[Addr-1] The reason of my humbly');
  });

  it('CONTROL — back-matter is still filtered at minUnits=1 (Indexes never rides in)', () => {
    const secs = buildCcelSections(ONE_UNIT_WORK, undefined, undefined, { minUnits: 1 });
    expect(secs.some((s) => /indexes/i.test(s.heading ?? ''))).toBe(false);
  });
});

describe('buildCcelSections with acquire.matter_allow (the nat-regen shape)', () => {
  it('minUnits=1 ALONE cannot rescue the nested Title Page discourse', () => {
    expect(buildCcelSections(NESTED_TITLE_PAGE, undefined, undefined, { minUnits: 1 })).toEqual([]);
  });

  it('matter_allow rescues it, and the div’s own h-tag becomes the heading', () => {
    const secs = buildCcelSections(NESTED_TITLE_PAGE, undefined, undefined, { minUnits: 1, matterAllow: '^title pages?$' });
    expect(secs).toHaveLength(1);
    expect(secs[0]!.heading).toBe('Discourse of the Nature of Regeneration');
    // the epigraph scripRef anchors the unit (2 Cor 5:17)
    expect(secs[0]!.anchors).toEqual([{ verseIdStart: 47_005_017, verseIdEnd: 47_005_017 }]);
  });

  it('CONTROL — without the override MATTER_RE still drops a Title Page outright', () => {
    // a well-formed 3-unit work with a title page: 3 content units survive, the
    // title page does not, profile or no profile key set
    const work = NESTED_TITLE_PAGE.replace('</div1>\n<div1 title="Indexes"', '</div1>\n<div1 title="Chapter Two"><p>Second discourse part with enough body text here to pass the forty character minimum for a unit.</p></div1>\n<div1 title="Chapter Three"><p>Third discourse part with enough body text here to pass the forty character minimum for a unit.</p></div1>\n<div1 title="Indexes"');
    const secs = buildCcelSections(work);
    expect(secs.map((s) => s.heading)).toEqual(['Chapter Two', 'Chapter Three']);
  });
});
