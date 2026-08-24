// D23 (DEEP_SWEEP) — `pnpm ingest:merge-commentaries` rewrote each shared chapter file with ONLY
// its own two input dirs, deleting every entry the other two writers of that same path had put
// there. Measured on the live 848 MB tree: 1,189 files contain non-HelloAO entries that a re-run
// would have deleted, and 62,961 entries carry a register `work` slug.
//
// REACHABLE TODAY, which the finding's "input dirs are absent in a fresh checkout" caveat
// undersells: ADR-120 deleted the patristic producer, but ingest-commentary-api still fills
// data/commentaries-api over the NETWORK with no local prerequisite — that feed alone makes the
// entry list non-empty and triggers the destructive write. And predeploy-gate.ts:180 instructs an
// operator to run this script at exactly the moment the corpus needs rebuilding.
import { describe, expect, it } from 'vitest';
import { mergeChapterEntries } from '../src/ingest/merge-chapter-entries';

const e = (author: string, work?: string) => ({ author, work, tag: `${author}/${work ?? '-'}` });

describe('D23 — rewriting a shared chapter file preserves foreign entries', () => {
  it('keeps entries this run does not own', () => {
    const out = mergeChapterEntries([e('John Calvin'), e('Matthew Poole')], [e('John Gill')]);
    expect(out.map((x) => x.author).sort()).toEqual(['John Calvin', 'John Gill', 'Matthew Poole']);
  });

  it('REPLACES its own stale entries rather than duplicating them', () => {
    const out = mergeChapterEntries([e('John Gill'), e('John Calvin')], [e('John Gill')]);
    expect(out.filter((x) => x.author === 'John Gill')).toHaveLength(1);
    expect(out.map((x) => x.author).sort()).toEqual(['John Calvin', 'John Gill']);
  });

  it('preserves a register-owned entry even when the author name collides', () => {
    // The normalisation hazard: if register ever wrote 'John Gill' instead of 'Gill, John',
    // author-keying alone would delete a register work. `work` makes that impossible.
    const out = mergeChapterEntries([e('John Gill', 'gill-song')], [e('John Gill')]);
    expect(out).toHaveLength(2);
    expect(out.some((x) => x.work === 'gill-song'), 'a register work must survive').toBe(true);
  });

  it('is idempotent — running twice is the same as running once', () => {
    const existing = [e('John Calvin', 'calvin-crosswire'), e('Matthew Poole')];
    const incoming = [e('John Gill'), e('Adam Clarke')];
    const once = mergeChapterEntries(existing, incoming);
    const twice = mergeChapterEntries(once, incoming);
    expect(twice.map((x) => x.tag).sort()).toEqual(once.map((x) => x.tag).sort());
  });

  it('an empty existing file is just this run’s entries', () => {
    expect(mergeChapterEntries([], [e('John Gill')]).map((x) => x.author)).toEqual(['John Gill']);
  });
});
