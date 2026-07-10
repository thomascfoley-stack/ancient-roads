// Text normalization for the verbatim-quote check: the contract requires
// every voice.quote to be a substring of its cited section with whitespace
// and punctuation normalized (curly quotes, em dashes, ellipses, casing on
// initial capitals must not fail an otherwise verbatim quote).

const PUNCT = /[‘’“”'"“”‘’.,;:!?()[\]{}–—…-]/g;

// Some ingested public-domain sources (19th-C commentaries scanned to HTML)
// store characters as HTML entities: a curly apostrophe as &#8217;, an em dash
// as &mdash;, an accented name letter as &uuml;. The model quotes the DECODED
// character, so the source's entities must be decoded to the same character
// before matching — this is EXACT decoding (&#8217; IS ’), not fuzzy matching,
// and it is applied symmetrically to both quote and body. Numeric entities
// decode completely; named entities use a pragmatic map of those seen in prose.
// An unrecognized name is left untouched, so decoding can only make a true
// verbatim quote match — it can never turn a non-match into a match.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ensp: ' ', emsp: ' ', thinsp: ' ', shy: '', zwnj: '', zwj: '',
  ndash: '–', mdash: '—', minus: '−', hellip: '…',
  lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„',
  laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›',
  prime: '′', Prime: '″',
  copy: '©', reg: '®', trade: '™', deg: '°',
  sect: '§', para: '¶', middot: '·', bull: '•',
  dagger: '†', Dagger: '‡',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ', szlig: 'ß',
};

export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, body: string) => {
    if (body.charCodeAt(0) === 35 /* '#' */) {
      const cp =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp < 1 || cp > 0x10ffff) return m;
      return String.fromCodePoint(cp);
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

export function normalizeForMatch(text: string): string {
  return decodeHtmlEntities(text)
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
