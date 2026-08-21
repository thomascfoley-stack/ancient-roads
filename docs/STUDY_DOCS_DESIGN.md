# STUDY DOCS & TOPIC VIEW — architecture and design

**Status:** **APPROVED 2026-08-12 (owner).** All owner decisions ruled (E1–E9, §9). Design-before-code; no implementation exists — the build contract is `docs/STUDY_DOCS_BUILD.md`.
**Filed:** 2026-08-11 against `a02d03e`. **Revised the same day** after independent review
(findings S-A…S-N, P-1…P-4, verified against `39c2632`). All fourteen review findings are
incorporated; two with refinement, noted where they land.
**Companion to:** `ASK_HISTORY_DESIGN.md` (2026-08-10) and its two audits — especially **F-4**
(the `source_id`-keyed servability re-check) and **F-8** (store `sections.id` alongside ordinal).
**Owner rulings captured 2026-08-11:** turns are independent — no conversational memory, no LLM
query-contextualization step (deferred, possibly never). Studies and chats are separate areas:
Research History is capture; Studies are curation.

> **MEASURED** = read out of the tree at the stated anchor. **UNKNOWN** = a hole this design
> refuses to fill by inference — listed in §10 with the measurement that closes it.

---

## 1. The requirement

The owner, 2026-08-11: *"Thinking about Rahab the harlot — see all of the commentaries, hymns,
sermons easily in one view and not lose track of where I am. Save that commentary clipping to my
study doc or append it. Add historical works, sermons, poetry and lexicons to that same body of
work. One area where chats go and another for in-depth studies — snippets or whole bodies. All of
the app working together."*

- **R1 — the topic view.** Name a subject; see the library's answer **grouped by register**
  (commentaries, sermons, hymns/poetry, theology, lexicons), each group's count and emptiness
  *true*, with orientation — dig in, come back, lose nothing.
- **R2 — study docs.** Durable, user-authored bodies of work: your own writing plus **clippings**
  (attributed corpus quotes, snippet or whole reading unit). Many studies, not one master doc (E3).
- **R3 — save from anywhere.** One canonical **Save to study** verb on every surfaced item, on
  every surface.
- **R4 — two areas.** Research History (automatic, immutable) and Studies (deliberate, editable)
  are separate sidebar sections. Capture vs. curation.
- **R5 — one search surface.** One box returns your studies and the library as labelled groups
  (merged with R1 — §7.3; review P-1).
- **R0 — independence is locked.** Follow-up questions run self-contained. The UI must never
  imply memory. No new LLM call anywhere in this design.

---

## 2. How it works today — measured

### 2.1 User-data conventions (settled)

`docs/USER_DATA.md`: structured user content in Neon Postgres, files in Vercel Blob, no new
infrastructure. House shape, MEASURED on `notes`/`highlights` (`db/schema.sql:340-372`):
`user_id TEXT`, `created_at`/`updated_at`, `deleted_at` tombstones (added for sync —
USER_DATA.md:63,79,94), partial indexes `WHERE deleted_at IS NULL`, RLS via
`current_setting('app.current_user_id', true)`, and the audited **H1/H2 belts** in
`web/src/lib/chat.ts:82-139` (explicit `user_id` on every read; ownership-checked
`INSERT…SELECT…WHERE EXISTS` on every write). `runAsUser` (`web/src/lib/db.ts:111-121`) runs a
**static array** of statements in one transaction with `set_config(…, is_local=true)` — correct
and pool-safe, but it means **no read-then-conditional-write inside one transaction**; atomic
writes must be single statements (§6.3).

### 2.2 Privilege reality for new tables (the 106 lesson)

