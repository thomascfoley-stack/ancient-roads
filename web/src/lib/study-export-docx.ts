import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import {
  blockRenderState,
  TOMBSTONE_NOTICE,
  type ServabilityResolution,
} from './servability';
import type { ServabilityKeyed } from './servability';
import { clippingDisplay } from './clipping-display';

// Study → Word (.docx) — editor v2, owner requirement 2026-08-12 ("export as a Microsoft Word
// document or PDF … we cannot export a .md file"). Export is a RENDER PATH, so every block
// passes through the ONE shared licensing rule (blockRenderState) — formats can disagree about
// styling, never about what text may appear. The `docx` dependency was surfaced and
// owner-approved with the requirement. (The markdown serializer this module once sat beside
// was removed 2026-08-21 with the md export type — same owner, enforcing the ruling above.)
//
// TWO LAYERS ON PURPOSE. `studyExportModel` is a pure, dependency-free description of the
// document (tested directly); `exportStudyDocx` maps that model onto docx primitives and packs
// it, and the print view renders the same model as HTML. A licensing bug can only live in the
// model layer, where the tests are.
//
// Text blocks are the user's prose, exported as plain paragraphs (split on blank lines) —
// markdown SYNTAX is not interpreted in v1; the user's prose is what Word receives.

/** A block as the bounded export read returns it. Moved here from study-export.ts (deleted). */
export interface ExportBlock extends ServabilityKeyed {
  kind: 'text' | 'clipping';
  body: string | null;
  quote: string | null;
  attribution: { author?: string; work_title?: string; reference?: string } | null;
  /** Trim offsets (111): exports show the same excerpt the editor shows, ellipses included. */
  trim_start?: number | null;
  trim_end?: number | null;
}

export type ExportNode =
  | { type: 'title'; text: string }
  | { type: 'body'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'attribution'; text: string }
  | { type: 'notice'; text: string };

function attributionText(attribution: ExportBlock['attribution']): string {
  const author = attribution?.author?.trim();
  const title = attribution?.work_title?.trim();
  const reference = attribution?.reference?.trim();
  const name = [author, title].filter(Boolean).join(', ');
  return `— ${name || 'Unknown source'}${reference ? ` (${reference})` : ''}`;
}

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

/** The pure document model — deterministic over (blocks, resolution), licensing decided by the
 *  shared rule, nothing else. */
export function studyExportModel(
  study: { title: string },
  blocks: readonly ExportBlock[],
  resolution: ServabilityResolution,
): ExportNode[] {
  const nodes: ExportNode[] = [{ type: 'title', text: study.title.trim() || 'Untitled study' }];
  for (const block of blocks) {
    const state = blockRenderState(block, resolution);
    if (state === 'text') {
      for (const p of paragraphsOf(block.body ?? '')) nodes.push({ type: 'body', text: p });
    } else if (state === 'clipping') {
      // The ONE trim rule (clipping-display) — the .docx and the print view (which renders
      // this model) show exactly the excerpt every other surface shows.
      for (const p of paragraphsOf(clippingDisplay(block).text)) nodes.push({ type: 'quote', text: p });
      nodes.push({ type: 'attribution', text: attributionText(block.attribution) });
    } else {
      nodes.push({ type: 'attribution', text: attributionText(block.attribution) });
      nodes.push({ type: 'notice', text: TOMBSTONE_NOTICE });
    }
  }
  return nodes;
}

const QUOTE_INDENT = 480; // twentieths of a point: a third of an inch, Word's block-quote look

function toParagraph(node: ExportNode): Paragraph {
  switch (node.type) {
    case 'title':
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.LEFT,
        spacing: { after: 240 },
        children: [new TextRun({ text: node.text })],
      });
    case 'body':
      return new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: node.text })],
      });
    case 'quote':
      return new Paragraph({
        indent: { left: QUOTE_INDENT },
        spacing: { after: 120 },
        children: [new TextRun({ text: node.text })],
      });
    case 'attribution':
      return new Paragraph({
        indent: { left: QUOTE_INDENT },
        spacing: { after: 240 },
        children: [new TextRun({ text: node.text, italics: true })],
      });
    case 'notice':
      return new Paragraph({
        indent: { left: QUOTE_INDENT },
        spacing: { after: 240 },
        children: [new TextRun({ text: node.text, italics: true })],
      });
  }
}

/** Pack the study as a .docx buffer. Deterministic content; the belt arrived via the model. */
export async function exportStudyDocx(
  study: { title: string },
  blocks: readonly ExportBlock[],
  resolution: ServabilityResolution,
): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: studyExportModel(study, blocks, resolution).map(toParagraph) }],
  });
  return Packer.toBuffer(doc);
}
