// The queue's claim vocabulary, in a module that imports nothing.
//
// D9 (DEEP_SWEEP): requeueForRetry lives in documents.ts and needs CLAIMED_STATUSES /
// STALE_CLAIM_MINUTES so its CAS uses the SAME predicate claimNext uses to reclaim a stale row —
// two hand-typed status lists would drift. But queue.ts already imports documents.ts, and
// queue.ts imports embedChunks: taking them from queue.ts created an import CYCLE and pulled the
// embedder into the module graph of every route that touches documents.ts. The wallet invariant
// caught it immediately — two routes that spend no money started matching the spender predicate.
//
// So the constants live here, where both can reach them without reaching through each other.
export const STALE_CLAIM_MINUTES = 5;

/** Statuses that mean a worker is holding the row. `processOne` writes all three (B022). */
export const CLAIMED_STATUSES = ['parsing', 'chunking', 'embedding'] as const;
