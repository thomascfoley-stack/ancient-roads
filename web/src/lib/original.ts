// Original-language (interlinear) data access + morphology decoding.
// Word data:   /original/{bookSlug}/{chapter}.json  (built by ingest-original.ts)
// Dictionaries: /lexicon/{greek,hebrew}.json         (built by ingest-strongs.ts)

export interface OWord {
  w: string;   // surface word (original script)
  l: string;   // lemma (dictionary form)
  tr: string;  // transliteration
  s: string;   // Strong's key ("H7225" / "G26" / "")
  m: string;   // morph code
  g: string;   // short gloss
}

export interface OriginalData {
  book: number;
  chapter: number;
  lang: 'hebrew' | 'greek';
  verses: Record<string, OWord[]>;
}

export interface LexEntry {
  lemma: string;
  translit: string;
  pron: string;
  def: string;
  derivation: string;
  kjv: string;
}

const originalCache = new Map<string, OriginalData | null>();

export async function fetchOriginal(
  bookSlug: string,
  chapter: number,
): Promise<OriginalData | null> {
  const key = `${bookSlug}:${chapter}`;
  if (originalCache.has(key)) return originalCache.get(key)!;
  try {
    const res = await fetch(`/original/${bookSlug}/${chapter}.json`);
    const data = res.ok ? ((await res.json()) as OriginalData) : null;
    originalCache.set(key, data);
    return data;
  } catch {
    // Deliberately NOT cached. `null` is also this module's "not loaded yet" value, so
    // caching a failure pinned the reader on "Loading Greek / Hebrew…" permanently and
    // made a retry impossible for the life of the tab. A miss re-fetches.
    return null;
  }
}

const lexCache = new Map<string, Record<string, LexEntry>>();

