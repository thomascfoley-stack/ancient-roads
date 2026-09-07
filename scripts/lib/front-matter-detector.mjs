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

/** Detector version — recorded in every scan verdict so a report can be read against the
 *  rules that produced it. 2.0.0 adds the ADR-029 addendum-2 shapes (word/phrase indexes,
 *  publisher catalogues) and the author-aware per-work sweep. */
export const DETECTOR_VERSION = '2.0.0';

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

// ── ADR-029 addendum-2 shapes (DETECTOR_VERSION 2.0.0) ────────────────────────
// Addendum 2 widened the class from "composite volume" to ANY non-authorial matter carried
// in with the text, and named four shapes. The label rules above cover editor prologues;
// the two shapes genuinely missing were publisher catalogues/price lists and machine-made
// word/phrase indexes. Every pattern below is grounded in the bodies that were actually
// suppressed (docs/evidence/part2/nonauthorial-matter-suppressed.jsonl — read, not assumed).

/** Language adjectives seen on the suppressed index headings (929 rows, all of the form
 *  "(Latin|German|French) Words and Phrases"). Whole-title match, anchored both ends — a
 *  sermon titled "Words and Phrases of the Apostle" is not an index; calvin-institutes'
 *  KEPT "General Index of Chapters" never contains "words and phrases". */
const INDEX_LANGS = [
  'latin', 'greek', 'german', 'french', 'hebrew', 'syriac', 'arabic', 'aramaic', 'chaldee',
  'english', 'scotch', 'scottish', 'anglo-saxon', 'saxon', 'spanish', 'italian', 'dutch',
  'welsh', 'gaelic', 'ethiopic', 'coptic', 'persian', 'sanskrit',
];
const WORD_INDEX_RE = new RegExp(
  String.raw`^\s*(?:index\s+of\s+)?(?:(?:${INDEX_LANGS.join('|')})\b[\s,&]*?(?:\band\b)?\s*)+` +
    String.raw`words?\s+and\s+phrases?(?:\s*\([^)]{0,60})?\s*[.:]?\s*$`,
  'i',
);

/** Publisher catalogue titles, from the suppressed rows: "CHEAP EDITIONS OF POPULAR
 *  WORKS.", "WORKS PREPARING FOR PUBLICATION", "_Funk & Wagnalls' Important Publications._". */
const CATALOGUE_TITLE_RE = new RegExp(
  String.raw`^\s*_?\s*(?:` +
    String.raw`(?:catalogue|list)\s+of\s+(?:new\s+|choice\s+|valuable\s+)?books\b` +
    `|` + String.raw`list\s+of\s+(?:the\s+)?(?:new\s+)?(?:works|publications)\b` +
    `|` + String.raw`books\s+(?:published|lately\s+published|for\s+sale)\s+by\b` +
    `|` + String.raw`works\s+(?:preparing\s+for\s+publication|(?:lately\s+)?published\s+by)\b` +
    `|` + String.raw`cheap\s+editions?\s+of\s+popular\s+works` +
    `|` + String.raw`new\s+books\s+and\s+(?:new\s+)?editions` +
    `|` + String.raw`[\w&.']+(?:\s+[\w&.']+){0,3}'?\s+important\s+publications` +
    `|` + String.raw`opinions\s+of\s+the\s+press|press\s+notices?` +
    String.raw`)\b.*_?\s*$`,
  'i',
);

/** A heading that IS a bibliographic format+price descriptor — the Traherne ad headings:
 *  "_Post 8vo, cloth extra, 6s.; or on hand-made paper, 12s._", "_16mo, cloth, 3s. 6d._",
 *  "_Small 4to, buckram, 2s. 6d._". Requires all three of format, binding and price, which
 *  no real chapter heading carries. */
const FORMAT_PRICE_HEADING_RE = new RegExp(
  String.raw`^(?=.*\b(?:folio|quarto|octavo|duodecimo|sexto-decimo|\d{1,2}\s?mo|\d{1,2}\s?vo|f?cap|foolscap|crown|demy|post|imperial|royal)\b)` +
    String.raw`(?=.*\b(?:cloth|paper|buckram|leather|boards?|morocco|calf|vellum|roan)\b)` +
    String.raw`(?=.*(?:\d+\s?s\.|\d+\s?d\.|\$\s?\d|\d+\s?cents?|\d+s\b|\bnet\b))`,
  'i',
);

