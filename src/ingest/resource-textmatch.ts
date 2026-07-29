// Reusable re-source core: the text-match that decides provenance-repair ($0) vs
// re-embed, and the SourceAdapter contract. Source-agnostic — the SAME matcher +
// driver serve helloao (commentaries) and, next, Schaff/NewAdvent (patristic).
// Only the adapter (how to fetch a work's per-verse text) changes per source.

// verseId = book*1_000_000 + chapter*1_000 + verse  (the corpus-wide scheme).
export interface VerseText { verseId: number; text: string }

// A permitted PD source we can re-fetch a work's text from, per verse. Each source
// (helloao, CrossWire, NewAdvent, archive.org, Wikisource) implements this once.
export interface SourceAdapter {
  readonly name: string;
  // Every (verseId, text) this source has for the work. `sourceKey` is the source's
  // own id for the work (helloao commentary id, CrossWire module name, …).
  fetchWork(sourceKey: string): Promise<VerseText[]>;
  // Provenance the repair records: the canonical URL, a human edition label, and a
  // forward-compatible rebuild recipe so a future full-text rebuild is a clean
  // re-fetch (not a re-investigation).
  provenanceUrl(sourceKey: string): string;
  editionLabel(sourceKey: string, title: string): string;
  rebuildRecipe(sourceKey: string): Record<string, unknown>;
}

export function tokenList(s: string): string[] {
  const n = s.toLowerCase()
    .replace(/&#x?[0-9a-f]+;/gi, ' ')  // strip numeric HTML entities
    .replace(/<[^>]+>/g, ' ')          // strip tags
    .replace(/[^a-z0-9]+/g, ' ')       // fold punctuation
    .trim();
  return n ? n.split(/\s+/) : [];
}

export function tokens(s: string): Set<string> {
  return new Set(tokenList(s));
}

// OCR-tolerant tokenizer for cross-copy matching of two INDEPENDENT scans of the same
// printed work. tokenList() is byte-identical-synced and must not change; this is the
// scan-normalizing variant. Two OCR engines of the same page produce the SAME words but
// DIFFERENT layout artifacts — line-break hyphenation, all-caps running headers, page/
// verse numbers — which fragment exact shingles and sink containment. We strip those
// (NOT the OCR character errors, which are real signal that the words differ) so the
// surviving shingles reflect wording, not typography. Measured: layout-only damage
// recovers from ~85% (tokenList) to ~99% (this) containment on genuinely identical text.
export function tokenListOcr(s: string): string[] {
  const dehyphenated = s.replace(/([A-Za-z])-[ \t]*\r?\n[ \t]*([A-Za-z])/g, '$1$2');
  const bodyOnly = dehyphenated
    .split(/\r?\n/)
    .filter((line) => {
      const letters = line.replace(/[^A-Za-z]/g, '');
      // Drop all-caps running-header/title lines (e.g. "EXPOSITORY THOUGHTS", "ST. JOHN").
      return !(letters.length >= 4 && letters === letters.toUpperCase());
    })
    .join(' ');
  const folded = bodyOnly
    .toLowerCase()
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!folded) return [];
  // Drop pure-digit tokens (page numbers, verse markers, scripture-ref numerals).
  return folded.split(/\s+/).filter((tok) => !/^\d+$/.test(tok));
}

export function shingleHashSetOcr(s: string, n = 3): Set<number> {
  const t = tokenListOcr(s);
  const out = new Set<number>();
  for (let i = 0; i + n <= t.length; i++) out.add(fnv1a(t.slice(i, i + n).join(' ')));
  return out;
}

// ── Title-page guard ────────────────────────────────────────────────────────
// Before matching two scans as the SAME work, assert their title pages agree. Two
// nights of content were lost when a scan of Ryle-on-JOHN was matched against
// Ryle-on-LUKE (both title pages say which Gospel in the first ~800 chars). A number
// is not evidence until the guard confirms the inputs are even the same work.

export type Gospel = 'MATTHEW' | 'MARK' | 'LUKE' | 'JOHN';

function classifyGospelWord(w: string): Gospel | null {
  const u = w.toUpperCase();
  if (u.startsWith('MAT')) return 'MATTHEW';
  if (u.startsWith('MAR') || u === 'MK') return 'MARK';
  if (u.startsWith('LU')) return 'LUKE';
  if (u.startsWith('JOH') || u.startsWith('JON')) return 'JOHN'; // JOHlSr, JOH2Sr, …
  return null;
}

function romanToInt(r: string): number | null {
  // OCR renders volume numerals as I / II / Ill / VOXi etc. Tolerate l→I and lowercase.
  const s = r.toUpperCase().replace(/L(?=L|$)/g, 'I'); // "Ill" → "III" heuristic
  const map: Record<string, number> = { I: 1, V: 5, X: 10 };
  let total = 0;
  let prev = 0;
  for (const ch of s.split('').reverse()) {
    const v = map[ch];
    if (v === undefined) return null;
    if (v < prev) total -= v;
    else { total += v; prev = v; }
  }
  return total > 0 && total <= 4 ? total : null;
}

/** Extract {gospel, volume} from a scan's title region by voting over "ST. <gospel> …
 *  VOL. <roman>" occurrences (title + running headers repeat the work's own gospel;
 *  cross-references to other Gospels are a minority). Returns null if undecidable. */
