// Clipboard payloads for the selection popover's copy chips (design §10.1:
// Copy styled · Copy lines · Text only). Pure so the exact payloads are unit-tested.
// The label is always `Author · Work · locus` shaped (for scripture: "John 3:16 · KJV") —
// attribution discipline: author + work + locus, NEVER a host URL.

export interface CopySource {
  /** The exact selected canonical substring. */
  text: string;
  /** Context label, e.g. "John 3:16 · KJV". */
  label: string;
  /** Verse / line number for the lines format (omit to skip the number). */
  lineNo?: string;
}

/** Text only — the bare words: no quotes, no reference. */
export function formatTextOnly(src: CopySource): string {
  return src.text;
}

/** Copy lines — reader style: numbered line, reference on its own line. */
export function formatLines(src: CopySource): string {
  const line = src.lineNo ? `${src.lineNo}  ${src.text}` : src.text;
  return `${line}\n${src.label}`;
}

/** Copy styled, plain-text half — quoted with attribution (the text/plain fallback). */
export function formatStyledText(src: CopySource): string {
  return `“${src.text}”\n${src.label}`;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Copy styled, rich half — serif italic quote + attribution line (the text/html item). */
export function formatStyledHtml(src: CopySource): string {
  return (
    `<blockquote style="font-family:Georgia,'Times New Roman',serif;font-style:italic;margin:0;">“${escapeHtml(src.text)}”</blockquote>` +
    `<p style="font-family:Georgia,'Times New Roman',serif;font-size:0.85em;margin:0.3em 0 0;">${escapeHtml(src.label)}</p>`
  );
}