/** One line of a printed price list: "MILNES'S POEMS OF MANY YEARS            5 0",
 *  "---- MEMORIALS OF MANY SCENES", "_s._ _d._", "6s. 6d.", "$1.50", "20 cents". */
const PRICE_LINE_RES = [
  /^_?s\._?\s+_?d\._?$/, // shillings/pence column header
  /\s{3,}\d{1,2}\s+\d{1,2}\s*$/, // title + wide gap + shillings pence
  /^\d{1,2}\s+\d{1,2}$/, // a wrapped price alone on its line
  /\d+\s?s\.\s*(?:\d+\s?d\.)?\s*$/, // "6s." / "3s. 6d."
  /\$\s?\d+(?:\.\d{1,2})?\s*$/, // "$1.50"
  /\b\d+\s?cents?\b/i, // "20 cents"
  /^-{4,}\s*\S/, // "---- MEMORIALS OF MANY SCENES" (same-author continuation mark; TWO
  // hyphens is a cross-reference leader — chain-reference works are full of "--SEE X")
  /^\([^)]{0,30}(?:mo|vo)\.\s*\)$/i, // "(In 2 4mo.)"
];

/** Advertisement-blurb signals, each grounded in the suppressed spurgeon rows. A body is
 *  publisher matter only when at least two DISTINCT signal types appear AND the first
 *  appears in the opening 40% — the detector's standing doctrine ("front matter announces
 *  itself first") applied to back matter. This is what keeps addendum 2's KEPT mixed chunk
 *  (spurgeon §298: a sermon whose tail bleeds into an ad) from being called a finding:
 *  its first signal sits at 63% of the body, because most of the chunk is real Spurgeon. */
