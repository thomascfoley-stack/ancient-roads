// @vitest-environment jsdom
//
// B047 — A SELECTION THAT CROSSES A VERSE BOUNDARY STILL PRODUCES OFFSETS.
//
// Filed as "Highlight color/action popover does not mount when a drag-selection crosses a verse
// boundary". Confirmed, with the exact line: `rangeToOffsetsInContainer` opened with
//
//   if (!container.contains(range.startContainer) || !container.contains(range.endContainer))
//     return null;
//
// `useTextAnnotation` resolves its target from `range.startContainer`, so a drag ending in the
// NEXT verse hands that guard an end node the start verse does not contain. It returned null,
// `pending` became null, and nothing mounted. The reader drags, releases, and the app does nothing
// at all — no popover, no message.
//
// THE FIX IS TO CLAMP, NOT TO SPAN. Highlights are stored per verse (`Map<verse, StoredSpan[]>`),
// so a true multi-verse highlight is buildable — but it changes the shape `useTextAnnotation`
// returns, and that hook also serves `work-section.tsx` and `work-beside-tradition.tsx`. That is a
// design change across three surfaces, not a bug fix, and it is filed rather than smuggled in.
// Clamping is not silent: the highlight paints on the first verse only, which is visible feedback
// about exactly what happened. "Does less than asked, and shows you" beats "does nothing, silently".
//
// TESTED AT THE PURE FUNCTION, deliberately. A first draft drove the React hook through
// `renderHook` + a stubbed `window.getSelection`, and it failed on its own CONTROL case — the
// single-verse selection that works in the product every day. That is a harness fault, and a test
// whose control cannot pass proves nothing about the case it targets. The clamp is pure
// arithmetic over a Range and a container; testing it there removes the React plumbing from the
// question entirely.

import { describe, expect, it } from 'vitest';
import { rangeToOffsetsInContainer } from '../../src/lib/highlight-range';

function verses() {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  const v1 = document.createElement('span');
  v1.setAttribute('data-verse-text', '1');
  v1.append(document.createTextNode('In the beginning was the Word'));
  const v2 = document.createElement('span');
  v2.setAttribute('data-verse-text', '2');
  v2.append(document.createTextNode('The same was in the beginning with God'));
  root.append(v1, v2);
  document.body.append(root);
  return { root, v1, v2 };
}

const len = (el: Element) => (el.textContent ?? '').length;

describe('B047 — a range ending outside the container clamps instead of vanishing', () => {
  it('a cross-verse drag yields offsets bounded by the FIRST verse', () => {
    // SEED: restore the `|| !container.contains(range.endContainer)` half of the guard -> RED,
    // and the failure is `null` — which is the product doing nothing at all on release.
    const { v1, v2 } = verses();
    const r = document.createRange();
    r.setStart(v1.firstChild!, 3);
    r.setEnd(v2.firstChild!, 8);

    const out = rangeToOffsetsInContainer(r, v1, len(v1));
    expect(out, 'a cross-verse drag produced no offsets').not.toBeNull();
    expect(out!.start).toBe(3);
    // Clamped to this verse's own end — it must not have run on into verse 2's text.
    expect(out!.end).toBe(len(v1));
  });

  it('a selection wholly inside ONE verse is unchanged', () => {
    // The control. The ordinary path is the whole surface working today and must not move.
    const { v1 } = verses();
    const r = document.createRange();
    r.setStart(v1.firstChild!, 3);
    r.setEnd(v1.firstChild!, 16);
    expect(rangeToOffsetsInContainer(r, v1, len(v1))).toEqual({ start: 3, end: 16 });
  });

  it('a range that STARTS outside the container is still refused', () => {
    // Clamping the end is a repair; clamping the start would be a guess about which verse the
    // reader meant. `useTextAnnotation` resolves the target from the start node, so a start
    // outside the container means the caller asked about the wrong container.
    const { v1, v2 } = verses();
    const r = document.createRange();
    r.setStart(v1.firstChild!, 3);
    r.setEnd(v2.firstChild!, 8);
    expect(rangeToOffsetsInContainer(r, v2, len(v2))).toBeNull();
  });
});
