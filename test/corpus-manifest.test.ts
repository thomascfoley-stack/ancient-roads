// PROPERTY (Work Order v2 Stage 3.1): the corpus ratchet REFUSES a deploy that would carry
// less content than the last one, and refuses equally when it cannot tell.
//
// This is exercised against fixtures rather than the real ~380MB corpus because a ratchet
// that has only ever been watched on a tree that happened not to trip it is a ratchet nobody
// has seen work. The failures it exists for — a half-finished regeneration, an interrupted
// merge, a quarantine that took more than intended — cannot be produced on demand in the real
// corpus, and are invisible in the reader afterwards: it renders whatever it finds, so a
// library that lost a voice looks exactly like a library that never had one.
//
// THE CASE THAT DRIVES THE DESIGN is the author-level one. Every chapter file holds entries
// from many authors, so Calvin can vanish from the entire corpus without changing a single
// file count, a single directory, or a single byte of the on-disk layout the reader walks.
// A ratchet that watched only files would wave that through.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { codeOnly } from '../scripts/lib/source-scan.mjs';
import {
  MANIFEST_VERSION,
  buildCorpusInventory,
  buildCorpusManifest,
  evaluateCorpusRatchet,
  loadLatestManifest,
} from '../scripts/lib/corpus-manifest.mjs';

const scratch: string[] = [];
afterAll(() => {
  for (const d of scratch) rmSync(d, { recursive: true, force: true });
});

/** A corpus on disk: `<book>/<chapter>.json`, each holding one entry per named author. */
type Corpus = Record<string, string[][]>;

function makeCorpus(books: Corpus): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'corpus-manifest-'));
  scratch.push(dir);
  for (const [book, chapters] of Object.entries(books)) {
    mkdirSync(path.join(dir, book), { recursive: true });
    chapters.forEach((authors, i) => {
      const entries = authors.map((author) => ({ author, verseStart: 1, verseEnd: 1, text: 'x' }));
      writeFileSync(path.join(dir, book, `${i + 1}.json`), JSON.stringify({ chapter: i + 1, entries }));
    });
  }
  return dir;
}

const inv = (books: Corpus) => buildCorpusInventory(makeCorpus(books));
const manifestOf = (books: Corpus) => buildCorpusManifest(makeCorpus(books), { sha: 'deadbee' });

/** Three books, three authors present in every chapter. */
const FULL: Corpus = {
  jhn: [['Calvin', 'Henry'], ['Calvin', 'Henry', 'Gill']],
  rom: [['Calvin', 'Henry', 'Gill']],
};

describe('the inventory names what is on disk, at BOTH granularities', () => {
  it('counts chapter files per book and entries per author', () => {
    const i = inv(FULL);
    expect(i.present).toBe(true);
    expect(i.books).toEqual({ jhn: 2, rom: 1 });
    expect(i.works).toEqual({ Calvin: 3, Henry: 3, Gill: 2 });
    expect(i.fileCount).toBe(3);
    expect(i.entryCount).toBe(8);
  });

  it('reports an ABSENT corpus as absent rather than as an empty one', () => {
    // The distinction is the whole ratchet: "zero files" and "no directory" must not collapse
    // into one reading, because only one of them can be silently produced by a bad rm.
    const i = buildCorpusInventory(path.join(tmpdir(), 'corpus-manifest-does-not-exist'));
    expect(i.present).toBe(false);
    expect(i.fileCount).toBe(0);
    expect(i.corpusHash).toBeNull();
  });

  it('an unparseable file still counts as a file and contributes no entries', () => {
    // It must surface as authors LOSING entries — the refusal we want — and never as a
    // silent zero that reads like a clean, smaller corpus.
    const dir = makeCorpus({ jhn: [['Calvin']] });
    writeFileSync(path.join(dir, 'jhn', '2.json'), '{ truncated mid-write');
    const i = buildCorpusInventory(dir);
    expect(i.fileCount).toBe(2);
    expect(i.entryCount).toBe(1);
  });

  it('the hash distinguishes corpora with identical TOTALS but different composition', () => {
    const a = inv({ jhn: [['Calvin']], rom: [['Henry']] });
    const same = inv({ jhn: [['Calvin']], rom: [['Henry']] });
    const swappedAuthor = inv({ jhn: [['Calvin']], rom: [['Gill']] });
    const swappedBook = inv({ jhn: [['Calvin']], gal: [['Henry']] });
    expect(a.corpusHash).toBe(same.corpusHash);
    expect(a.corpusHash).not.toBe(swappedAuthor.corpusHash);
    expect(a.corpusHash).not.toBe(swappedBook.corpusHash);
  });

  it('the manifest carries the version, the sha, the counts and both tables', () => {
    const m = manifestOf(FULL);
    expect(m.version).toBe(MANIFEST_VERSION);
    expect(m.sha).toBe('deadbee');
    expect(m.bookCount).toBe(2);
    expect(m.workCount).toBe(3);
    expect(m.fileCount).toBe(3);
    expect(m.entryCount).toBe(8);
    expect(m.books).toEqual({ jhn: 2, rom: 1 });
    expect(m.works).toEqual({ Calvin: 3, Henry: 3, Gill: 2 });
    expect(Date.parse(m.ts)).not.toBeNaN();
  });
});

