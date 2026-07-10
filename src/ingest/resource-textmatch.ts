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

// Fraction of `part`'s tokens present in `whole`.
export function containment(part: Set<string>, whole: Set<string>): number {
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
export function tallyContainment(snippets: Set<string>[], sourceText: Set<string>, t = 0.8): ContainStats {
  const s: ContainStats = { total: 0, repair: 0, drop: 0 };
  for (const snip of snippets) {
    if (snip.size < 8) continue;
    s.total++;
    if (containment(snip, sourceText) >= t) s.repair++; else s.drop++;
  }
  return s;
}
