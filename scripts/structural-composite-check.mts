#!/usr/bin/env -S npx tsx
/**
 * Structural composite check — ADR-029 Track C (owner order 2026-09-07,
 * docs/pm/orders/2026-09-07-structural-validation-order.md).
 *
 * Takes a slug, returns composite / single / unknown with the structural evidence
 * that decided it. The question answered: does this source item map 1:1 to one
 * work by the manifest's declared author?
 *
 * Evidence, strongest first (every verdict names its layer):
 *   L0  adapter shape: SWORD / helloao / single-doc adapters are one work by construction.
 *   L2  source ThML DC.Creator roles: distinct declared AUTHOR clusters (L2a), or the
 *       manifest author absent from the declared authors while present as editor (L2b).
 *   L3  the source's own table of contents (ThML div1/div2 titles; dev-DB section
 *       headings as a supplementary staged-structure source): >1 distinct top-level
 *       work, or a numbered run of genre-titled treatises (L3b).
 *   L4  a division/heading title attributing authorship to a named person other than
 *       the declared author ("Life of Dr. X", "Letter of Ser Y", "Sermon of Dr. Z");
 *       "Life of <the declared author>" counts — a biography of the author is by
 *       another hand by construction.
 *   L5  the manifest entry's own shape (title vs author): title attributes the work to
 *       a named person != author, "Works of X, Vol. N" collection shape, "X and Y
 *       <surname>" two-author title, "Life of the late <author>".
 *
 * Title/slug pattern is NEVER sufficient for "single": single requires real structure
 * (a source TOC, source metadata, or a one-work adapter). Anything decidable only by
 * pattern returns UNKNOWN. An unknown is not a pass.
 *
 * Read-only. Dev DB only, SELECT only, and only when --dev-db is passed with
 * NEON_BRANCH=dev; no production connection is made by this script, ever.
 *
 * Usage:
 *   npx tsx scripts/structural-composite-check.mts <slug> [...more slugs]
 *   npx tsx scripts/structural-composite-check.mts --slugs=<file.json>   # ["slug",...] or {"slugs":[...]}
 *   export DATABASE_URL="$(cat ~/.neon_dev_owner_url)" NEON_BRANCH=dev
 *   npx tsx scripts/structural-composite-check.mts --dev-db --slugs=<file.json>
 * Options: --no-fetch (cache miss => unknown), --concurrency=N (default 4), --json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CCEL_CACHE = join(ROOT, 'data/raw/ccel');
const GUT_CACHE = join(ROOT, 'data/raw/gutenberg');

type Verdict = 'composite' | 'single' | 'unknown';
interface Finding { layer: string; evidence: string }
interface Result { slug: string; verdict: Verdict; reason: string; findings: Finding[] }

// ---------- manifest ----------

interface ManifestEntry {
  slug: string; title: string; author: string; source_type?: string;
  provenance?: {
    acquire?: { adapter?: string; ccel_ids?: string[]; ebook_id?: number };
    rebuild?: { source?: string };
  };
}

function loadManifest(): Map<string, ManifestEntry> {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'ingest/sources.config.json'), 'utf8')) as ManifestEntry[];
  return new Map(cfg.map((e) => [e.slug, e]));
}

// ---------- name handling ----------

const HONORIFICS = /^(dr|rev|mr|mrs|st|saint|ser|bishop|pope|fra|dom|sir|abbot|cardinal|prof|ven)\b/i;
const STOP_SINGLE = new Set([
  'god', 'christ', 'jesus', 'lord', 'holy', 'spirit', 'scripture', 'scriptures', 'heaven',
  'hell', 'faith', 'grace', 'glory', 'providence', 'salvation', 'prayer', 'church', 'bible',
  'gospel', 'trinity', 'apostles', 'apostle', 'angels', 'man', 'men', 'soul', 'sin', 'truth',
  'nature', 'reason', 'revelation', 'testament', 'psalms', 'prophets', 'saints',
]);
const STOP_CAP_PAIR = /^(new|old) testament$|^holy (spirit|ghost|scripture|communion|trinity)$|^divine (providence|grace|love|wisdom|justice|mercy)$/i;

function authorTokens(author: string): Set<string> {
  const toks = author.toLowerCase().match(/[a-z']+/g) ?? [];
  return new Set(toks.filter((t) => t.length >= 3 && !['the', 'and', 'saint', 'st'].includes(t)));
}

/** edit distance ≤1 for tokens len≥5 — absorbs source-metadata typos ("Chesteron"/"Chesterton"). */
function tokEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Cluster person-name strings: two strings are the same person if they share any token. */
function clusterPersons(names: string[]): string[][] {
  const tokenized = names.map((n) => ({
    raw: n,
    toks: new Set((n.toLowerCase().match(/[a-z_]+/g) ?? [])
      .flatMap((t) => t.split('_'))
      .filter((t) => t.length >= 3 && !['st', 'saint', 'rev', 'dr', 'sir', 'the'].includes(t))),
  }));
  const parent = tokenized.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < tokenized.length; i++)
    for (let j = i + 1; j < tokenized.length; j++) {
      const a = [...tokenized[i]!.toks], b = [...tokenized[j]!.toks];
      if (a.some((ta) => b.some((tb) => tokEq(ta, tb)))) parent[find(i)] = find(j);
    }
  const clusters = new Map<number, string[]>();
  tokenized.forEach((t, i) => {
    const r = find(i);
    clusters.set(r, [...(clusters.get(r) ?? []), t.raw]);
  });
  return [...clusters.values()];
}

