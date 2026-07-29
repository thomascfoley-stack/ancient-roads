# SLICE 1 DATA MODEL — buildable artifacts (drafted 2026-07-15, NOT applied/built)

Turns the approved [`SERMON_SEARCH_DESIGN.md`](SERMON_SEARCH_DESIGN.md) data layer into artifacts so
tomorrow is **execution, not design**. Two deliverables here + one draft migration:

- [`db/migrations/013_user_corpus.sql.draft`](../db/migrations/013_user_corpus.sql.draft) — the four
  user-scoped tables (Neon dialect, RLS on each, full delete cascade, brute-force/no-HNSW per §5).
  **A `.sql.draft`: not applied.** It targets a Neon **dev branch that does not exist yet**
  (OWNER_ACTIONS §1); apply only there, never prod.
- The **module interfaces** below — type signatures, no implementations.
- The **test plan** below — the three invariants that gate Slice 1.

Slice 0 already cleared its bar (anchor recall 90% held-out, precision ≥60% at K≥2 — `STATE_OF_TRUTH.md` §5),
which is what justifies building Slice 1 at all.

## Storage schema (see the .sql.draft for the DDL)

| table | grain | key columns | notes |
|---|---|---|---|
| `user_documents` | one upload | `id TEXT`, `user_id`, `doc_type`, `status`, `checksum`, `blob_url` | lifecycle status (§8); `empty` is explicit, not a silent drop |
| `user_sections` | one chunk | `id TEXT`, `document_id→docs CASCADE`, `user_id`, `ordinal`, `kind`, `tsv` | type-aware chunk (§4); FTS via `tsv` GIN |
| `user_section_embeddings` | one vector | `PK(section_id→sections CASCADE, model_slug)`, `user_id`, `VECTOR(1024)` | **no HNSW** — brute-force per user (§5); `model_slug` = parity (§6) |
| `user_section_anchors` | one verse range | `PK(section_id→sections CASCADE, verse_id_start)`, `user_id`, `verse_id_end`, `channel` | fast presence path `(user_id, verse_id)` (§3) |

Design choices baked in: **TEXT ids** (opaque, client/server-generatable — not BIGINT IDENTITY);
**`user_id` denormalized on all four** so every RLS policy is a direct match (no subquery-in-policy);
**delete cascade** `document → sections → {embeddings, anchors}` in one statement (blob delete is app-layer);
**no global vector index** (a per-user HNSW partition is a separate tripwire migration above ~20–30k chunks/user).

## Module interfaces (signatures only — `web/src/lib/user-corpus/`, not built)

```ts
// ---- ingestion pipeline: upload → parse → detect → chunk → anchor → embed → store (§8) ----
type DocType = 'sermon' | 'paper' | 'notes' | 'book' | 'unknown';
type DocStatus = 'queued' | 'parsing' | 'chunking' | 'embedding' | 'ready' | 'failed' | 'empty';

interface UploadInput { userId: string; filename: string; bytes: Uint8Array; declaredType?: DocType; }
interface ParsedDoc { text: string; pages?: number; extractableChars: number; } // extractableChars≈0 ⇒ 'empty'
interface Chunk { text: string; ordinal: number; heading?: string; kind: 'body' | 'footnote' | 'heading'; }
interface Anchor { verseStart: number; verseEnd: number; channel: 'explicit' | 'prose' | 'uncited'; confidence: number; }

function parseUpload(input: UploadInput): Promise<ParsedDoc>;            // → blob store; sets status
function detectDocType(parsed: ParsedDoc, declared?: DocType): DocType;  // heuristic OR user-declared (§4)
function chunkByType(parsed: ParsedDoc, type: DocType): Chunk[];         // dispatch to a per-type chunker
function anchorChunk(chunk: Chunk): Anchor[];                            // reuses the corpus anchor stack (§2, Slice 0)
function embedChunks(chunks: Chunk[], modelSlug: string): Promise<number[][]>; // batched, off request path (§6/§11)

// ---- storage layer: the ONLY writer of the four tables; every call is user-scoped under RLS ----
interface StoredDoc { documentId: string; status: DocStatus; sectionCount: number; }
function storeDocument(
  userId: string,
  meta: { title: string; type: DocType; filename: string; blobUrl: string; checksum: string; byteSize: number },
  sections: Array<{ chunk: Chunk; anchors: Anchor[]; embedding: number[]; modelSlug: string }>,
): Promise<StoredDoc>;                                                   // one transaction; sets status='ready'
function setDocStatus(userId: string, documentId: string, status: DocStatus, error?: string): Promise<void>;
function deleteDocument(userId: string, documentId: string): Promise<void>; // DB cascade + blob delete (§8)

// ---- per-user retrieval — three modes (§3) + the join (§3 "the moat") ----
interface VerseRange { start: number; end: number; }
interface UserHit { documentId: string; sectionId: string; text: string; score: number; date: string; title: string; }
interface CorpusVoice { author: string; work: string; verseId: number; sectionId: number; }

function verseAnchorScan(userId: string, range: VerseRange): Promise<UserHit[]>;          // presence, fast path (index, not vectors)
function semanticSearch(userId: string, queryVec: number[], k: number): Promise<UserHit[]>; // brute-force cosine over ONE user's rows
function keywordSearch(userId: string, q: string, k: number): Promise<UserHit[]>;         // per-user FTS over tsv
function traditionGap(userId: string, documentId: string): Promise<CorpusVoice[]>;        // corpus voices on the doc's anchors it did NOT cite
```

