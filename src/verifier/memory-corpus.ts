// In-memory CorpusLookup for tests and the offline eval harness. Production
// swaps this for a Postgres-backed implementation with the same interface.

import type { Origin } from '../contract/types.js';
import type { CorpusLookup, ResolvedSection, ResolvedTranslation } from './types.js';

export interface MemoryCorpusData {
  sections: ResolvedSection[];
  translations: ResolvedTranslation[];
  // Verse existence: for fixtures, treat any structurally valid verse as
  // existing unless listed in missingVerses. Real lookups query the verses table.
  missingVerses?: Array<{ translation: string; verseId: number }>;
}

export function createMemoryCorpus(data: MemoryCorpusData): CorpusLookup {
  const sectionKey = (id: number, origin: Origin) => `${origin}:${id}`;
  const sections = new Map(data.sections.map((s) => [sectionKey(s.id, s.origin), s]));
  const sources = new Map(data.sections.map((s) => [s.source.id, s.source]));
  const translations = new Map(data.translations.map((t) => [t.slug, t]));
  const missing = new Set((data.missingVerses ?? []).map((m) => `${m.translation}:${m.verseId}`));

  return {
    async getSection(sectionId, origin) {
      return sections.get(sectionKey(sectionId, origin)) ?? null;
    },
    async getSource(sourceId) {
      const s = sources.get(sourceId);
      return s ? { id: s.id, author: s.author, title: s.title } : null;
    },
    async getTranslation(slug) {
      return translations.get(slug) ?? null;
    },
    async verseExists(translationSlug, verseId) {
      return translations.has(translationSlug) && !missing.has(`${translationSlug}:${verseId}`);
    },
  };
}
