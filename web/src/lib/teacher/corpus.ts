import { decodeVerseId } from '@bible/verse-id';
import { webVerseCounts } from '@bible/verse-counts';
import type { CorpusLookup } from '@/verifier/types';
import type { RetrievedChunk } from './retrieve';

// Builds the verifier's CorpusLookup from a retrieval set. Sections are the
// retrieved chunks, indexed 1..N (the section_id the composer is told to cite),
// so the verifier's quote/attribution checks resolve against exactly what the
// model was shown — it cannot cite outside the retrieval set.
//
// verseExists is REAL (unlike the CLI stub): a passage verse must fall within
// the WEB versification's verse count for its book/chapter. This restores the
// verifier's passage_exists guard on the teacher path.
export function buildCorpusLookup(retrieval: RetrievedChunk[]): CorpusLookup {
  const sections = new Map(
    retrieval.map((r, i) => {
      const id = i + 1;
      return [
        `corpus:${id}`,
        {
          id,
          body: r.content,
          origin: 'corpus' as const,
          source: {
            id,
            author: r.metadata.author,
            title: r.metadata.sourceTitle,
            tradition: r.metadata.tradition ?? 'unknown',
          },
          // The verse range this chunk is indexed to — the verifier grounds voice-block
          // anchors against it (LONG_NIGHT H2), so a fabricated cross-book anchor is rejected.
          verses: { start: r.metadata.verseId, end: r.metadata.verseEnd },
        },
      ];
    }),
  );

  return {
    async getSection(sectionId, origin) {
      return sections.get(`${origin}:${sectionId}`) ?? null;
    },
    async getSource(sourceId) {
      const s = sections.get(`corpus:${sourceId}`);
      return s ? { id: s.id, author: s.source.author, title: s.source.title } : null;
    },
    async getTranslation(slug) {
      // WEB is the one translation licensed for teacher display today.
      if (slug === 'web') return { slug: 'web', isActive: true, licensedForDisplay: true };
      return null;
    },
    async verseExists(_slug, verseId) {
      const { book, chapter, verse } = decodeVerseId(verseId);
      const count = webVerseCounts.verseCount(book, chapter);
      return count !== undefined && verse >= 1 && verse <= count;
    },
  };
}