## Test plan — the three invariants Slice 1 must pass (write these RED-first)

1. **Two-account tenancy (the cross-user leak test).** Seed user A and user B each with a document +
   sections + embeddings + anchors. Driving the **real `runAsUser` path** (RLS bound, not `neondb_owner`):
   every read/search/delete as A returns only A's rows; `verseAnchorScan`/`semanticSearch`/`keywordSearch`
   as A never surface B's chunks; A deleting a doc never touches B's. Seed-bug proof: drop the `user_id`
   predicate (or the RLS policy) → the test goes RED. This is the SEC-2 pattern (`db.ts`, migration 001),
   extended to the four new tables — verify with two accounts, not by reading policy.

2. **No-HNSW-index recall (the brute-force correctness assertion).** With `user_section_embeddings` having
   **no vector index**, `semanticSearch` returns the exact top-k by cosine — assert it equals a reference
   brute-force computed in the test over the same rows (100% recall, §5). This locks the deliberate absence
   of an index: if someone adds a global HNSW, the per-user starvation returns and this recall check is the
   canary. (The tripwire → per-user partition is a separate future slice; this test guards the common case.)

3. **Model parity (the join-safety assertion).** `traditionGap` must **refuse to compare** user vectors whose
   `model_slug` ≠ the corpus's pinned model (`bge-large-en-v1.5`, ADR-005) — a cross-model cosine is
   meaningless (§6). Seed a user embedding row with a wrong `model_slug` → `traditionGap` excludes it (or
   throws), never returns a spurious "voice you didn't cite." Seed-bug proof: remove the parity guard →
   the mismatched row joins → RED.

## Ships-with — lock the shared corpus `embeddings` to SELECT-only (do NOT skip)

**This rides WITH Slice 1, it does not wait for it.** Today `app_runtime` still holds
`INSERT/UPDATE/DELETE` on the shared corpus `embeddings` table (`STATE_OF_TRUTH.md` §7.1, a LONG-NIGHT
finding). It's tolerable *now* because the runtime only ever serves corpus rows. **The moment Slice 1 ships,
user content and corpus content coexist behind the same `app_runtime` connection** — a runtime role that can
write the corpus table is a materially bigger deal then than it is today (a compromised request path, or a
tenancy bug, could reach corpus integrity, not just one user's rows). So the `REVOKE INSERT, UPDATE, DELETE ON
embeddings FROM app_runtime` belongs in the same change set as this migration — not a follow-up that gets lost.

Caveat that makes it non-trivial (why it wasn't auto-applied): **first confirm the ingestion path does not
connect as `app_runtime`.** Ingestion runs as `neondb_owner` by design, but verify before revoking, or ingestion
breaks. Draft it as `db/migrations/0NN_revoke_embeddings_writes.sql.draft` alongside 013 and apply both on the
dev branch together; it's a prod write, so it stays a draft until the branch exists (OWNER_ACTIONS §1).

## Out of scope for Slice 1 (named, not forgotten)

- The **per-user HNSW partition** + the tripwire job (§5) — a separate migration, fired above ~20–30k chunks/user.
- **Quotas / plan limits / embedding-cost accounting** (§9/§11) — observability + billing, not the data model.
- Multi-type chunkers beyond the **one type Slice 1 ships end-to-end** (prose/sermons, per the design's slice plan).
- Applying migration 013 — blocked on the Neon **dev branch** (OWNER_ACTIONS §1). Draft stays `.sql.draft` until then.
