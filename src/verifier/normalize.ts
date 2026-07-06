// Text normalization for the verbatim-quote check: the contract requires
// every voice.quote to be a substring of its cited section with whitespace
// and punctuation normalized (curly quotes, em dashes, ellipses, casing on
// initial capitals must not fail an otherwise verbatim quote).

const PUNCT = /[‘’“”'"“”‘’.,;:!?()\[\]{}–—…-]/g;

export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNormalizedSubstring(quote: string, body: string): boolean {
  const q = normalizeForMatch(quote);
  if (q.length === 0) return false;
  return normalizeForMatch(body).includes(q);
}
