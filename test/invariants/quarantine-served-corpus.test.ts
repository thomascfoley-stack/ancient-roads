// THE QUARANTINE MOVES BYTES; IT MUST NOT LOSE THEM.
//
// `quarantine-served-corpus.ts` rewrites 1,212 files of a 407 MB tree that is gitignored,
// untracked, and for the scraped sources the only copy on the machine. There is no `git checkout`
// to undo it. So the round-trip is pinned here, driven against fixtures, before it is ever pointed
// at the real corpus:
//
//   filter → every dropped entry is in the quarantine tree, byte-for-byte
//   restore → the served file is identical to what it was before the filter
//
// and the two properties that make a re-run safe: filtering twice removes nothing the second time,
// and a second filter MERGES into an existing quarantine file rather than clobbering it (the case
// that silently eats the first run's entries).
//
// The predicate is not re-implemented here. The script imports `isPublishedCommentaryEntry` from
// the shipped module, so these cases assert against the real serving boundary.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'src/ingest/quarantine-served-corpus.ts';

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Entry {
  verseStart: number;
  verseEnd: number;
  author: string;
  sourceUrl: string;
  text: string;
  work?: string;
}

/**
 * A throwaway repo-shaped sandbox: the script resolves `web/public/commentaries` and
 * `corpus-quarantine` relative to cwd, so it is run with cwd set here. It still imports the real
 * predicate out of the real repo, which is the point.
 */
function sandbox(entries: Entry[]): { dir: string; served: string; quarantined: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'quarantine-'));
  tmps.push(dir);
  const served = path.join(dir, 'web/public/commentaries/gen/1.json');
  mkdirSync(path.dirname(served), { recursive: true });
  writeFileSync(served, JSON.stringify({ book: 1, chapter: 1, entries }));
  return { dir, served, quarantined: path.join(dir, 'corpus-quarantine/commentaries/gen/1.json') };
}

const run = (dir: string, ...args: string[]): string =>
  execFileSync('node', ['--import', path.join(REPO, 'node_modules/tsx/dist/loader.mjs'), path.join(REPO, SCRIPT), ...args], {
    cwd: dir,
    encoding: 'utf8',
  });

const entry = (author: string, verseStart: number, extra: Partial<Entry> = {}): Entry => ({
  verseStart,
  verseEnd: verseStart,
  author,
  sourceUrl: '',
  text: `${author} on verse ${verseStart}. `.repeat(4),
  ...extra,
});

const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as { entries: Entry[] };

describe('filter', () => {
  it('removes exactly what the shipped reader filter removes, and keeps the rest', () => {
    // 'Tyndale Study Notes' is MUST_NOT_SERVE; 'Pelagius' is simply not on the published
    // allowlist; 'John Gill' is published. All three are decided by the real predicate.
    // SEED: invert the keep/drop partition -> RED.
    const { dir, served } = sandbox([entry('John Gill', 1), entry('Tyndale Study Notes', 2), entry('Pelagius', 3)]);
    run(dir, '--apply');
    expect(read(served).entries.map((e) => e.author)).toEqual(['John Gill']);
  });

  it('writes every dropped entry to the quarantine tree, byte-for-byte', () => {
    // The whole safety argument is that nothing is deleted. If the quarantine copy is lossy or
    // absent, the script is a deleter with a reassuring name.
    // SEED: skip the quarantine write -> RED.
    const dropped = entry('Tyndale Study Notes', 2);
    const { dir, quarantined } = sandbox([entry('John Gill', 1), dropped]);
    run(dir, '--apply');
    expect(read(quarantined).entries).toEqual([dropped]);
  });

  it('leaves the corpus untouched without --apply', () => {
    const before = [entry('John Gill', 1), entry('Tyndale Study Notes', 2)];
    const { dir, served, quarantined } = sandbox(before);
    const out = run(dir);
    expect(out).toMatch(/DRY RUN/);
    expect(read(served).entries).toEqual(before);
    expect(existsSync(quarantined)).toBe(false);
  });

  it('is idempotent — a second run removes nothing', () => {
    const { dir } = sandbox([entry('John Gill', 1), entry('Tyndale Study Notes', 2)]);
    run(dir, '--apply');
    expect(run(dir, '--apply')).toMatch(/quarantined 0 entries/);
  });

  it('MERGES into an existing quarantine file instead of clobbering it', () => {
    // The eating-your-own-tail case: run once, more offending content lands in the served file,
    // run again — the second quarantine write must not replace the first run's entries.
    // SEED: writeAtomic(qFile, {entries: drop}) with no merge -> RED, Origen disappears.
    const { dir, served, quarantined } = sandbox([entry('John Gill', 1), entry('Origen of Alexandria', 2)]);
    run(dir, '--apply');
    const doc = read(served);
    writeFileSync(served, JSON.stringify({ book: 1, chapter: 1, entries: [...doc.entries, entry('CS Lewis', 3)] }));
    run(dir, '--apply');
    expect(read(quarantined).entries.map((e) => e.author).sort()).toEqual(['CS Lewis', 'Origen of Alexandria']);
  });

  it('archives two entries that differ only past the first 64 characters', () => {
    // THIS ONE COST TWO ENTRIES BEFORE IT EXISTED. The first key was
    // `verseStart:verseEnd:author:textLength:text.slice(0,64)`; on the real corpus two
    // `Basil of Caesarea` records matched on all five and the merge Map kept one, so the run
    // archived 77,398 of 77,400. The served tree was already rewritten, and it is the only copy
    // on the machine — unrecoverable. Basil has 100 same-verse pairs and repeats text lengths, so
    // the shape is not exotic.
    // SEED: restore the slice(0,64) key -> RED, one entry archived instead of two.
    const shared = 'Basil of Caesarea, homily on the six days of creation, opening line. ';
    const a = entry('Basil of Caesarea', 5, { text: `${shared}FIRST variant tail...` });
    const b = entry('Basil of Caesarea', 5, { text: `${shared}SECOND variant tail..` });
    expect(a.text).toHaveLength(b.text.length); // the collision precondition, asserted not assumed
    expect(a.text.slice(0, 64)).toBe(b.text.slice(0, 64));
    const { dir, quarantined } = sandbox([entry('John Gill', 1), a, b]);
    run(dir, '--apply');
    expect(read(quarantined).entries).toHaveLength(2);
  });

  it('refuses an empty tree rather than reporting it clean', () => {
    // A scan that walked the wrong directory reports zero offenders, which is indistinguishable
    // from success. The corpus is 1,212 files; zero is a bug, not a pass.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'quarantine-'));
    tmps.push(dir);
    expect(() => run(dir, '--apply')).toThrow(/an empty scan is not a pass/);
  });
});

describe('restore', () => {
  it('round-trips: filter then restore reproduces the original entries', () => {
    // This is the property the whole "nothing is deleted" claim rests on.
    // SEED: drop `text` from the quarantine record -> RED.
    const before = [entry('John Gill', 1), entry('Tyndale Study Notes', 2), entry('CS Lewis', 3)];
    const { dir, served } = sandbox(before);
    run(dir, '--apply');
    expect(read(served).entries).toHaveLength(1);
    run(dir, '--restore', '--apply');
    const after = read(served).entries;
    expect([...after].sort((a, b) => a.verseStart - b.verseStart)).toEqual(before);
  });

  it('does not duplicate entries when restored twice', () => {
    const { dir, served } = sandbox([entry('John Gill', 1), entry('Origen of Alexandria', 2)]);
    run(dir, '--apply');
    run(dir, '--restore', '--apply');
    run(dir, '--restore', '--apply');
    expect(read(served).entries).toHaveLength(2);
  });
});