// A missing lexicon file serves the host's HTML 404 page, and res.json() on that
// body throws. Degrade to null like fetchOriginal/fetchJson instead (the asymmetry
// documented in docs/DEPLOY_PREFLIGHT.md §4). Failures are not cached, so a later
// call can recover.
async function loadLexicon(lang: 'greek' | 'hebrew'): Promise<Record<string, LexEntry> | null> {
  const cached = lexCache.get(lang);
  if (cached) return cached;
  try {
    const res = await fetch(`/lexicon/${lang}.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, LexEntry>;
    lexCache.set(lang, data);
    return data;
  } catch {
    return null;
  }
}

// 'unavailable' = the lexicon itself failed to load, as opposed to null = no entry
// for this key. Panels surface the difference rather than claiming "no entry".
export async function fetchLexEntry(strong: string): Promise<LexEntry | null | 'unavailable'> {
  if (!strong) return null;
  const lang = strong[0] === 'H' ? 'hebrew' : 'greek';
  const lex = await loadLexicon(lang);
  if (!lex) return 'unavailable';
  return lex[strong] ?? null;
}

// Full-lexicon access for the Word Study search page. Null when it cannot be loaded.
export async function loadFullLexicon(lang: 'greek' | 'hebrew') {
  return loadLexicon(lang);
}

// Concordance: every verseId where this Strong's number occurs (built by
// src/ingest/build-concordance.ts). Sharded by 2-digit prefix bucket (G3588 -> "G35");
// outlier function words have their own shard, flagged in the bucket. MUST stay in sync
// with concordanceBucket() in build-concordance.ts.
export interface Concordance { strong: string; count: number; verseIds: number[] }
type BucketEntry = { count: number; verseIds: number[] } | { count: number; shard: true };

/** Bucket file for a Strong's number: language letter + floor(number/100). */
function bucketOf(strong: string): string {
  return `${strong[0]}${Math.floor(parseInt(strong.slice(1), 10) / 100)}`;
}

const bucketCache = new Map<string, Record<string, BucketEntry> | null>();
const shardCache = new Map<string, Concordance | null>();

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function fetchConcordance(strong: string): Promise<Concordance | null> {
  if (!strong || !/^[GH]\d+$/.test(strong)) return null;
  const bucketKey = bucketOf(strong);
  if (!bucketCache.has(bucketKey)) {
    bucketCache.set(bucketKey, await fetchJson<Record<string, BucketEntry>>(`/concordance/${bucketKey}.json`));
  }
  const entry = bucketCache.get(bucketKey)?.[strong];
  if (!entry) return null;
  if ('shard' in entry) {
    // Outlier: verseIds live in a dedicated shard file.
    if (!shardCache.has(strong)) {
      shardCache.set(strong, await fetchJson<Concordance>(`/concordance/${strong}.json`));
    }
    return shardCache.get(strong) ?? null;
  }
  return { strong, count: entry.count, verseIds: entry.verseIds };
}

// ---- English word -> original word ------------------------------------------
//
// The interlinear data has NO positional alignment between the English translation and the
// original words: John 10:11 gives `ποιμὴν / G4166 / gloss "a shepherd"` and nothing that says
// which English word that is. So selecting "shepherd" in the reader can only be matched against
// what each original word CLAIMS to mean — its gloss, and the Strong's KJV-usage list.
//
// That is a heuristic, and the product guarantee ("report, never interpret") decides how it must
// behave when it is unsure: it returns EVERY candidate rather than picking one, and an empty array
// rather than a guess. The caller shows all of them, or says plainly that there is no match. What
// it must never do is assert a single Greek word for an English one it has not actually matched.

/** One original word that claims the selected English word's sense. `index` is its position in the verse. */
export interface EnglishMatch {
  word: OWord;
  index: number;
}

// Leading articles/markers in a gloss ("a shepherd", "to give"), and Strong's own "X" filler.
// Dropped ONLY when the gloss has more words after them, so a gloss that is just "the" still
// matches the word "the".
const GLOSS_LEADERS = new Set(['a', 'an', 'the', 'to', 'x']);

/** Lowercase, drop possessives and anything that is not a letter. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z]/g, '');
}

/**
 * Crude English stemmer, KJV first. Used ONLY as a fallback after exact matching fails, because
 * over-stemming invents matches and a wrong match is worse here than no match: "careth" must
 * reach "care", but "sheep" must not become "shee".
 */
function stemEn(s: string): string {
  if (s.length > 4 && s.endsWith('eth')) return s.slice(0, -3);
  if (s.length > 4 && s.endsWith('est')) return s.slice(0, -3);
  if (s.length > 4 && s.endsWith('ies')) return `${s.slice(0, -3)}y`;
  if (s.length > 4 && s.endsWith('ing')) return s.slice(0, -3);
  if (s.length > 4 && s.endsWith('ed')) return s.slice(0, -2);
  if (s.length > 3 && s.endsWith('es')) return s.slice(0, -2);
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
  return s;
}

function glossTokens(gloss: string): string[] {
  const raw = gloss.split(/[^A-Za-z'’]+/).map(normalise).filter(Boolean);
  return raw.length > 1 && GLOSS_LEADERS.has(raw[0]!) ? raw.slice(1) : raw;
}

/** Strong's KJV-usage is a comma list with parenthetical asides and `+` markers: strip both. */
function kjvTokens(kjv: string): string[] {
  return kjv
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\+/g, ' ')
    .split(/[^A-Za-z'’]+/)
    .map(normalise)
    .filter((t) => t.length > 1 && !GLOSS_LEADERS.has(t));
}

/** True when a selection is one word, i.e. the only shape this lookup can answer. */
export function isSingleWord(text: string): boolean {
  return /^[A-Za-z][A-Za-z'’-]*$/.test(text.trim());
}

/**
 * The original words in a verse whose gloss or KJV usage claims the given English word.
 *
 * EXACT MATCHES WIN OUTRIGHT — the stemmed pass runs only when nothing matched exactly, so
 * "shepherd" cannot drag in "shepherds" from another word while a real "shepherd" exists.
 * Repeated words are collapsed by Strong's number, because John 10:11 says ποιμὴν twice and a
 * reader wants one entry, not two identical ones.
 *
 * `lex` may be null when the lexicon file failed to load; matching then falls back to glosses
 * alone, which is degraded but honest — the caller is told which it got.
 */
export function matchEnglishWord(
  english: string,
  words: OWord[],
  lex: Record<string, LexEntry> | null,
): EnglishMatch[] {
  const target = normalise(english);
  if (!target) return [];
  const targetStem = stemEn(target);

  const byKey = new Map<string, { match: EnglishMatch; exact: boolean }>();
  words.forEach((word, index) => {
    const tokens = [...glossTokens(word.g ?? ''), ...kjvTokens((word.s && lex?.[word.s]?.kjv) || '')];
    if (tokens.length === 0) return;
    const exact = tokens.includes(target);
    if (!exact && !tokens.some((t) => stemEn(t) === targetStem)) return;
    const key = word.s || word.l || word.w;
    const prev = byKey.get(key);
    if (!prev || (exact && !prev.exact)) byKey.set(key, { match: { word, index }, exact });
  });

  const all = [...byKey.values()];
  const exact = all.filter((c) => c.exact);
  return (exact.length > 0 ? exact : all).map((c) => c.match).sort((a, b) => a.index - b.index);
}

// ---- Morphology decoding ---------------------------------------------------

const GK = {
  person: { '1': '1st person', '2': '2nd person', '3': '3rd person' } as Record<string, string>,
  tense: { P: 'present', I: 'imperfect', F: 'future', A: 'aorist', X: 'perfect', Y: 'pluperfect' } as Record<string, string>,
  voice: { A: 'active', M: 'middle', P: 'passive' } as Record<string, string>,
  mood: { I: 'indicative', D: 'imperative', S: 'subjunctive', O: 'optative', N: 'infinitive', P: 'participle' } as Record<string, string>,
  case: { N: 'nominative', G: 'genitive', D: 'dative', A: 'accusative', V: 'vocative' } as Record<string, string>,
  number: { S: 'singular', P: 'plural' } as Record<string, string>,
  gender: { M: 'masculine', F: 'feminine', N: 'neuter' } as Record<string, string>,
  degree: { C: 'comparative', S: 'superlative' } as Record<string, string>,
};

const GK_POS: Record<string, string> = {
  'N-': 'noun', 'A-': 'adjective', 'RA': 'article', 'RP': 'personal pronoun',
  'RR': 'relative pronoun', 'RD': 'demonstrative pronoun', 'RI': 'interrogative/indefinite pronoun',
  'V-': 'verb', 'P-': 'preposition', 'C-': 'conjunction', 'D-': 'adverb',
  'X-': 'particle', 'I-': 'interjection', 'M-': 'indeclinable number',
};

const HEB_POS: Record<string, string> = {
  A: 'adjective', C: 'conjunction', D: 'adverb', N: 'noun', P: 'pronoun',
  R: 'preposition', S: 'suffix', T: 'particle', V: 'verb',
};
const HEB_NOUN_TYPE: Record<string, string> = { c: 'common', p: 'proper', g: 'gentilic' };
const HEB_GENDER: Record<string, string> = { m: 'masculine', f: 'feminine', b: 'both', c: 'common' };
const HEB_NUMBER: Record<string, string> = { s: 'singular', p: 'plural', d: 'dual' };
const HEB_STATE: Record<string, string> = { a: 'absolute', c: 'construct', d: 'determined' };
const HEB_STEM: Record<string, string> = {
  q: 'qal', N: 'niphal', p: 'piel', P: 'pual', h: 'hiphil', H: 'hophal', t: 'hithpael',
};
const HEB_VERB_TENSE: Record<string, string> = {
  p: 'perfect', i: 'imperfect', w: 'waw-consecutive', h: 'cohortative', j: 'jussive',
  v: 'imperative', a: 'infinitive absolute', c: 'infinitive construct', r: 'participle', s: 'passive participle',
};

function decodeGreek(code: string): string {
  // code like "N- ----NSF-" or "V- 3IAI-S--"
  const [pos, parse = ''] = code.split(' ');
  const parts: string[] = [];
  const p = GK_POS[pos ?? ''] ?? pos ?? '';
  if (p) parts.push(p);
  const at = (i: number, table: Record<string, string>) => {
    const c = parse[i];
    if (c && c !== '-') return table[c];
    return undefined;
  };
  const feats = [
    at(0, GK.person), at(1, GK.tense), at(2, GK.voice), at(3, GK.mood),
    at(4, GK.case), at(5, GK.number), at(6, GK.gender), at(7, GK.degree),
  ].filter(Boolean);
  return [parts.join(' '), feats.join(' ')].filter(Boolean).join(' · ');
}

function decodeHebrewMorpheme(seg: string): string {
  // seg like "Ncfsa" or "Vqp3ms" (language prefix already stripped)
  const pos = seg[0]!;
  const posName = HEB_POS[pos] ?? pos;
  const rest = seg.slice(1);
  const feats: string[] = [];
  if (pos === 'N') {
    if (HEB_NOUN_TYPE[rest[0]!]) feats.push(HEB_NOUN_TYPE[rest[0]!]!);
    for (const ch of rest.slice(1)) {
      if (HEB_GENDER[ch]) feats.push(HEB_GENDER[ch]!);
      else if (HEB_NUMBER[ch]) feats.push(HEB_NUMBER[ch]!);
      else if (HEB_STATE[ch]) feats.push(HEB_STATE[ch]!);
    }
  } else if (pos === 'V') {
    if (HEB_STEM[rest[0]!]) feats.push(HEB_STEM[rest[0]!]!);
    if (HEB_VERB_TENSE[rest[1]!]) feats.push(HEB_VERB_TENSE[rest[1]!]!);
    for (const ch of rest.slice(2)) {
      if (HEB_GENDER[ch]) feats.push(HEB_GENDER[ch]!);
      else if (HEB_NUMBER[ch]) feats.push(HEB_NUMBER[ch]!);
    }
  }
  return [posName, feats.join(' ')].filter(Boolean).join(' ');
}

function decodeHebrew(code: string): string {
  // code like "HR/Ncfsa" — language letter H/A, morphemes split by "/"
  const body = code.replace(/^[HA]/, '');
  return body
    .split('/')
    .map((seg) => decodeHebrewMorpheme(seg))
    .filter(Boolean)
    .join(' + ');
}

export function decodeMorph(code: string, lang: 'hebrew' | 'greek'): string {
  if (!code) return '';
  try {
    return lang === 'greek' ? decodeGreek(code) : decodeHebrew(code);
  } catch {
    return code;
  }
}
