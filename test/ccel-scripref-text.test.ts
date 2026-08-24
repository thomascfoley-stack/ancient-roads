// K-2 (UX_REMEDIATION_PLAN.md) — `thmlText()` deleted the DISPLAY TEXT of every <scripRef>,
// not just the tag, and that text is usually part of the sentence.
//
// THE COMMENT THIS REPLACES WAS A REASONABLE GENERALISATION FROM ONE SHAPE. It read: "scripRefs are
// marginal cross-reference ANNOTATIONS (already consumed by unitAnchor) — their display text
// ('Heb 12:24') is debris inside body text." That is true of a margin note. It is false of the
// majority of CCEL's actual usage, and the difference is measurable rather than arguable.
//
// MEASURED over the 876 cached ThML works in `data/raw/ccel` (2026-08-24), 135,464 scripRefs
// sampled across the first 250 files:
//   • 21% sit immediately inside an open parenthesis — `... place for you (<scripRef>John 14:2…`.
//     Deleting the element leaves the parentheses behind and empty: `( )`.
//   • 78% sit in running prose — `He is mentioned in <scripRef>Acts xvii, 34</scripRef>`.
//     Deleting the element leaves a sentence with its object removed.
// Both are repaired by keeping the inner text, which is why this is one fix and not two.
//
// AND THE FINDING THAT SENT ME HERE WAS PARTLY WRONG — recorded because the wrong half is
// instructive. I filed this as "inline scripture references are stripped from prose," implying the
// QUOTATIONS were being lost, and cited Kempis. In Kempis the quotation sits OUTSIDE the scripRef
// and survives intact; only the citation is lost, leaving `"…I go to prepare a place for you" ( ).`
// So the severity was overstated (this is lost citations and broken sentences, not deleted
// scripture) while the direction was right. Sized on the dev branch: 27 CCEL works, 40,463
// sections, 1,937 of them (4.8%) carrying visible `( )` debris. Dev has 0 CCEL works PUBLISHED, so
// the dev number is indicative only — production is a separate, owner-gated count.
//
// This test does NOT repair stored rows. The adapter is upstream of the corpus; already-ingested
// text stays damaged until someone re-ingests, which is an owner-approved step (ingest runbook).

import { describe, expect, it } from 'vitest';
import { thmlText } from '../src/ingest/adapter-ccel';

describe('thmlText keeps scripRef display text', () => {
  it('a parenthesised citation survives instead of leaving empty parens', () => {
    // Shape taken verbatim from kempis_imitation.xml (ONE.1-p1.1).
    const frag =
      '<p>&#x201C;HE WHO follows Me, walks not in darkness,&#x201D; says the Lord ' +
      '(<scripRef passage="John 8:12" parsed="|John|8|12|0|0">John 8:12</scripRef>).</p>';
    const out = thmlText(frag);
    expect(out).toContain('John 8:12');
    expect(out, 'the citation was deleted, leaving the parentheses empty').not.toMatch(/\(\s*\)/);
    // The quotation itself was never the thing at risk — pinned so a future "fix" cannot trade one
    // for the other.
    expect(out).toContain('walks not in darkness');
  });

  it('a reference that is the object of a sentence survives', () => {
    // Shape taken from the not-in-parens majority (aaberg_hymnsdenmark.xml and others).
    const frag = '<p>He is mentioned in <scripRef passage="Acts 17:34">Acts xvii, 34</scripRef> only.</p>';
    const out = thmlText(frag);
    expect(out, 'the sentence lost its object').toMatch(/mentioned in Acts xvii, 34 only/);
  });

  it('CONTROL — the tag itself is still gone, and attributes never leak into the text', () => {
    const frag = '<p>See <scripRef passage="Heb 12:24" osisRef="Bible:Heb.12.24">Heb 12:24</scripRef>.</p>';
    const out = thmlText(frag);
    expect(out).not.toMatch(/<|>|scripRef|osisRef|passage=/);
    expect(out).toBe('See Heb 12:24.');
  });

  it('CONTROL — <note> is still removed WITH its contents (a different element, different rule)', () => {
    // Guards the blast radius of this change: only scripRef's handling moves. If someone "tidies"
    // these two rules into one, footnote bodies start appearing mid-sentence in the corpus.
    const frag = '<p>Text<note place="foot">a footnote body</note> continues.</p>';
    expect(thmlText(frag)).not.toContain('a footnote body');
  });
});