export function extractGospelVolume(text: string): { gospel: Gospel; volume: number | null } | null {
  const head = text.slice(0, 20000);
  const votes: Record<string, number> = {};
  let volume: number | null = null;
  const re = /ST[.\s]+([A-Za-z0-9]{2,10})[.\s]+VO[LX][.\sI]*?([IVXLl]{1,4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const g = classifyGospelWord(m[1]!);
    if (!g) continue;
    votes[g] = (votes[g] ?? 0) + 1;
    if (volume === null) volume = romanToInt(m[2]!);
  }
  // Fallback: no "VOL." matched — vote on bare "ST. <gospel>" title/header lines.
  if (Object.keys(votes).length === 0) {
    const re2 = /ST[.\s]+([A-Za-z0-9]{2,10})\b/g;
    while ((m = re2.exec(head)) !== null) {
      const g = classifyGospelWord(m[1]!);
      if (g) votes[g] = (votes[g] ?? 0) + 1;
    }
  }
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  return { gospel: ranked[0]![0] as Gospel, volume };
}

/** True only if both scans are the same Gospel AND (when both state a volume) the same
 *  volume. Unknown volume on one side is permitted (some scans omit it); a Gospel
 *  mismatch, or a stated-volume mismatch, fails closed. */
export function titleGuardAgrees(a: string, b: string): { ok: boolean; a: ReturnType<typeof extractGospelVolume>; b: ReturnType<typeof extractGospelVolume> } {
  const ga = extractGospelVolume(a);
  const gb = extractGospelVolume(b);
  const ok = !!ga && !!gb && ga.gospel === gb.gospel
    && (ga.volume === null || gb.volume === null || ga.volume === gb.volume);
  return { ok, a: ga, b: gb };
}

// Overlapping n-gram (shingle) set — the ordered-phrase fingerprint. Word-SET
// containment can't tell two translations apart (they share vocabulary); shingle
// containment can (only the SAME translation shares long exact phrases). Used for
// patristic where the question is "same PD translation?" not "same words?".
export function shingleSet(s: string, n = 4): Set<string> {
  const t = tokenList(s);
  const out = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n).join(' '));
  return out;
}

// 32-bit FNV-1a. For a corpus-scale shingle index, store hashes (numbers) not
// strings — a whole-corpus Set<string> of n-grams is memory-prohibitive.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function shingleHashSet(s: string, n = 4): Set<number> {
  const t = tokenList(s);
  const out = new Set<number>();
  for (let i = 0; i + n <= t.length; i++) out.add(fnv1a(t.slice(i, i + n).join(' ')));
  return out;
}

// Add a text's shingle-hashes into a growing corpus set (for building the corpus).
export function addShingleHashes(corpus: Set<number>, s: string, n = 4): void {
  const t = tokenList(s);
  for (let i = 0; i + n <= t.length; i++) corpus.add(fnv1a(t.slice(i, i + n).join(' ')));
}

export type MatchClass = 'match' | 'truncated' | 'differ';

// match  = same text (Jaccard ≥ t).
// truncated = same text, one side cut short (containment ≥ t) — still a $0 repair.
// differ = genuinely different edition → re-embed (or drop, if no PD source).
export function classify(our: Set<string>, their: Set<string>, t = 0.9): MatchClass {
  let inter = 0;
  for (const x of our) if (their.has(x)) inter++;
  const jac = inter / (our.size + their.size - inter || 1);
  if (jac >= t) return 'match';
  const contain = inter / Math.max(1, Math.min(our.size, their.size));
  return contain >= t ? 'truncated' : 'differ';
}

export interface MatchStats { compared: number; match: number; truncated: number; differ: number; sourceOnly: number }

// Compare a source's per-verse text to our stored text and tally the split.
export function tallyMatch(stored: Map<number, Set<string>>, source: VerseText[]): MatchStats {
  const s: MatchStats = { compared: 0, match: 0, truncated: 0, differ: 0, sourceOnly: 0 };
  for (const { verseId, text } of source) {
    const our = stored.get(verseId);
    if (!our) { s.sourceOnly++; continue; }
    s.compared++;
    s[classify(our, tokens(text))]++;
  }
  return s;
}

export const repairOf = (s: MatchStats): number => s.match + s.truncated;
export const repairPct = (s: MatchStats): number => (s.compared ? (100 * repairOf(s)) / s.compared : 0);

// Fraction of `part`'s members present in `whole` (works on token-sets, shingle
// strings, or shingle-hash sets).
export function containment<T>(part: Set<T>, whole: Set<T>): number {
  if (part.size === 0) return 0;
  let inter = 0;
  for (const x of part) if (whole.has(x)) inter++;
  return inter / part.size;
}

export interface ContainStats { total: number; repair: number; drop: number }

// Patristic sources (NewAdvent/Schaff) are organized by WORK, not verse. So the
// question per stored snippet is: is its text present in the PD work's full text?
// contained ⇒ same PD translation (repair); not ⇒ a different/modern translation
// (drop). Trivially short snippets are skipped.
export function tallyContainment<T>(snippets: Set<T>[], sourceText: Set<T>, t = 0.8): ContainStats {
  const s: ContainStats = { total: 0, repair: 0, drop: 0 };
  for (const snip of snippets) {
    if (snip.size < 8) continue;
    s.total++;
    if (containment(snip, sourceText) >= t) s.repair++; else s.drop++;
  }
  return s;
}
