-- ============================================================
-- 041: dormant delivery-preference columns on `plans`
-- ============================================================
-- Owner ruling 2026-08-02 evening: do NOT ask about delivery channel or a
-- calendar time-block at plan creation right now — the builder stays
-- in-app-only. But add the columns now, DEFAULTed and unused, so shipping
-- Composio push / calendar integration later (ADR-045 §8) is a read of an
-- existing column, never a backfill across every plan created before it.
--
-- ZERO-WINDOW-SAFE (ADR-025, same pattern as 031): ADD COLUMN with a
-- constant default is catalog-metadata-only in Postgres for a table this
-- small — no rewrite, no serving index touched.
--
-- Neither column is read or written by any route yet (grep confirms it at
-- the time this migration lands) — this file is schema-only.

ALTER TABLE plans ADD COLUMN IF NOT EXISTS delivery_channel TEXT NOT NULL DEFAULT 'app';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS calendar_minutes INTEGER;

ALTER TABLE plans ADD CONSTRAINT plans_delivery_channel_check
  CHECK (delivery_channel IN ('app', 'email', 'calendar'));

COMMENT ON COLUMN plans.delivery_channel IS
  'How the user wants this plan delivered. UNUSED today (041) - the app is the only channel wired. Reserved for the Composio push slice (ADR-045 SS8).';
COMMENT ON COLUMN plans.calendar_minutes IS
  'Requested daily reading time-block length in minutes, for a future calendar-push event duration. UNUSED today (041) - NULL always until that slice ships.';
