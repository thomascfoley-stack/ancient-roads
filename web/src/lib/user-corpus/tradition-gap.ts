// The tradition-gap join — "which voices from the tradition speak on the passages I engaged?"
//
// §1's step 3, and the order's "the moat": steps 1-2 are ordinary personal search, and this is the
// thing nobody else can build, because it needs a licensed, adjudicated corpus on the other side.
//
// ── THE CORPUS PREDICATE IS INJECTED, AND THAT IS ADR-104 ───────────────────────────────────────
// The predicate is a parameter so no second copy is ever written. [Header corrected 2026-08-21:
// this paragraph told maintainers `LEGAL_CORPUS_FILTER` was still the author allowlist and
// importing it returned the WRONG filter — true on the branch this file was born on, false since
// Lane A merged `served`; `routing.ts` is `(served)` and all three production call sites import
// it. The stale version was the deep dive's docs-vs-reality finding 13.]
//
// ── THE PARAMETER IS A TRUSTED SQL FRAGMENT, NOT USER INPUT ─────────────────────────────────────
// It is spliced textually, because a predicate cannot be a bound parameter — the same shape
// `routing.ts` uses for LEGAL_CORPUS_FILTER. It must therefore only ever receive a COMPILE-TIME
// CONSTANT from `routing.ts`. The branded type below exists to make an accidental
// `corpusPredicate(userInput)` call something you have to write on purpose.

import { runAsUser } from '@/lib/db';
import { FORBIDDEN_PROVENANCE_DOMAINS } from '@/lib/forbidden-provenance.mjs';

/** A SQL boolean fragment over `embeddings e`. Compile-time constants only — never user input. */
export type CorpusPredicate = string & { readonly __corpusPredicate: unique symbol };

/**
 * Brand a compile-time constant as a corpus predicate.
 *
 * Rejects anything containing a statement terminator or comment marker. That is NOT a sanitiser —
 * a determined caller can defeat it and it would be dangerous to rely on — it is a tripwire for the
 * accident this type exists to prevent, and it fails loudly rather than silently accepting.
 */
export function corpusPredicate(fragment: string): CorpusPredicate {
  if (/;|--|\/\*/.test(fragment)) {
    throw new Error('corpusPredicate: fragment contains a statement terminator or comment marker');
  }
  return fragment as CorpusPredicate;
}

/** Maps 1:1 onto `Attribution` (web/src/contract/types.ts), which Slice 4 feeds to the verifier. */
export interface TraditionVoice {
  author: string;
  work: string;
  tradition: string;
  /** Always 'corpus' here. A user's own words are never returned by this function (§7). */
  origin: 'corpus';
  /** The verse of the first engaged entry, for a deep link. */
  verseId: number;
  sourceId: string;
  /** How many of THIS document's anchor ranges the work engages — the ranking signal. */
  rangesHit: number;
}

export interface TraditionGapResult {
  voices: TraditionVoice[];
  /** Distinct AUTHORS, not entries — see the note in the query. */
  authorCount: number;
  /** How many verse ranges of the document were considered (bounded — see MAX_RANGES). */
  rangesConsidered: number;
}

/**
 * Ranges scanned per document. A long book can anchor thousands of verses, and an unbounded
 * range set turns this into a corpus-wide scan. CLAUDE.md: never an unbounded result set.
 */
export const MAX_RANGES = 200;
export const MAX_VOICES = 50;

/**
 * The voices the tradition offers on this document's passages.
 *
 * ── WHAT THIS COMPUTES IN SLICE 1, STATED PRECISELY ─────────────────────────────────────────────
 * The design's question is "which voices did I NOT engage?". Answering the *not* half needs a
 * signal for which voices the document DID engage, and Slice 1 has none: the anchoring channels
 * detect Scripture, not quoted commentators. So this returns the voices on the document's
 * passages — the full set, not the complement — and the "gap" refinement waits for a
 * commentator-detection channel it would be dishonest to fake by, say, string-matching author
 * names in the prose.
 *
 * That is still the moat's mechanism: it is the corpus join by verse, which is what nothing else
 * can do. It is not yet the moat's headline.
 *
 * ── ONE STATEMENT, AND WHY ──────────────────────────────────────────────────────────────────────
 * `runAsUser` takes a static array of queries, so there is no read-then-branch inside the RLS
 * transaction. The document's anchors are a CTE feeding the corpus scan. Two round trips would
 * leave the bound transaction and cost the isolation guarantee.
 *
 * ── THE MULTIPLICATION HAZARD, WHICH APPLIES TWICE ──────────────────────────────────────────────
 * `work.ts:155` records it: a section carries several anchor rows, so a plain join multiplies rows
 * and a LIMIT silently starts counting anchors instead of sections. Here BOTH sides are many —
 * many anchors per document, many corpus entries per verse — so the product is quadratic. It is
 * collapsed with DISTINCT ON before any limit is applied, and the ranges themselves are bounded
 * first, in the CTE.
 *
 * ── A VOICE IS AN AUTHOR, NOT AN ENTRY ──────────────────────────────────────────────────────────
 * `today.ts:127-140` records that counting entries let ONE commentator satisfy a "≥2 voices" floor
 * and concealed a zero-coverage hole. Rows are one per (author, work) because that is what a reader
 * wants to see, but `authorCount` is computed over DISTINCT AUTHORS and is the number any floor
 * must use.
 */
