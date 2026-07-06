// TypeScript mirror of src/contract/schema.json (contract v1.1).
// The JSON schema is authoritative; keep these in sync.

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
  year?: number;
  tradition: string;
  origin: Origin;
}

export interface VoiceBlock {
  type: 'voice';
  section_id: number;
  attribution: Attribution;
  quote: string;
  summary: string;
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
