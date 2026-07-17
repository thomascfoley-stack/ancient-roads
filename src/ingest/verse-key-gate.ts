// The verse-key distributional rule (§3, 2026-07-13) as a callable module, so the
// ingest gate and the harness CALL one rule instead of re-inlining it.
//
// `verse_start = verse_end = chapter` is a PLAUSIBLE value: in range, satisfies
// every per-row constraint, renders fine — only a DISTRIBUTIONAL assertion catches
// it. The threshold is measured, not guessed: every clean author sits at 0.9–6.9%
// collapsed (the genuine rate of "a comment on verse N of chapter N"); every
// biblehub-sourced author sits at 99.9–100%. 0.20 separates the populations with
// an order-of-magnitude margin. Do NOT raise it to make a corpus pass — repair the
// corpus (docs/CORPUS_VERSE_KEY_REPAIR.md).

export const COLLAPSE_MAX = 0.2;
export const MIN_ENTRIES = 200;

export interface KeyedEntry {
  author: string;
  verseStart: number;
  verseEnd: number;
  chapter: number;
}

export function isCollapsedKey(e: Pick<KeyedEntry, 'verseStart' | 'verseEnd' | 'chapter'>): boolean {
  return e.verseStart === e.verseEnd && e.verseStart === e.chapter;
}

export interface AuthorCollapse {
  author: string;
  n: number;
  collapsed: number;
  rate: number;
}

export function collapseByAuthor(entries: Iterable<KeyedEntry>): AuthorCollapse[] {
  const byAuthor = new Map<string, { n: number; collapsed: number }>();
  for (const e of entries) {
    const rec = byAuthor.get(e.author) ?? { n: 0, collapsed: 0 };
    rec.n++;
    if (isCollapsedKey(e)) rec.collapsed++;
    byAuthor.set(e.author, rec);
  }
  return [...byAuthor.entries()]
    .map(([author, v]) => ({ author, n: v.n, collapsed: v.collapsed, rate: v.n ? v.collapsed / v.n : 0 }))
    .sort((a, b) => b.rate - a.rate || b.n - a.n);
}

/** Authors (≥ minEntries) whose collapse rate breaches the threshold. Empty = pass. */
export function collapseOffenders(
  stats: AuthorCollapse[],
  minEntries = MIN_ENTRIES,
  max = COLLAPSE_MAX,
): AuthorCollapse[] {
  return stats.filter((s) => s.n >= minEntries && s.rate >= max);
}
