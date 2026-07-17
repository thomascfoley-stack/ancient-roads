// archive.org OCR adapter (INGESTION_ADAPTERS.md "archive — OCR guardrails";
// ARCHIVE_ORG_INGEST_DESIGN.md). Fetches + caches an item's `_djvu.txt` derivative,
// applies the OCR guardrails (edition/title-page check, garbage-line rate bar,
// page-chrome strip by frequency analysis), and parses the work into per-headword
// entries. First (and so far only) profile: thayers-lexicon.
//
//   npx tsx src/ingest/adapter-archive.ts --slug=thayers-lexicon [--identifier=<id>]
//
// FAIL CLOSED (throw with a precise, quotable reason — the quarantine record):
//   - edition markers absent from the front matter (wrong/mislabeled scan)
//   - garbage-line rate > 5% (unusable OCR)
//   - fewer entries than the profile floor (structure not recognized)
//   - headword recognizability below the pre-registered bar (a lexicon whose KEYS
//     are OCR junk is unusable as a lexicon, however clean its English prose)
//
// Headword recognizability: archive.org ran Latin-script OCR over Thayer, so Greek
// headwords come out as visual-confusion junk (`{nyla` = ζημία, `ayabos` = ἀγαθός) —
// zero Greek Unicode in the whole derivative. We measure how many entry headwords
// are still recognizable by collapsing BOTH the OCR junk and the Strong's Greek
// lemma list (5,624 NT words — the exact vocabulary Thayer covers) into a shared
// confusion-class skeleton and matching under a small edit-distance budget. This is
// an honest approximate measure, not an inversion of the OCR; the CLI prints
// matched/unmatched samples so the number can be eyeballed, not just trusted.
//
// NO database writes. Output (only when every bar passes) is a JSONL of
// {key, text} next to the cached scan, for a later staging step.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { sanitizeForIngest } from './content-sanity.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const CACHE_ROOT = 'data/raw/archive';
const STRONGS_GREEK_URL = 'https://raw.githubusercontent.com/openscriptures/strongs/master/greek/strongs-greek-dictionary.js';

// ── fetch + cache ──
async function fetchCached(url: string, cachePath: string): Promise<string> {
  if (existsSync(cachePath)) return readFileSync(cachePath, 'utf8');
  mkdirSync(path.dirname(cachePath), { recursive: true });
  console.log(`  fetching ${url} ...`);
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(cachePath, text);
  console.log(`  cached ${cachePath} (${text.length} chars)`);
  return text;
}

export async function fetchArchiveDjvu(identifier: string, cacheDir: string): Promise<string> {
  return fetchCached(`https://archive.org/download/${identifier}/${identifier}_djvu.txt`, path.join(cacheDir, `${identifier}_djvu.txt`));
}

// ── guardrail 1: edition / title-page check ──
export function editionCheck(text: string, markers: RegExp[]): void {
  const head = text.slice(0, 60_000); // title page + front matter
  const missing = markers.filter((m) => !m.test(head));
  if (missing.length > 0) {
    throw new Error(`FAIL CLOSED: edition check — front matter lacks ${missing.map(String).join(', ')} (wrong or mislabeled scan)`);
  }
}

// ── guardrail 2: garbage-line rate ──
// A line is garbage when it is dominated by non-letters, carries runs of repeated
// non-word characters, or is strewn with digit-letter jumble tokens (`083i`).
export function isGarbageLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false; // blank is structure, not garbage
  if (/(\W)\1{4,}/.test(t)) return true; // ===== ,,,,, etc.
  const nonSpace = t.replace(/\s+/g, '');
  const letters = (nonSpace.match(/[a-zA-ZÀ-ɏͰ-Ͽἀ-῿]/g) ?? []).length;
  if (nonSpace.length >= 4 && letters / nonSpace.length < 0.45) return true;
  const jumbles = t.split(/\s+/).filter((tok) => tok.length >= 3 && /[a-z][0-9]|[0-9][a-z]/i.test(tok)).length;
  return jumbles >= 2;
}

export function garbageRate(lines: string[]): { rate: number; garbage: number; nonBlank: number } {
  let garbage = 0, nonBlank = 0;
  for (const l of lines) {
    if (l.trim().length === 0) continue;
    nonBlank++;
    if (isGarbageLine(l)) garbage++;
  }
  return { rate: nonBlank === 0 ? 1 : garbage / nonBlank, garbage, nonBlank };
}