MEASURED: `db/migrations/032_audit_2026_08_02_data_layer.sql:48-49` narrowed schema defaults —
tables created after 032 are **born SELECT + INSERT only** for `app_runtime`.
`db/migrations/106_plan_write_grants.sql` is the postmortem of the next table-creating migration
that forgot: `POST /api/plans/<id>` → 500 `permission denied`, hidden because INSERT and SELECT
worked. **Every table this design creates postdates 032; the migration carries explicit GRANTs
and a self-verifying tail (§6.1).** UPDATE is granted where edits exist; DELETE is granted
nowhere (soft-delete only — 032's rule: a table that needs more says so in its own migration).

### 2.3 The two corpus stores share no key (review S-A)

MEASURED (`db/migrations/006_sources_sections.sql:36-43`): `sections.source_id` is
**`BIGINT REFERENCES sources(id)`**. `embeddings.source_id` is a **synthesized TEXT key**
(`commentary:jhn:1:1-5:Matthew Henry`, `src/ingest/source-id.ts:38-44`). Same column name,
different universes. No `section_id` exists on `embeddings` anywhere in schema or migrations
(grep, verified 2026-08-11). The mapping existed transiently inside `migrate-sections-slice.ts`'s
window function (`:233-234`) and was never persisted. **Consequence: a clipping must carry
whichever key its surface owns, and the write snapshots from the store that key addresses (§6.3).**

| Save from | The item carries | Snapshot from |
|---|---|---|
| Ask answer's source list | `embeddings.source_id` (+ chunk identity) | `embeddings.content` — the exact bytes surfaced |
| Topic view / Book Reader | `sections.id` (+ slug, ordinal) | `sections.body` |

`section_id`/`ordinal` on an ask-surface clipping are optional enrichment for the Open link;
absent them the clipping saves and simply offers no deep link (the product's existing rung-4
behaviour). Deriving them is the companion design's resolver ladder, whose prod ceiling the audit
measured at ~41% — **resolution failure must never block a save.**

### 2.4 The licensing predicates a stored quote must re-obey

Carried, MEASURED: `embeddings.served` is row-level (044:90; served-predicated indexes
`:133-164`); forbidden provenance is row-level and cross-cuts works; `sources.status='published'`
is the work-level gate; `idx_embeddings_source` is `UNIQUE(source_type, source_id, chunk_index)`
(`db/schema.sql:181`). The re-check therefore has **two legs, one per key**:
`source_id`-keyed (`embeddings … AND served` + provenance) and `section_id`-keyed
(`sources.status='published'`). Both positive-form; both fail closed. **And the tombstone is a
data state, not only a render decision** (§6.5, review S-K).

### 2.5 The search engine already exists, fenced

MEASURED (`web/src/lib/search-sections.ts:1-29, 48-49, 62-76`): cross-corpus FTS over `sections`;
published-only (invariant `library-published-boundary`), unit-deduped via `unit_ordinal`
(invariant `search-sections`), register-labelled — every row carries `sourceType` (invariant
`register-wall-surfaces`). `DEFAULT_LIMIT = 20`, `MAX_LIMIT = 100`, **globally ranked** — so
grouping a single truncated result set would render register groups as a partition of the top-N,
with empty groups **lying** about the library (review S-C). The fix uses the fence the engine was
built for: `catalog`/`catalogs` register filters, whose own comment says they were *"built ahead
of the split-screen UI that will drive it."* **One capped query per register group, in parallel**
(§7.3).

### 2.6 Register corpus on production — SUPERSEDED 2026-08-12

~~MEASURED (committed evidence, `docs/evidence/a2-prod-readonly-2026-08-01/census.txt` A2.1;
WORKLOG:4594/:5725): prod holds 7 sources, all `commentary`; register works have never been
ingested to prod.~~

**T0-b recon, 2026-08-12 (Fable prod read, `docs/evidence/study-docs-p1/`):** prod now holds
**125 published works across 11 source types** — commentary 26, hymn 32, devotional 15,
poetry 13, lexicon 10, confession 9, father 7, sermon 6, theology 3, topical_index 3,
historian 1 (register ingest landed between the census and the apply session; the count was
corrected 2026-08-12 after independent re-count of the raw log — Fable's prose said 10).
Note: `historian` has zero served `embeddings` rows — published but served by nothing, the
lexicon/A8 pattern. Register groups on prod are expected to have real content; the P2 browser
pass should expect populated groups.

**T0-a, same session:** ask-surface `source_id` resolvability is **unmeasurable** — no stored
surfaced lists exist on prod because ask-history persistence has not shipped. The ~41%
resolver-ceiling estimate remains the only number until it does.

**T0-c, same session — closed positive for today's corpus, with a stated residual:** zero
`sections` rows carry forbidden provenance; every work whose `embeddings` rows do is either
staged (the status gate refuses clippings) or clean-sourced on the sections side. **Residual:**
the write gate treats `source_url IS NULL` as clean — zero exposure today, but it re-opens if a
future ingest writes NULL-url sections for a provenance-held work. Also re-measured: ADR-044's
known served-dirty rows stand at **4,174** (open owner call A9, unchanged) — the clipping write
and servability re-check refuse those rows regardless of `served`, so Study Docs carries no
exposure to that hole.

### 2.7 Existing placeholders

- `study_guides` (`db/schema.sql:145-159`): channel-linked, whole document in one `sections
  JSONB` blob. Wrong shape; not reused (F1). Left in place (E2).
- `/study/[id]` renders `ComingSoon` titled "Study spaces" whose copy promises conversation
  (*"talk it through with the voices who came before you"*) — R0 forbids the promise; E1 owns the
  name and copy.

---

## 3. The findings that decide the design

- **F1 — a study doc is rows, not a blob.** Blob JSONB rewrites the whole doc per autosave,
  last-write-wins at document granularity, and hides clippings from servability re-checks and
  search indexes. Blocks-as-rows.
- **F2 — a clipping is a stored corpus quote.** Rendering one later bypasses every live licensing
  predicate. Fail-closed re-check (§2.4) **plus** a data-state tombstone (§6.5): a render path
  that forgets the check still has nothing licensed to show.
- **F3 — provenance is structural, not conventional.** The client sends a reference; the server
  snapshots quote + attribution **in the same single INSERT…SELECT** that writes the block (§6.3).
  There is no code path on which client-supplied quote text reaches the table.
- **F4 — the topic view is presentation, not retrieval.** No new engine; per-register queries
  over the existing fenced engine. The day it grows its own retrieval, the accuracy gates apply.
- **F5 — two stores, one page, never one ranking.** Corpus search under licensing predicates;
  study search under `user_id`. Separate queries, labelled groups, one surface.

---

## 4. Architecture

### 4.1 Where everything lives

| Thing | Store |
|---|---|
| Studies, blocks, revisions | Neon Postgres — new tables (§6.1), house conventions (§2.1) |
| Chats / research history | Neon Postgres — existing `chats` + `messages` (companion design) |
| Corpus | unchanged — no ingest, no retrieval change |
| Files (future uploads) | Vercel Blob + `user_library` (USER_DATA.md; out of scope) |

### 4.2 Product shape

Four user-data areas plus the shared library — the owner's 2026-08-11 map, organized:

```
CAPTURE                    LIBRARY                        CURATION
Research History           Search surface / Reader        Studies (the sermon builder)
(automatic, immutable)     (register-walled, gated)       (deliberate, editable)
      │                          │                              ▲
      │  Save to study ──────────┴──────── Save to study ───────┘
      └────────────────────────►  ◄─────────────────────────────┘
                     one verb on every surface, one default target

THEIR CORPUS
My Works — the personal LIBRARY, not a file system (owner ruling 2026-08-11). Uploaded sermons
and papers are WORKS with title/type/status, not files in folders (SERMON_SEARCH_DESIGN.md;
Slice 1 built on lane-b dev: migrations 100/102, /api/user-corpus/{documents,upload,search}).
Surfaced today as "My uploads" at /library/uploads — the page already titles itself "My Works"
(web/src/app/library/uploads/[id]/page.tsx:3); this design adopts the name and the framing.
      │  searched alongside the library (§6.4 group) · clipped into studies (§12 note)
      └────────────────────────►  ◄─────────────────────────────┘
```

The relationships that matter:

- **My Works is a library, and the fourth area — not a mode of Studies, not a file manager.**
  Uploads are the pastor's *finished* corpus — stored, chunked, anchored, embedded, searchable
  (`searchMyWorks`, three modes behind `/api/user-corpus/search`). Studies are *work in
  progress*. A finished sermon travels Studies → export → (optionally) into My Works, where it
  becomes searchable history. There are no folders; a work carries title, type, and status —
  organization is metadata, not hierarchy.
- **One search surface, every personal domain** (§7.3): Your studies, **Your works** (the
  existing `user-corpus/search` endpoint — fused semantic+FTS, keyword mode, verse-anchor scan),
  **Your prayers** (`prayers.body`), **Your notes** (`notes.body`) — then the library by
  register. "My prayers, my notes, my sermons, searchable with the commentaries and lexicons"
  is one box, one page, labelled groups — never one blended ranking (F5).
- **Prayers and notes keep their own homes** (E9). PRAYER JOURNAL is shipped (PR1a, migration
  107 on prod); notes are verse-anchored in the reader. Neither moves into My Works — the
  unification happens at the search layer, not by relocating shipped features.
- **Clippings from My Works are a later, easy extension:** a user-corpus section needs no
  licensing tombstone (it's the user's own text), but the same block shape holds — a third key
  type (`user_section_id`) when the need is real, not before.
- **The `/ask` integration with user voices is SERMON_SEARCH_DESIGN's Slice 4** (origin-aware,
  additive-only) — owned there, not here. This design only reserves the search group and the
  clipping extension.

### 4.3 Sequencing

Slices in §10. Load-bearing order: **schema + grants + provenance-safe write before any UI that
saves**; the tombstone data state ships with the first clipping render. The merged search surface
(T3) is independent of studies and can ship first — with prod expectations set by §2.6. This
design's Done depends on slices the companion design owns (collapse model, visited markers,
thread pinning, delete) — that dependency is a gate, not a footnote.

