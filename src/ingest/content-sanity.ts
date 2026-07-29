// Content-sanity for ingestion. Some public-domain sources (19th-C commentaries
// scanned to HTML) carry HTML entities (&#x3b1; for Greek α, &#8217; for a curly
// apostrophe). The verifier now decodes these at match time (verifier/normalize),
// but stored content should also be clean so the reader renders real characters
// and embeddings are computed over real text, not entity noise.
//
// Reuses the SAME decoder as the verifier (single source of truth for the entity
// map) so ingest and verification can never disagree about what an entity means.

import { decodeHtmlEntities } from '../verifier/normalize.js';

// Decode entities to real Unicode for storage/embedding. Pure text transform —
// unlike normalizeForMatch it does NOT lowercase/strip punctuation, so the
// stored content stays human-readable and verbatim.
export function sanitizeForIngest(text: string): string {
  return decodeHtmlEntities(text);
}

// Integrity-gate signal: entities that land in prose (numeric char refs, curly
// quotes, dashes, accented letters) and can therefore break a verbatim-quote
// match. Structural/symbol entities (©, §, spacing) are excluded — they are not
// what a model quotes mid-sentence.
const QUOTE_BREAKING_ENTITY =
  /&(#x?[0-9a-f]+|rsquo|lsquo|rdquo|ldquo|sbquo|bdquo|mdash|ndash|hellip|apos|quot|amp|nbsp|[a-z]?acute|[a-z]?grave|[a-z]?circ|[a-z]?uml|[a-z]?tilde|ccedil|szlig|aelig|oslash);/i;

export function hasQuoteBreakingEntities(text: string): boolean {
  return QUOTE_BREAKING_ENTITY.test(text);
}