// ── guardrail 3: page-chrome strip (frequency analysis + isolated guide lines) ──
// Repeated short lines (running heads like "NEW TESTAMENT LEXICON.", page numbers)
// are identified by exact-line frequency; per-page guide words (the current
// headword re-printed atop each column) are unique per page, so frequency misses
// them — they are caught as short isolated lines between blanks that are not
// entry starts.
export function stripPageChrome(
  lines: string[],
  isEntryStart: (l: string) => boolean,
): { kept: string[]; strippedByFrequency: number; strippedGuideLines: number } {
  const freq = new Map<string, number>();
  for (const l of lines) {
    const t = l.trim();
    if (t.length > 0 && t.length <= 42) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const kept: string[] = [];
  let strippedByFrequency = 0, strippedGuideLines = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = (lines[i] ?? '').trim();
    if (t.length === 0) { kept.push(''); continue; }
    if (t.length <= 42 && (freq.get(t) ?? 0) >= 10) { strippedByFrequency++; continue; }
    if (/^\d{1,4}$/.test(t)) { strippedByFrequency++; continue; } // bare page number
    const prevBlank = i === 0 || (lines[i - 1] ?? '').trim().length === 0;
    const nextBlank = i === lines.length - 1 || (lines[i + 1] ?? '').trim().length === 0;
    if (prevBlank && nextBlank && t.length <= 32 && t.split(/\s+/).length <= 3 && !isEntryStart(t)) {
      strippedGuideLines++;
      continue;
    }
    kept.push(lines[i] ?? '');
  }
  return { kept, strippedByFrequency, strippedGuideLines };
}