---

## 5. Function — how the pieces fit together

### Flow A — ask, then keep what mattered
1. User asks; thread created, answer streams, full surfaced list stored (companion S1).
2. Each source item: **Open** (when a destination resolves) and **Save to study**.
3. Save → default target (last-used study, one tap) or picker → POST `{ section_id? | source_id }`
   → server snapshots and appends the clipping atomically (§6.3).
4. Back returns to `/ask/{threadId}`; the originating turn re-expanded; visited items marked.

### Flow B — the Rahab view (merged search surface, §7.3)
1. One query → one capped query **per register group** in parallel, plus the user's studies.
2. Groups render with true counts and true empties; per-group "show more" is a per-group offset.
3. Every row: attribution, snippet, register label, **Open**, **Save to study**.
4. Query, group collapse, and per-group paging live in the URL — back restores by construction.

### Flow C — writing in a study doc
1. `/studies/{id}`: title, block stream. Text blocks = your writing; clipping blocks = quote +
   attribution + open-link (or tombstone).
2. The editor emits **block ops**, never document saves: `append_text`, `update_text`,
   `insert_clipping`, `move`, `delete`. Text ops debounce (~500 ms); structural ops immediate.
3. Every op is one transaction through `runAsUser`; the `studies.updated_at` bump rides in the
   same transaction (§6.2).
