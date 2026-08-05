import 'server-only';
// Match a phrase to real, already-ingested topics — never generate one.
// docs/PLAN_TOPIC_MATCHING_DESIGN.md is the design record. FTS over
// sections.tsv (existing GIN index, migration 016), the same
// websearch_to_tsquery pattern search-sections.ts already runs in
// production. Returns pointers; the caller resolves a pick into a PlanSpec
// topic scope, never free text.

import { getDb } from '@/lib/db';

export interface TopicMatch {
  workSlug: string;
  workTitle: string;
  sectionId: number;
  heading: string;
  entryCount: number;
}

const MAX_LIMIT = 10;

export async function matchTopics(query: string, limit = 3): Promise<TopicMatch[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const n = Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);

  const sql = getDb();
  // RANK ON THE HEADING, not the whole tsv. The spot check (design §6, run
  // 2026-08-02) caught the naive ranking burying exact topics: "faith"
  // ranked JESUS, THE CHRIST (3,833 passages, body mentions faith dozens of
  // times) above the literal FAITH heading, and "anxiety" returned junk
  // while OpenBible's own "anxiety" topic existed. tsv (heading+body) stays
  // as the INDEXED prefilter; ordering is exact-heading first, then
  // heading-word rank, with body rank only as the tiebreak.
  const rows = (await sql.query(
    `SELECT s.id::int AS section_id, s.heading, src.slug AS work_slug, src.title AS work_title,
            (SELECT count(*)::int FROM topical_entries te WHERE te.section_id = s.id) AS entry_count
     FROM sections s
     JOIN sources src ON src.id = s.source_id
     WHERE src.source_type = 'topical_index'
       AND src.status = 'published'
       AND s.tsv @@ websearch_to_tsquery('english', $1)
     ORDER BY
       (lower(s.heading) = lower($1)) DESC,
       ts_rank_cd(to_tsvector('english', s.heading), websearch_to_tsquery('english', $1)) DESC,
       ts_rank_cd(s.tsv, websearch_to_tsquery('english', $1)) DESC
     LIMIT $2`,
    [q, n],
  )) as Array<{ section_id: number; heading: string; work_slug: string; work_title: string; entry_count: number }>;

  return rows.map((r) => ({
    workSlug: r.work_slug,
    workTitle: r.work_title,
    sectionId: r.section_id,
    heading: r.heading,
    entryCount: r.entry_count,
  }));
}
