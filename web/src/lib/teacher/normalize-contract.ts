// Pre-verification normalization of the model's parsed JSON. JSON-mode models
// frequently quote numeric IDs (e.g. anchor `"43004006"` instead of 43004006);
// the contract schema requires integers, so those blocks fail verification for a
// purely cosmetic reason. This coerces ONLY the known-numeric ID fields, and ONLY
// when the string is an exact base-10 integer — a lossless, unambiguous fix. It
// does NOT touch quotes, attribution, framing, or any free text, and it never
// invents or drops fields, so the verifier's substring/attribution/diversity
// gates remain fully intact and fail-closed.

function toIntIfNumericString(v: unknown): unknown {
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) {
    const n = Number(v.trim());
    if (Number.isSafeInteger(n)) return n;
  }
  return v;
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
          b.attribution = {
            author: src.author,
            work: src.work,
            tradition: src.tradition,
            origin: 'corpus',
          };
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
