// Attach `metadata.sectionOrdinal` to retrieval rows so an /ask result card can deep-link into
// the reader at the quoted section (/work/[slug]#s{ordinal}).
//
// RETRIEVAL ACCURACY IS UNTOUCHED BY CONSTRUCTION. This module only WRITES one metadata field on
// rows it is handed; it never reorders, filters, or adds a row, and nothing downstream —
// selectVoices, the composer, the verifier — reads the field. The accuracy gate (CLAUDE.md) is
// measured over the rows in retrieval order, and this cannot move it.
//
// Two sourceId shapes, two resolutions: a register-work id names its ordinal outright (parsed,
// no query); a classic-commentary id carries no section id, so those rows are resolved in ONE
// batch through lib/work.ts locateSections by (work, anchor range, body) equality.
//
// FAIL-SOFT. An ask must never fail because a deep link could not be resolved: any throw is
// logged once and the unresolved ordinals stay undefined; the card simply gets no link.
import type { RetrievedChunk } from './retrieve';
import { sectionOrdinalFromSourceId } from '@/lib/source-ordinal';
import { locateSections, type SectionLocator } from '@/lib/work';

export async function attachSectionOrdinals(rows: RetrievedChunk[]): Promise<void> {
  // The WHOLE body is inside the guard, not just the query: a malformed row (a non-string
  // sourceId, a null metadata) must not reject this promise either — teach() awaits it late, and
  // a rejection there would fail an ask over a deep link. The promise never rejects, by
  // construction, which is what makes deferring the await safe.
  try {
    const pending: { row: RetrievedChunk; loc: SectionLocator }[] = [];
    for (const row of rows) {
      const parsed = sectionOrdinalFromSourceId(row.sourceId);
      if (parsed !== null) {
        row.metadata.sectionOrdinal = parsed;
        continue;
      }
      const { work, verseId, verseEnd } = row.metadata;
      if (work && typeof verseId === 'number') {
        pending.push({
          row,
          loc: { work, verseId, verseEnd: typeof verseEnd === 'number' ? verseEnd : verseId, content: row.content },
        });
      }
    }
    if (pending.length === 0) return;
    const found = await locateSections(pending.map((p) => p.loc));
    pending.forEach((p, i) => {
      const ordinal = found[i];
      if (ordinal !== null && ordinal !== undefined) p.row.metadata.sectionOrdinal = ordinal;
    });
  } catch (e) {
    console.error('section-locate: ordinals left unresolved:', (e as Error).message);
  }
}
