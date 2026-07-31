// FRONT-MATTER DETECTOR (Work Order v2 Stage 3.2).
//
// PROPERTY: no served commentary entry keyed to a verse is book- or chapter-level apparatus.
//
// WHAT THE DEFECT LOOKS LIKE. Ingest slices a printed volume into entries and gives each one
// a verse key. A book's front matter — Preface, Introduction, The Argument, Contents,
// Dedication, Title Page — has no verse, so it lands on the first one available, usually
// chapter 1 verse 1. The reader then shows a publisher's dedication as though it were the
// author's comment on "In the beginning was the Word", and /ask can quote it as commentary.
// This is ADR-029's class (non-authorial matter bound into a work) seen from the verse-key
// side, and it is invisible in the product: an entry that reads oddly looks like an old
// writer being verbose.
//
// WHY THE RULE IS NARROW. ADR-029's sweep found real content whose HEADING looks like
// apparatus and which must not be touched: schaff-creeds' "Comparative Table of the
// Ante-Nicene Rules of Faith" is scholarship (comparing creeds is the book's subject), and
// calvin-institutes' "General Index of Chapters" is a legible table of contents that belongs
// to the work. So a detector that fires on a WORD ANYWHERE in a body is useless — "this
// preface is short" would trip it, and a detector nobody trusts gets switched off. The rule
// here is therefore: the apparatus label must BE the entry's title line, not appear in it.
//
// A DETECTION IS NOT A DELETION. This module only reports, and the runner stops the build
// rather than editing content: what an entry IS cannot be settled by a regex, and ADR-029
// already recorded two ranges that were reported wrong and one chunk that would have
// destroyed sermon text if deleted on the report alone. Every hit is a claim to be read.

/** The labels. Each is a whole-title match, optionally followed by a scope phrase
 *  ("to the Gospel of John", "of the Epistle to the Romans", "to the Reader"). */
const LABELS = [
  'preface',
  'introduction',
  'argument',
  'contents',
  'table of contents',
  'dedication',
  'dedicatory epistle',
  'title page',
  'prolegomena',
  'advertisement',
  'to the reader',
  'the epistle dedicatory',
];

/** `Preface`, `THE ARGUMENT.`, `Introduction to the Gospel of John`, `Contents:` —
 *  a label, an optional scope phrase, and nothing else. Anchored at both ends, which is what
 *  keeps "In this preface Paul says…" out. */
const LABEL_BODY = LABELS.map((l) => l.replace(/ /g, String.raw`\s+`)).join('|');
/** The scope phrase is captured so its subject can be judged; see BOOKISH_SCOPE_RE. */
const LABEL_RE = new RegExp(
  String.raw`^\s*(?:the\s+)?(?:${LABEL_BODY})` +
    String.raw`(\s*[—–-]?\s*(?:to|of|for|on)\s+[^.;:!?]{0,80})?` +
    String.raw`\s*[.:;—–-]*\s*$`,
  'i',
);

/**
 * Does the scope phrase name a BOOK or an EDITION — or a subject?
 *
 * This distinction was forced by the first real run, over the 191,749 shipping entries. Two of
 * the eight admitted hits were not apparatus at all, and both were of the shape "label + scope":
 *
 *   Philip Schaff, "The Argument for the Immaculate Conception." keyed at Genesis 3:15 — §29 of
 *     The Creeds of Christendom, genuine polemical scholarship, and Gen 3:15 is precisely the
 *     passage adduced for that dogma. The key is APT.
 *   Thomas Watson, "The Preface to the Lord's Prayer" keyed at Matthew 6:9 — an exposition of
 *     the prayer's own preface, and Matt 6:9 IS "Our Father which art in heaven". Also apt.
 *
 * In both, "argument"/"preface" names the SUBJECT of real exposition. In "Preface to the Gospel
 * of John" the same word names the front matter OF A VOLUME. So a scope that names a book, a
 * volume or an edition keeps a hit strong; any other scope makes it a hit worth READING but not
 * worth stopping a build over. This is the ADR-029 trap ("Comparative Table of the Ante-Nicene
 * Rules of Faith" is scholarship) met a second time, in a second form.
 */
