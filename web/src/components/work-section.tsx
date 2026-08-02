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
import { splitBodyParagraphs, sectionLabel } from '@/lib/work-reader';
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

/** Registers whose line breaks are SEMANTIC. In verse the line is the unit of the form, so a
 *  single "\n" must render as a line break; in prose the same character is a source hard-wrap
 *  artifact (maclaren stores "…after our likeness;\nand let them have dominion…") and must
 *  collapse. Anything unrecognised collapses — the safe side, since a wrongly-preserved
 *  newline shatters a sentence while a wrongly-collapsed one only loses a line break. */
const LINEATED_REGISTERS = new Set(['hymn', 'poetry']);

export function WorkSection({
  section,
  spans,
  registerEl,
  sourceType,
}: {
  section: WorkSectionRow;
  /** Local (Phase-2, unpersisted) highlight preview ranges, as offsets into section.body. */
  spans?: HighlightRange[];
  /** Windowing hook: the reader tracks rendered elements for measurement/active-section. */
  registerEl?: (ordinal: number, el: HTMLElement | null) => void;
  /** The work's `source_type`. Decides whether newlines inside a paragraph are rendered
   *  (verse) or collapsed (prose) — CSS only, so the render invariant above is untouched:
   *  the character stream is identical either way. */
  sourceType?: string;
}) {
  const paragraphs = splitBodyParagraphs(section.body);
  const sectionHeading = sectionLabel(section);
  // CSS-only: `pre-wrap` renders the newlines ALREADY PRESENT in the text nodes and still
  // wraps long lines. It adds and drops nothing, so text nodes keep concatenating to exactly
  // section.body and every highlight offset stays valid.
  const bodyWhitespace = LINEATED_REGISTERS.has(sourceType ?? '') ? ' whitespace-pre-wrap' : '';
  const segments = spans?.length ? flattenToSegments(section.body.length, spans) : null;

  let offset = 0;
  return (
    <section
      id={`s${section.ordinal}`}
      data-section-ordinal={section.ordinal}
      ref={(el) => registerEl?.(section.ordinal, el)}
      className="scroll-mt-24"
    >
      {/* The heading a reader sees. `heading` alone left every commentary section untitled --
          the column is null for all of them (migrate-sections-slice.ts never wrote it), so a
          reader scrolling Matthew Henry saw unbroken prose with no indication of which verse
          they were on. `sectionLabel` falls through to the passage. */}
      {sectionHeading && (
        <h2 className="mb-3 mt-10 font-scripture text-xl font-medium leading-snug text-stone-800 dark:text-stone-100">
          {sectionHeading}
        </h2>
      )}
      {/* The annotatable container: text nodes here concatenate to EXACTLY section.body. */}
      <div data-section-text={section.id}>
        {paragraphs.map((slice, pi) => {
          const start = offset;
          offset += slice.length;
          return (
            <p key={pi} className={`mb-5 last:mb-0${bodyWhitespace}`}>
              {segments ? renderClippedSegments(segments, section.body, start, start + slice.length) : slice}
            </p>
          );
        })}
      </div>
    </section>
  );
}
