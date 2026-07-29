// Shared sanitizer for ts_headline snippets rendered via dangerouslySetInnerHTML.
// ts_headline wraps matches in <mark>…</mark> but does NOT escape the surrounding
// document text, so any tag-shaped text that survived ingest (CCEL ThML, a stray
// <script>) would render live. Escape EVERYTHING, then restore ONLY the <mark> pairs
// ts_headline itself inserted. Single source so a second sink can never drift
// unsanitized (deep-audit 2026-07-24: catalog-search had drifted without this).
export function sanitizeSnippet(snippet: string): string {
  return snippet
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/&lt;mark&gt;/g, '<mark>').replace(/&lt;\/mark&gt;/g, '</mark>');
}
