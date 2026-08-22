// History-lane pure functions — HISTORY_RETRIEVAL_DESIGN §3. Deterministic, no LLM, no DB.
// Tests: web/test/history-search.test.ts — written first, watched RED against a wrong stub
// (12/13 failures) before this implementation existed.

/** Pre-registered ORDINAL priors (§3.4, amended after review). The design claim is the ORDER —
 *  a verbatim entity hit is near-certain relevance, cosine is a guess — not the magnitudes.
 *  Tuning is a later slice: n≥50 logged queries, ADR-103 two-split. The frozen 20-query eval is
 *  a regression floor and is never tuned against. */
export const HISTORY_RANK_WEIGHTS = { entity: 3, period: 2, cosine: 1, fts: 0.5 } as const;

/**
 * The similarity floor (2026-08-21, pre-registered + calibrated:
 * docs/evidence/history-similarity-floor-2026-08-21.md). A result whose ONLY evidence is text
 * must have cosine >= this to count as matched at all — measured on dev: real-with-data 0.75,
 * nonsense 0.44-0.54. FTS word-hits alone never make a "Closest match" hero: "how to fix a
 * leaking kitchen tap" was matching sections containing "fix" and "tap", and the hero it
 * produced is exactly the confident-wrong answer the pre-launch walk flagged. Entity and period
 * evidence is verbatim/structural and unaffected.
 */
export const HISTORY_TEXT_COSINE_FLOOR = 0.6;

export interface Period { start: number; end: number }

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

/** Verbatim date forms only — the ingest contract's §5 discipline applied to queries.
 *  Precedence, deterministic: explicit A.D. range > explicit single years (enveloped) >
 *  natural century spans > null. Never inferred, never fuzzy. */
export function parsePeriod(q: string): Period | null {
  const range = /\bA\.?D\.?\s*(\d{1,4})\s*(?:[-–]|to)\s*(\d{1,4})\b/i.exec(q);
  if (range) return { start: Number(range[1]), end: Number(range[2]) };

  const years: number[] = [];
  for (const m of q.matchAll(/\bA\.?D\.?\s*(\d{1,4})\b/gi)) years.push(Number(m[1]));
  for (const m of q.matchAll(/\b(\d{1,4})\s*B\.?C\.?\b/gi)) years.push(-Number(m[1]));
  if (years.length) return { start: Math.min(...years), end: Math.max(...years) };

  const nat = new RegExp(`\\b(${Object.keys(ORDINALS).join('|')})\\s+century(\\s+B\\.?C\\.?)?`, 'i').exec(q);
  if (nat) {
    const n = ORDINALS[nat[1]!.toLowerCase()]!;
    return nat[2]
      ? { start: -(n * 100), end: -((n - 1) * 100 + 1) }
      : { start: (n - 1) * 100 + 1, end: n * 100 };
  }
  return null;
}

/** Section period_* columns may be single- or both-ended NULL; a fully unstated period never
 *  counts as an overlap (SQL three-valued-logic lesson: NULL must not read as "matches"). */
export function periodsOverlap(a: Period, b: { start: number | null; end: number | null }): boolean {
  if (b.start === null && b.end === null) return false;
  const bs = b.start ?? Number.NEGATIVE_INFINITY;
  const be = b.end ?? Number.POSITIVE_INFINITY;
  return a.start <= be && bs <= a.end;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Deterministic scorer. Similarity legs are clamped so a broken normalizer upstream can never
 *  outvote a verbatim entity hit — the ordinal claim survives bad inputs. */
export function scoreSection(p: { entityHit: boolean; periodOverlap: boolean; cosine: number; fts: number }): number {
  return (p.entityHit ? HISTORY_RANK_WEIGHTS.entity : 0)
    + (p.periodOverlap ? HISTORY_RANK_WEIGHTS.period : 0)
    + clamp01(p.cosine) * HISTORY_RANK_WEIGHTS.cosine
    + clamp01(p.fts) * HISTORY_RANK_WEIGHTS.fts;
}

/** Excerpts are SLICES, so the substring property holds by construction; display ellipsis is the
 *  UI's, never part of the asserted excerpt. When a needle is given and present, the window
 *  centers on its FIRST occurrence so the excerpt shows why the section matched (review nit,
 *  2026-08-20) — computed purely by indices, so it remains an exact substring. */
export function makeExcerpt(body: string, maxLen = 420, needle?: string): string {
  if (needle) {
    const at = body.toLowerCase().indexOf(needle.toLowerCase());
    if (at > 60) {
      const start = Math.min(at - 60, Math.max(0, body.length - maxLen));
      return body.slice(start, start + maxLen);
    }
  }
  return body.slice(0, maxLen);
}

/** The v1 verifier (§1): every excerpt that reaches a response body must be an exact substring of
 *  the stored section. Throws — the route converts to a 500, which fails closed to the error card;
 *  a mutated excerpt must never render. */
export function assertExcerptVerbatim(body: string, excerpt: string): void {
  if (!body.includes(excerpt)) {
    throw new Error('history excerpt is not a verbatim substring of its section body — refusing to render');
  }
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Verbatim, word-bounded, whole-label match against the vocabulary DERIVED from
 *  section_history_anchors (§3.1) — never a second copy of the gazetteer. No fuzzy matching:
 *  a miss must mean "not anchored", never "spelled differently". */
export function matchEntities(
  q: string,
  vocab: { slug: string; label: string }[],
): { slug: string; label: string }[] {
  const seen = new Set<string>();
  const out: { slug: string; label: string }[] = [];
  for (const e of vocab) {
    if (seen.has(e.slug)) continue;
    if (new RegExp(`\\b${escapeRe(e.label)}\\b`, 'i').test(q)) {
      seen.add(e.slug);
      out.push(e);
    }
  }
  return out;
}
