// Retrieval boundary vocabulary. These types are the seams between the three
// modules (source adapters, embedding, store) and the query entrypoint. Keep them
// small; nothing here knows about Postgres, HTTP, or the on-disk corpus shape.

// v1 handles commentary only. The DB column already allows more source types;
// widen this union when a second source adapter lands.
export type SourceType = 'commentary';

export interface Attribution {
  author: string;
  year: number | null;
  tradition: string | null;
  sourceTitle: string;
  sourceUrl: string | null;
}

// One unit of text to embed, with its provenance. A source adapter emits these.
// It is a CHUNK, not necessarily a whole commentary entry: `sourceId` identifies
// the logical entry and is stable across its chunks; `chunkIndex` disambiguates.
export interface CorpusDoc {
  sourceType: SourceType;
  sourceId: string;
  chunkIndex: number;
  verseId: number; // canonical: book*1e6 + chapter*1e3 + verse
  verseEnd: number;
  text: string;
  attribution: Attribution;
}

// Provider-agnostic embedding. Vectors are only comparable within one `model`.
export interface Embedder {
  readonly model: string;
  readonly dims: 1024; // must match the embeddings.embedding vector(1024) column
  embed(texts: string[]): Promise<number[][]>; // batched by the impl; one vector per input, in order
}

export interface RowMetadata extends Attribution {
  verseId: number;
  verseEnd: number;
  model: string; // which embedder produced the vector (drift guard)
}

export interface EmbeddingRow {
  sourceType: SourceType;
  sourceId: string;
  chunkIndex: number;
  content: string;
  embedding: number[]; // length === Embedder.dims
  metadata: RowMetadata;
}

export interface SearchOpts {
  limit: number; // required — no unbounded result sets
  sourceType?: SourceType;
}

export interface RankedRow {
  sourceId: string;
  score: number; // cosine similarity, 0..1, higher = closer
  content: string;
  metadata: RowMetadata;
}

// The only interface that touches Postgres/pgvector.
export interface EmbeddingStore {
  upsert(rows: EmbeddingRow[]): Promise<{ inserted: number; skipped: number }>;
  search(queryVector: number[], opts: SearchOpts): Promise<RankedRow[]>;
}

// The public result shape returned to callers of `retrieve`.
// `RetrievalResult` was removed 2026-08-02 with `retrieve.ts`, its only consumer. The shipped
// retrieval path returns `RankedRow` (below), which src/teacher and web/src/lib/teacher use.
