// "Find me something like this" — the corpus by MEANING, when the verse anchors find nothing.
//
// ── WHY THIS EXISTS, MEASURED ───────────────────────────────────────────────────────────────────
// `traditionGap` is keyed entirely on verse anchors, so a sermon that paraphrases rather than
// quoting verbatim anchors NOTHING and the panel is empty. Reproduced on production with a real
// sermon on grace: `ready`, searchable, and `rangesConsidered: 0` → zero voices, against a served
// corpus of 398,113 rows with 44 prose authors, 22 hymn authors and 13 poetry authors — plenty of
// which is about grace. "There should be a result and there isn't" was exactly right.
//
// Detection of the quoted translation is not built (ADR-100), so anchoring shingles against the
// KJV family; a preacher quoting the NIV, or preaching the sense of a passage without quoting it,
// is invisible to the anchor channel by construction. This channel is the semantic spine the
// design always named for that residual (SERMON_SEARCH_DESIGN §2: "anchor-only misses
// un-scriptural-but-relevant prose").
//
// ── WHY THIS IS A DIFFERENT CLAIM, AND MUST BE WORDED AS ONE ────────────────────────────────────
// The anchor panel says: these voices write ON the passages your document cites. That is a fact
// about verse ids. This says: these voices are NEAR your document in meaning. It is a similarity
// score, not a citation, and the UI must never let the two read the same — the product reports
// what others said, and "related" is a weaker claim than "on this passage".
//
// ── WHY THREE QUERIES, AND NOT ONE ──────────────────────────────────────────────────────────────
// A single nearest-neighbour sweep returns prose almost exclusively: prose is 303,148 of the
// 398,113 served rows, and hymns and poetry (11k combined, shorter and more figurative) never
// reach the top. Measured — a global top-12 was 8/12 Spurgeon and contained no hymn or poetry at
// all. Since the ASK is hymns and poetry alongside the commentators, each register is retrieved on
// its own budget.
//
// The register filter is applied as `metadata->>'register' = $` for hymn and poetry only. Writing
// it as `COALESCE(metadata->>'register','prose') = 'prose'` for the third is not indexable and
// took **84 seconds** against production; the unfiltered sweep is index-backed, returns the same
// prose, and takes ~400ms. All three run in parallel: 1.24s end to end, measured.

import { runAsUser } from '@/lib/db';
import { FORBIDDEN_PROVENANCE_DOMAINS } from '@/lib/forbidden-provenance.mjs';
import { EMBEDDING_DB_SLUG, corpusRecordedModel, isJoinable } from './model';
import type { CorpusPredicate } from './tradition-gap';

/** A corpus voice near this document in meaning, with the register it belongs to. */
export interface RelatedVoice {
  author: string;
  work: string;
  register: 'prose' | 'hymn' | 'poetry';
  tradition: string;
  /** Cosine similarity, 0-1. Surfaced so the UI can be honest that this is a score, not a citation. */
  similarity: number;
  origin: 'corpus';
}

export interface RelatedVoicesResult {
  voices: RelatedVoice[];
  /** False when the document has no comparable vectors — the caller must say so, not show an empty shelf. */
  comparable: boolean;
  /** Set when the user's rows were embedded by a different model; the join is refused, not faked. */
  modelMismatch?: string;
}

/** Per register, so one prolific preacher cannot take the whole panel. */
const PER_REGISTER = 6;
/** Inner sweep before de-duplication by author+work. */
const SWEEP = 300;

// hnsw.ef_search for the three sweeps, set transaction-locally in the SAME runAsUser batch
// (runAsUser wraps its queries in one sql.transaction; `set_config(…, true)` anywhere else is a
// no-op on the stateless driver — routing.ts:311-315, the one shipped precedent). At the default
// ef_search=40 an HNSW scan returns AT MOST 40 candidates, so a LIMIT ${SWEEP} sweep was starving
// by construction whenever the planner picked the index — the failure the sibling module measured
// at 21/60 unfiltered and 0/60 filtered (suggested-readings.ts header). 400 = SWEEP plus a third
// of headroom for rows the author/predicate conjuncts reject, well under pgvector's 1000 cap and
// under the measured 7.4s-at-800 cost (routing ships 64 for a pool of 50 — same "smallest that
// fills" rule, scaled to this LIMIT). Whether production's planner takes the index at all still
// needs the owner-terminal `EXPLAIN (ANALYZE)` the audit order records as owed (H9); if it seq
// scans, the GUC is inert and the sweep is already exact.
const SWEEP_EF_SEARCH = 400;

type Row = { author: string; work: string | null; register: string | null; tradition: string | null; sim: number };

/**
 * Corpus voices near this document in meaning.
 *
 * PARITY IS ENFORCED, NOT ASSUMED (§6). The centroid is built only from rows whose `model_slug`
 * names the corpus's model, and if the document has none the result is `comparable: false` rather
 * than a silently empty list — a cross-model cosine returns plausible garbage with no error, which
 * is the one failure here that would never announce itself.
 */
