// Section ordinal off an `embeddings.source_id`, for the /ask result card's reader deep link.
//
// Register works (src/ingest/register-writer.ts) write `${type}:${slug}:${ordinal}[.${chunk}]`,
// where the ordinal IS `sections.ordinal` — exactly three colon-separated parts. Classic
// commentaries (src/ingest/source-id.ts) write `commentary:{book}:{ch}:{vs}-{ve}:{author}` —
// five parts, and NO section id anywhere on the string; those resolve through the anchors
// table instead (lib/work.ts locateSections). The part count is what keeps the two apart:
// `commentary:jhn:3:16-16:…` must never read as "ordinal 3 of work jhn".

const ORDINAL_RE = /^(\d+)(?:\.\d+)?$/;

/** The section ordinal a register-work sourceId names (>= 1), or null for any other shape. */
export function sectionOrdinalFromSourceId(sourceId: string): number | null {
  const parts = sourceId.split(':');
  if (parts.length !== 3) return null;
  const m = ORDINAL_RE.exec(parts[2]!);
  if (!m) return null;
  const ordinal = Number(m[1]);
  return Number.isSafeInteger(ordinal) && ordinal >= 1 ? ordinal : null;
}
