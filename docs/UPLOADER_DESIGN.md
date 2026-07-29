# UPLOADER + PERSONAL SERMON SEARCH (design, 2026-07-24)

**Status: DESIGN ONLY. This document ships zero feature code and zero migrations. The owner
approves this design, section by section, before any code is written.** It builds on the approved
`docs/SERMON_SEARCH_DESIGN.md` (two spines, per-user brute-force vectors with the HNSW tripwire,
the Slice-0 recall/precision numbers) and does not re-litigate it. Scope here: the upload pipeline
and the personal search surface only. The tradition-gap join and the `/ask` integration are later
slices with their own designs (§6).

Sign-off model: each numbered section is a separate yes/no; §7 lists the questions that need an
explicit ruling.

---

## 1. Data model

Adopts the shape already drafted in `db/migrations/013_user_corpus.sql.draft` (draft, never
applied, dev-branch target only): four user-scoped tables mirroring the corpus's
`sources / sections / section_embeddings / section_anchors` so any future corpus join is a
symmetric verse-id equijoin. Condensed sketch (the draft file is the full text):

```sql
-- SKETCH ONLY. Applied, once approved, as 013 on the dev branch first; never prod-first.
CREATE TABLE user_documents (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT NOT NULL,                       -- auth subject; the RLS key
  title           TEXT NOT NULL,
  doc_type        TEXT NOT NULL DEFAULT 'unknown'
                  CHECK (doc_type IN ('sermon','paper','notes','book','unknown')),
  source_filename TEXT,
  blob_url        TEXT,                                -- Vercel Blob ref (raw file)
  byte_size       BIGINT,
  checksum        TEXT,                                -- sha256: dedupe + idempotency key
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','parsing','chunking','embedding','ready','failed','empty')),
  parse_error     TEXT,
  asserted_ownership_at TIMESTAMPTZ,                   -- §5; NEW vs the 013 draft (Q7)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_sections (                           -- the retrieval chunk
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id TEXT NOT NULL REFERENCES user_documents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,                           -- denormalized: every policy is a direct match
  ordinal     INT NOT NULL,
  heading     TEXT,
  body        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'body' CHECK (kind IN ('body','footnote','heading')),
  tsv         TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
  UNIQUE (document_id, ordinal)                        -- stage idempotency (§2)
);

CREATE TABLE user_section_embeddings (                 -- brute-force per user; NO shared HNSW by design
  section_id TEXT NOT NULL REFERENCES user_sections(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  model_slug TEXT NOT NULL,                            -- must equal the corpus model (parity, §2)
  embedding  VECTOR(1024) NOT NULL,
  PRIMARY KEY (section_id, model_slug)
);

CREATE TABLE user_section_anchors (                    -- the verse presence fast path
  section_id     TEXT NOT NULL REFERENCES user_sections(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,
  verse_id_start INT NOT NULL,
  verse_id_end   INT NOT NULL,
  channel        TEXT NOT NULL CHECK (channel IN ('explicit','prose','uncited')),
  confidence     REAL NOT NULL,                        -- carries the shingle count K (§3)
  PRIMARY KEY (section_id, verse_id_start)
);
-- Indexes: (user_id, created_at) on documents; (user_id) + GIN(tsv) on sections;
-- (user_id) on embeddings; (user_id, verse_id_start, verse_id_end) on anchors.
```

### RLS: auth-grade user isolation

- **Default-deny.** RLS ENABLED on all four tables. A non-BYPASSRLS role sees zero rows unless a
  policy admits them. Exactly one permissive per-user policy per table, covering
  SELECT/INSERT/UPDATE/DELETE:

```sql
CREATE POLICY user_documents_policy ON user_documents
  USING      (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));
-- identical policy on user_sections, user_section_embeddings, user_section_anchors
GRANT SELECT, INSERT, UPDATE, DELETE ON user_documents, user_sections,
  user_section_embeddings, user_section_anchors TO app_runtime;
```

- **Fails closed when the session var is unset:** `current_setting(..., true)` returns NULL, the
  predicate is not true, zero rows. This backstop is already proven for the existing user tables
  (`docs/SECURITY.md` SEC-2: "query WITHOUT runAsUser returns 0 rows").