function clusterMatchesAuthor(cluster: string[], auth: Set<string>): boolean {
  return cluster.some((name) => {
    const toks = (name.toLowerCase().match(/[a-z_]+/g) ?? []).flatMap((t) => t.split('_'));
    return toks.some((t) => t.length >= 3 && [...auth].some((at) => tokEq(t, at)));
  });
}

/**
 * Does `phrase` (text after an attributive "of"/"by") name a person?
 * Returns { names_person, names_author } — a person is an honorific-led name,
 * a 2+-word capitalized name, or a single capitalized non-stopword name.
 */
function personInPhrase(rawPhrase: string, auth: Set<string>): { person: boolean; isAuthor: boolean; name: string } {
  let p = (rawPhrase.replace(/^the late\s+/i, '').split(/[,;:([]/)[0] ?? '').trim();
  p = p.replace(/[."'\u201d\u2019]+$/g, '').trim();
  if (!p) return { person: false, isAuthor: false, name: p };
  const toks = (p.toLowerCase().match(/[a-z']+/g) ?? []).filter((t) => t.length >= 3);
  const isAuthor = toks.some((t) => auth.has(t));
  if (HONORIFICS.test(p)) return { person: true, isAuthor, name: p };
  const words = p.split(/\s+/);
  const capRun = words.filter((w) => /^[A-Z\u00c0-\u00de][a-z'\u2019.-]+$/.test(w));
  if (capRun.length >= 2 && !STOP_CAP_PAIR.test(p)) return { person: true, isAuthor, name: p };
  if (capRun.length === 1) {
    const low = capRun[0]!.toLowerCase().replace(/[^a-z]/g, '');
    if (low.length >= 4 && !STOP_SINGLE.has(low)) return { person: true, isAuthor, name: p };
  }
  return { person: false, isAuthor, name: p };
}

// ---------- TOC shape ----------

const HYGIENE = /title ?page|^contents\b|table of contents|indexes?$|^index\b|^index of|words and phrases|preface|prefatory|foreword|introduct|prolegomena|appendix|errata|corrigenda|advertisement|dedication|to the reader|list of|glossary|bibliograph|works of reference|subject index|editorial|biographical note|erratum|note on the text|textual note/i;
const NUMBERED_PART = new RegExp(
  '^(book|part|chapter|chap|section|sect|volume|vol|homily|sermon|discourse|letter|epistle|treatise|hymn|psalm' +
    '|meditation|devotion|lecture|canto|satire|eclogue|lesson|ode|essay|article|discussione?)\\b\\.?\\s*(n?o?\\.?\\s*)?' +
    '(i{1,3}v?x?|iv|vi{0,3}|ix|xi{0,3}|x|l+|c+|\\d+\\b|one|two|three|four|five|six|seven|eight|nine|ten' +
    '|eleven|twelve|first|second|third|fourth|fifth)\\b',
  'i');
const LEADING_NUMERAL = /^([ivxlc]{1,7}|\d{1,3})[.)](\s|$)/i;
const GENRE_NOUN = /\b(treatise|dissertation|inquiry|discourse|narrative|history of|dialogue|dialogues|apology|apologia|commentary on|lectures on)\b/i;

function isHygiene(title: string): boolean { return HYGIENE.test(title.trim()); }
function isNumberedPart(title: string): boolean {
  const t = title.trim();
  return NUMBERED_PART.test(t) || LEADING_NUMERAL.test(t);
}

/**
 * Biblical-book names. For a `commentary` source_type, a division titled with a
 * biblical book is a per-book part of the one commentary (its construction),
 * not a distinct work. Closed list; a miss just leaves L3 conservative.
 */
const BIBLE_BOOKS = new Set([
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua', 'judges', 'ruth',
  '1 samuel', '2 samuel', '1 kings', '2 kings', '1 chronicles', '2 chronicles', 'ezra',
  'nehemiah', 'esther', 'job', 'psalms', 'psalm', 'proverbs', 'ecclesiastes',
  'song of solomon', 'song of songs', 'canticles', 'isaiah', 'jeremiah', 'lamentations',
  'lamentations of jeremiah', 'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah',
  'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi',
  'matthew', 'mark', 'luke', 'john', 'acts', 'acts of the apostles', 'romans',
  '1 corinthians', '2 corinthians', 'galatians', 'ephesians', 'philippians', 'colossians',
  '1 thessalonians', '2 thessalonians', '1 timothy', '2 timothy', 'titus', 'philemon',
  'hebrews', 'james', '1 peter', '2 peter', '1 john', '2 john', '3 john', 'jude', 'revelation',
  'revelation of st. john', 'apocalypse',
]);
function isBibleBookPart(title: string): boolean {
  let t = title.trim().toLowerCase().replace(/[.]+$/, '').replace(/^the\s+/, '');
  t = t.replace(/^(gospel|epistle|book|prophecy) of\s+/, '').replace(/\s+of jeremiah$/, ' of jeremiah');
  if (BIBLE_BOOKS.has(t)) return true;
  // "The Epistle of Paul to the Romans" / "Gospel according to St. John" forms
  const m = t.match(/\b(?:to the|according to(?: st\.?)?|of)\s+([a-z ]+)$/);
  return !!m && BIBLE_BOOKS.has(m[1]!.replace(/^st\.?\s+/, '').trim());
}
function commonPrefixRun(titles: string[]): boolean {
  if (titles.length < 2) return false;
  const toks = titles.map((t) => t.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' '));
  return toks.every((t) => t === toks[0]) && (toks[0]?.length ?? 0) > 0;
}

/** title ≈ book title (wrapper division that just restates the book) */
function resemblesBookTitle(divTitle: string, bookTitle: string): boolean {
  const dt = new Set((divTitle.toLowerCase().match(/[a-z']+/g) ?? []).filter((t) => t.length >= 4));
  const bt = (bookTitle.toLowerCase().match(/[a-z']+/g) ?? []).filter((t) => t.length >= 4);
  if (dt.size === 0 || bt.length === 0) return false;
  const overlap = bt.filter((t) => dt.has(t)).length;
  return overlap / bt.length >= 0.6;
}

interface Div { level: number; title: string }

/** Attributive markers: a division/title attributing authorship or biographical subject to someone. */
const STRONG_ATTR = /\b(life|memoir|memoirs|biography|sketch)\s+of\b|\blife of\b|\bby\s+/i;
const WEAK_ATTR = /\b(letter|epistle|sermon|sermons|works|writings|martyrdom|lives|theology|doctrine|philosophy|thought|teachings?|poems|hymns|dialogues?)\s+of\s+([A-Z][^\n]{0,80})/i;

function attributionFinding(title: string, auth: Set<string>, layer: string, where: string): Finding | null {
  const t = title.trim();
  // "Life of ..." — strong: biography. If the subject IS the declared author, it is
  // still another hand's work (a "Life of the late Rev. Mr. John Flavel" is not by Flavel).
  const life = t.match(/\b(?:the\s+)?(?:life|memoir|memoirs|biography)\s+of\s+(.{1,90})/i)
    ?? t.match(/\bsketch of\s+(.{1,90}?\blife)\b/i);
  if (life) {
    const p = personInPhrase(life[1]!, auth);
    if (p.person && !p.isAuthor)
      return { layer, evidence: `${where} "${t.slice(0, 80)}" is a Life/memoir of ${p.name}, not of the declared author` };
    if (p.person && p.isAuthor && /life of (the late |(dr|rev|mr|mrs|st)\b)/i.test(t))
      return { layer, evidence: `${where} "${t.slice(0, 80)}" is a Life OF the declared author — biographical subject, another hand by construction` };
    if (p.isAuthor && /^the life of /i.test(t))
      return { layer, evidence: `${where} "${t.slice(0, 80)}" is a Life OF the declared author — biographical subject, another hand by construction` };
  }
  const weak = t.match(WEAK_ATTR);
  if (weak) {
    // "Preface to the Letter of St. Paul to the Romans" — the of-phrase is the OBJECT
    // of this work's own genre (preface/commentary/notes on something), not an
    // attribution of this item to another hand.
    if (/^(a |the )?(preface|introduction|commentary|commentaries|notes?|expositions?|lectures?|discourses?|dissertation|essay)\s+(to|on)\b/i.test(t)) return null;
    const ofIdx = t.toLowerCase().indexOf(weak[1]!.toLowerCase() + ' of');
    const phraseFull = t.slice(ofIdx + weak[1]!.length + 4);
    const phrase = (phraseFull.split(/[,;:([]/)[0] ?? '').trim() || phraseFull.trim();
    // Scripture attribution ("the Epistle of Paul to the Romans") names the biblical
    // book's traditional author — a closed class, not foreign matter in THIS item.
    const toThe = phrase.toLowerCase().match(/\b(?:to the|according to)\s+([a-z ]+?)\s*$/);
    const whole = phrase.match(/^([a-z'. ]+?)\s*$/i);
    const tailBook = (toThe?.[1] ?? whole?.[1] ?? '').replace(/^(st\.?|the)\s+/, '').replace(/[.]+$/, '').trim();
    if (tailBook && BIBLE_BOOKS.has(tailBook)) return null;
    const p = personInPhrase(phrase, auth);
    if (p.person && !p.isAuthor)
      return { layer, evidence: `${where} "${t.slice(0, 80)}" attributes a ${weak[1]!} to ${p.name}, not the declared author` };
  }
  return null;
}

// ---------- ThML parsing ----------

interface ThmlInfo {
  creators: { sub: string; scheme: string; value: string }[];
  divs: Div[];
}

function parseThml(xml: string): ThmlInfo {
  const headEnd = xml.indexOf('</ThML.head>');
  const head = headEnd > 0 ? xml.slice(0, headEnd) : xml.slice(0, 60000);
  const creators: ThmlInfo['creators'] = [];
  for (const m of head.matchAll(/<DC\.Creator\b([^>]*)(?:\/>|>(.*?)<\/DC\.Creator>)/gs)) {
    const attrs = m[1] ?? '';
    const value = (m[2] ?? '').replace(/<[^>]+>/g, '').trim();
    if (!value) continue;
    creators.push({
      sub: /sub="([^"]*)"/.exec(attrs)?.[1] ?? '',
      scheme: /scheme="([^"]*)"/.exec(attrs)?.[1] ?? '',
      value,
    });
  }
  const divs: Div[] = [];
  for (const m of xml.matchAll(/<div([1-4])\b[^>]*\btitle="([^"]*)"/g))
    divs.push({ level: Number(m[1]!), title: m[2]!.replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').trim() });
  return { creators, divs };
}

// ---------- structural sources ----------

async function getThml(ccelId: string, noFetch: boolean): Promise<{ xml: string; origin: string } | null> {
  const cachePath = join(CCEL_CACHE, `${ccelId.replace('/', '_')}.xml`);
  if (existsSync(cachePath)) return { xml: readFileSync(cachePath, 'utf8'), origin: 'local ThML cache' };
  if (noFetch) return null;
  const url = `https://www.ccel.org/ccel/${ccelId}.xml`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml.includes('<ThML')) return null;
    mkdirSync(CCEL_CACHE, { recursive: true });
    writeFileSync(cachePath, xml);
    return { xml, origin: `live fetch ${url}` };
  } catch {
    return null;
  }
}

async function getGutenberg(ebookId: number, noFetch: boolean): Promise<{ text: string; origin: string } | null> {
  const cachePath = join(GUT_CACHE, `${ebookId}.txt`);
  if (existsSync(cachePath)) return { text: readFileSync(cachePath, 'utf8'), origin: 'local Gutenberg cache' };
  if (noFetch) return null;
  const url = `https://www.gutenberg.org/cache/epub/${ebookId}/pg${ebookId}.txt`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return null;
    const text = await res.text();
    mkdirSync(GUT_CACHE, { recursive: true });
    writeFileSync(cachePath, text);
    return { text, origin: `live fetch ${url}` };
  } catch {
    return null;
  }
}

// ---------- dev DB (optional, SELECT only) ----------

async function devDbHeadings(slug: string): Promise<string[] | null> {
  if (!process.env.DATABASE_URL) return null;
  if (process.env.NEON_BRANCH !== 'dev') throw new Error('--dev-db requires NEON_BRANCH=dev (refusing anything else)');
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const r = await client.query(
      'select s.heading from sections s join sources so on so.id = s.source_id where so.slug = $1 order by s.ordinal',
      [slug]);
    return r.rows.map((row: { heading: string }) => row.heading as string);
  } finally {
    await client.end();
  }
}

// ---------- the rule ----------

const SINGLE_WORK_ADAPTERS = new Set(['sword', 'crosswire-sword', 'helloao', 'thayers']);

async function checkSlug(slug: string, manifest: Map<string, ManifestEntry>, opts: { noFetch: boolean; devDb: boolean }): Promise<Result> {
  const compositeFindings: Finding[] = []; // decisive evidence of >1 work / foreign author
  const notes: string[] = [];              // informational, never decisive
  let sawStructure = false;                // real source structure was inspected
  const entry = manifest.get(slug);
  if (!entry) return { slug, verdict: 'unknown', reason: 'no manifest entry — nothing structural to inspect', findings: [] };
  const auth = authorTokens(entry.author ?? '');
  const acquire = entry.provenance?.acquire ?? {};
  const adapter = acquire.adapter ?? '';

  // L5e (pre-adapter) — the author field itself declares more than one person
  // ("Jamieson, Fausset & Brown"): not one work by one author, whatever the adapter.
  if (/[A-Za-z]\s+(&| and )\s+[A-Z]/.test(entry.author ?? ''))
    return finish(slug, 'composite', [{ layer: 'L5e', evidence: `manifest author field "${entry.author}" declares more than one person — not one work by one author` }]);

  // L0 — one-work-by-construction adapters (acquire adapter or declared rebuild source).
  const rebuildSource = entry.provenance?.rebuild?.source ?? '';
  if (SINGLE_WORK_ADAPTERS.has(adapter) || SINGLE_WORK_ADAPTERS.has(rebuildSource))
    return { slug, verdict: 'single', reason: `L0 adapter=${adapter || rebuildSource}: one work by construction (module/verse-keyed single commentary)`, findings: [] };

  // ---- CCEL: the source item's own metadata + table of contents ----
  if (adapter === 'ccel' && (acquire.ccel_ids ?? []).length > 0) {
    let missing = 0;
    for (const ccelId of acquire.ccel_ids!) {
      const got = await getThml(ccelId, opts.noFetch);
      if (!got) { notes.push(`no ThML for ${ccelId} (cache miss${opts.noFetch ? ', --no-fetch' : ', fetch failed'})`); missing++; continue; }
      sawStructure = true;
      const thml = parseThml(got.xml);
      const src = `ThML ${ccelId} (${got.origin})`;

      // L2 — DC.Creator roles.
      const authors = thml.creators.filter((c) => /author|writer/i.test(c.sub)).map((c) => c.value);
      const editors = thml.creators.filter((c) => /editor|translator/i.test(c.sub)).map((c) => c.value);
      if (authors.length > 0) {
        const authorClusters = clusterPersons(authors);
        if (authorClusters.length >= 2)
          compositeFindings.push({ layer: 'L2a', evidence: `${src}: DC.Creator declares ${authorClusters.length} distinct authors (${authorClusters.map((c) => c[0]).slice(0, 6).join('; ')}${authorClusters.length > 6 ? ', …' : ''})` });
        else if (!clusterMatchesAuthor(authorClusters[0]!, auth)) {
          const asEditor = editors.length > 0 && clusterPersons(editors).some((cl) => clusterMatchesAuthor(cl, auth));
          compositeFindings.push({
            layer: 'L2b',
            evidence: `${src}: DC.Creator declares author "${authorClusters[0]![0]}" but manifest author is "${entry.author}"${asEditor ? ' (present only as editor/translator)' : ''} — declared author is not an author of this item`,
          });
        }
      } else {
        notes.push(`${src}: DC.Creator carries no Author-role entries (${thml.creators.length} creators unroled)`);
      }

      // Division titles: L4 attribution markers (strong at every level; weak at div1, deeper only in collection shape).
      const isCommentary = entry.source_type === 'commentary';
      const div1s = thml.divs.filter((d) => d.level === 1).map((d) => d.title);
      const contentDiv1 = div1s.filter((t) => !isHygiene(t) && !resemblesBookTitle(t, entry.title));
      const collectionShape = contentDiv1.length <= 1;
      for (const d of thml.divs) {
        if (isHygiene(d.title)) continue;
        // A numbered chapter is a part of the enclosing work, not a bound-in work:
        // "Chapter V. The Real Life of St. Thomas" is a chapter, not a biography volume.
        if (isNumberedPart(d.title)) continue;
        // A per-biblical-book division of a commentary is that commentary's own construction.
        if (isCommentary && isBibleBookPart(d.title)) continue;
        const isStrong = /\b(life|memoir|memoirs|biography)\s+of\b|\bsketch of\b/i.test(d.title);
        const weakOk = d.level === 1 || collectionShape;
        if (!isStrong && !weakOk) continue;
        const f = attributionFinding(d.title, auth, 'L4', `${src} div${d.level}`);
        if (f) compositeFindings.push(f);
      }

      // L3 — TOC work-count at div1; collection shape falls to div2.
      const isPart = (t: string): boolean => isNumberedPart(t) || (isCommentary && isBibleBookPart(t));
      const workCountVerdict = (titles: string[], level: number): Finding | null => {
        const content = titles.filter((t) => !isHygiene(t) && !resemblesBookTitle(t, entry.title));
        if (content.length < 2) return null;
        if (content.every(isPart)) {
          const genreTitled = content.filter((t) => GENRE_NOUN.test(t));
          if (genreTitled.length >= 2)
            return { layer: 'L3b', evidence: `${src}: ${content.length} numbered div${level} divisions are genre-titled treatises, e.g. "${genreTitled[0]!.slice(0, 60)}" / "${genreTitled[1]!.slice(0, 60)}" — a numbered run of distinct works` };
          return null; // one work in parts (numbered, or per-biblical-book for a commentary)
        }
        if (commonPrefixRun(content)) return null; // "A Treatise of X / of Y / of Z" part-family
        // A parallel-language edition ("[English] Disputation..." / "[Latin] Disputatio...")
        // presents ONE work in two languages.
        if (content.every((t) => /^\[(english|latin|greek|german|deutsch|french|hebrew|spanish|italian|syriac)\]/i.test(t.trim()))) return null;
        // Halves/sides of one whole ("The Negative Side" / "The Positive Side").
        if (content.every((t) => /^(the\s+)?[a-z']+\s+(side|half)$/i.test(t.trim()))) return null;
        return { layer: 'L3', evidence: `${src}: TOC lists ${content.length} distinct top-level div${level} works: ${content.slice(0, 4).map((t) => `"${t.slice(0, 50)}"`).join(', ')}${content.length > 4 ? ', …' : ''}` };
      };
      const f1 = workCountVerdict(div1s, 1);
      if (f1) compositeFindings.push(f1);
      else if (collectionShape) {
        const f2 = workCountVerdict(thml.divs.filter((d) => d.level === 2).map((d) => d.title), 2);
        if (f2) compositeFindings.push(f2);
      }
    }
    if (compositeFindings.length > 0) return finish(slug, 'composite', compositeFindings);
    if (missing > 0)
      return finish(slug, 'unknown', [], `structure not established for ${missing}/${acquire.ccel_ids!.length} ccel_ids (${notes.join('; ')}) — and pattern alone cannot pass a work`);
  }
  // ---- Gutenberg: the ebook's own contents ----
  else if (adapter === 'gutenberg' && acquire.ebook_id) {
    const got = await getGutenberg(acquire.ebook_id, opts.noFetch);
    if (!got) return finish(slug, 'unknown', [], `no Gutenberg text for #${acquire.ebook_id} — structure not established, pattern alone cannot pass a work`);
    const contents = got.text.match(/^(CHAPTER|Chapter|PART|Part|BOOK|Book|LECTURE|Lecture)\b[^\n]{0,70}$/gm) ?? [];
    if (contents.length >= 2) {
      sawStructure = true;
      notes.push(`Gutenberg #${acquire.ebook_id} (${got.origin}): contents are ${contents.length} numbered chapter-units of one work, e.g. "${contents[0]!.slice(0, 50)}"`);
    } else {
      return finish(slug, 'unknown', [], `Gutenberg #${acquire.ebook_id}: no usable contents structure found — pattern alone cannot pass a work`);
    }
  }

  // ---- dev DB staged headings (supplementary staged-structure evidence) ----
  if (opts.devDb) {
    try {
      const headings = await devDbHeadings(slug);
      if (headings && headings.length > 0) {
        const dbFindings: Finding[] = [];
        for (const h of headings.slice(0, 200)) {
          if (isHygiene(h)) continue;
          const f = attributionFinding(h, auth, 'L4-db', 'dev-DB section heading');
          if (f) dbFindings.push(f);
        }
        if (dbFindings.length > 0) return finish(slug, 'composite', dbFindings);
        notes.push(`dev-DB staged headings (${headings.length}) carry no foreign-person attribution marker; sample: "${headings[0]?.slice(0, 60)}"`);
      } else {
        notes.push('dev-DB: slug not staged (0 sections)');
      }
    } catch (e) {
      notes.push(`dev-DB heading query failed: ${(e as Error).message}`);
    }
  }

  // ---- L5 — manifest entry shape (title vs author) ----
  const l5: Finding[] = [];
  const t = entry.title ?? '';
  const f5a = attributionFinding(t, auth, 'L5', 'manifest title');
  if (f5a) l5.push(f5a);
  if (/\bworks of\b/i.test(t) && /\bvol(ume)?\.?\s*\d/i.test(t))
    l5.push({ layer: 'L5b', evidence: `manifest title "${t.slice(0, 80)}" declares a volume of collected Works — multi-work collection by construction` });
  const twoAuthors = t.match(/\bworks of\s+([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/);
  if (twoAuthors && twoAuthors[1] !== twoAuthors[2] && auth.has(twoAuthors[3]!.toLowerCase()))
    l5.push({ layer: 'L5d', evidence: `manifest title "${t.slice(0, 80)}" names two authors (${twoAuthors[1]} and ${twoAuthors[2]} ${twoAuthors[3]}); manifest author field declares only "${entry.author}"` });
  if (l5.length > 0) return finish(slug, 'composite', l5);

  // ---- verdict: single only on established structure; pattern alone is UNKNOWN ----
  if (sawStructure)
    return finish(slug, 'single', [], `source structure (${adapter === 'ccel' ? `ThML TOC+metadata ${(acquire.ccel_ids ?? []).join(', ')}` : `Gutenberg #${acquire.ebook_id} contents`}): one content work, no foreign-author marker in source metadata, division titles or manifest shape${notes.length ? ` [${notes.join('; ')}]` : ''}`);
  return finish(slug, 'unknown', [], `adapter=${adapter || 'none'}: no structural evidence established (${notes.join('; ') || 'nothing to inspect'}); pattern alone cannot pass a work`);
}

function finish(slug: string, verdict: Verdict, findings: Finding[], override?: string): Result {
  const decisive = findings.find((f) => f.layer.startsWith('L'));
  const reason = override ?? (verdict === 'composite' && decisive ? `${decisive.layer}: ${decisive.evidence}` : findings[0]?.evidence ?? verdict);
  return { slug, verdict, reason, findings };
}

// ---------- CLI ----------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noFetch = args.includes('--no-fetch');
  const devDb = args.includes('--dev-db');
  const asJson = args.includes('--json');
  const conc = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 4);
  const slugsFile = args.find((a) => a.startsWith('--slugs='))?.split('=')[1];
  let slugs = args.filter((a) => !a.startsWith('--'));
  if (slugsFile) {
    const raw = JSON.parse(readFileSync(slugsFile, 'utf8'));
    slugs = Array.isArray(raw) ? raw : raw.slugs;
  }
  if (slugs.length === 0) { console.error('no slugs given'); process.exit(2); }
  const manifest = loadManifest();
  const results: Result[] = [];
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < slugs.length) {
      const slug = slugs[idx++]!;
      results.push(await checkSlug(slug, manifest, { noFetch, devDb }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, slugs.length) }, worker));
  const bySlug = new Map(results.map((r) => [r.slug, r]));
  for (const slug of slugs) {
    const r = bySlug.get(slug)!;
    if (asJson) console.log(JSON.stringify(r));
    else console.log(`${r.slug}\t${r.verdict}\t${r.reason}`);
  }
  const counts = { composite: 0, single: 0, unknown: 0 };
  for (const r of results) counts[r.verdict]++;
  console.error(`\n== ${slugs.length} works: ${counts.single} single, ${counts.composite} composite, ${counts.unknown} unknown`);
}

main().catch((e) => { console.error(e); process.exit(1); });
