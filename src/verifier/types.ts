import type { Origin } from '../contract/types.js';

// What the verifier needs to know about a resolved section. In production
// this comes from Postgres (sections join sources, or user_sections join
// user_documents); in tests, from an in-memory fixture.
export interface ResolvedSection {
  id: number;
  body: string;
  origin: Origin;
  source: {
    id: number;
    author: string;
    title: string; // source title; attribution.work may also match section heading
    tradition: string;
  };
  heading?: string;
}

export interface ResolvedTranslation {
  slug: string;
  isActive: boolean;
  licensedForDisplay: boolean;
}

export interface CorpusLookup {
  getSection(sectionId: number, origin: Origin): Promise<ResolvedSection | null>;
  getSource(sourceId: number): Promise<{ id: number; author: string; title: string } | null>;
  getTranslation(slug: string): Promise<ResolvedTranslation | null>;
  verseExists(translationSlug: string, verseId: number): Promise<boolean>;
}

// What retrieval returned for this query — the diversity rule is judged
// against what was available, not against the whole corpus.
export interface RetrievalContext {
  sectionIds: number[];
  traditions: string[]; // distinct traditions present in the retrieval set
}

export interface TeacherContractConfig {
  minVoices: number; // default 3
  minTraditions: number; // default 2
}

export const DEFAULT_CONTRACT_CONFIG: TeacherContractConfig = {
  minVoices: 3,
  minTraditions: 2,
};

export interface Violation {
  check: string; // e.g. 'schema', 'quote_verbatim', 'screen:I3'
  blockIndex?: number;
  message: string;
  span?: string;
}

export type VerifierResult =
  | { ok: true }
  | { ok: false; violations: Violation[] };