- **No service-role bypass on any request path.** Every request-path query runs as `app_runtime`
  (NOBYPASSRLS) through the `runAsUser` transaction pattern (`web/src/lib/db.ts`). Owner
  (`neondb_owner`) connection strings are migration/ingest tooling only; no module under
  `web/src/app/api/**` or `web/src/lib/**` may hold one. The queue worker (§2) also runs as
  `app_runtime` under `runAsUser` with the document owner's user id, so even the ingest writes are
  policy-checked (WITH CHECK), not trusted.
- **Verified by two accounts, not by reading policy** (CLAUDE.md Security). Named test plan:
  `user-uploads-rls-tenancy` suite, modeled on `tenancy.test.ts` + the SEC-2 verification: account
  A uploads; account B runs all three search modes and direct repository reads and sees zero;
  the unset-var backstop sees zero. Red-first proof in §8 A1.

### How this differs from the platform corpus, and the fence

- The platform corpus is `embeddings` rows with `user_id IS NULL` (plus `sources`/`sections`).
  User uploads **never write the shared `embeddings` table at all**, not even with `user_id` set:
  separate tables make the isolation structural (different relations), not predicate-only, and
  avoid the shared-index starvation the search design names (§5 there).
- Two independent walls keep user content out of the platform pools:
  1. **Structural:** every served pool in `web/src/lib/teacher/routing.ts` selects
     `FROM embeddings WHERE user_id IS NULL AND ...` (`legalBasePool`, `injectionSql`,
     `songVerse*`, `lane*`, `diversityBackfillSql`), with `LEGAL_CORPUS_FILTER` / lane filters on
     top. No platform query references a `user_*` table.
  2. **Policy:** migration `022_embeddings_write_policy_user_scope.sql` scopes the `embeddings`
     write policy to `user_id = current_setting('app.current_user_id')`, so `app_runtime` cannot
     create platform (`user_id IS NULL`) rows even through a bug.
- **The register-fence hazard, named:** any NEW pool boundary must carry the fence alongside it.
  Standing rule this design adds: SQL that reads `user_*` tables must run user-scoped as
  `app_runtime` under `runAsUser`; SQL that feeds `/ask` compose must read only
  `user_id IS NULL` rows through the routing.ts filters. Enforced by the seeded fence-leak test
  (§8 A2), not by code review alone.
- User content never counts toward the exegetical ≥2-voices floor (`SERMON_SEARCH_DESIGN.md` §7).
  This surface never touches compose or the verifier at all, so the question does not arise until
  the out-of-scope Slice 4.

---

## 2. Ingestion path

```
upload -> validate -> parse -> chunk -> anchor -> embed -> store -> status
```

The upload request does only: validate, write the blob, insert the `user_documents` row
(status `queued`), kick the drain. Everything after that runs off the request path
(CLAUDE.md: embeddings/LLM calls never on the request path).

**Validate (at the request):**
- Content-type allowlist: `.docx`, `.pdf`, `.txt`, `.md` only (epub deferred). Type decided by
  magic-byte sniff, never by extension.
- Caps: 15 MB per file raw; docx decompressed-size cap 50 MB (zip bomb); PDF page cap 500.
- No execution or parsing of active content: docx macros never executed (text extraction only);
  XML parsed with entity expansion disabled (XXE / billion-laughs); PDF JavaScript, embedded
  files, and forms ignored (text layer only); md treated as plain text, never rendered as HTML at
  ingest, no remote fetches ever.

**Parse (in the worker), parser choices and their risks:**

| format | parser | risk | mitigation |
|---|---|---|---|
| docx | `mammoth` (pure JS, no native code) | zip bomb; XML entity expansion | decompressed cap before parse; entities disabled; runs in the queue worker with a timeout, never in the request handler |
| pdf | `pdfjs-dist` text extraction (Mozilla, pure JS) | hostile PDFs crash/hang parsers; scanned PDFs have no text layer | worker isolation + hard timeout; near-zero extractable text over N pages fails LOUD to `failed: needs OCR` / terminal `empty`, never `ready` (`SERMON_SEARCH_DESIGN.md` §8) |
| txt / md | none (UTF-8 validate, control-char strip) | minimal | size cap |

