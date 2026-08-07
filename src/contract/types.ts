// TypeScript mirror of src/contract/schema.json (contract v1.1).
// The JSON schema is authoritative; keep these in sync.
//
// The contract exists to enforce the north-star spec docs/PRINCIPLES.md: the
// response shape forces cited voices (never assistant-voice interpretation),
// corpus-resolvable attribution (C1), and enough structure to meet the
// grounded-example floor (G1).

export type ContractVersion = '1.0' | '1.1';
export type Origin = 'corpus' | 'user_library';

export interface VerseRange {
  start: number; // canonical verse ID
  end: number;
}

export interface FramingBlock {
  type: 'framing';
  text: string;
}

export interface Attribution {
  author: string;
  work: string;
  // The work's library slug, e.g. "adam-clarke" — present only when the retrieved
  // section's metadata carries one (see register-label-embeddings.mjs backfill).
  // Lets the client link a quote back to the work; absence means "not clickable",
  // never a broken link.
  slug?: string;
  year?: number;
  tradition: string;
  origin: Origin;
}

export interface VoiceBlock {
  type: 'voice';
  section_id: number;
  attribution: Attribution;
  quote: string;
  // Optional (contract 1.1+): the composer is extractive — the verbatim quote
  // carries the substance. When present, summary is a thin, screened pointer to
  // the quote's topic, never a paraphrase. Omitting it is preferred (less drift).
  summary?: string;
  anchors?: VerseRange[];
}

export interface PassageItem extends VerseRange {
  translation: string; // translation slug, e.g. 'web'
}

export interface PassagesBlock {
  type: 'passages';
  items: PassageItem[];
}

export interface ReadingItem {
  source_id: number;
  title: string;
  author: string;
  note?: string;
}

export interface ReadingBlock {
  type: 'reading';
  items: ReadingItem[];
}

export interface PrayerPromptBlock {
  type: 'prayer_prompt';
  text: string;
}

export type Block =
  | FramingBlock
  | VoiceBlock
  | PassagesBlock
  | ReadingBlock
  | PrayerPromptBlock;

export interface TeacherResponse {
  contract_version: ContractVersion;
  teacher: string;
  blocks: Block[];
}