const BOOKISH_SCOPE_RE =
  /^\s*(?:to|of|on)\s+(?:the\s+)?(?:gospels?|epistles?|book|books|prophecy|prophet|acts|revelation|apocalypse|psalter|psalms?|pentateuch|volume|edition|work|works|treatise|commentary|reader|following|present|whole|first|second|third|fourth|new\s+testament|old\s+testament|st\.?\s|saint\s)/i;

/** Roman numerals only: `I`, `xiv.`, `II. III. IV.`, `— XXI —`. Latin-alphabet numerals plus
 *  punctuation and nothing else. Requires at least one numeral so '' does not match. */
const ROMAN_ONLY_RE = /^[\s.,;:()[\]—–-]*(?:[ivxlcdm]+[\s.,;:()[\]—–-]*)+$/i;

/** How much of a body may be read as its title line. Front matter announces itself first. */
const TITLE_SCAN_CHARS = 160;

/**
 * A title line longer than this is a SENTENCE, not a title, and the label match is a false
 * positive. This bound exists because of two real ones caught while writing the detector:
 *
 *   "The introduction of the Word as pre-existent is the burden of these first verses."
 *   "The argument of the apostle here is drawn from the nature of God's promise to Abraham."
 *
 * Both are ordinary exposition. They matched because the optional scope phrase ("of the
 * Word…", "of the apostle…") ran on to the end of the line, which is exactly what a sentence
 * does and a title does not. Real front-matter titles are short: the longest in the fixtures
 * is "Dedication — To the Right Honourable the Earl of Warwick" at 55 characters.
 */
const MAX_TITLE_CHARS = 70;

/** A label line only counts as a TITLE if it stands alone — a line with body after it, or a
 *  body that is nothing but the label. In prose the first line is the start of a sentence
 *  that keeps going, which is the other half of how the two are told apart. */
const STANDALONE_BODY_MAX = 60;

/** A body this short carries no exposition; it is a fragment of apparatus or a stub. */
const STUB_MAX_CHARS = 40;

/** The entry's title line: an explicit heading, else the body's first non-empty line. */
export function titleLine({ heading, body } = {}) {
  const h = typeof heading === 'string' ? heading.trim() : '';
  if (h.length > 0) return h.slice(0, TITLE_SCAN_CHARS);
  const text = typeof body === 'string' ? body : '';
  const first = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  return first.trim().slice(0, TITLE_SCAN_CHARS);
}

/** A label with a scope: strong when the scope names a volume, weak when it names a subject. */
function labelStrength(match) {
  const scope = match?.[1]?.trim();
  if (!scope) return 'strong'; // a bare "Preface" / "The Argument" / "Contents"
  return BOOKISH_SCOPE_RE.test(scope) ? 'strong' : 'weak';
}

/**
 * Is this entry book/chapter apparatus rather than comment on its verse?
 *
 * Returns `{ apparatus, strength, kind, evidence }`. `kind` names WHICH rule fired and
 * `strength` says how much weight it carries, so a report can be read by class and a false
 * positive can be argued with rather than merely disbelieved. Only STRONG hits stop a build;
 * weak ones are for reading. See BOOKISH_SCOPE_RE for why that line is drawn where it is.
 */
