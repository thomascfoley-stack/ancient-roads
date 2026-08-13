import {
  blockRenderState,
  TOMBSTONE_NOTICE,
  type ServabilityKeyed,
  type ServabilityResolution,
} from './servability';
import { clippingDisplay } from './clipping-display';

// Study → markdown (design Flow E; build task 1.7). "Durable body of work" includes taking it
// with you — the export ships with the first slice, and its serialization is the seam the §12
// composition future (export to Google Docs) reuses.
//
// A PURE, DETERMINISTIC function over the bounded read (listAllBlocksForExport) plus a
// servability resolution: same inputs, same bytes, no clock, no I/O. Export is a RENDER PATH,
// so both Flow D legs apply here exactly as on screen: the data-state tombstone and the
// re-check belt arrive via the ONE shared rule in servability.ts (blockRenderState) — this
// module never re-derives licensing, it only formats what that rule says may be shown.
// A caller that skips resolveServability() has no resolution to pass, so the belt cannot be
// forgotten by accident.

export interface ExportBlock extends ServabilityKeyed {
  kind: 'text' | 'clipping';
  body: string | null;
  quote: string | null;
  attribution: { author?: string; work_title?: string; reference?: string } | null;
  /** Trim offsets (111): exports show the same excerpt the editor shows, ellipses included. */
  trim_start?: number | null;
  trim_end?: number | null;
}

function attributionLine(attribution: ExportBlock['attribution']): string {
  const author = attribution?.author?.trim();
  const title = attribution?.work_title?.trim();
  const reference = attribution?.reference?.trim();
  const name = [author, title ? `*${title}*` : undefined].filter(Boolean).join(', ');
  const ref = reference ? ` (${reference})` : '';
  return `— ${name || 'Unknown source'}${ref}`;
}

/** Prefix every line (including blank ones) so multi-paragraph quotes stay one blockquote. */
function blockquote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n');
}

/**
 * Serialize a study to markdown: title, then blocks in the caller's (position, id) order —
 * text verbatim, clippings as blockquote + attribution line, tombstones as attribution +
 * notice with no quote and no link.
 */
export function exportStudyMarkdown(
  study: { title: string },
  blocks: readonly ExportBlock[],
  resolution: ServabilityResolution,
): string {
  const parts: string[] = [`# ${study.title.trim() || 'Untitled study'}`];
  for (const block of blocks) {
    const state = blockRenderState(block, resolution);
    if (state === 'text') {
      parts.push((block.body ?? '').trim());
    } else if (state === 'clipping') {
      // The ONE trim rule (clipping-display): the export carries the same excerpt the editor
      // shows — never a range of its own devising.
      parts.push(`${blockquote(clippingDisplay(block).text.trim())}\n>\n> ${attributionLine(block.attribution)}`);
    } else {
      parts.push(`> ${attributionLine(block.attribution)} — ${TOMBSTONE_NOTICE}`);
    }
  }
  return parts.filter((p) => p !== '').join('\n\n') + '\n';
}