4. **A failed write is visible before the next debounce fires** — the block shows unsaved state
   and the buffer is never discarded (review S-F; the companion design's `saved` principle,
   stronger here because the user is authoring).
5. `update_text` first appends the outgoing body to `study_block_revisions` in the same
   transaction (§6.1) — the one non-regenerable asset in the system gets an undo substrate.

### Flow D — a work is quarantined after you've saved from it
1. **Data leg (ops):** `UPDATE study_blocks SET quote = NULL, cleared_at = now() WHERE
   source_id = ANY($1)` (or via the section join). Attribution and reference keys stay.
2. **Render leg (belt):** the fail-closed re-check still runs; anything unservable renders as a
   tombstone. Either leg alone suffices; both ship.
3. Tombstone render rule, everywhere: **`attribution IS NOT NULL AND quote IS NULL`** →
   attribution + "no longer available in the library"; no quote, no link.
4. **Re-instatement (refinement of review S-K):** quarantine is not always terminal. Because the
   keys survive the purge, a re-licensed work's clippings can be re-snapshotted by an ops job.
   The purge is not a one-way door.

### Flow E — export
A study serializes to a download: title, then blocks in order — text verbatim, clippings quoted
with an attribution line, tombstones as attribution + notice. One deterministic loop over the
bounded read. Ships in T1 (review P-2): "durable body of work" includes taking it with you.

> **Amended 2026-08-21 (owner ruling): the formats are `.docx` and the PDF print view, both
> rendered from one model (`lib/study-export-docx.ts`). The markdown serializer this flow
> originally described is REMOVED** — the 2026-08-12 editor-v2 ruling was already "Word or PDF …
> we cannot export a .md file", and markdown is an AI-native plumbing format, not something a
> person hands to a person. If the §12 Google Docs export lands, it renders from the model, not
> from a text format. (Git history holds the deleted serializer: `web/src/lib/study-export.ts`.)

---

## 6. Data

### 6.1 Schema

```sql
CREATE TABLE studies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  pinned_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_studies_user ON studies(user_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE study_blocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id     UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,                  -- denormalized: H1 belt without a join
  position     TEXT NOT NULL,                  -- fractional base-62 key; see ordering note
  kind         TEXT NOT NULL CHECK (kind IN ('text', 'clipping')),

  body         TEXT,                           -- kind='text': the user's writing (markdown)

  source_id    TEXT,                           -- embeddings key (ask-surface clippings)
  section_id   BIGINT,                         -- sections.id (reader/topic clippings; enrichment otherwise)
  work_slug    TEXT,
  ordinal      INT,
  quote        TEXT,                           -- server snapshot; NULL + attribution = tombstone (data state)
  attribution  JSONB,                          -- {author, work_title, reference} — server-written
  cleared_at   TIMESTAMPTZ,                    -- when quote was purged (Flow D); keys survive for re-hydration

  tsv          TSVECTOR GENERATED ALWAYS AS (
                 to_tsvector('english',
                   coalesce(body,'') || ' ' || coalesce(quote,'') || ' ' ||
                   coalesce(attribution->>'work_title','') || ' ' ||
                   coalesce(attribution->>'author',''))) STORED,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,

  CHECK ( (kind = 'text')     = (body IS NOT NULL) ),
  CHECK ( (kind = 'clipping') = (quote IS NOT NULL OR cleared_at IS NOT NULL) ),
  CHECK ( kind = 'clipping' OR (source_id IS NULL AND section_id IS NULL AND quote IS NULL
                                AND attribution IS NULL AND work_slug IS NULL AND ordinal IS NULL) ),
  CHECK ( kind <> 'clipping' OR (source_id IS NOT NULL OR section_id IS NOT NULL) ),
  CHECK ( kind <> 'clipping' OR attribution IS NOT NULL )
);
CREATE UNIQUE INDEX idx_blocks_order  ON study_blocks(study_id, position) WHERE deleted_at IS NULL;
CREATE INDEX  idx_blocks_study        ON study_blocks(study_id, position, id) WHERE deleted_at IS NULL;
CREATE INDEX  idx_blocks_source       ON study_blocks(source_id)
  WHERE kind = 'clipping' AND deleted_at IS NULL;
CREATE INDEX  idx_blocks_section      ON study_blocks(section_id)
  WHERE kind = 'clipping' AND deleted_at IS NULL;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE INDEX  idx_blocks_user_tsv     ON study_blocks USING gin (user_id, tsv)
  WHERE deleted_at IS NULL;                   -- user scope INSIDE the index (review S-J)

CREATE TABLE study_block_revisions (           -- append-only; text blocks only (review S-E)
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id     UUID NOT NULL REFERENCES study_blocks(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  body         TEXT NOT NULL,
  replaced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_revisions_block ON study_block_revisions(block_id, replaced_at DESC);

ALTER TABLE studies ENABLE ROW LEVEL SECURITY;          -- same policy shape as notes/highlights
ALTER TABLE study_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_block_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY studies_policy   ON studies   USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));
-- (identical policies on study_blocks, study_block_revisions)

-- 032/106: tables born after 032 are SELECT+INSERT only. Say what each table needs. No DELETE anywhere.
GRANT SELECT, INSERT, UPDATE ON studies TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON study_blocks TO app_runtime;
GRANT SELECT, INSERT ON study_block_revisions TO app_runtime;   -- append-only by grant, not by habit

-- 106's self-verifying tail: a typo fails the migration instead of being reported applied.
DO $$ BEGIN
  IF NOT has_table_privilege('app_runtime','studies','UPDATE') THEN
    RAISE EXCEPTION 'FAILED: app_runtime lacks UPDATE on studies'; END IF;
  IF NOT has_table_privilege('app_runtime','study_blocks','UPDATE') THEN
    RAISE EXCEPTION 'FAILED: app_runtime lacks UPDATE on study_blocks'; END IF;
  IF has_table_privilege('app_runtime','study_blocks','DELETE') THEN
    RAISE EXCEPTION 'FAILED: app_runtime has DELETE on study_blocks; soft-delete only'; END IF;
  IF has_table_privilege('app_runtime','study_block_revisions','UPDATE') THEN
    RAISE EXCEPTION 'FAILED: revisions must be append-only'; END IF;
END $$;
```

