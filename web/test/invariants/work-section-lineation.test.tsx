// @vitest-environment jsdom
//
// LINEATION — verse must keep its line breaks; prose must not gain any.
// Ship-committee LENS 1, BROKEN #3.
//
// The defect: `work-section.tsx` splits a body into paragraphs on BLANK lines only
// (`splitBodyParagraphs`), and the <p> inherits `white-space: normal`, which collapses a
// single "\n" to a space. So a hymn whose lines are separated by single newlines renders as
// one prose blob with the stanza numbers inline:
//   "1 Behold the glories of the Lamb Amidst his Father's throne Prepare new honours…"
// `olney-hymns` escaped only because its source happens to use blank lines between lines.
//
// The fix cannot be a blanket `white-space: pre-wrap`. Real prose in this corpus is
// HARD-WRAPPED at the source — `maclaren-expositions` stores
// "…after our likeness;\nand let them have dominion over the fish…" — so preserving every
// newline everywhere would shatter prose mid-sentence. The newline means different things in
// the two registers: in verse the line is the unit; in prose it is a wrap artifact.
// So lineation is preserved for hymn/poetry ONLY, keyed off the work's source_type.
//
// THE RENDER INVARIANT IS THE HARD CONSTRAINT (work-section.tsx §3, owner-mandated): the
// data-section-text container's text nodes must concatenate to EXACTLY section.body, because
// useTextAnnotation derives highlight offsets by walking them. A fix that inserted <br> text,
// stripped a "\n", or re-joined lines would silently corrupt every highlight on the page.
// A CSS-only fix adds and drops nothing — these tests assert that in BOTH registers.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WorkSection } from '@/components/work-section';
import type { WorkSectionRow } from '@/lib/work';

/** A watts-hymns-shaped body: single newlines, no blank lines (the real failing case). */
const VERSE_BODY =
  'A new song to the Lamb that was slain.\nRev. 5. 6 8 9 10 12.\n1 Behold the glories of the Lamb\n'
  + "Amidst his Father's throne\nPrepare new honours for his name,\nAnd songs before unknown.";

/** A maclaren-expositions-shaped body: hard-wrapped prose, single newlines mid-sentence. */
const PROSE_BODY =
  'THE VISION OF CREATION\n‘And God said, Let us make man in our image, after our likeness;\n'
  + 'and let them have dominion over the fish of the sea, and over the fowl of the air.’';

// No `as` cast: the interface is the contract, and a cast is exactly how the first version of
// this helper shipped a red CI. It used the DB column name `unit_ordinal`, but WorkTocRow
// declares the camelCase `unitOrdinal`, so the object never overlapped the target type. The app
// tsconfig let it through; `tsconfig.test.json` (audit.sh gate 3) did not.
function row(body: string): WorkSectionRow {
  return { id: 1, ordinal: 1, unitOrdinal: 1, heading: null, body };
}

/** The computed white-space of every rendered paragraph. */
function paragraphWhiteSpace(container: HTMLElement): string[] {
  return [...container.querySelectorAll('p')].map((p) => p.className);
}

describe('work-section lineation — verse keeps its lines, prose keeps its flow', () => {
  it('VERSE: a hymn body with single newlines renders with lineation preserved', () => {
    const { container } = render(<WorkSection section={row(VERSE_BODY)} sourceType="hymn" />);
    const classes = paragraphWhiteSpace(container);
    expect(classes.length).toBeGreaterThan(0);
    // Would have FAILED before the fix: no paragraph carried a pre-wrap class, so every
    // "\n" collapsed and the hymn rendered as one run-on line.
    expect(
      classes.every((c) => c.includes('whitespace-pre-wrap')),
      `hymn paragraphs must preserve newlines; got classes ${JSON.stringify(classes)}`,
    ).toBe(true);
  });

  it('VERSE: poetry gets the same treatment as hymn', () => {
    const { container } = render(<WorkSection section={row(VERSE_BODY)} sourceType="poetry" />);
    expect(paragraphWhiteSpace(container).every((c) => c.includes('whitespace-pre-wrap'))).toBe(true);
  });

  it('PROSE: a hard-wrapped commentary body does NOT get its newlines hardened', () => {
    const { container } = render(<WorkSection section={row(PROSE_BODY)} sourceType="commentary" />);
    const classes = paragraphWhiteSpace(container);
    expect(classes.length).toBeGreaterThan(0);
    // Would FAIL if the fix were a blanket pre-wrap: maclaren's mid-sentence wrap
    // "…after our likeness;\nand let them have dominion…" would break into two lines.
    expect(
      classes.every((c) => !c.includes('whitespace-pre-wrap')),
      `prose paragraphs must let newlines collapse; got classes ${JSON.stringify(classes)}`,
    ).toBe(true);
  });

  it('PROSE: an unknown/absent source_type collapses (fails to the safe side)', () => {
    const { container } = render(<WorkSection section={row(PROSE_BODY)} />);
    expect(paragraphWhiteSpace(container).every((c) => !c.includes('whitespace-pre-wrap'))).toBe(true);
  });

  // ── The render invariant. This is what makes the fix safe to ship: highlight offsets are
  // derived by walking these text nodes, so a single added or dropped character silently
  // mis-places every annotation in the section.
  for (const [label, body, sourceType] of [
    ['verse', VERSE_BODY, 'hymn'],
    ['prose', PROSE_BODY, 'commentary'],
  ] as const) {
    it(`RENDER INVARIANT (${label}): container text nodes concatenate to EXACTLY section.body`, () => {
      const { container } = render(<WorkSection section={row(body)} sourceType={sourceType} />);
      const el = container.querySelector('[data-section-text]');
      expect(el).not.toBeNull();
      expect(el!.textContent).toBe(body);
      // and specifically: every newline survives in the text layer, in both registers —
      // the difference is CSS only, never the character stream.
      expect((el!.textContent!.match(/\n/g) ?? []).length).toBe((body.match(/\n/g) ?? []).length);
    });
  }
});
