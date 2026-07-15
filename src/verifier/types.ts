import type { Origin, VerseRange } from '../contract/types';

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
  // The canonical verse range this section is actually indexed to (what the source
  // is commenting ON). The verifier requires a voice block's anchors to intersect this,
  // so a model can't quote a real Genesis section and anchor it to Revelation to sneak an
  // unrelated passage past passages_grounded (LONG_NIGHT H2). Optional: legacy/CLI lookups
  // that don't supply it fall back to structural-only anchor validation.
  verses?: VerseRange;
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
  // Verse ranges the QUERY itself named — resolveIntent(query).inject. A passages
  // block item is "grounded" iff it intersects one of these OR a voice-block anchor;
  // otherwise it is the model's own uncited selection and the verifier fails closed
  // (the passages_grounded screen). Optional/defaults to [] so callers that predate
  // the screen (and topical queries, which resolve to nothing) still typecheck.
  queryRanges?: VerseRange[];
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
