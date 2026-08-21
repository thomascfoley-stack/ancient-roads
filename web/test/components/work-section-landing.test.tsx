// @vitest-environment jsdom
//
// THE LANDING GLOW + MARGIN ORDINALS (order 2026-08-20-historians-study-entrance, fidelity
// pass 2026-08-21): the approved design promises two reader details the first ship omitted —
// "the landing passage gets a gold hairline… so you always know where the study dropped you",
// and quiet gold section numbers in the margin of history works (the board drew both). What is
// pinned:
//
//   * A section marked `landed` carries the gold-hairline marker; an unmarked one does not.
//     (The glow is DEEP-LINK arrivals only — the caller decides; this component just obeys.)
//   * A historian section shows its margin ordinal; a commentary section does not — the marks
//     are scoped to the register the design drew, not sprayed across every reader.
//   * THE RENDER INVARIANT HOLDS EITHER WAY: the data-section-text container's text nodes still
//     concatenate to EXACTLY section.body — all new chrome lives outside the container, or the
//     annotation engine's offsets shatter (work-reader's ★ invariant).

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkSection } from '@/components/work-section';

afterEach(cleanup);

const section = {
  id: 42,
  ordinal: 600,
  heading: 'Lecture VI — The Ecclesia at Ephesus',
  body: 'First paragraph of the lecture.\n\nSecond paragraph, still verbatim.',
} as never;

function containerText(root: HTMLElement): string {
  const el = root.querySelector('[data-section-text]')!;
  return el.textContent ?? '';
}

describe('WorkSection landing + margin marks', () => {
  it('a landed section carries the gold marker; a plain one does not', () => {
    const { container: a } = render(<WorkSection section={section} sourceType="historian" landed />);
    const { container: b } = render(<WorkSection section={section} sourceType="historian" />);
    expect(a.querySelector('section')!.className).toMatch(/border-accent/);
    expect(b.querySelector('section')!.className).not.toMatch(/border-accent/);
  });

  it('historian sections show the margin ordinal; other registers do not', () => {
    const { container: hist } = render(<WorkSection section={section} sourceType="historian" />);
    const { container: comm } = render(<WorkSection section={section} sourceType="commentary" />);
    const mark = hist.querySelector('[data-margin-ordinal]');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('600');
    expect(mark!.getAttribute('aria-hidden')).toBe('true');
    expect(comm.querySelector('[data-margin-ordinal]')).toBeNull();
  });

  it('the render invariant survives both marks: container text === section.body, exactly', () => {
    const { container } = render(<WorkSection section={section} sourceType="historian" landed />);
    expect(containerText(container as HTMLElement)).toBe(
      'First paragraph of the lecture.\n\nSecond paragraph, still verbatim.',
    );
  });
});
