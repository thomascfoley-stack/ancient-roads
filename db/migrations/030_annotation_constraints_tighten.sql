-- ============================================================
-- 030: tighten the Phase 3 annotation constraints (fresh-audit remediation)
-- ============================================================
-- Remediates findings from the independent Phase 3 audit (2026-07-19). 025-029
-- are already applied; this migration closes the gaps rather than editing an
-- applied file.
--
-- (a) ADR-027 fail-closed for SPANS. A section-anchored HIGHLIGHT carries
--     span_start/span_end into sections.body. Without a pinned
--     source_content_hash a later re-ingest that shifts the body is UNDETECTABLE,
--     so the span paints at wrong offsets — exactly the "corrupt span" ADR-027
--     forbids. Section highlights therefore REQUIRE source_content_hash.
--     SCOPED DELIBERATELY: `notes` and `bookmarks` have NO span columns (verified
--     on dev — notes is verse_id/verse_end/body; bookmarks is an anchor + label),
--     so a section note/bookmark carries no offsets and no span can be corrupted.
--     The hash stays OPTIONAL there (still useful to flag "the text changed"),
--     rather than over-constraining a shape that cannot go corrupt. This is a
--     narrower fix than the audit proposed; the reason is written here so the
--     deviation is visible, not silent.
-- (b) translation is verse-only (offsets are translation-relative, 015). A
--     section highlight with translation='kjv' was accepted; now rejected.
-- (c) Explicit target_kind whitelist. Design §4 specifies it literally. It was
--     previously enforced only as a SIDE EFFECT of the XOR (a bogus kind
--     falsifies both disjuncts). If the XOR is ever relaxed or split the
--     whitelist would vanish with it — so state it directly.
-- (d) annotation_tags uniqueness must be per-user. UNIQUE(tag_id,target_type,
--     target_id) is enforced by an index, and unique indexes are NOT subject to
--     RLS: user A inserting a link to B's (tag,target) uuids would collide with
--     B's own later insert — a cross-user denial of service and an existence
--     oracle on rows B cannot see. Adding user_id scopes the collision domain.
-- (e) Keyset tiebreaks. 015 deliberately put `id` in (user_id, ts DESC, id) so
--     listHighlights/listNotes page deterministically. The three Phase 3 list
--     indexes omitted it; Phase 4 paginates exactly these, and ties on
--     created_at/updated_at (bulk actions, a throttled progress PUT) would skip
--     or duplicate rows across pages.
--
-- IDEMPOTENT: DROP CONSTRAINT/INDEX IF EXISTS before each ADD/CREATE. Atomic.
-- Row counts are trivial (all Phase 3 tables are empty; highlights 5, notes 2).
-- RUN: node db/apply-migration.mjs db/migrations/030_annotation_constraints_tighten.sql
-- ROLLBACK: restore the 025/029 constraint bodies (see those files' headers).
-- ============================================================

BEGIN;

-- (c) explicit target_kind whitelist on all three polymorphic tables
ALTER TABLE notes      DROP CONSTRAINT IF EXISTS notes_target_kind_chk;
ALTER TABLE notes      ADD  CONSTRAINT notes_target_kind_chk      CHECK (target_kind IN ('verse','section'));
ALTER TABLE highlights DROP CONSTRAINT IF EXISTS highlights_target_kind_chk;
ALTER TABLE highlights ADD  CONSTRAINT highlights_target_kind_chk CHECK (target_kind IN ('verse','section'));
ALTER TABLE bookmarks  DROP CONSTRAINT IF EXISTS bookmarks_target_kind_chk;
ALTER TABLE bookmarks  ADD  CONSTRAINT bookmarks_target_kind_chk  CHECK (target_kind IN ('verse','section'));

-- (a)+(b) highlights: section rows must pin the content hash and must not carry a translation
ALTER TABLE highlights DROP CONSTRAINT IF EXISTS highlights_anchor_xor;
ALTER TABLE highlights ADD CONSTRAINT highlights_anchor_xor CHECK (
  (target_kind = 'verse'
     AND verse_id IS NOT NULL AND section_id IS NULL) OR
  (target_kind = 'section'
     AND section_id IS NOT NULL AND verse_id IS NULL
     AND source_content_hash IS NOT NULL   -- ADR-027: drift must be detectable
     AND translation IS NULL)              -- translation is verse-only (015)
);

-- (d) per-user uniqueness on the polymorphic tag join
ALTER TABLE annotation_tags DROP CONSTRAINT IF EXISTS annotation_tags_uniq;
ALTER TABLE annotation_tags ADD  CONSTRAINT annotation_tags_uniq UNIQUE (user_id, tag_id, target_type, target_id);

-- (e) deterministic keyset tiebreaks for the Phase 4 list queries
DROP INDEX IF EXISTS idx_bookmarks_user_created;
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created
  ON bookmarks (user_id, created_at DESC, id) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS idx_library_items_user_shelf;
CREATE INDEX IF NOT EXISTS idx_library_items_user_shelf
  ON library_items (user_id, shelf, updated_at DESC, id);
DROP INDEX IF EXISTS idx_reading_progress_user_updated;
CREATE INDEX IF NOT EXISTS idx_reading_progress_user_updated
  ON reading_progress (user_id, updated_at DESC, id);

COMMIT;
