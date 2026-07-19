'use client';

// One section in the Book Reader's reading column (design §2/§10.1: comfortable measure,
// serif body, same reading idiom as the Bible reader).
//
// ★ RENDER INVARIANT (§3, owner-mandated — tested by test/invariants/work-reader-ui.test.tsx):
// the data-section-text container's text nodes concatenate to EXACTLY section.body. The
// shared annotation engine (useTextAnnotation → rangeToOffsetsInContainer) walks those text
// nodes to derive offsets into the canonical body, so the render must never insert or drop a
// character:
//   * the heading and all chrome live OUTSIDE the container;
//   * each <p> carries its exact body slice INCLUDING trailing separator whitespace
//     (splitBodyParagraphs), so paragraphing adds no characters;
//   * highlight segments are clipped to their paragraph slice (flatten-then-clip, the same
//     segment idiom as VerseDisplay — never string-splicing);
//   * body text is interpolated as TEXT, never HTML — ingest markup-ish characters render
//     escaped and stay byte-identical in textContent.

import { HIGHLIGHT_BG } from '@/lib/highlight-colors';
import { flattenToSegments, type HighlightRange, type Segment } from '@/lib/highlight-range';
import { splitBodyParagraphs } from '@/lib/work-reader';
import type { WorkSectionRow } from '@/lib/work';

/** The paragraph slice [start, end) of `body` rendered through the highlight tiling: every
 *  segment's intersection with the slice, in order. The pieces concatenate to exactly
 *  body.slice(start, end) because the segments tile [0, body.length] contiguously. */
function renderClippedSegments(segments: Segment[], body: string, start: number, end: number) {
  const out: React.ReactNode[] = [];
  let i = 0;
  for (const seg of segments) {
    const lo = Math.max(seg.start, start);
    const hi = Math.min(seg.end, end);
    if (lo >= hi) continue;
    const text = body.slice(lo, hi);
    out.push(
      seg.color ? (
        <span key={i} className={`rounded-[3px] ${HIGHLIGHT_BG[seg.color] ?? ''}`}>
          {text}
        </span>
      ) : (
        <span key={i}>{text}</span>
      ),
    );
    i++;
  }
  return out;
}

export function WorkSection({
  section,
  spans,
  registerEl,
}: {
  section: WorkSectionRow;
  /** Local (Phase-2, unpersisted) highlight preview ranges, as offsets into section.body. */
  spans?: HighlightRange[];
  /** Windowing hook: the reader tracks rendered elements for measurement/active-section. */
  registerEl?: (ordinal: number, el: HTMLElement | null) => void;
}) {
  const paragraphs = splitBodyParagraphs(section.body);
  const segments = spans?.length ? flattenToSegments(section.body.length, spans) : null;

  let offset = 0;
  return (
    <section
      id={`s${section.ordinal}`}
      data-section-ordinal={section.ordinal}
      ref={(el) => registerEl?.(section.ordinal, el)}
      className="scroll-mt-24"
    >
      {section.heading && (
        <h2 className="mb-3 mt-10 font-scripture text-xl font-medium leading-snug text-stone-800 dark:text-stone-100">
          {section.heading}
        </h2>
      )}
      {/* The annotatable container: text nodes here concatenate to EXACTLY section.body. */}
      <div data-section-text={section.id}>
        {paragraphs.map((slice, pi) => {
          const start = offset;
          offset += slice.length;
          return (
            <p key={pi} className="mb-5 last:mb-0">
              {segments ? renderClippedSegments(segments, section.body, start, start + slice.length) : slice}
            </p>
          );
        })}
      </div>
    </section>
  );
}