Decisions and why:

- **`position TEXT` fractional key** (review S-I): base-62 midpoint strings cannot exhaust, need
  no rebalance path, no detection, no invariant. Every read orders `position, id` (id is the
  tiebreaker; the unique index forbids duplicates). ~20-line helper, no operational tail.
- **Five CHECKs** (review S-G): a block is exactly its kind; a text block carries no clipping
  fields; a clipping carries at least one resolvable key and always attribution. The table, not
  the route, is the structural guard — S-1 pins the route, these pin the data.
- **`quote IS NULL` semantics:** a live clipping has a quote; a tombstoned one has `cleared_at`.
  The CHECK makes "clipping that is nothing" unrepresentable.
- **`idx_blocks_user_tsv`** composite GIN (review S-J): at user-content scale a global GIN makes
  "grace" walk half the index to return one user's three rows. User scope goes inside the index.
  Note the write profile differs from `sections.tsv` (written once at ingest): this index updates
  on every debounced save — GIN `fastupdate` tuning is a T1 task, corpus tuning does not transfer.
- **Revisions are append-only by GRANT.** No UPDATE/DELETE exists to revoke later.

### 6.2 The write path — block ops, one transaction each

`/api/studies`, `/api/studies/[id]`, `/api/studies/[id]/blocks`. Each op runs through
`runAsUser` as a small static array: the mutation (H2-belted — `…WHERE EXISTS (SELECT 1 FROM
studies WHERE id = $1 AND user_id = $2)`) plus the `studies.updated_at` bump, in one transaction
(review S-M: two statements, one transaction, said plainly). Reads bounded: studies list
cursor-paginated; blocks read `ORDER BY position, id` with a documented cap and pagination past
it (S-7).

**Soft-deleting a study tombstones its blocks in the same transaction** (review S-H) —
`UPDATE study_blocks SET deleted_at = now() WHERE study_id = $1` — and the studies-side search
joins `studies` regardless (it needs the title), so a deleted study's content cannot surface in
search. `ON DELETE CASCADE` covers only hard delete, which is not a code path.

Concurrency: block-level last-write-wins across tabs (accepted, §6.5) — with revisions, an
overwrite is support-recoverable, not silent loss.

### 6.3 Clipping write — one atomic statement per surface (review S-D)

Reader/topic surface:

```sql
INSERT INTO study_blocks (study_id, user_id, position, kind,
                          section_id, work_slug, ordinal, quote, attribution)
SELECT $1, $2, $3, 'clipping', s.id, src.slug, s.ordinal, s.body,
       jsonb_build_object('author', src.author, 'work_title', src.title, 'reference', $4)
FROM sections s JOIN sources src ON src.id = s.source_id
WHERE s.id = $5
  AND src.status = 'published'                                  -- licensing gate IN the write
  AND EXISTS (SELECT 1 FROM studies WHERE id = $1 AND user_id = $2)   -- H2 belt
RETURNING id;
```