const BLURB_SIGNALS = {
  price: /\bprice[,.]?\s*\$?\d|\$\s?\d+(?:\.\d{1,2})?|\b\d+\s?cents?\b/i,
  formatBinding:
    /\b(?:folio|quarto|octavo|duodecimo|\d{1,2}\s?mo|\d{1,2}\s?vo)\b[^.]{0,50}\b(?:cloth|paper|boards?|buckram|leather)\b|\b(?:cloth|paper|boards?|buckram|leather)\b[^.]{0,30}(?:\$|\d+\s?cents?\b|\d+\s?s\b|\d+\s?d\b)/i,
  press:
    /(?:Journal|Press|Times|Herald|Gazette|Review|Standard|Union|Evangelist|Observer|Watchman|Transcript|Chronicle|Examiner|Tribune|Telegraph|Intelligencer|Advocate|Guardian|Spectator)\s+says\b|["”]\s*--_?\s*(?:Gen|Col|Rev|Dr|Hon|Ex-Gov|Prof|Capt|Mr|Mrs|Sir)\b/i,
  trade:
    /\bagents\s+wanted\b|\bspecial\s+rates\b|\bjust\s+published\b|\b(?:second|third|fourth|fifth|sixth|new)\s+edition\b|\bimportant\s+publications\b|\bend\s+of\s+project\s+gutenberg\b|\bbooks\s+published\s+by\b|\bcatalogue\s+of\s+books\b|\bpreparing\s+for\s+publication\b/i,
};

/** How far into a body the author-aware foreign-matter signals may look. A foreign work
 *  bound in announces at its own head (the Origen §1 banner sits at char 8); anything
 *  deeper is prose ABOUT a work — a church history's subject, a lexicon's citation, a
 *  poem's title — which the first full scan showed this rule drowning in (schaff-hcc,
 *  thayers, jfb, herrick: hundreds of non-findings). Title region only. */
const FOREIGN_SCAN_CHARS = 120;
/** A rule line is the print boundary signature: "The First Epistle of Clement. ————" is
 *  a bound-in work; "The Epistles of Ignatius" with no rule after it is a chapter's
 *  subject. Searched a little wider than the title region. */
const RULE_LINE_SCAN_CHARS = 160;
const RULE_LINE_RE = /—{3,}|–{4,}|-{4,}|_{3,}/;

/** Scripture's own authors. A commentary on Romans legitimately banners "The Epistle of
 *  Paul…" at its head — the epistle is the commentary's SUBJECT, not foreign matter. The
 *  composite-volume defect names a church writer (Clement under Origen), never an apostle
 *  under a commentator. Honest bound: the Epistle of Barnabas bound into a volume would be
 *  missed; recorded here rather than pretending the rule is wider. */
const SCRIPTURE_AUTHORS = new Set([
  'paul', 'peter', 'james', 'john', 'jude', 'judas', 'matthew', 'mark', 'luke', 'moses',
  'david', 'solomon', 'isaiah', 'jeremiah', 'ezekiel', 'daniel', 'hosea', 'joel', 'amos',
  'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah',
  'malachi', 'timothy', 'titus', 'barnabas', 'silas',
]);

/** Not persons: tokens that satisfy the possessive/banner shapes without naming an author. */
const NON_PERSON_TOKENS = new Set([
  'god', 'lord', 'jesus', 'christ', 'jehovah', 'yahweh', 'holy', 'spirit', 'king', 'queen',
  'author', 'editor', 'publisher', 'translator', 'reader', 'people', 'children', 'men',
  'women', 'master', 'church', 'gospel', 'scripture', 'bible', 'heaven', 'father', 'mother',
  // determiners/pronouns/abstracts a title-shaped phrase can put after "of" without
  // naming anyone: "The Works of His Hands", "The Life of Goodness".
  'thy', 'thine', 'his', 'her', 'our', 'their', 'this', 'that', 'those', 'these', 'same',
  'goodness', 'holiness', 'righteousness', 'truth', 'grace', 'mercy', 'faith', 'love',
  'apostle', 'apostles', 'prophet', 'prophets', 'evangelist', 'psalmist', 'law', 'cross',
  'saviour', 'savior', 'name', 'darkness',
  // abstract nouns in ordinary chapter titles — real Origen headings fired here:
  // "One's Life" (§973), "Life of Thought" (§536).
  'one', 'thought', 'mind', 'soul', 'man', 'world', 'word', 'nature', 'reason', 'wisdom',
  'knowledge', 'power', 'glory', 'judgment', 'death', 'flesh', 'body', 'heart', 'things',
]);

/** A work banner naming a person: "The First\nEpistle of Clement to the Corinthians.",
 *  "The Homilies of S. Chrysostom". Newlines count as space — print banners wrap.
 *  CASE-SENSITIVE on purpose: a printed banner is a title ("The Second Epistle of
 *  Clement"); prose like "the works of Thy goodness" / "life of holiness" is not, and an
 *  /i flag here flooded the first live run with exactly those non-names. */
const BANNER_RE = new RegExp(
  String.raw`\b(?:The\s+)?(?:First|Second|Third|Fourth|Fifth)?\s*` +
    String.raw`(?:Epistles?|Works?|Writings?|Homilies|Commentary|Commentaries|Treatises?|Discourses?|Sermons?|Poems?|Letters?|Life|Apology|Apologies|Histories|Oracles)\s+of\s+` +
    String.raw`(?:S\.?|St\.?|Saint\s+)?([A-Z][a-z]{2,})\b`,
);
/** Possessive banner: "Origen's Commentary on the Gospel of John" — no fire under Origen;
 *  "Schaff's Prolegomena" under Chrysostom would fire. Case-sensitive, same reason. */
const POSSESSIVE_BANNER_RE =
  /\b([A-Z][a-z]{2,})['’]s\s+(?:Commentary|Commentaries|Works?|Writings?|Homilies|Sermons?|Poems?|Epistles?|Treatises?|Life|History)\b/;
/** All-caps possessive, the bookseller-catalogue shape: "HAYDN'S DICTIONARY OF DATES",
 *  "MILNES'S POEMS OF MANY YEARS". Requires a WORK-TYPE noun after the possessive, or every
 *  all-caps poem/chapter title fires — "SODOM'S DOOM", "ZION'S APPEAL", "NEW-YEAR'S GIFT"
 *  all matched in the first full scan and none of them names an author. */
const ALLCAPS_POSSESSIVE_RE =
  /\b([A-Z]{3,})['’]S\s+(?:DICTIONARY|WORKS?|POEMS?|WRITINGS?|COMMENTARY|COMMENTARIES|LIFE|LIVES|HISTORY|HISTORIES|SERMONS?|LETTERS?|ESSAYS?|TRAVELS?|VOYAGES?|MEMOIRS?|LECTURES?|TREATISE|TRACTS?|OPERA)\b/;
/** A line that IS "By <Name>" — "By Philip Schaff", "By JAMES THOMSON ("B.V.")",
 *  "BY H. S. POMEROY, M.D." Two or more name tokens (initials count): "By Inheritance" /
 *  "By Adam" / ". by R. Menzies" — a one-word citation or an abstract noun — are not
 *  bylines, and the first full scan showed exactly those firing in commentary text. */
const BYLINE_RE =
  /(?:^|\n)\s*[Bb][Yy]\s+((?:[A-Z][\w.'’-]*\s+){1,3}[A-Z][\w.'’-]+)\s*(?:\("[^"]{0,20}"\))?(?:,\s*(?:[A-Z]\.?\s*)+)?[._]?\s*(?=\n|$)/;
/** The title-page form: "The Life and Work of St. John Chrysostom. By Philip Schaff, D.D."
 *  — the byline follows a full stop and ends at a comma or period, mid-line. The [A-Z]
 *  requirement keeps ". By faith…" / ". By this means…" out; God/Christ/apostles are
 *  excluded downstream. */
const TITLE_BYLINE_RE =
  /[.!?]\s+[Bb][Yy]\s+((?:[A-Z][\w.'’-]*\s+){1,3}[A-Z][\w.'’-]+)(?=,\s|\.\s|\.?$|$)/;

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

  // 4. The title line is a machine-generated word/phrase index — "(Latin|German|French)
  //    Words and Phrases", "Index of Latin Words and Phrases". Anchored at both ends, so
  //    calvin's KEPT "General Index of Chapters" and schaff's KEPT creed table cannot match.
  const indexTitle = title.length > 0 && title.length <= MAX_TITLE_CHARS ? title : h;
  if (indexTitle && indexTitle.length <= MAX_TITLE_CHARS && WORD_INDEX_RE.test(indexTitle)) {
    return { apparatus: true, strength: 'strong', kind: 'word-index-title', evidence: indexTitle };
  }

  // 5. The title line is a publisher catalogue — "CHEAP EDITIONS OF POPULAR WORKS.",
  //    "WORKS PREPARING FOR PUBLICATION", or a bibliographic format+price descriptor
  //    ("_Post 8vo, cloth extra, 6s._").
  if (indexTitle && indexTitle.length <= 120 && (CATALOGUE_TITLE_RE.test(indexTitle) || FORMAT_PRICE_HEADING_RE.test(indexTitle))) {
    return { apparatus: true, strength: 'strong', kind: 'publisher-catalogue-title', evidence: indexTitle.slice(0, 80) };
  }

  // 6. The body is a printed price list — a run of lines that are title + price
  //    (shillings/pence, dollars, cents) and nothing else. Needs ≥6 non-empty lines and
  //    ≥60% price-shaped, so a poem with one "2 6" in it is not a finding.
  {
    const lines = collapsed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length >= 6) {
      const priced = lines.filter((l) => PRICE_LINE_RES.some((re) => re.test(l.trim()))).length;
      if (priced / lines.length >= 0.6) {
        return { apparatus: true, strength: 'strong', kind: 'publisher-price-list-body', evidence: lines[0].trim().slice(0, 80) };
      }
    }
  }

  // 7. The body is press-puff advertisement — ≥2 distinct blurb signal types, the first in
  //    the opening 40%. See BLURB_SIGNALS for why the position bound exists (the KEPT
  //    spurgeon §298 mixed chunk fails it on purpose).
  {
    const hits = [];
    for (const [type, re] of Object.entries(BLURB_SIGNALS)) {
      const m = re.exec(body);
      if (m) hits.push({ type, at: m.index });
    }
    const distinct = new Set(hits.map((x) => x.type));
    const first = Math.min(...hits.map((x) => x.at), Infinity);
    if (distinct.size >= 2 && first <= body.length * 0.4) {
      return { apparatus: true, strength: 'strong', kind: 'publisher-blurb-body', evidence: body.slice(first, first + 80) };
    }
  }

  return { apparatus: false, strength: null, kind: null, evidence: null };
}

/**
 * Is this entry FOREIGN matter — a work banner or byline naming someone other than the
 * declared author? This is the composite-volume half of ADR-029 (Clement under Origen,
 * Schaff under Chrysostom) and needs the author to judge against, so it lives apart from
 * frontMatterVerdict and runs only through the per-work sweep. It reads the heading and
 * the body's first FOREIGN_SCAN_CHARS — foreign matter announces at its own head, and a
 * name deep inside a chunk is a quote, not a boundary.
 *
 * Returns `{ foreign, kind, name, evidence }`. A finding is a claim to be READ, never a
 * deletion: ADR-029 recorded two reported ranges that were wrong, and forbids ordinal
 * surgery on the strength of a report.
 */
export function foreignMatterVerdict(entry = {}, { author = '' } = {}) {
  const surnames = new Set(
    String(author)
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 3 && !['saint', 'the', 'of'].includes(t)),
  );
  const isAuthor = (name) => surnames.size > 0 && [...surnames].some((s) => name.toLowerCase().includes(s) || s.includes(name.toLowerCase()));
  const namedPerson = (name) => {
    const n = String(name).toLowerCase();
    return !SCRIPTURE_AUTHORS.has(n) && !NON_PERSON_TOKENS.has(n) && !isAuthor(n);
  };

  const heading = typeof entry.heading === 'string' ? entry.heading : '';
  const body = typeof entry.body === 'string' ? entry.body : '';
  const hasRuleLine = RULE_LINE_RE.test(body.slice(0, RULE_LINE_SCAN_CHARS));

  const checks = [
    { kind: 'foreign-work-banner', re: BANNER_RE },
    { kind: 'foreign-work-banner', re: POSSESSIVE_BANNER_RE },
    { kind: 'foreign-work-banner', re: ALLCAPS_POSSESSIVE_RE },
    { kind: 'foreign-work-byline', re: BYLINE_RE },
    { kind: 'foreign-work-byline', re: TITLE_BYLINE_RE },
  ];
  // The HEADING and the body's title region are judged separately. A body match with the
  // print-boundary signature (a rule line) is STRONG — that is the shape a bound-in work
  // actually takes ("The First Epistle of Clement. ————"). A bare body match, or a match
  // in the heading, is WEAK: a heading that names another work usually declares the
  // section's SUBJECT (Foxe's "The Life of William Gardiner" is Foxe's own chapter), and
  // deciding otherwise is a reading, not a regex.
  for (const [region, baseStrength] of [
    [body.slice(0, FOREIGN_SCAN_CHARS), hasRuleLine ? 'strong' : 'weak'],
    [heading, 'weak'],
  ]) {
    const text = String(region);
    if (!text) continue;
    for (const { kind, re } of checks) {
      const m = re.exec(text);
      if (!m) continue;
      const raw = m[1];
      // A byline names one person; test its last capitalized token (the surname, skipping
      // initials). A banner capture is already a single name.
      const tokens = raw.match(/[A-Za-z'’]{3,}/g) ?? [];
      const name = tokens[tokens.length - 1] ?? raw;
      if (!namedPerson(name)) continue;
      if (kind === 'foreign-work-byline' && tokens.some((t) => isAuthor(t))) continue;
      return { foreign: true, kind, strength: baseStrength, name, evidence: m[0].trim().slice(0, 80) };
    }
  }
  return { foreign: false, kind: null, strength: null, name: null, evidence: null };
}

/**
 * The per-work head-AND-tail sweep. ADR-029's own sweep method: composite boundaries and
 * publisher matter present at a work's head (front-matter bleed, an editor's prologue, a
 * foreign work bound in front) or its tail (appended works, catalogues, indexes), so every
 * section is checked and each finding is tagged 'head' | 'tail' | 'middle' against the
 * window sizes. Runs frontMatterVerdict (author-free shapes) and foreignMatterVerdict
 * (author-aware shapes) on every section.
 *
 * `held` is true when any STRONG finding exists — the signal the ingest adapter holds a
 * work on. Weak findings are reported but do not hold (owner decision #4 on gating
 * strength is open; this matches the scan runner's standing "only strong stops" doctrine).
 */
export function sweepWorkMatter(sections, { author = '', head = 12, tail = 12 } = {}) {
  const findings = [];
  const list = Array.isArray(sections) ? sections : [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const position = i < head ? 'head' : i >= list.length - tail ? 'tail' : 'middle';
    const v = frontMatterVerdict(s);
    if (v.apparatus) {
      findings.push({ index: i, ordinal: s?.ordinal ?? null, position, ...v });
      continue; // one finding per section is enough to read
    }
    const f = foreignMatterVerdict(s, { author });
    if (f.foreign) {
      findings.push({
        index: i, ordinal: s?.ordinal ?? null, position,
        apparatus: true, strength: f.strength, kind: f.kind, evidence: f.evidence,
        reason: `names '${f.name}', not the declared author '${author}'`,
      });
    }
  }
  return {
    scanned: list.length,
    findings,
    held: findings.some((f) => f.strength === 'strong'),
    byKind: findings.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {}),
  };
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
  if (scan.admittedHits.length > 0) {
    return {
      stop: true,
      reason: `${scan.admittedHits.length} SERVED entr${scan.admittedHits.length === 1 ? 'y is' : 'ies are'} book/chapter apparatus keyed to a verse`,
    };
  }
  return { stop: false, reason: null };
}
