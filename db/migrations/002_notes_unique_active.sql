-- ============================================================
-- SEC-2 follow-up: one active note per (user, verse), enforced by a UNIQUE partial index
-- ============================================================
-- Lets upsertNote use INSERT ... ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL
-- DO UPDATE — a single, atomic statement that fits one runAsUser transaction — instead of a
-- read-then-branch across two transactions. The predicate matches the soft-delete model: a
-- soft-deleted note (deleted_at set) does not occupy the slot, so a fresh note can be created.
--
-- Idempotent. Safe on empty/prod data (prod has 0 notes). If duplicate ACTIVE rows ever exist
-- for the same (user_id, verse_id), the unique index build fails loudly — dedupe first.

DROP INDEX IF EXISTS idx_notes_user_verse;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_user_verse
  ON notes (user_id, verse_id) WHERE deleted_at IS NULL;
