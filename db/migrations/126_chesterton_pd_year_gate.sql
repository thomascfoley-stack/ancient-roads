-- ============================================================
-- 126: Chesterton PD-year gate — a licensing control, not metadata polish
-- ============================================================
-- Owner directive 2026-08-21: the 21 staged Chesterton works carried
-- year_written NULL, so the standing rule "GK Chesterton only before 1931"
-- (ADR-112's ground; the US 95-year term) was mechanically UNCHECKABLE at flip
-- time — a licensing rule that lived only in prose. This migration closes both
-- halves:
--
--   1. Backfills first-publication years for the Chesterton works, sourced from
--      the G. K. Chesterton bibliography (en.wikipedia.org, fetched 2026-08-21;
--      it independently corroborates the one year already present —
--      historyengland 1917). Only NULL rows are written; nothing is clobbered.
--   2. Adds a CHECK that FAILS CLOSED: no row whose author matches Chesterton
--      may hold status='published' without a year_written strictly before 1931.
--      Postgres re-evaluates row CHECKs on UPDATE, so a publish flip of a
--      year-less or post-1930 Chesterton work dies at the database — the
--      control binds every write path, including ones not yet written.
--
-- The ILIKE net is deliberately wide: a false positive (some other Chesterton)
-- fails CLOSED and is fixed by giving that row its real year — the correct
-- failure direction for a licensing gate. chesterton-preexistence (quarantined,
-- likely misattributed, deliberately NOT backfilled) stays publishable-never
-- until someone establishes what it actually is and gives it a year.
--
-- NOT VALID + VALIDATE, the 038/040/112 idiom: the ACCESS EXCLUSIVE window is
-- milliseconds and existing rows are proven, not assumed, by the VALIDATE.

UPDATE sources s
   SET year_written = v.year
  FROM (VALUES
    ('chesterton-america',          1922),
    ('chesterton-ball-cross',       1909),
    ('chesterton-defendant',        1901),
    ('chesterton-divorce',          1920),
    ('chesterton-eugenics',         1922),
    ('chesterton-everlasting',      1925),
    ('chesterton-heretics',         1905),
    ('chesterton-historyengland',   1917),
    ('chesterton-innocencebrown',   1911),
    ('chesterton-longbow',          1925),
    ('chesterton-magic',            1913),
    ('chesterton-manalive',         1912),
    ('chesterton-napoleon',         1904),
    ('chesterton-orthodoxy',        1908),
    ('chesterton-thingsconsidered', 1908),
    ('chesterton-thursday',         1908),
    ('chesterton-toomuch',          1922),
    ('chesterton-trifles',          1909),
    ('chesterton-victorianage',     1913),
    ('chesterton-whatwrong',        1910),
    ('chesterton-whitehorse',       1911),
    ('chesterton-wisdom',           1914)
  ) AS v(slug, year)
 WHERE s.slug = v.slug
   AND s.year_written IS NULL;

SET lock_timeout = '2s';

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_chesterton_pd_gate;
ALTER TABLE sources ADD CONSTRAINT sources_chesterton_pd_gate
  CHECK (author NOT ILIKE '%chesterton%'
         OR status <> 'published'
         OR (year_written IS NOT NULL AND year_written < 1931)) NOT VALID;
ALTER TABLE sources VALIDATE CONSTRAINT sources_chesterton_pd_gate;
