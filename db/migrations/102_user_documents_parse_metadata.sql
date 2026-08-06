-- ============================================================
-- 102: parse metadata, queue claim, retry counter, checksum dedupe on user_documents
-- ============================================================
-- Slice 1 step 2 (upload -> parse -> status). Everything here exists because something in the
-- order or the design REQUIRES it, not because it might be useful later:
--
--   mime_type         SERMON_SEARCH_DESIGN §9 and the Slice 1 order's Definition of Done both
--                     require "parse-failure rate BY FILE TYPE". That number cannot be computed
--                     unless the type is stored, and it must be the SNIFFED type, never the
--                     declared one — §8 says "MIME sniff (don't trust extension)", so recording
--                     the extension would record the thing we deliberately refuse to trust.
--   page_count        The scanned-PDF loud failure is defined as "near-zero extractable text over
--                     N PAGES" (§8). Without the page count the threshold has no denominator and
--                     the decision cannot be audited after the fact.
--   extractable_chars The numerator of that same decision. Stored so a document that was ruled
--                     'empty' can be re-examined without re-parsing it, and so the threshold can
--                     be re-tuned against real history rather than re-run against lost evidence.
--   attempts          §8 requires per-doc RETRY. A retry counter is what stops a poison document
--                     from being re-claimed forever, and it is the only way to distinguish "failed
--                     once, transiently" from "fails every time".
--   claimed_at        The queue is a Postgres FOR UPDATE SKIP LOCKED drain (§8). If a worker dies
--                     mid-parse the row is left in 'parsing' with nothing holding it. Without a
--                     claim timestamp that row is invisible to the drain forever -- a silent drop,
--                     which is the exact failure class this slice exists to refuse.
--
-- CHECKSUM DEDUPE. §8: "checksum for dedupe (they keep Rom8-FINAL-v2-USETHIS.docx)". The unique
-- index is PARTIAL on checksum IS NOT NULL, because a row may legitimately exist before its
-- checksum is computed, and because NULLs are not equal to each other in a unique index anyway --
-- stated explicitly so the partiality reads as deliberate rather than as an oversight.
-- It is scoped (user_id, checksum): two users uploading the same public-domain sermon are two
-- documents, not a collision, and cross-user dedupe would leak the existence of another user's
-- upload through a constraint violation.
--
--   DATABASE_URL="$(cat ~/.neon_lane_b_owner_url)" MIGRATE_TARGET_ENDPOINT=ep-snowy-bird-atmdsv3g \
--     node db/apply-migration.mjs db/migrations/102_user_documents_parse_metadata.sql
-- ============================================================

ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS mime_type         TEXT;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS page_count        INT;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS extractable_chars INT;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS attempts          INT NOT NULL DEFAULT 0;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS claimed_at        TIMESTAMPTZ;

-- Dedupe: one document per (user, file contents). See the note above on why it is partial and why
-- it is scoped to the user.
CREATE UNIQUE INDEX IF NOT EXISTS user_documents_user_checksum_uidx
  ON user_documents (user_id, checksum)
  WHERE checksum IS NOT NULL;

-- The drain's claim query: oldest queued first, and stale 'parsing' rows reclaimable by age.
-- Partial on the two states the drain can ever claim, so it stays small as ready/failed rows
-- accumulate -- those are the overwhelming majority in steady state and the drain never reads them.
CREATE INDEX IF NOT EXISTS user_documents_queue_idx
  ON user_documents (status, claimed_at NULLS FIRST, created_at)
  WHERE status IN ('queued', 'parsing');