export function frontMatterVerdict(entry = {}) {
  const title = titleLine(entry);
  const body = typeof entry.body === 'string' ? entry.body : '';
  const hasHeading = typeof entry.heading === 'string' && entry.heading.trim().length > 0;

  // A label taken from the BODY has to stand alone as a line. With an explicit heading there
  // is nothing to disambiguate: the field is already a title by construction.
  const standsAlone =
    hasHeading || /\S[^\n]*\n/.test(body.trim()) || body.trim().length <= STANDALONE_BODY_MAX;

  // 1. The title line IS an apparatus label — short enough to be a title, and standing alone.
  const titleMatch = title.length > 0 && title.length <= MAX_TITLE_CHARS && standsAlone ? LABEL_RE.exec(title) : null;
  if (titleMatch) {
    return { apparatus: true, strength: labelStrength(titleMatch), kind: 'apparatus-title', evidence: title };
  }

  // 2. The whole body is roman numerals — a contents/pagination fragment. Guarded by a length
  //    bound: a long body of numerals is something else and deserves a human, not this rule.
  const collapsed = body.trim();
  if (collapsed.length > 0 && collapsed.length <= 120 && ROMAN_ONLY_RE.test(collapsed)) {
    return { apparatus: true, strength: 'strong', kind: 'roman-numeral-body', evidence: collapsed.slice(0, 60) };
  }

  // 3. A heading that is an apparatus label while the body says something else still counts:
  //    the reader shows the heading, and ingest keyed BOTH to the verse.
  const h = typeof entry.heading === 'string' ? entry.heading.trim() : '';
  const headingMatch = h.length > 0 && h.length <= MAX_TITLE_CHARS ? LABEL_RE.exec(h) : null;
  if (headingMatch) {
    return { apparatus: true, strength: labelStrength(headingMatch), kind: 'apparatus-heading', evidence: h.slice(0, 80) };
  }

  return { apparatus: false, strength: null, kind: null, evidence: null };
}

/** Bodies too short to be exposition. Reported SEPARATELY from apparatus: a stub is a
 *  suspicion, not a finding, and mixing the two would let the weaker rule discredit the
 *  stronger one. */
export function isStub(entry = {}) {
  const body = typeof entry.body === 'string' ? entry.body.trim() : '';
  return body.length > 0 && body.length <= STUB_MAX_CHARS;
}

/**
 * Scan entries and group the findings.
 *
 * `served` decides admission and is INJECTED, never re-implemented here: the runner passes
 * the real predicate from web/src/lib/legal-corpus. A second opinion about what is served is
 * how a report comes to disagree with the product it describes.
 */
export function scanEntries(entries, { served = () => true } = {}) {
  const hits = [];
  const stubs = [];
  let scanned = 0;
  for (const e of entries) {
    scanned++;
    const admitted = Boolean(served(e));
    const v = frontMatterVerdict(e);
    if (v.apparatus) hits.push({ ...v, admitted, entry: e });
    else if (isStub(e)) stubs.push({ admitted, entry: e });
  }
  return {
    scanned,
    hits,
    stubs,
    admittedHits: hits.filter((h) => h.admitted),
    /** Admitted AND strong — the property violations that stop a build. */
    admittedStrongHits: hits.filter((h) => h.admitted && h.strength === 'strong'),
    /** Admitted but scope-named — to be read, not acted on automatically. */
    admittedWeakHits: hits.filter((h) => h.admitted && h.strength !== 'strong'),
    byKind: hits.reduce((acc, h) => ({ ...acc, [h.kind]: (acc[h.kind] ?? 0) + 1 }), {}),
  };
}

/**
 * The verdict. STOP when apparatus is reachable by a reader; a hit on an entry that is NOT
 * served is debt to record, not a reason to block.
 *
 * A scan that examined nothing is also a STOP. Zero hits out of zero entries is the shape
 * every broken scan takes, and it is indistinguishable from success unless it is refused.
 */
export function frontMatterVerdictSummary(scan) {
  if (scan.scanned === 0) {
    return { stop: true, reason: 'VACUOUS: the scan examined 0 entries, so it could not have found anything' };
  }
  const n = scan.admittedStrongHits.length;
  if (n > 0) {
    return {
      stop: true,
      reason: `${n} SERVED entr${n === 1 ? 'y is' : 'ies are'} book/chapter apparatus keyed to a verse`,
    };
  }
  return { stop: false, reason: null };
}