// ── Thayer entry segmentation ──
// In print every entry opens a paragraph with a bold Greek headword followed by
// inflection/POS apparatus. Through Latin OCR that shape survives as: a line-initial
// pseudo-Greek token (possibly prefixed by junk from breathing marks: * " ' “ &),
// then a comma/bracket, then within ~70 chars an inflection marker — an `-ending,`
// or `indecl` or a gender word mangled to a digit (ὁ→6, ἡ→7/9/4, τό→70/76).
const HEAD_RE = /^[*"'“‘&[(]{0,2}[A-Za-zÀ-ɏ&{£€@|)\]'’.-]{0,27}[A-Za-zÀ-ɏ]\s*[,([]/;
const MARK_RE = /-[a-zà-ÿ@]{0,10}\s*[,;:.]|indecl|\b(?:6|7|9|4|76|70|17)\s*,/;
// Common English words that open prose lines and would otherwise fake an entry.
const ENGLISH_STOP = new Set(('the and of to in a is it for with as by on that this from or are at be was not but his ' +
  'which have has he they we you i so an its these those also see cf who whom all one two their there when where used ' +
  'word words sense meaning thing things others hence acc gen dat absol plur sing pers aor fut impf pass mid act inf ' +
  'ptcp subj impv opp equiv prop name freq prob un in- un-').split(' '));

export function isThayerEntryStart(line: string): boolean {
  if (!HEAD_RE.test(line)) return false;
  if (!MARK_RE.test(line.slice(0, 70))) return false;
  const firstWord = line.split(/[\s,([]/, 1)[0] ?? '';
  const alpha = firstWord.replace(/[^a-zA-Z]/g, '').toLowerCase();
  return !ENGLISH_STOP.has(alpha);
}

export interface LexEntry { key: string; text: string }

export function parseThayerEntries(bodyLines: string[]): LexEntry[] {
  const starts: number[] = [];
  for (let i = 0; i < bodyLines.length; i++) {
    const l = bodyLines[i] ?? '';
    if (l.length > 0 && l[0] !== ' ' && isThayerEntryStart(l)) starts.push(i);
  }
  const entries: LexEntry[] = [];
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s]!;
    const to = s + 1 < starts.length ? starts[s + 1]! : bodyLines.length;
    const raw = bodyLines.slice(from, to).join('\n');
    const text = sanitizeForIngest(raw).replace(/\s+/g, ' ').trim();
    const firstLine = bodyLines[from] ?? '';
    const key = (firstLine.split(/[,([]/, 1)[0] ?? '').replace(/^[*"'“‘&[(]+/, '').trim();
    if (key.length === 0 || text.length < 40) continue;
    entries.push({ key, text });
  }
  return entries;
}

// ── headword recognizability vs the Strong's Greek vocabulary ──
// Both sides collapse into a shared confusion-class alphabet built from observed
// tesseract Latin-script confusions in this scan (γ→y, η→n, ζ→{/¢/C, θ→0/6/8/b,
// π→m/7, ρ→p, σ→o/c, ω→w/@, accented vowels→d, breathings→junk prefixes …).
// Collisions are accepted: this is a similarity skeleton for approximate matching,
// not an inversion.
const CLASS: Record<string, string> = {
  // latin + junk (input is lowercased, NFD-stripped first)
  a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f', g: 'u', h: 'h', i: 'i', j: 'i', k: 'k',
  l: 'i', m: 'm', n: 'n', o: 'o', p: 'p', q: 'b', r: 'r', s: 's', t: 't', u: 'u', v: 'u',
  w: 'w', x: 'x', y: 'u', z: 'c',
  '0': 'b', '4': 'a', '6': 'b', '7': 'm', '8': 'b', '9': 'b', '1': 'i',
  '{': 'c', '}': 'c', '(': 'c', ')': 'c', '¢': 'c', '£': 'x', '€': 'e', '@': 'w', '|': 'i', '!': 'i',
  // greek (lowercased, diacritics stripped)
  'α': 'a', 'β': 'b', 'γ': 'u', 'δ': 'd', 'ε': 'e', 'ζ': 'c', 'η': 'n', 'θ': 'b', 'ι': 'i',
  'κ': 'k', 'λ': 'a', 'μ': 'u', 'ν': 'u', 'ξ': 'x', 'ο': 'o', 'π': 'm', 'ρ': 'p', 'σ': 'o',
  'ς': 's', 'τ': 't', 'υ': 'u', 'φ': 'd', 'χ': 'x', 'ψ': 'u', 'ω': 'w',
};

export function confusionSkeleton(word: string): string {
  const base = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let out = '';
  for (const ch of base) out += CLASS[ch] ?? '';
  return out;
}

// Levenshtein distance, or null when it exceeds `max` (early exit).
function levenshteinWithin(a: string, b: string, max: number): number | null {
  if (Math.abs(a.length - b.length) > max) return null;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] ?? max + 1) + 1, (cur[j - 1] ?? max + 1) + 1, (prev[j - 1] ?? max + 1) + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return null;
    prev = cur;
  }
  const d = prev[b.length] ?? max + 1;
  return d <= max ? d : null;
}

interface StrongsWord { lemma: string; xlit: string }

export async function loadStrongsGreek(cacheDir: string): Promise<StrongsWord[]> {
  const js = await fetchCached(STRONGS_GREEK_URL, path.join(cacheDir, 'strongs-greek-dictionary.js'));
  const start = js.indexOf('{');
  const end = js.lastIndexOf('}');
  // Same sandboxed-literal technique as ingest-strongs.ts (pinned upstream file).
  const dict = Function(`"use strict"; return (${js.slice(start, end + 1)});`)() as Record<string, unknown>;
  const words: StrongsWord[] = [];
  for (const v of Object.values(dict)) {
    if (typeof v !== 'object' || v === null) continue;
    const rec = v as Record<string, unknown>;
    const lemma = typeof rec.lemma === 'string' ? rec.lemma : '';
    const xlit = typeof rec.translit === 'string' ? rec.translit : typeof rec.xlit === 'string' ? rec.xlit : '';
    if (lemma.length > 0) words.push({ lemma, xlit });
  }
  if (words.length < 5000) throw new Error(`Strong's Greek wordlist parsed to only ${words.length} lemmas — refusing to measure against a partial vocabulary`);
  return words;
}

export interface RecognizabilityReport {
  total: number;
  greekScript: number;     // headwords containing actual Greek Unicode (expected 0 for Latin-OCR scans)
  recognizable: number;    // skeleton-matched to a Strong's lemma or transliteration within the edit budget
  exact: number;           // skeleton-matched at distance 0 — the strict lower bound
  rate: number;
  exactRate: number;
  matchedSamples: { key: string; lemma: string; distance: number }[];
  unmatchedSamples: string[];
}

export function measureHeadwords(entries: LexEntry[], vocab: StrongsWord[]): RecognizabilityReport {
  const byLen = new Map<number, { skel: string; lemma: string }[]>();
  for (const w of vocab) {
    for (const cand of [w.lemma, w.xlit]) {
      if (cand.length === 0) continue;
      const skel = confusionSkeleton(cand);
      if (skel.length === 0) continue;
      const bucket = byLen.get(skel.length);
      if (bucket) bucket.push({ skel, lemma: w.lemma });
      else byLen.set(skel.length, [{ skel, lemma: w.lemma }]);
    }
  }
  const budget = (len: number) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);
  let greekScript = 0, recognizable = 0, exact = 0;
  const matchedSamples: { key: string; lemma: string; distance: number }[] = [];
  const unmatchedSamples: string[] = [];
  for (const e of entries) {
    if (/[Ͱ-Ͽἀ-῿]/.test(e.key)) greekScript++;
    const skel = confusionSkeleton(e.key);
    const max = budget(skel.length);
    let best: { lemma: string; distance: number } | null = null;
    if (skel.length >= 3) {
      for (let len = skel.length - max; len <= skel.length + max; len++) {
        for (const c of byLen.get(len) ?? []) {
          const d = levenshteinWithin(skel, c.skel, max);
          if (d !== null && (best === null || d < best.distance)) {
            best = { lemma: c.lemma, distance: d };
            if (d === 0) break;
          }
        }
        if (best?.distance === 0) break;
      }
    }
    if (best !== null) {
      recognizable++;
      if (best.distance === 0) exact++;
      if (matchedSamples.length < 10) matchedSamples.push({ key: e.key, lemma: best.lemma, distance: best.distance });
    } else if (unmatchedSamples.length < 10) {
      unmatchedSamples.push(e.key);
    }
  }
  const total = entries.length;
  return {
    total, greekScript, recognizable, exact,
    rate: total === 0 ? 0 : recognizable / total,
    exactRate: total === 0 ? 0 : exact / total,
    matchedSamples, unmatchedSamples,
  };
}

// ── the thayers-lexicon profile ──
const THAYER = {
  slug: 'thayers-lexicon',
  cacheDir: path.join(CACHE_ROOT, 'thayers'),
  editionMarkers: [/GREEK-ENGLISH LEXICON/i, /NEW TESTAMENT/i, /THAYER/i, /Grimm/i],
  bodyStart: /^NEW TESTAMENT LEXICON/,
  bodyEnd: /^APPENDIX\b/,          // the closing appendix (searched in the final 15%)
  minEntries: 3000,                // Thayer covers ~5,600 NT words; below this the segmentation failed
  minRecognizable: 0.7,            // pre-registered bar: ≥70% of headwords must be recognizable
  maxGarbage: 0.05,                // >5% garbage lines ⇒ unusable OCR
};

export interface ArchiveRunReport {
  identifier: string;
  chars: number;
  garbage: { rate: number; garbage: number; nonBlank: number };
  strippedByFrequency: number;
  strippedGuideLines: number;
  entries: number;
  sampleEntries: LexEntry[];
  headwords: RecognizabilityReport;
}

export async function acquireThayer(identifier: string): Promise<{ report: ArchiveRunReport; entries: LexEntry[] }> {
  const text = await fetchArchiveDjvu(identifier, THAYER.cacheDir);
  editionCheck(text, THAYER.editionMarkers);
  const lines = text.split('\n');

  const startIdx = lines.findIndex((l) => THAYER.bodyStart.test(l.trim()));
  if (startIdx < 0) throw new Error(`FAIL CLOSED: ${identifier} — body-start marker ${String(THAYER.bodyStart)} not found`);
  let endIdx = lines.length;
  for (let i = lines.length - 1; i >= Math.floor(lines.length * 0.85); i--) {
    if (THAYER.bodyEnd.test((lines[i] ?? '').trim())) { endIdx = i; break; }
  }
  const body = lines.slice(startIdx + 1, endIdx);

  const garbage = garbageRate(body);
  const { kept, strippedByFrequency, strippedGuideLines } = stripPageChrome(body, isThayerEntryStart);
  const entries = parseThayerEntries(kept);

  console.log('  measuring headword recognizability against Strong\'s Greek vocabulary ...');
  const vocab = await loadStrongsGreek(THAYER.cacheDir);
  const headwords = measureHeadwords(entries, vocab);

  const report: ArchiveRunReport = {
    identifier, chars: text.length, garbage, strippedByFrequency, strippedGuideLines,
    entries: entries.length, sampleEntries: entries.slice(0, 3), headwords,
  };
  printReport(report);

  // fail closed AFTER printing, so the run output carries the evidence
  if (garbage.rate > THAYER.maxGarbage) {
    throw new Error(`QUARANTINE ${THAYER.slug}: OCR garbage rate ${(garbage.rate * 100).toFixed(1)}% (> ${THAYER.maxGarbage * 100}% bar) on ${identifier}`);
  }
  if (entries.length < THAYER.minEntries) {
    throw new Error(`QUARANTINE ${THAYER.slug}: only ${entries.length} entries segmented (< ${THAYER.minEntries} floor) on ${identifier} — structure not recognized`);
  }
  if (headwords.rate < THAYER.minRecognizable) {
    throw new Error(`QUARANTINE ${THAYER.slug}: headword recognizability ${(headwords.rate * 100).toFixed(1)}% (< ${THAYER.minRecognizable * 100}% bar) on ${identifier} — ` +
      `Greek OCR is Latin-script junk (${headwords.greekScript}/${headwords.total} headwords contain Greek script); unusable as lexicon keys`);
  }
  return { report, entries };
}

function printReport(r: ArchiveRunReport): void {
  console.log(`\n=== archive adapter report: ${r.identifier} ===`);
  console.log(`  djvu text: ${r.chars} chars`);
  console.log(`  garbage lines: ${r.garbage.garbage}/${r.garbage.nonBlank} = ${(r.garbage.rate * 100).toFixed(2)}% (bar: 5%)`);
  console.log(`  page chrome stripped: ${r.strippedByFrequency} by frequency, ${r.strippedGuideLines} guide lines`);
  console.log(`  entries segmented: ${r.entries}`);
  console.log(`  headwords in Greek script: ${r.headwords.greekScript}/${r.headwords.total} (${((100 * r.headwords.greekScript) / Math.max(1, r.headwords.total)).toFixed(1)}%)`);
  console.log(`  headwords recognizable (confusion-skeleton vs Strong's): ${r.headwords.recognizable}/${r.headwords.total} = ${(r.headwords.rate * 100).toFixed(1)}% (bar: 70%)`);
  console.log(`  headwords exact-skeleton match (strict lower bound): ${r.headwords.exact}/${r.headwords.total} = ${(r.headwords.exactRate * 100).toFixed(1)}%`);
  console.log('  matched samples (OCR headword -> best Strong\'s lemma @ distance):');
  for (const m of r.headwords.matchedSamples) console.log(`    ${m.key}  ->  ${m.lemma} @${m.distance}`);
  console.log('  unmatched samples:');
  for (const u of r.headwords.unmatchedSamples) console.log(`    ${u}`);
  console.log('  entry samples:');
  for (const e of r.sampleEntries) console.log(`    [${e.key}] ${e.text.slice(0, 120)}`);
}

// ── CLI ──
interface ManifestEntry { slug?: string; provenance?: { acquire?: { adapter?: string; identifier?: string } } }

async function main() {
  const slug = arg('--slug');
  if (slug !== 'thayers-lexicon') {
    throw new Error("usage: adapter-archive.ts --slug=thayers-lexicon [--identifier=<archive.org id>] (only the thayers profile exists)");
  }
  let identifier = arg('--identifier');
  if (!identifier) {
    const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as ManifestEntry[];
    const entry = manifest.find((e) => e.slug === slug);
    const acq = entry?.provenance?.acquire;
    if (acq?.adapter !== 'archive' || !acq.identifier) throw new Error(`manifest entry ${slug} has no archive acquire.identifier`);
    identifier = acq.identifier;
  }
  const { entries } = await acquireThayer(identifier);
  const out = path.join(THAYER.cacheDir, `${slug}-entries.jsonl`);
  writeFileSync(out, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  console.log(`\nALL BARS PASSED → ${entries.length} entries → ${out}`);
}

if (process.argv[1] && /adapter-archive/.test(process.argv[1])) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