Ask surface: the same shape against `embeddings` — `WHERE source_id = $n AND served` plus the
forbidden-provenance predicate, snapshotting `content` (the exact bytes the user read).
`0 rows` = not owned or not servable; the route returns a reason code (probe after), but the
safety property holds either way. Atomic, ownership-checked, licensing-gated, zero
client-supplied text, one round trip. F3 is structural.

**Whole-body appends are capped** (review S-L): one block per reading unit, a server-side cap
per op, and the UI states the count before running — *"This will add 412 clippings to Rahab.
Add them?"*

### 6.4 Search — two query paths, one page

Corpus side: per-register calls to the existing fenced engine (§2.5). Personal side: one scoped
query per domain — studies (`study_blocks.tsv`, §6.1), works (`/api/user-corpus/search`,
already built), prayers and notes (a generated `tsvector` + GIN on `body`, same pattern as
`study_blocks` — two tiny migrations; both tables are small and user-scoped, so the composite
`(user_id, tsv)` shape from §6.1 applies unchanged). Every personal query runs
`WHERE user_id = $1 AND deleted_at IS NULL`, `ts_headline` snippets, capped count, hard LIMIT —
the `search-sections.ts` pattern, whose header explains why those properties keep it honest.
Never one ranking (F5). Semantic search over user content is later and additive (an embedding
column); it touches nothing on the corpus path.

### 6.5 Deliberately absent

Versioning UI (revisions exist as substrate only). Sharing/collaboration (retired, `N4`).
Rich-text framework (`body` is markdown; the block model makes richer editors additive). Vector
search over user content. Conversational anything (R0). **LLM-assisted composition — shaped for
in §12, built never in this design.**

---

## 7. UI/UX

### 7.1 Sidebar
**RESEARCH HISTORY** (pinned threads first, then recents, "All research"), **MY STUDIES**
(pinned, then `updated_at` recents, "All studies" — user-facing name per E1, ruled 2026-08-12),
**MY WORKS** (the personal library — supersedes the "My uploads" label; the route
`/library/uploads` stays, per that page's own comment: changing a linked URL is its own
decision; works listed with title, type, and per-document status — queued/parsing/ready/empty,
never silently dropped), **PRAYER JOURNAL** (untouched). **Later (filed, E9 addendum):** an
expandable **MY LIBRARY** umbrella grouping the user's artefact types — notes, highlights,
prayers, sermons, studies — as they scale, with organizing capability designed in a later
build.

### 7.2 Thread page (companion-owned; constraints stated here)
Four-level collapse within a turn: question line → answer → surfaced list ("9 sources") → item.
Turns themselves are **flat, dated, independent siblings** — never visually nested under one
another; the composer reads "Ask another question," not a chat box (review P-4; R0 is an owner
ruling and the grammar must not imply memory). Collapse-all = a table of contents of questions.
Back from a work re-expands the originating turn to the sources level. Visited items marked
(client-only `localStorage`; S-9). Every item: **Open** / **Save to study**.

### 7.3 The merged search surface (R1 + R5; review P-1)
One route, one box. Groups, in order: **Your studies**, **Your works** (the uploaded corpus via
`/api/user-corpus/search`), **Your prayers** (`prayers.body`), **Your notes** (`notes.body`) —
each signed-in and non-empty — then **Commentaries**, **Sermons**, **Hymns & Poetry**,
**Theology**, **Lexicons**. Every group from its own capped query (§2.5, §6.4), so every count
is true and every empty group is honestly empty. Per-group "show more" paginates that group
only. Register labels on every library row (S-5); personal rows need no register label — group
membership says whose they are. **Personal groups are governed by an explicit include-personal
checkbox (E8, ruled 2026-08-12)** — the user decides whether their own works/writings are in
scope for a given search. "The topic view" is this page with a subject typed in — not a
separate route (E5 resolved by the merge).

### 7.4 Study doc page
Title (inline edit), pin toggle, export, block stream. Text blocks edit in place (markdown,
debounced autosave, **visible unsaved/failed state** — S-13). Clippings render attribution +
quote + Open; tombstones render attribution + notice, no link. "+ Text" between blocks; clippings
arrive via Save to study, never from an in-editor corpus fetch.

### 7.5 Save-to-study affordance (review P-3)
**Default target:** the study you last saved to — one tap, toast: *"Saved to Rahab. Change?"*
The picker (recents, pinned, "New study" titled from context) is the second tap, only when
wanted. Highest-frequency verb in the feature; the difference between one tap and two is the
difference between used and demoed.

---

## 8. Invariants — each ships with its red-proof

`docs/THE_LOOP.md`: a check never watched go RED proves nothing. Red-proofs are written as
executable checks, not disjunctions (review S-N).

