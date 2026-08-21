// Pre-verification normalization of the model's parsed JSON. JSON-mode models
// frequently quote numeric IDs (e.g. anchor `"43004006"` instead of 43004006);
// the contract schema requires integers, so those blocks fail verification for a
// purely cosmetic reason. This coerces ONLY the known-numeric ID fields, and ONLY
// when the string is an exact base-10 integer — a lossless, unambiguous fix.
//
// It also performs SNAP-TO-SOURCE quote repair (see snapQuoteToSection): when a
// quote drifts from verbatim partway through (the model copies an opening
// sentence then paraphrases/stitches a non-adjacent one), the drifted TAIL is
// trimmed so the kept text is the model's own verbatim prefix. It never pulls in
// text the model didn't write and never lengthens a quote — it can only shorten
// to the verbatim portion. The verifier still re-runs isNormalizedSubstring on
// whatever remains, so a repair that isn't genuinely verbatim is still rejected
// and the whole path stays fail-closed.

import { normalizeForMatch, isNormalizedSubstring } from '../../verifier/normalize';
import type { Origin } from '../../contract/types';

function toIntIfNumericString(v: unknown): unknown {
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) {
    const n = Number(v.trim());
    if (Number.isSafeInteger(n)) return n;
  }
  return v;
}

// Only repair genuine near-quotes: the verbatim prefix must be a substantial
// fraction of the model's quote AND a substantial absolute span. Observed drift
// (model quotes one sentence verbatim, then stitches a non-adjacent one) leaves
// ~50% verbatim, so the ratio floor sits below that but well above a coincidental
// fragment (~15%). A quote that matches only briefly is a fabrication, not drift
// — no repair, let the verifier reject it. Both guards must hold; and because the
// kept text is always a verbatim prefix re-checked by the verifier, a snap can
// only ever shorten to real source text, never manufacture a pass.
const SNAP_MIN_RATIO = 0.4;
const SNAP_MIN_CHARS = 40;

// If `quote` is not a verbatim substring of `body` but a long prefix of it is,
// return that prefix (trimmed to a word boundary). Returns the original quote if
// it already matches, or null if there is no high-similarity verbatim prefix.
// The result is always a prefix of the model's OWN quote — never invented text.
function snapQuoteToSection(quote: string, body: string): string | null {
  if (isNormalizedSubstring(quote, body)) return quote;
  const fullLen = normalizeForMatch(quote).length;
  if (fullLen === 0) return null;

  // Longest raw prefix of the quote whose normalization is a substring of body.
  // Any prefix of an occurring substring also occurs, so this is monotonic.
  let lo = 1, hi = quote.length, bestRaw = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (isNormalizedSubstring(quote.slice(0, mid), body)) { bestRaw = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (bestRaw === 0) return null;

  // Don't cut mid-word: back off to the last whitespace if we split a token.
  let cut = bestRaw;
  if (cut < quote.length && /\S/.test(quote[cut] ?? '')) {
    const lastSpace = quote.lastIndexOf(' ', cut);
    if (lastSpace > 0) cut = lastSpace;
  }
  const repaired = quote.slice(0, cut).trim();
  const keptLen = normalizeForMatch(repaired).length;
  if (keptLen < SNAP_MIN_CHARS || keptLen / fullLen < SNAP_MIN_RATIO) return null;
  return isNormalizedSubstring(repaired, body) ? repaired : null;
}

// Authoritative attribution for a cited section, keyed by 1-based section_id
// (the index the composer is shown). Deriving attribution from the section the
// model *cited* — rather than trusting the attribution it *typed* — turns three
// brittle "did the model echo the author/work/tradition correctly" checks into
// facts. The model's only real jobs become: pick a section_id and copy a
// verbatim quote from it. The verifier still enforces the verbatim-quote match
// against that section, so grounding is unchanged and fail-closed.
export interface SectionAttribution {
  author: string;
  work: string;
  tradition: string;
  // The work's library slug, when known — lets the client link the quote back to
  // the work. Omitted (not empty-string) when the source row has no slug, so a
  // missing value degrades to "not clickable" rather than a broken link.
  slug?: string;
  // The section's full text, used for snap-to-source quote repair. Optional so
  // callers that only need attribution backfill (e.g. tests) can omit it.
  body?: string;
  // The namespace this section resolved under in the CorpusLookup the caller
  // built (`corpus:${id}` vs `user_library:${id}`, see corpus.ts /
  // memory-corpus.ts). When present it is authoritative for the backfilled
  // attribution.origin — the verifier's trust boundary (SERMON_SEARCH_DESIGN §7)
  // keys on origin, so it must record where the section CAME FROM, never a
  // constant (defect H4: unconditional 'corpus' laundered user uploads into
  // guarantee-bearing voices before the verifier could see the difference).
  origin?: Origin;
}

export function normalizeContract(
  parsed: unknown,
  sections?: SectionAttribution[],
): unknown {
  if (typeof parsed !== 'object' || parsed === null) return parsed;
  const root = parsed as Record<string, unknown>;
  const blocks = root.blocks;
  if (!Array.isArray(blocks)) return parsed;

  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;

    if (b.type === 'voice') {
      b.section_id = toIntIfNumericString(b.section_id);
      // Backfill attribution from the cited section (if it resolves), so a
      // correct section_id + verbatim quote can't be rejected over a mistyped
      // author. A hallucinated section_id resolves to nothing here and is still
      // caught by the verifier's section/quote checks.
      if (sections && typeof b.section_id === 'number') {
        const src = sections[b.section_id - 1];
        if (src) {
          // Never launder provenance (H4, SERMON_SEARCH_DESIGN §7): origin is the
          // namespace the section resolved under (src.origin, authoritative when
          // the caller supplies it); else the model's own claim is preserved for
          // the verifier to resolve fail-closed. 'corpus' is only the legacy
          // default for corpus-only callers whose sections declare no origin.
          const claimed = (b.attribution as Record<string, unknown> | null | undefined)?.origin;
          const priorOrigin: Origin | undefined =
            claimed === 'corpus' || claimed === 'user_library' ? claimed : undefined;
          b.attribution = {
            author: src.author,
            work: src.work,
            ...(src.slug ? { slug: src.slug } : {}),
            tradition: src.tradition,
            origin: src.origin ?? priorOrigin ?? 'corpus',
          };
          // Snap-to-source: trim a drifted quote back to its verbatim prefix.
          if (src.body && typeof b.quote === 'string') {
            const snapped = snapQuoteToSection(b.quote, src.body);
            if (snapped) b.quote = snapped;
          }
        }
      }
      if (Array.isArray(b.anchors)) {
        for (const anchor of b.anchors) {
          if (anchor && typeof anchor === 'object') {
            const a = anchor as Record<string, unknown>;
            a.start = toIntIfNumericString(a.start);
            a.end = toIntIfNumericString(a.end);
          }
        }
      }
    } else if (b.type === 'passages' && Array.isArray(b.items)) {
      for (const item of b.items) {
        if (item && typeof item === 'object') {
          const it = item as Record<string, unknown>;
          it.start = toIntIfNumericString(it.start);
          it.end = toIntIfNumericString(it.end);
        }
      }
    } else if (b.type === 'reading' && Array.isArray(b.items)) {
      for (const item of b.items) {
        if (item && typeof item === 'object') {
          const it = item as Record<string, unknown>;
          it.source_id = toIntIfNumericString(it.source_id);
        }
      }
    }
  }
  return parsed;
}
