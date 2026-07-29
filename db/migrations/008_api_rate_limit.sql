-- ============================================================
-- 008: per-user fixed-window rate limit for /api/ask (wallet-DoS guard)
-- ============================================================
-- ADDITIVE, non-breaking, reversible (DROP TABLE api_rate_limit). The teacher
-- endpoints spend on embeddings + rerank + Qwen; an authed beta tester (or any
-- gate-bypass path) could otherwise hammer them. A per-user fixed-window counter
-- (one atomic upsert per request) enforces ASK_LIMIT_PER_MIN / ASK_LIMIT_PER_DAY.
-- See docs/SITE_GATE_RATELIMIT_DESIGN.md (beta wall 1).
--   Run as neondb_owner: node db/apply-migration.mjs db/migrations/008_api_rate_limit.sql
--
-- RLS is intentionally NOT enabled: this is an operational counter keyed by
-- user_id, not user-readable content. app_runtime (NOBYPASSRLS) must read/write
-- freely; there is nothing sensitive to isolate (counts only, no secrets).
-- ============================================================

CREATE TABLE IF NOT EXISTS api_rate_limit (
  user_id      text        NOT NULL,
  bucket       text        NOT NULL,      -- 'ask:min' | 'ask:day'
  window_start timestamptz NOT NULL,      -- truncated window start (UTC)
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);

-- Supports the periodic sweep of expired windows (DELETE WHERE window_start < now()-interval).
CREATE INDEX IF NOT EXISTS api_rate_limit_window_idx ON api_rate_limit (window_start);

-- Explicit least-privilege DML grant for the runtime role (001's ALTER DEFAULT
-- PRIVILEGES should already cover future tables; this is belt-and-suspenders).
GRANT SELECT, INSERT, UPDATE, DELETE ON api_rate_limit TO app_runtime;
