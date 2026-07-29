# Document 7: User content storage (highlights, notes, favorites)

Where per-user data lives and how it renders through a signed-in account.
Grounded in the existing Neon schema ([db/schema.sql](../db/schema.sql)) and the
canonical verse id ([web/src/bible/verse-id.ts](../web/src/bible/verse-id.ts)).

## Decision

**Structured user content (highlights, notes, favorites, reading position) goes
in Neon Postgres.** **User-uploaded files (PDF/EPUB/audio) go in Vercel Blob,
with metadata rows in Neon.** Nothing else.

Why not the other options:

| Option | Verdict | Reason |
|---|---|---|
| **Neon Postgres** | ✅ structured data | Relational, per-user, RLS you already run, range-queryable by the canonical verse id, one backup/PITR story. You already pay for it. |
| **Vercel Blob** | ✅ files only | Object storage + CDN for binaries. Pair with the existing `user_library` table (`storage_key`). Keeps large blobs out of the DB. |
| Vercel Postgres | ❌ | Deprecated into a Neon-backed marketplace integration; you already use Neon directly. No reason to add a layer. |
| Vercel KV (Upstash Redis) | ❌ for this | Ephemeral/cache semantics. Fine later for rate-limits or a hot "last read" cache, wrong for durable notes. |
| Vercel Edge Config | ❌ | Tiny read-mostly global config (flags), not per-user write data. |

The whole feature is CRUD over a few narrow, well-indexed tables scoped by
`user_id` — a textbook relational job. No new infrastructure.

## Anchoring: the one design decision that matters

Everything anchors to the **canonical verse id** (`book*1e6 + chapter*1e3 +
verse`), which is **translation-independent**. That is what lets a highlight made
in ESV still light up when the reader switches to KJV, and makes "everything in
John 3" a single range scan: `verse_id >= 43003001 AND verse_id < 43004000`.

Two granularities:

- **Verse / verse-range (default, robust):** anchor = `verse_id` (+ `verse_end`).
  Renders correctly in every translation. This covers the large majority of real
  use (how YouVersion/Logos highlight most of the time).
- **Sub-verse (phrase/word):** anchor = `verse_id` + the `translation` it was
  made in + character `start_offset`/`end_offset`. Offsets are translation-
  specific (a phrase in ESV is not the same character span in KJV). Rule: when
  rendering the **same** translation, apply the offsets exactly; when rendering a
  **different** translation, **degrade to a whole-verse highlight** (or a subtle
  edge marker). Do not attempt perfect cross-translation phrase mapping now — it
  needs word-alignment data and is not worth the complexity. (If original-language
  word highlighting lands later, anchor those to the OSHB/STEPBible `word_id`,
  which IS stable across English translations.)

## Schema (ready to run; matches existing conventions)

```sql
-- Highlights: verse-level (translation-independent) or sub-verse (offset-based)
CREATE TABLE highlights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  verse_id      INTEGER NOT NULL,              -- canonical start
  verse_end     INTEGER,                       -- canonical end (NULL = single verse)
  translation   TEXT,                          -- set only for sub-verse highlights
  start_offset  INTEGER,                       -- char offset in verse text (NULL = whole verse)
  end_offset    INTEGER,
  color         TEXT NOT NULL DEFAULT 'yellow',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ                     -- soft delete (sync)
);
CREATE INDEX idx_highlights_user_verse ON highlights(user_id, verse_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_highlights_user_updated ON highlights(user_id, updated_at DESC);

-- Notes: markdown, anchored to a verse or verse-range (word_id reserved for later)
CREATE TABLE notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  verse_id      INTEGER NOT NULL,
  verse_end     INTEGER,
  word_id       BIGINT,                         -- future: original-language word anchor
  body          TEXT NOT NULL,                  -- markdown
  tags          TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_notes_user_verse ON notes(user_id, verse_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_user_updated ON notes(user_id, updated_at DESC) WHERE deleted_at IS NULL;

-- Favorites / bookmarks: a verse, a passage, a commentary voice, or a sermon
CREATE TABLE favorites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('verse','passage','commentary','sermon')),
  verse_id      INTEGER,                        -- for verse/passage
  verse_end     INTEGER,
  ref           TEXT,                           -- for commentary/sermon (author slug + section id)
  label         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (user_id, kind, verse_id, ref)
);
CREATE INDEX idx_favorites_user ON favorites(user_id, created_at DESC) WHERE deleted_at IS NULL;
```