describe('the ratchet refuses LOSS the directory tree cannot show', () => {
  const previous = manifestOf(FULL);

  it('an AUTHOR removed from every chapter file — no file count changes at all', () => {
    // The defect a file-count ratchet is blind to, and the realistic one: a re-merge drops a
    // commentator from the entries while every book, chapter and file stays exactly as it was.
    const current = inv({
      jhn: [['Calvin', 'Henry'], ['Calvin', 'Henry']],
      rom: [['Calvin', 'Henry']],
    });
    expect(current.fileCount).toBe(previous.fileCount);
    expect(current.books).toEqual(previous.books);

    const r = evaluateCorpusRatchet(current, previous, { deploying: true });
    expect(r.ok).toBe(false);
    expect(r.missingWorks).toEqual(['Gill']);
    expect(r.failures.join('\n')).toMatch(/work\(s\) present in the last manifest and MISSING now: Gill/);
  });

  it('an author who merely SHRANK is a refusal too, with both counts', () => {
    const current = inv({ jhn: [['Calvin', 'Henry'], ['Calvin', 'Henry', 'Gill']], rom: [['Calvin', 'Henry']] });
    const r = evaluateCorpusRatchet(current, previous, { deploying: true });
    expect(r.ok).toBe(false);
    expect(r.shrunkWorks).toEqual([{ work: 'Gill', was: 2, now: 1 }]);
    expect(r.failures.join('\n')).toMatch(/work 'Gill' shrank: 2 → 1/);
  });

  it('a BOOK gone is named as a book, not only as a file-count drop', () => {
    const r = evaluateCorpusRatchet(inv({ jhn: [['Calvin', 'Henry'], ['Calvin', 'Henry', 'Gill']] }), previous, { deploying: true });
    expect(r.ok).toBe(false);
    expect(r.missingBooks).toEqual(['rom']);
    expect(r.failures.join('\n')).toMatch(/book\(s\) present in the last manifest and MISSING now: rom/);
  });

  it('GROWTH masking a LOSS still refuses — no total is the invariant', () => {
    // A regeneration adds a new book while dropping an author, so every headline number goes
    // UP. A ratchet watching totals would pass it, and the reader would show a bigger library
    // that has quietly lost a voice.
    const current = inv({
      jhn: [['Calvin', 'Henry'], ['Calvin', 'Henry']],
      rom: [['Calvin', 'Henry']],
      gal: [['Calvin', 'Henry'], ['Calvin', 'Henry'], ['Calvin', 'Henry']],
    });
    expect(current.fileCount).toBeGreaterThan(previous.fileCount);
    expect(current.entryCount).toBeGreaterThan(previous.entryCount);

    const r = evaluateCorpusRatchet(current, previous, { deploying: true });
    expect(r.ok).toBe(false);
    expect(r.missingWorks).toEqual(['Gill']);
  });

  it('honest growth passes — this is a ratchet against loss, not a freeze', () => {
    const r = evaluateCorpusRatchet(
      inv({
        jhn: [['Calvin', 'Henry'], ['Calvin', 'Henry', 'Gill']],
        rom: [['Calvin', 'Henry', 'Gill']],
        gal: [['Calvin', 'Henry', 'Gill', 'Spurgeon']],
      }),
      previous,
      { deploying: true },
    );
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('an unchanged corpus passes', () => {
    expect(evaluateCorpusRatchet(inv(FULL), previous, { deploying: true }).ok).toBe(true);
  });
});

describe('the ratchet refuses IGNORANCE — not knowing is not the same as nothing wrong', () => {
  it('an absent corpus is a refusal even when not deploying', () => {
    const r = evaluateCorpusRatchet({ present: false, fileCount: 0, entryCount: 0, books: {}, works: {}, corpusHash: null }, manifestOf(FULL));
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/ABSENT/);
  });

  it('no previous manifest is a REFUSAL at deploy (ADR-036: an absent baseline is not a clean one)', () => {
    const r = evaluateCorpusRatchet(inv(FULL), null, { deploying: true });
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/no committed corpus manifest/);
  });

  it('no previous manifest is a survey, not a failure, on a pre-commit run', () => {
    // The same gate runs on every commit, where the corpus may legitimately be mid-rebuild.
    // Refusing there gets the hook turned off, which costs more than it buys.
    const r = evaluateCorpusRatchet(inv(FULL), null, { deploying: false });
    expect(r.ok).toBe(true);
    expect(r.baselining).toBe(true);
  });

  it('a manifest from an OLDER shape is refused rather than compared', () => {
    // v1 `works` were per-directory FILE counts; v2 `works` are per-author ENTRY counts. Read
    // one as the other and every author reads as missing — or, worse, a real loss hides
    // inside a number that grew for an unrelated reason.
    const stale = { ...manifestOf(FULL), version: 1 };
    const r = evaluateCorpusRatchet(inv(FULL), stale, { deploying: true });
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/version 1, this gate speaks version 2/);
  });

  it('a manifest with NO version field is treated as v1 and refused, not assumed current', () => {
    const unversioned: Record<string, unknown> = { ...manifestOf(FULL) };
    delete unversioned.version;
    const r = evaluateCorpusRatchet(inv(FULL), unversioned, { deploying: true });
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/refusing to compare/);
  });
});