| # | Invariant | Red-proof |
|---|---|---|
| S-1 | The server writes clipping `quote`/`attribution`; client-supplied quote text is **rejected with 400** | POST a block carrying `quote` → assert 400 → red |
| S-2 | An unservable clipping renders as a tombstone | seed a clipping with an unserved `source_id`; assert attribution-only render → red |
| S-3 | The re-check covers **section-less rows (ask path) and source_id-less rows (reader path)**, and fails closed | seed each shape; make the lookup throw; assert tombstone → red |
| S-4 | Cross-tenant read/write impossible on all three tables — two real accounts over `app_runtime`; A **does** see A's rows | B guesses A's ids on read and write → red (C5 carried: RLS unproven under Neon's user-id format; belts are load-bearing; a belt-removed control proves RLS separately) |
| S-5 | Every search-surface row carries its register label; no register is presented as exegesis | remove `sourceType` from the corpus query; assert the existing register-wall invariant goes red → red |
| S-6 | Search never surfaces staged/quarantined works | staged work with matching text; assert absent (extends the published-boundary invariant) → red |
| S-7 | Studies list, blocks read, and every search group are bounded — row caps **and** a stated byte ceiling; soft-deleted studies contribute nothing to search | remove a LIMIT → red; tombstone a study, assert its blocks absent from search → red |
| S-8 | A block op cannot mutate another study's block | op naming a foreign study's block id → 0 rows, error → red |
| S-9 | Collapse/visited state is client-only; no render path depends on it | make a render path read `localStorage`; assert the check goes red → red |
| S-10 | A tombstone keeps attribution and drops quote **and link** | assert no anchor in the tombstone render → red |
| S-11 | **Every write verb the block layer issues is granted** — derived from the code (the list of SQL verbs the routes emit), not hand-listed | add an op using an ungranted verb → red (the check `UX_REMEDIATION.md §9` has filed and nobody built; review S-B) |
| S-12 | An empty register group is **its own query's zero**, never a truncation artefact | seed a hymn match, request with a higher-ranked commentary match present at limit=1; assert the hymn group still shows its row → red |
| S-13 | A failed text-block write is visible in the editor before the next debounce fires; the buffer is never discarded | make the block route 500; assert unsaved state renders → red |
| S-14 | Block order is stable and total across renders | insert two blocks at the same computed midpoint; assert deterministic order (`position, id`) → red |

---

## 9. Owner decisions

| # | Decision | Blocks | Recommendation |
|---|---|---|---|
| E1 | `/study/[id]` is a shipped `ComingSoon` whose copy promises conversation — R0 forbids it | T1 | **RULED 2026-08-12: the user-facing name is "My Studies."** The ComingSoon copy must still drop the conversational promise |
| E2 | `study_guides` (unused, blob-shaped) — leave or drop | T1 | Leave; dropping is an ops decision |
| E3 | One master doc vs. many studies | T1 | **RULED 2026-08-12: many.** A new study = a new doc ("Rahab" is one doc; "Perseverance" is another). The user saves and organizes their docs; no master doc with everything in it |
| E4 | Retention | T1 | **RULED 2026-08-12: forever**, tombstoned delete — matches the companion's D3 |
| E5 | ~~Topic view route/name~~ | — | **Resolved by the P-1 merge:** one search surface; no separate `/topics` route |
| E6 | ~~Whole-body granularity~~ | — | **Resolved:** one block per reading unit, capped per op (§6.3) |
| E7 | Default save target = last-used study (§7.5) | T2 | **RULED 2026-08-12: always auto-save, never ask.** Editing a study saves to that study automatically, every time, with no prompt. The Save-to-study clipping affordance likewise defaults to the last-used study (one tap; the picker is only for choosing a different one) |
| E8 | Composition order (§12): finder vs. drafter | post-T3 | **RULED 2026-08-12: finder ONLY — the drafter is ruled out, not deferred.** The helper matches the user's own ideas to the corpus (commentaries, hymns, poems, lexicons, sermons) and, via an include-personal checkbox, to their own works — recommended readings, never written prose |
| E9 | Do prayers/notes physically move into My Works? | T3 | **RULED 2026-08-12: homes stay** (Prayer Journal is shipped; notes are verse-anchored in the reader). Unification is at the search layer. Owner amendment: everything is *viewable* together — see the My Library umbrella below |

**Owner direction, filed for later (2026-08-12, explicitly "decide later"):** a **My Library**
umbrella — the master collection of the user's things: notes, highlights, prayers, sermons,
studies. Homes stay (E9); My Library is the single *view* over all of them. The sidebar gets an
expandable MY LIBRARY grouping listing each artefact type as they scale, and an **organizing
capability** (beyond title/type metadata) is filed for a later build. Not designed here; recorded
so T3's search surface and the sidebar work don't foreclose it.

---

## 10. Slices

- **T0 — recon (small, read-only; rides gate A5).** (a) Ask-surface identity completeness: what
  fraction of surfaced items carry a `source_id` that resolves in `embeddings` — one aggregate.
  (b) Register census refresh (§2.6). (c) The provenance leg for `section_id`-keyed clippings:
  forbidden provenance lives on `embeddings` rows; confirm how a sections-only clipping re-checks
  it (register works are licensed at work level — likely fine; namespace-B sections were
  backfilled from embeddings — verify the linkage exists for the check). The old "confirm the
  `sections`→`embeddings` join" item is **closed negatively** — the relation does not exist (§2.3).
- **T1 — schema + block ops + doc page.** Migration as §6.1 **including GRANTs and the
  verification block**; routes with H1/H2 belts; `/studies` list; `/studies/{id}` with text
  blocks, revisions, visible save state, markdown export. S-4, S-7, S-8, S-11, S-13, S-14.
- **T2 — clippings.** §6.3 both legs, the affordance with default target, clipping render +
  tombstone (one shared module with the history surface), whole-body cap, the Flow D purge op.
  S-1, S-2, S-3, S-10.
- **T3 — the merged search surface.** Per-register grouped queries + studies group. S-5, S-6,
  S-12. Prod expectations per §2.6.
- **T4 — companion addendum.** Collapse model, visited markers, thread pinning, deletes —
  executed in the ask-history slices, gated as §4.3 states.

Browser verification at 390px and desktop, authenticated (the `/gate` password makes `curl`
blind — the N4 lesson), is part of Done for every UI slice.

---

## 11. What this design does not claim

- That register works exist on prod (measured: they do not, §2.6).
- That a `sections`→`embeddings` relation exists (measured: it does not, §2.3) — the design is
  built around its absence.
- That the provenance leg of the `section_id`-keyed re-check is fully specified (T0-c closes it).
- That RLS binds under Neon's user-id format (C5, carried; belts load-bearing).
- Anything about latency, accuracy, or faithfulness gates — no LLM call, no retrieval change.
  (The composition future in §12 does not change this: the finder is retrieval, and the
  drafter is ruled out by owner ruling, 2026-08-12.)
- That this document is verified. It is a list of measured claims until its invariants have been
  watched go red.

---

## 12. Where this goes — sermon and paper composition (shaped for, not built)

**Owner direction, 2026-08-11; ruled 2026-08-12:** users will create sermons and papers in the
app, with an AI helper that **matches the user's own ideas to the corpus — and never writes for
them.** The ruling is absolute (E8): no drafting, no completing thoughts, no thinking for the
user. The helper finds and matches: a portion of the user's own writing — a thought about Rahab,
prayer, perseverance — is matched directly against the ingested corpus (commentaries, hymns,
poems, lexicons, sermons) and surfaced as **recommended readings**. With an explicit
include-personal checkbox, the same matching runs against the user's **own** sermons and
writings. Exportable to Google Docs when the time comes.

**Much of the matching machinery already exists** (MEASURED 2026-08-12):
`web/src/lib/user-corpus/suggested-readings.ts` (exact per-category corpus matching against a
user's document, queued; measured against prod's 398,113 served rows),
`related-voices.ts` ("find me something like this" — semantic matching when verse anchors find
nothing), and `tradition-gap.ts`. The §12 finder is the *in-editor* application of this existing
capability, not a new engine — the same rule as F4 for the topic view.

**Why the fit is natural:**

- **A study doc already is a sermon doc.** Blocks-as-rows, the user's writing interleaved with
  attributed clippings, ordered and exportable. Composition is this design with a higher ratio
  of `text` blocks.
- **The export seam exists and the Google pipe is plumbed.** Flow E's deterministic markdown
  serialization is the on-ramp, and the connection layer is already built: `user_integrations`
  (`db/schema.sql:197-210` — provider, `composio_account_id`, scopes, RLS) plus the Composio
  client wrapper (`web/src/lib/composio.ts`). Export-to-Docs is "connect account, push the same
  serialization" — a T-later slice, not a re-architecture.
- **Clippings are citations.** Provenance-safe snapshots with attribution and servability
  re-checks are exactly what a published sermon or paper needs from its sources.

**The rules that keep it safe:**

1. **The finder is retrieval, not composition.** Matched passages enter the doc **only through
   the §6.3 clipping write** — server snapshot, servability check, attribution. The editor never
   receives raw corpus text to paste, and no generated text is added to anything. Zero schema
   change; stays under the retrieval rules that already govern ask.
2. **The helper never writes. Owner ruling, 2026-08-12 — not deferred, ruled out.** No draft
   paragraphs, no completions, no machine prose anywhere in a user document. Every word in a
   study doc is either the user's own or an attributed corpus quote; block `kind` only ever
   distinguishes those two. (This supersedes the earlier "drafter as gated future slice"
   framing — there is no drafter slice, on any horizon.)
3. **Matching is transparent.** Recommended readings are shown as what they are — real passages
   with attribution that the user opens, reads, and chooses to clip or ignore. The helper
   suggests reading; it never suggests wording.