RLS, identical to every other user table in the schema:

```sql
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites  ENABLE ROW LEVEL SECURITY;

CREATE POLICY highlights_policy ON highlights
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));
-- ...same for notes and favorites
```

`gen_random_uuid()` PKs, `TEXT user_id`, `TIMESTAMPTZ`, `current_setting`-based
RLS — the same shape as `channels`, `chats`, `user_library`. `updated_at` +
`deleted_at` are added on all three specifically for sync (see below).

## Rendering via the account

1. **Per-request identity.** The Neon Auth session gives the user's stable id
   (`sub`). On each request, before touching user rows, set the RLS variable:
   `SET LOCAL app.current_user_id = <sub>` (wrap the existing `getDb()` in a
   helper that does this). RLS then guarantees isolation; app code never filters
   by user by hand.
2. **Reader overlay (the hot path).** When a chapter loads, one query returns all
   of the user's content for it, using the range trick:
   ```sql
   SELECT * FROM highlights
   WHERE user_id = current_setting('app.current_user_id', true)
     AND verse_id >= $chapter_start AND verse_id < $chapter_end
     AND deleted_at IS NULL;
   ```
   (`$chapter_start = book*1e6 + chapter*1e3 + 1`, `$chapter_end = ...+1000`.)
   Same for notes and favorites. The `VerseDisplay` component tints highlighted
   verses, shows a note indicator, and a favorite star — layered on top of the
   static scripture JSON it already renders. Writes are optimistic (update UI
   immediately, POST in the background) with a small client cache keyed by chapter.
3. **"My Library" account views.** Cross-chapter lists, all keyed by `user_id`:
   notes ordered by `updated_at`, highlights grouped by book, favorites by
   `created_at`. These slot into the existing sidebar "My books" / library
   section. Because the anchor is a canonical verse id, `formatVerseId()` renders
   every entry as a clickable reference straight into the reader.

Access layer: Next 15 server routes / server actions using
`@neondatabase/serverless` (`getDb()`), one thin repository module per table
(`createHighlight`, `listByChapter`, `update`, `softDelete`). No ORM needed.

## Built sync-ready from day one (cheap now, unlocks the roadmap)

The platform plan is web-first, then React Native mobile and a Tauri/Electron
desktop app on **one Neon backend**. Offline-first sync is inevitable. The three
columns that make it possible cost nothing today:

- **UUID PKs** — clients generate ids offline; no server round-trip to create.
- **`updated_at`** — delta sync: `WHERE user_id = me AND updated_at > $cursor`.
- **`deleted_at`** (soft delete) — deletes replicate; last-write-wins resolves
  conflicts without tombstone tables.

Do not build sync now. But with these columns, a later local SQLite mirror on
mobile/desktop syncing to Neon by `updated_at` cursor is a straight path. Hard
deletes and integer autoincrement PKs would close that door.

## Files (already handled, for completeness)

User uploads use the existing `user_library` table: binary in **Vercel Blob**
(the `storage_key`), metadata in Neon. Extracted text and its embeddings go in
`user_sections` / `embeddings` (`source_type = 'user_upload'`) so uploaded
material flows through the same retrieval + verifier path as the corpus and
renders with the contract 1.1 "from your library" badge. Keep large binaries out
of Postgres.

## Build order

1. Add the three tables + RLS to `db/schema.sql`; run via `db/migrate.mjs`.
2. `getDb()` helper that sets `app.current_user_id` from the Neon Auth session.
3. Repository modules + server actions (create/list-by-chapter/update/soft-delete).
4. Reader overlay: highlight tint + note indicator + favorite star on `VerseDisplay`.
5. "My Library" views for notes/highlights/favorites in the sidebar section.
6. (Later) delta-sync endpoint and a local mirror when mobile/desktop start.