describe('loadLatestManifest reads the newest committed record', () => {
  it('orders on ts, NOT on the git sha the filename starts with', () => {
    // THE CASE THE OLD FIXTURES COULD NOT SEE. They were named `aaa1111` and `bbb2222` — shas that
    // happened to sort in the same order as their timestamps — so `.sort()` on the raw filename
    // passed, and the filename begins with SEVEN CHARACTERS OF RANDOM HEX. Caught on the real
    // evidence directory 2026-08-02: `839017d` (07-31) and `629521a` (08-01) both present, and the
    // loader returned the OLDER one because '8' > '6'.
    //
    // That direction was harmless — a bigger baseline makes the ratchet fire. The other direction
    // is the whole defect: a new manifest whose sha sorts LOW is never read, the ratchet keeps
    // comparing against an older, smaller corpus, and everything lost since then ships green.
    // Which way it lands is decided by hash bits.
    //
    // SEED: restore `.sort()` over the filenames -> RED, it returns 10.
    const dir = mkdtempSync(path.join(tmpdir(), 'corpus-evidence-'));
    scratch.push(dir);
    expect(loadLatestManifest(dir, () => ({}) as never)).toBeNull();

    for (const [sha, ts, fileCount] of [
      ['fff9999', '2026-07-01T00:00:00.000Z', 10], // sha sorts HIGH, oldest
      ['aaa1111', '2026-07-30T00:00:00.000Z', 20], // sha sorts LOW, newest
    ] as const) {
      const name = `corpus-manifest-${sha}-${ts.replace(/[:.]/g, '-')}.json`;
      writeFileSync(path.join(dir, name), JSON.stringify({ fileCount, ts, works: {} }));
    }
    writeFileSync(path.join(dir, 'zzz-not-a-manifest.json'), '{}');

    expect(loadLatestManifest(dir, (p) => JSON.parse(readFileSync(p, 'utf-8')))?.fileCount).toBe(20);
  });

  it('a v1 manifest with no ts is a floor, not a crash — it sorts below anything dated', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'corpus-evidence-'));
    scratch.push(dir);
    writeFileSync(path.join(dir, 'corpus-manifest-aaa1111-old.json'), JSON.stringify({ fileCount: 5, works: {} }));
    expect(loadLatestManifest(dir, (p) => JSON.parse(readFileSync(p, 'utf-8')))?.fileCount).toBe(5);

    writeFileSync(
      path.join(dir, 'corpus-manifest-bbb2222-new.json'),
      JSON.stringify({ fileCount: 7, ts: '2026-07-30T00:00:00.000Z', works: {} }),
    );
    expect(loadLatestManifest(dir, (p) => JSON.parse(readFileSync(p, 'utf-8')))?.fileCount).toBe(7);
  });

  it('an absent evidence directory reads as no baseline, not as a crash', () => {
    expect(loadLatestManifest(path.join(tmpdir(), 'corpus-evidence-missing'), () => ({}) as never)).toBeNull();
  });
});