export async function relatedVoices(
  userId: string,
  documentId: string,
  predicate: CorpusPredicate,
): Promise<RelatedVoicesResult> {
  // The corpus's OWN recorded model, read from the plane the comparison targets — never our
  // constant, which would make the check tautological (see model.ts).
  const [modelRows] = await runAsUser(userId, (sql) => [
    sql`SELECT DISTINCT ue.model_slug FROM user_section_embeddings ue
          JOIN user_sections s ON s.id = ue.section_id
         WHERE ue.user_id = ${userId} AND s.document_id = ${documentId}`,
  ]);
  const slugs = (modelRows as { model_slug: string }[]).map((r) => r.model_slug);
  if (slugs.length === 0) return { voices: [], comparable: false };
  // The corpus value is READ, not assumed (H3): `isJoinable(slug, EMBEDDING_DB_SLUG)` was our
  // constant on both sides — the exact tautology model.ts forbids, green for everything we write
  // while the corpus silently re-embeds under it. `empty` (nothing to verify against — and
  // nothing to join with) and `mixed` (mid-re-embed: a centroid join would mix vector spaces)
  // both refuse rather than guess.
  const corpus = await corpusRecordedModel((build) => runAsUser(userId, build));
  if (corpus.kind !== 'one') {
    return corpus.kind === 'mixed'
      ? { voices: [], comparable: false, modelMismatch: `corpus records ${corpus.models.join(', ')}` }
      : { voices: [], comparable: false };
  }
  const bad = slugs.find((s) => !isJoinable(s, corpus.model));
  if (bad) return { voices: [], comparable: false, modelMismatch: bad };

  // One vector for the whole work. A per-chunk sweep is better recall and costs a query per chunk;
  // the centroid is what makes this a fixed, ~1s panel instead of a per-document surprise.
  const [centroidRows] = await runAsUser(userId, (sql) => [
    sql`SELECT AVG(ue.embedding)::vector AS v
          FROM user_section_embeddings ue
          JOIN user_sections s ON s.id = ue.section_id
         WHERE ue.user_id = ${userId} AND s.document_id = ${documentId}
           AND ue.model_slug = ${EMBEDDING_DB_SLUG}`,
  ]);
  const centroid = (centroidRows as { v: string | null }[])[0]?.v;
  if (!centroid) return { voices: [], comparable: false };

  // The provenance belt (D9): the same leg servability.ts / studies.ts / research.ts apply.
  // `served` does NOT subsume it — ADR-044's served-but-forbidden rows are live exposure — and a
  // voice surfaced from a forbidden aggregator is an attribution the product may not make.
  const sweep = (registerFilter: string): string => `
    WITH near AS (
      SELECT e.metadata->>'author'    AS author,
             e.metadata->>'work'      AS work,
             e.metadata->>'register'  AS register,
             e.metadata->>'tradition' AS tradition,
             1 - (e.embedding <=> $1::vector) AS sim
        FROM embeddings e
       WHERE e.user_id IS NULL
         AND e.metadata->>'author' IS NOT NULL
         AND (e.metadata->>'sourceUrl' IS NULL OR NOT EXISTS (
                SELECT 1 FROM unnest($2::text[]) d
                WHERE lower(e.metadata->>'sourceUrl') LIKE '%' || d || '%'))
         AND ${predicate}
         ${registerFilter}
       ORDER BY e.embedding <=> $1::vector
       LIMIT ${SWEEP}
    )
    SELECT DISTINCT ON (author, work) author, work, register, tradition, sim
      FROM near ORDER BY author, work, sim DESC`;

  const domains = [...FORBIDDEN_PROVENANCE_DOMAINS];
  const [, general, hymn, poetry] = await runAsUser(userId, (sql) => [
    // Transaction-local, so it governs exactly the three sweeps below and cannot leak into any
    // other query on the pooled connection. Value rationale at SWEEP_EF_SEARCH.
    sql`SELECT set_config('hnsw.ef_search', ${String(SWEEP_EF_SEARCH)}, true)`,
    sql.query(sweep(''), [centroid, domains]),
    sql.query(sweep(`AND e.metadata->>'register' = 'hymn'`), [centroid, domains]),
    sql.query(sweep(`AND e.metadata->>'register' = 'poetry'`), [centroid, domains]),
  ]);

  const take = (rows: unknown, register: RelatedVoice['register']): RelatedVoice[] =>
    (rows as Row[])
      .map((r) => ({
        author: r.author,
        work: r.work ?? '',
        register: (r.register === 'hymn' || r.register === 'poetry' ? r.register : 'prose') as RelatedVoice['register'],
        tradition: r.tradition ?? '',
        similarity: Number(r.sim),
        origin: 'corpus' as const,
      }))
      // The unfiltered sweep can return a hymn or a poem; let it be counted as what it is rather
      // than relabelled by which query happened to find it.
      .filter((v) => (register === 'prose' ? v.register === 'prose' : v.register === register))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, PER_REGISTER);

  const seen = new Set<string>();
  const voices = [...take(general, 'prose'), ...take(hymn, 'hymn'), ...take(poetry, 'poetry')].filter((v) => {
    const key = `${v.author}|${v.work}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { voices, comparable: true };
}
