// The tradition-gap join — "which voices from the tradition speak on the passages I engaged?"
//
// §1's step 3, and the order's "the moat": steps 1-2 are ordinary personal search, and this is the
// thing nobody else can build, because it needs a licensed, adjudicated corpus on the other side.
//
// ── THE CORPUS PREDICATE IS INJECTED, AND THAT IS ADR-104 ───────────────────────────────────────
// The order requires filtering on `embeddings.served = true` via THE canonical predicate, never a
// second hand-written one. On this branch that predicate does not exist yet: `routing.ts` here is
// byte-identical to `main` and `LEGAL_CORPUS_FILTER` is still the author allowlist, while the
// COLUMN is on the database (328,775 of 1,070,674 rows served). Importing the canonical symbol
// today returns the WRONG filter.
//
// So the predicate is a parameter. The join's logic is built and tested now; the production call
// site supplies `LEGAL_CORPUS_FILTER` once Lane A merges, and that is a one-line change. No second
// copy of the predicate is written anywhere, which is what ADR-104 protects.
//
// ── THE PARAMETER IS A TRUSTED SQL FRAGMENT, NOT USER INPUT ─────────────────────────────────────
// It is spliced textually, because a predicate cannot be a bound parameter — the same shape
// `routing.ts` uses for LEGAL_CORPUS_FILTER. It must therefore only ever receive a COMPILE-TIME
// CONSTANT from `routing.ts`. The branded type below exists to make an accidental
// `corpusPredicate(userInput)` call something you have to write on purpose.

import { runAsUser } from '@/lib/db';

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
  /** The verse of the best-matching entry, for a deep link. */
  verseId: number;
  sourceId: string;
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
  const maxVoices = Math.min(MAX_VOICES, Math.max(1, opts.maxVoices ?? MAX_VOICES));

  const text = `
    WITH doc_anchors AS MATERIALIZED (
      SELECT DISTINCT a.verse_id_start, a.verse_id_end
        FROM user_section_anchors a
        JOIN user_sections s ON s.id = a.section_id
       WHERE a.user_id = $1 AND s.document_id = $2
       ORDER BY a.verse_id_start
       LIMIT $3
    ),
    hits AS (
      SELECT DISTINCT ON (e.metadata->>'author', e.metadata->>'work')
             e.metadata->>'author'    AS author,
             e.metadata->>'work'      AS work,
             e.metadata->>'tradition' AS tradition,
             (e.metadata->>'verseId')::int AS verse_id,
             e.source_id
        FROM embeddings e
        JOIN doc_anchors d
          ON (e.metadata->>'verseId')::int BETWEEN d.verse_id_start AND d.verse_id_end
       WHERE e.user_id IS NULL
         AND e.metadata->>'author' IS NOT NULL
         AND ${predicate}
       ORDER BY e.metadata->>'author', e.metadata->>'work', (e.metadata->>'verseId')::int
    )
    SELECT * FROM hits ORDER BY author, work LIMIT $4`;

  const countText = `
    SELECT count(*)::int AS n FROM (
      SELECT DISTINCT a.verse_id_start, a.verse_id_end
        FROM user_section_anchors a
        JOIN user_sections s ON s.id = a.section_id
       WHERE a.user_id = $1 AND s.document_id = $2
       LIMIT $3
    ) r`;

  const [voiceRows, rangeRows] = await runAsUser(userId, (sql) => [
    sql.query(text, [userId, documentId, maxRanges, maxVoices]),
    sql.query(countText, [userId, documentId, maxRanges]),
  ]);

  const voices = (voiceRows as {
    author: string; work: string | null; tradition: string | null; verse_id: number; source_id: string;
  }[]).map((r) => ({
    author: r.author,
    work: r.work ?? '',
    tradition: r.tradition ?? '',
    origin: 'corpus' as const,
    verseId: r.verse_id,
    sourceId: r.source_id,
  }));

  return {
    voices,
    authorCount: new Set(voices.map((v) => v.author)).size,
    rangesConsidered: (rangeRows as { n: number }[])[0]?.n ?? 0,
  };
}