// Everything above is about fixtures. These three are about THIS repo, and without them the
// suite can be entirely green while the deploy path ratchets against nothing.
describe('the ratchet is actually armed in this repo', () => {
  const REPO = fileURLToPath(new URL('..', import.meta.url));

  it('a manifest recording a non-empty corpus is COMMITTED, in the version the gate speaks', () => {
    const m = loadLatestManifest(path.join(REPO, 'docs/evidence'), (p) => JSON.parse(readFileSync(p, 'utf-8')));
    expect(m, 'no committed corpus manifest — run `node scripts/build-corpus-manifest.mjs`').not.toBeNull();
    expect(m!.version, 'a manifest the gate refuses to compare is not a baseline').toBe(MANIFEST_VERSION);
    expect(m!.fileCount).toBeGreaterThan(0);
    expect(m!.entryCount).toBeGreaterThan(0);
    expect(Object.keys(m!.works ?? {}).length).toBeGreaterThan(0);
    expect(m!.corpusHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the deploy gate runs the ratchet and the verse-key scan, with no artifact exemption', () => {
    // COMMENT-STRIPPED (2026-08-02 audit, T3). These were six raw greps over the gate's source,
    // and the auditor proved the failure: removing EVERY real call site — evaluateCorpusRatchet(,
    // verseKeyOffenders(, forbiddenServedEntries(, the import, both message strings — and adding
    // one three-line explanatory comment NAMING them left all six assertions passing. That is
    // this repo's documented shape, from source-scan.mjs itself: "the files being scanned EXPLAIN
    // AT LENGTH what they no longer do." codeOnly() exists for exactly this and two sibling tests
    // already use it.
    //
    // The structural half is kept because it answers a question only the source can answer — is
    // the gate WIRED — but it can no longer be satisfied by prose. The behavioural half is below.
    const gate = codeOnly(readFileSync(path.join(REPO, 'scripts/predeploy-gate.ts'), 'utf-8'));
    expect(gate).toMatch(/evaluateCorpusRatchet\(/);
    expect(gate).toMatch(/from '\.\.\/web\/test\/helpers\/verse-key-scan'/);
    expect(gate).toMatch(/verseKeyOffenders\(/);
    expect(gate).toMatch(/forbiddenServedEntries\(/);
    // An absent corpus at deploy is a refusal, and a scan with no eligible author is not a pass.
    expect(gate).toMatch(/verse-key gate cannot run/);
    expect(gate).toMatch(/VACUOUS GATE/);
  });

  it('the ratchet it wires up ACTUALLY REFUSES a shrunk corpus', () => {
    // The behavioural half. Grepping for `evaluateCorpusRatchet(` proves the call is written;
    // this proves the thing being called says no. Driven directly, so it cannot be satisfied by
    // any amount of source text.
    const before = { version: MANIFEST_VERSION, sha: 'aaaaaaa', ts: '2026-01-01T00:00:00.000Z', corpusHash: 'a'.repeat(64), fileCount: 100, entryCount: 1000, bookCount: 66, workCount: 9, books: { gen: 50 }, works: { 'John Gill': 1000 } };
    const shrunk = { present: true, fileCount: 90, entryCount: 900, books: { gen: 45 }, works: { 'John Gill': 900 }, corpusHash: 'b'.repeat(64) };
    const grown = { present: true, fileCount: 110, entryCount: 1100, books: { gen: 55 }, works: { 'John Gill': 1100 }, corpusHash: 'c'.repeat(64) };

    const bad = evaluateCorpusRatchet(shrunk, before, { deploying: true });
    expect(bad.ok, 'a corpus that LOST files and entries must not pass the ratchet').toBe(false);

    // Positive control: growth is fine, so the refusal above is about loss and not about
    // refusing everything.
    expect(evaluateCorpusRatchet(grown, before, { deploying: true }).ok).toBe(true);
  });

  it('the invariant suite and the gate share ONE copy of the verse-key threshold', () => {
    const suite = readFileSync(path.join(REPO, 'web/test/invariants/verse-keys.test.ts'), 'utf-8');
    expect(suite).toMatch(/from '\.\.\/helpers\/verse-key-scan'/);
    // A second copy of the threshold is how the deploy-side check quietly stops matching what
    // CI believes it enforces.
    expect(suite).not.toMatch(/COLLAPSE_MAX\s*=/);
    expect(suite).not.toMatch(/FORBIDDEN_HOST\s*=/);
  });
});