Any parser crash or timeout ends in `failed(reason)`, surfaced per-doc with retry. Never a silent
drop.

**Chunk:** type-aware dispatch per `SERMON_SEARCH_DESIGN.md` §4. This slice ships the sermon
prose packer only; `doc_type` is recorded at upload so other types can be re-chunked later
without re-parsing.

**Verse-anchor:** the uncited-quote 6-gram shingle channel plus the explicit-reference channel
(Slice 0). Anchors are written at shingle count K>=2 with K recorded in `confidence`; the surface
default filters at K>=3 (§3). The index matched against is the §6 translation fork (Q1).
Deterministic string work, no LLM, runs in the worker.

**Embed:** `BAAI/bge-large-en-v1.5` via DeepInfra, identical to the corpus, `model_slug` stored
per row. The parity rule (`SERMON_SEARCH_DESIGN.md` §6) applies: any comparison or future join
refuses mismatched `model_slug` (§8 A8).

**Queue:** Postgres `SELECT ... FOR UPDATE SKIP LOCKED` drain; fire-and-forget drain kicked on
upload; cron as the sweeper (Vercel Pro dependency for multi-user, Q5). Worker runs as
`app_runtime` under `runAsUser` (§1).

**Idempotent re-upload:**
- Unique `(user_id, checksum)` among live documents: re-uploading identical bytes returns the
  existing document, zero new embedding spend.
- Every stage upserts on its natural key (`(document_id, ordinal)`, `(section_id, model_slug)`,
  `(section_id, verse_id_start)`), so a crashed worker re-drains and converges.
- Deletion is a real cascade: document -> sections -> embeddings -> anchors via FK cascade, plus
  the blob in the same operation (§8 A4).

**Quotas and abuse limits** (enforced at accept AND at drain; typed errors, never a silent
stall):

| limit | beta default | rationale |
|---|---|---|
| documents per user | 200 | beta scale |
| total bytes per user | 100 MB | blob + parse cost |
| chunks per user | 20,000 | sits at the brute-force tripwire (~20-30k, `SERMON_SEARCH_DESIGN.md` §5), so no per-user HNSW partition is needed in beta |
| uploads per hour | 20 | fixed-window, mirroring `db/migrations/008_api_rate_limit.sql` |
| embedding budget | batched; per-drain cap | one user cannot drain the wallet |

---

## 3. Personal search surface

- **Where:** `/library/uploads` (the route exists as a ComingSoon placeholder,
  `web/src/app/library/uploads/page.tsx`; this replaces it). Document list with per-doc status
  and retry, plus one search box.
- **What a query does** (both spines, `SERMON_SEARCH_DESIGN.md` §3):
  - a verse reference ("Romans 8") runs the verse-anchor scan on
    `(user_id, verse range)`: the O(index) presence fast path, never a vector scan;
  - free text runs brute-force cosine over the user's vectors fused with per-user FTS
    (reciprocal-rank fusion, as the corpus path does).
- **How results render (the trust boundary):**
  - every hit is labeled as the user's own (title, date, doc_type), visually distinct from corpus
    voices; never rendered as Scripture, never as an attributed historical voice;
  - nothing here enters `/ask` exegetical answers; this surface does not touch compose or the
    verifier; the personal corpus stays personal (RLS §1 + the fence);
  - bounded: LIMIT + keyset paging, never unbounded result sets (CLAUDE.md).
