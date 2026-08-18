/**
 * The offsets of the paragraph containing a match, within a section's text.
 *
 * WHY THIS EXISTS (B030). "+ Add to study" sent a bare `sectionId`, so the server snapshotted the
 * WHOLE section — a reader who found one paragraph in a search result got an entire commentary
 * chapter in their document, every time. The 2026-08-17 QA pass filed it as friction; the owner
 * ruled the treatment: insert the SURROUNDING PARAGRAPH, and let the reader widen from there,
 * because "having to subtract 100% of the time is annoying" while adding is occasional.
 *
 * WHAT THIS DOES NOT DO, and it is the whole reason the fix is cheap and safe: it does not cut the
 * stored text. Migration 111 ("trim not edit") stores the server's full snapshot and treats
 * `trim_start`/`trim_end` as a VIEW over it. So this computes a view, not a truncation — widening
 * later is an offset change with no refetch and no second network trip, and the untrimmed bytes
 * are always still there. That is exactly the "add more later" the ruling asks for.
 *
 * Paragraph boundaries are blank lines, falling back to single newlines, falling back to the whole
 * text — corpus prose is inconsistently formatted (OCR'd works often carry single newlines only),
 * so a strict blank-line rule would silently return the whole chapter on a large slice of the
 * corpus, which is the defect this function exists to remove.
 *
 * Returns null when there is nothing useful to say — no match, or the paragraph IS the whole text —
 * so the caller stores no trim at all rather than a trim that means nothing.
 */
export function paragraphAround(text: string, match: string): { start: number; end: number } | null {
  const hay = text ?? '';
  const needle = (match ?? '').trim();
  if (!hay || !needle) return null;

  // Case-insensitive, because search matches are case-insensitive; fall back to the first
  // whitespace-collapsed word run so a snippet with normalised spacing still locates.
  let at = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) {
    const firstWords = needle.split(/\s+/).slice(0, 6).join(' ').toLowerCase();
    if (firstWords.length < 8) return null; // too short to place honestly
    at = hay.toLowerCase().indexOf(firstWords);
    if (at < 0) return null;
  }

  // Returns null when the separator does not actually split the text, so the caller falls through
  // to the next strategy. Without that, a text with no blank lines yields ONE "paragraph" spanning
  // everything, the `\n` fallback never runs, and the whole-section guard below nulls the result —
  // i.e. exactly the OCR-prose case this fallback exists for silently got no trim. Caught by this
  // function's own test before it shipped.
  const bounds = (sep: RegExp): { start: number; end: number } | null => {
    if (hay.split(sep).length < 2) return null;
    const parts: { start: number; end: number }[] = [];
    let cursor = 0;
    for (const piece of hay.split(sep)) {
      const start = hay.indexOf(piece, cursor);
      if (start < 0) continue;
      parts.push({ start, end: start + piece.length });
      cursor = start + piece.length;
    }
    return parts.find((p) => at >= p.start && at < p.end) ?? null;
  };

  const para = bounds(/\n\s*\n/) ?? bounds(/\n/);
  if (!para) return null;
  // Trim trailing/leading whitespace out of the view so the document does not open with a blank line.
  let { start, end } = para;
  while (start < end && /\s/.test(hay[start]!)) start++;
  while (end > start && /\s/.test(hay[end - 1]!)) end--;
  if (end <= start) return null;
  // A "paragraph" that is the entire section says nothing — store no trim rather than a no-op one.
  if (start === 0 && end === hay.trimEnd().length) return null;
  return { start, end };
}