export async function traditionGap(
  userId: string,
  documentId: string,
  predicate: CorpusPredicate,
  opts: { maxRanges?: number; maxVoices?: number } = {},
): Promise<TraditionGapResult> {
  const maxRanges = Math.min(MAX_RANGES, Math.max(1, opts.maxRanges ?? MAX_RANGES));
  // Read the document's ranges, then delegate — a stored document and a pasted draft share ONE
  // SQL body (traditionGapForRanges), per the no-second-copy rule and the draft-check design.
  const [rangeRows] = await runAsUser(userId, (sql) => [
    sql`SELECT DISTINCT a.verse_id_start AS s, a.verse_id_end AS e
          FROM user_section_anchors a
          JOIN user_sections sec ON sec.id = a.section_id
         WHERE a.user_id = ${userId} AND sec.document_id = ${documentId}
         ORDER BY a.verse_id_start
         LIMIT ${maxRanges}`,
  ]);
  const ranges = (rangeRows as { s: number; e: number }[]).map((r) => ({ start: r.s, end: r.e }));
  return traditionGapForRanges(userId, ranges, predicate, opts);
}

/**
 * The join itself, over EXPLICIT ranges — what a stored document's anchors reduce to, and what a
 * pasted draft's in-process anchors produce directly (the draft check, design §1). Bounded the
 * same way; the ranges array is bound as jsonb, never spliced.
 */
export async function traditionGapForRanges(
  userId: string,
  rangesIn: { start: number; end: number }[],
  predicate: CorpusPredicate,
  opts: { maxRanges?: number; maxVoices?: number } = {},
): Promise<TraditionGapResult> {
  const maxRanges = Math.min(MAX_RANGES, Math.max(1, opts.maxRanges ?? MAX_RANGES));
  const maxVoices = Math.min(MAX_VOICES, Math.max(1, opts.maxVoices ?? MAX_VOICES));
  const ranges = rangesIn
    .filter((r) => Number.isInteger(r.start) && Number.isInteger(r.end) && r.start <= r.end)
    .slice(0, maxRanges);
  if (ranges.length === 0) return { voices: [], authorCount: 0, rangesConsidered: 0 };

  const text = `
    WITH doc_anchors AS MATERIALIZED (
      SELECT DISTINCT (e->>'start')::int AS verse_id_start, (e->>'end')::int AS verse_id_end
        FROM jsonb_array_elements($1::jsonb) e
    ),
    hits AS (
      -- One row per (author, work), RANKED BY SPECIFICITY TO THIS DOCUMENT (Tier 3, 2026-08-21):
      -- ranges_hit counts how many of the document's own anchor ranges the work engages, so the
      -- panel leads with the voices that walked the most of THIS sermon's ground — the old
      -- ORDER BY author put Clarke/Barnes/Maclaren first on every document in the corpus, which
      -- is alphabet, not relevance. verse_id/source_id come from the FIRST engaged range
      -- (min), keeping the row a real, linkable citation.
      SELECT e.metadata->>'author'    AS author,
             e.metadata->>'work'      AS work,
             max(e.metadata->>'tradition') AS tradition,
             min((e.metadata->>'verseId')::int) AS verse_id,
             min(e.source_id) AS source_id,
             count(DISTINCT d.verse_id_start)::int AS ranges_hit
        FROM embeddings e
        JOIN doc_anchors d
          ON (e.metadata->>'verseId')::int BETWEEN d.verse_id_start AND d.verse_id_end
       WHERE e.user_id IS NULL
         AND e.metadata->>'author' IS NOT NULL
         -- The provenance belt (D9): the same leg servability.ts / studies.ts / research.ts
         -- apply. The injected predicate does NOT subsume it — ADR-044's served-but-forbidden
         -- rows are live exposure — and a voice attributed from a forbidden aggregator is an
         -- attribution the product may not make. Bound as $4, the array-parameter idiom.
         AND (e.metadata->>'sourceUrl' IS NULL OR NOT EXISTS (
                SELECT 1 FROM unnest($3::text[]) d2
                WHERE lower(e.metadata->>'sourceUrl') LIKE '%' || d2 || '%'))
         AND ${predicate}
       GROUP BY e.metadata->>'author', e.metadata->>'work'
    )
    -- metadata->>'work' is a SLUG, and the panel was printing it at the reader:
    -- "Alexander Maclaren, maclaren-expositions". sources.slug is the join key the corpus census
    -- already uses, so resolve it to the title the rest of the library shows. LEFT, and COALESCE
    -- back to the slug, because a row whose work has no sources entry must still list its author
    -- rather than vanish.
    SELECT h.author, COALESCE(s.title, h.work) AS work, h.tradition, h.verse_id, h.source_id,
           h.ranges_hit
      FROM hits h
      LEFT JOIN sources s ON s.slug = h.work
     ORDER BY h.ranges_hit DESC, h.author, 2 LIMIT $2`;

  const [voiceRows] = await runAsUser(userId, (sql) => [
    sql.query(text, [JSON.stringify(ranges), maxVoices, [...FORBIDDEN_PROVENANCE_DOMAINS]]),
  ]);

  const voices = (voiceRows as {
    author: string; work: string | null; tradition: string | null; verse_id: number; source_id: string;
    ranges_hit: number;
  }[]).map((r) => ({
    author: r.author,
    work: r.work ?? '',
    tradition: r.tradition ?? '',
    origin: 'corpus' as const,
    verseId: r.verse_id,
    sourceId: r.source_id,
    rangesHit: r.ranges_hit,
  }));

  return {
    voices,
    authorCount: new Set(voices.map((v) => v.author)).size,
    rangesConsidered: ranges.length,
  };
}
