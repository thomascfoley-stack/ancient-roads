-- Sermon-shaped metadata, extracted not typed (docs/MY_WORKS_DRAFT_AND_METADATA_DESIGN.md §2;
-- Tier 3 of docs/pm/orders/2026-08-20-uploader-deep-dive.md).
--
-- DISPLAY-ONLY SUGGESTIONS. The drain writes what the manuscript head appears to say — the first
-- explicit stated text, a named-month preached-on date — and the UI shows them as chips beside
-- the user's own title. Nothing reads these back into title or any behavioural field in v1; a
-- wrong suggestion is a chip, not a renamed document. The confirm flow is filed, not built.
--
-- Idempotent per the 100-block convention. app_runtime already holds UPDATE on user_documents
-- (migration 100), so no grant changes.

ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS suggested_reference text;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS suggested_date date;
