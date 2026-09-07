// Shapes mirrored from the server (the client only renders; the server verifier is truth).
// Split out of ask-client.tsx in the 2026-09-06 redesign so the render pieces can live in their
// own files without importing the state machine.

// `origin` is optional for backward compatibility with answers stored before Slice 4; an absent
// origin renders exactly as before (a corpus voice).
export interface Attribution { author: string; work: string; slug?: string; tradition: string; year?: number; origin?: 'corpus' | 'user_library' }
export type Block =
  | { type: 'framing'; text: string }
  | { type: 'voice'; attribution: Attribution; quote: string; summary?: string; anchors?: { start: number; end: number }[] }
  | { type: 'passages'; items: { start: number; end: number; translation: string }[] }
  | { type: 'prayer_prompt'; text: string };

export interface SourcePreview { sourceId: string; author: string; sourceTitle: string; tradition: string | null; content: string; score: number }
// The retrieval row as the server ships it. `work`, `verseId`/`verseEnd` and `sectionOrdinal` are
// what a result link needs to open the book at the quoted section (2026-09-06); they were always
// on the wire, this interface just used to hide them.
export interface Retrieved {
  sourceId: string;
  score: number;
  content: string;
  metadata: { author: string; sourceTitle: string; tradition: string | null; work?: string; verseId?: number; verseEnd?: number; sectionOrdinal?: number };
}
// Register-lane chunk (song/verse, sermon, theology) — verbatim corpus text surfaced in its OWN
// labeled section, never blended into the exegetical voices.
export interface LaneChunk { sourceId: string; content: string; metadata: { author: string; sourceTitle: string; work?: string; register?: string; paraphrase?: boolean } }
export interface Lanes { song_verse?: LaneChunk[]; sermons?: LaneChunk[]; theology?: LaneChunk[]; historians?: LaneChunk[] }
export type TeacherResult =
  | ({ kind: 'composed'; response: { blocks: Block[] }; retrieval: Retrieved[] } & Lanes)
  | ({ kind: 'fallback'; retrieval: Retrieved[]; violations: { check: string; message: string }[] } & Lanes)
  | { kind: 'empty'; reason: string };

export type Stage = 'retrieving' | 'retrieved' | 'composing' | 'verifying' | 'rejected' | 'done' | 'error';
export type StreamEvent =
  | { stage: 'retrieving' }
  | { stage: 'retrieved'; sources: SourcePreview[]; traditions: number }
  | { stage: 'composing'; attempt: number }
  | { stage: 'verifying'; attempt: number }
  | { stage: 'rejected'; attempt: number }
  | { stage: 'done'; result: TeacherResult }
  | { stage: 'error'; message: string }
  // Research history (design §4.3): `thread` arrives BEFORE teach() output and carries the durable
  // URL; `saved` arrives after persistence and is the §4.6 saved signal — false renders as "not
  // saved" on the turn, never silently.
  | { stage: 'thread'; threadId: string }
  | { stage: 'saved'; ok: boolean }
  // The ask_outcomes row id for this ask (migration 125). Carried so a clipping taken from this
  // answer can name the ask it came from; that link is un-backfillable, so the client has to hold
  // it while the answer is on screen. Opaque — holding it grants no read.
  | { stage: 'outcome'; askOutcomeId: string };

export interface Turn {
  id: number;
  question: string;
  stage: Stage;
  attempt: number;
  sources: SourcePreview[];
  traditions: number;
  result?: TeacherResult;
  error?: string;
  /** Stored turns only: when this was asked (renders the "historical record" stamp). */
  askedAt?: string;
  /** Live turns: the §4.6 saved signal. undefined = still pending / not applicable. */
  saved?: boolean;
  /** Stored turns: sourceIds whose embeddings row is no longer served (per-row §4.4 check,
   *  resolveServability — fails closed). These render attribution, never the quote. */
  withdrawnIds?: string[];
  /** Q1: this turn failed on auth, not on the pipeline. The failure renders a way OUT (a sign-in
   *  link) rather than only "Ask again", which re-fails identically. A flag rather than matching
   *  on `error` text: the copy is user-facing and would silently unhook the link when reworded. */
  needsSignIn?: boolean;
  /** The ask_outcomes row this turn produced (125). Sent to the clipping API so a kept voice can
   *  be joined back to the ask that surfaced it. Absent on stored turns replayed from history —
   *  the association is not reconstructible after the fact, which is why it is captured live. */
  askOutcomeId?: string;
  /** A 429 said when to try again (epoch ms). The retry control stays visible but disabled until
   *  then — an explicit failure with a retry control (L1), never an instant re-fail. */
  retryAt?: number;
}

/** What /ask/[id] passes down: stored turns already in their terminal state. */
export interface InitialThread {
  id: string;
  turns: { question: string; askedAt: string; result: TeacherResult | null; withdrawnIds: string[] }[];
}

/** What a result link needs to open the book with a way back: the thread (for `from=ask:<id>`)
 *  and the question (for the strip's label). `threadId` is null until the `thread` event lands
 *  on a first ask; a link minted before that still opens the book, just without the strip. */
export interface LinkContext { threadId: string | null; question: string }

export const STAGE_RANK: Record<Stage, number> = { error: -1, retrieving: 0, retrieved: 1, composing: 2, rejected: 2, verifying: 3, done: 4 };
