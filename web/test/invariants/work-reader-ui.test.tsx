// @vitest-environment jsdom

// The container-concat invariant (docs/LIBRARY_READER_DESIGN.md §3 — owner-mandated):
// a WorkSection's data-section-text container must hold text nodes that concatenate to
// EXACTLY sections.body, or annotation offsets walked from the DOM drift off the canonical
// text. This is the render half of the Phase-1 offset invariant (the other half, the anchor
// math, is tested in highlight-range.test.ts). Seeding a one-character change in the render
// (drop/insert) turns the very first assertion red.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkSection } from '@/components/work-section';
import type { WorkSectionRow } from '@/lib/work';

// vitest runs with globals:false, so RTL's auto-cleanup never registers — without this,
// renders accumulate in document.body and querySelector sees stale sections.
afterEach(cleanup);

function sectionWith(body: string, heading: string | null = 'On Faith'): WorkSectionRow {
  return { id: 42, ordinal: 7, unitOrdinal: 3, heading, body };
}

function textContainer(): HTMLElement {
  const el = document.querySelector('[data-section-text="42"]');
  expect(el, 'the data-section-text container must exist').not.toBeNull();
  return el as HTMLElement;
}

describe('WorkSection — container-concat invariant (§3)', () => {
  it('textContent EXACTLY equals a multi-paragraph body with markup-ish characters', () => {
    const body =
      'First paragraph with <markup> & an *asterisk* pair.\n\n' +
      'Second paragraph — “quoted”, with  two   spaces.\n\n\n' +
      'Third paragraph, after a wider gap.';
    render(<WorkSection section={sectionWith(body)} />);

    const container = textContainer();
    // THE invariant: byte-for-byte, no inserted or dropped characters.
    expect(container.textContent).toBe(body);
    // Paragraphing happened (3 <p>s) without changing the text...
    expect(container.querySelectorAll('p')).toHaveLength(3);
    // ...and markup-looking text was rendered as TEXT, never live HTML.
    expect(container.querySelector('markup')).toBeNull();
  });

  it('keeps the heading OUTSIDE the text container (chrome must not pollute offsets)', () => {
    const body = 'Body words only.\n\nMore body.';
    render(<WorkSection section={sectionWith(body, 'The Heading')} />);

    expect(textContainer().textContent).toBe(body);
    expect(textContainer().textContent).not.toContain('The Heading');
    // The heading still renders — just outside the annotatable container.
    expect(document.querySelector('h2')?.textContent).toBe('The Heading');
  });

  it('stays exact through the highlight-segment path, even across a paragraph boundary', () => {
    const body = 'Alpha beta gamma.\n\nDelta epsilon zeta.';
    // A wash that starts mid-paragraph-1 and ends mid-paragraph-2: clips both slices.
    const spans = [{ start: 6, end: 24, color: 'yellow' }];
    render(<WorkSection section={sectionWith(body)} spans={spans} />);

    expect(textContainer().textContent).toBe(body);
    // The wash actually rendered (soft color wash behind the words, §10.1).
    expect(textContainer().textContent?.length).toBe(body.length);
  });

  it('a body with no blank lines renders as one exact paragraph', () => {
    const body = 'One single paragraph, nothing more.';
    render(<WorkSection section={sectionWith(body, null)} />);
    expect(textContainer().textContent).toBe(body);
    expect(textContainer().querySelectorAll('p')).toHaveLength(1);
  });
});