- **Defaults, justified from Slice 0** (`SERMON_SEARCH_DESIGN.md`, PRECISION RUN table):
  - anchor display threshold **K=3**: precision 96%, recall 75%, ~18 returns per sermon (a usable
    "passages engaged" list, against the K=1 wall of 67 returns at 33% precision);
  - a "loose matches" toggle drops to K=2 (recall 82%, precision 68%) for "am I sure I never
    wrote on this";
  - the K choice was read off the held-out set; it must be re-validated on one fresh set before
    multi-user ship (the design's own caveat; Q6);
  - semantic/FTS page size: 10. The semantic spine exists to catch the paraphrase residual the
    anchor channel structurally misses (the Exodus 33 / Matthew 15 / Job 17 class of misses).

---

## 4. The SEC-1 gate (read this even if you skim the rest)

**Multi-user upload CANNOT ship while the auth layer carries the GHSA-g38m account-takeover
class** (`docs/SECURITY.md` SEC-1: better-auth 1.4.18 via the `@neondatabase/auth` beta, no
app-level mitigation possible). The exploit: attacker pre-registers the victim's email via
`/sign-up/email`; the victim's later Google/GitHub login auto-links to the attacker's account.
**An attacker who takes an account takes the sermons.** Uploaded sermons are unpublished
intellectual property; this feature raises the value of every account, so it inherits the
launch blocker.

**The gate:** the uploader is enabled for more than one account only after ONE of:
1. the Better Auth direct cutover lands (the spike already passed all four proofs, including the
   g38m exploit not auto-linking on 1.6.23, `docs/SECURITY.md`) and the g38m GHSAs are removed
   from `pnpm.auditConfig.ignoreGhsas`; or
2. Neon's written confirmation is on file that the hosted auth server runs better-auth >= 1.6.11
   and verifies email before linking (the `docs/OWNER_ACTIONS.md` §2a question), accepted
   explicitly by the owner as an interim posture. The move-off still happens regardless
   (SECURITY.md decision of 2026-07-08).

The gate is enforced in CI, not prose: a test asserts the multi-user uploads flag cannot be
enabled while the g38m GHSAs remain ignored (§8 A7).

**Owner-only beta carve-out (acceptable, with ALL conditions held):** a single-account beta on
the owner's own account may run before the cutover only while:
1. public signup is unreachable (SITE_PASSWORD middleware + Vercel Deployment Protection,
   `docs/OWNER_ACTIONS.md` §0), which removes g38m's precondition (attacker pre-registration);
2. the upload endpoints hard-allowlist the owner's user id (env var), so no second account can
   reach them even if one exists;
3. it targets the Neon dev branch, not prod, until the schema is approved for prod;
4. the content is the owner's own (he accepts the residual risk on it).

---

## 5. Copyright and licensing stance for uploads

- **The user asserts ownership at upload** (one sentence in the UI; recorded as
  `asserted_ownership_at`, Q7). We host their private content; we do not redistribute it, serve
  it to any other user, or make it public.
- **Quotes of copyrighted translations (ESV/NIV/NASB/CSB/NLT) inside a user's own sermon are the
  user's liability**, not ours: their sermon is stored privately as their document, never as
  platform corpus. The license deploy gate stays blind to UGC by construction (it reads only
  `public/` corpus files + `user_id IS NULL` rows: `docs/PHASE_A_CLOSE.md` §4,
  `gate-ugc-blindness.test.ts`). That blindness is correct: the gate governs what WE serve, not
  what users keep privately.
- **No full-text copyrighted translation storage, ever, on either plane** (CLAUDE.md Data &
  licensing). The anchoring index is built only from translations we lawfully hold (KJV + the PD
  union, Q1); user prose is matched against that index; nothing is reconstructed from it.
- No training or fine-tuning on user content; no use of one user's content in another user's
  results (`SERMON_SEARCH_DESIGN.md` §14). Deletion is the full cascade including the blob.

---

## 6. Out of scope

- Cross-user search, congregation sharing, public sermon pages.
- Anything touching the platform corpus: no writes, no schema changes, no pool changes. The
  tradition-gap join and the `/ask` integration (Slices 3-4 of `SERMON_SEARCH_DESIGN.md`) are
  later designs with their own fence reviews.
- OCR of scanned PDFs (detect + fail loud only), epub, chunkers beyond the sermon prose packer,
  the per-user HNSW partition (tripwire documented, built only when tripped), collections/tags,
  bulk-import UX.

---

## 7. Open questions for the owner (each with a recommendation)

- **Q1. Translation indexing for the uncited-quote channel** (`docs/OWNER_ACTIONS.md` §6 fork
  applied here). Recommendation: option 1, index the union of PD translations we hold (KJV
  first, proven 90-93% recall on held-out Spurgeon vs WEB's 65%; add WEB/ASV/YLT/Darby/Geneva
  under the same K discipline), hold precision with K=3, and say plainly in UI copy that verse
  detection is strongest for KJV/PD quoters; modern-translation preachers ride the semantic
  spine. Covering ESV/NIV/NASB is structurally impossible (cannot store them); do not try.
- **Q2. Owner-only beta before the auth cutover** (§4 carve-out). Recommendation: yes, under the
  four named conditions; it derisks parsing and search UX on real sermons while SEC-1
  remediation lands.
- **Q3. Beta quota numbers** (200 docs / 100 MB / 20k chunks / 20 uploads-hour). Recommendation:
  adopt; revisit at pricing.
- **Q4. Blob storage.** Vercel Blob (the 013 draft's `blob_url`) vs Postgres bytea.
  Recommendation: Vercel Blob; raw files do not belong in Postgres; the delete cascade includes
  the blob (§8 A4).
- **Q5. Vercel Pro** for the queue sweeper (`SERMON_SEARCH_DESIGN.md` §12). Recommendation: not
  needed for the owner beta (on-upload drain suffices); required before multi-user ship.
- **Q6. K re-validation.** Recommendation: one more frozen held-out run, on a corpus other than
  CCEL vols 10/13, through the SHIPPED ingest path, before multi-user ship; bars stay recall
  >= 70%, precision >= 60% (§8 A9).
- **Q7. Ownership-assertion column** (`asserted_ownership_at` on `user_documents`, a delta to
  the 013 draft). Recommendation: add it.

---

## 8. Falsifiable acceptance checks (red-first, per build slice)

Per THE_LOOP / false-confidence discipline: each check is watched failing (bug seeded) before it
counts as a gate.

- **A1, two-account RLS** (schema slice): account A uploads; account B runs anchor scan,
  semantic, FTS, and direct repository reads: zero rows everywhere; the unset-var backstop
  returns zero. Red proof: on the dev branch, drop one table's policy predicate and watch B see
  A's rows; restore.
- **A2, fence leak** (schema slice): seed, as owner on dev, one `embeddings` row WITH `user_id`
  set and one `user_sections` row; run every platform pool through the real `routing.ts` entry
  points (`legalBasePool`, `injectionSql` over the seeded verse range, both lanes, songVerse,
  the FTS surface): the seeded content never appears. Red proof: strip `user_id IS NULL` from
  one pool in a scratch copy and watch the seeded row surface.
- **A3, validation** (ingest slice): a zip-bomb docx, an executable renamed `.docx`, an
  oversize file, and a scanned PDF each end `failed`/`empty` with a typed reason; none reaches
  `ready`. Red proof: bypass the decompressed-size cap and watch the bomb pass.
- **A4, delete cascade:** delete a document; zero sections/embeddings/anchors remain AND the
  blob 404s. Red proof: comment out blob deletion, watch the orphan.
- **A5, idempotent re-upload:** identical bytes twice: one document row, embedding-call counter
  unchanged on the second pass. Red proof: disable the checksum lookup, watch the duplicate and
  the double spend.
- **A6, quota exceeded:** fill to each quota; the next upload gets a typed rejection; the drain
  never exceeds the embedding budget (asserted on the call counter). Red proof: loosen one quota
  check, watch the overrun.
- **A7, SEC-1 gate:** a test asserts NOT (multi-user uploads enabled AND g38m GHSAs present in
  `pnpm.auditConfig.ignoreGhsas`). Red proof: flip the flag with the GHSAs present, watch red.
- **A8, model parity:** seed a user embedding with a wrong `model_slug`; search excludes it and
  records the mismatch. Red proof: remove the parity filter, watch it rank.
- **A9, anchor quality through the shipped path:** the frozen Spurgeon held-out set ingested via
  the REAL upload pipeline (not the Slice-0 script); recall >= 70% chapter-level and precision
  >= 60% at the shipped K, compared against Slice 0's 75/96 at K=3 for drift.
- **A10, UI definition of done:** `/library/uploads` loaded at 390px and desktop, a real upload
  and a real search exercised, no console errors, no horizontal overflow (CLAUDE.md DoD).
