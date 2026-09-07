// H-4 / LAUNCH_BLOCKERS §17 (deep-audit 2026-09-07): the static shelf gap.
//
// writeRegisterWork wrote reader entries into web/public/commentaries/ AT INGEST,
// while the work was still status='staged'. The DB path gates serving on
// published+served; the static shelf path had no gate — one full corpus-blob-sync
// from serving staged (incl. ADR-029-held) works, measured as 454 drifted chapter
// files on 2026-09-07.
//
// THE GATE: a work landing as 'staged' must NOT materialize shelf entries at
// ingest; a work landing as 'published' must (nothing else writes them). The old
// staged-materialization behavior is load-bearing for the owner publish runbook's
// shelf flow (flip moves DB status; the already-materialized files then sync), so
// it survives behind the explicit REGISTER_MATERIALIZE_STAGED_SHELF=1 flag rather
// than being deleted.
//
// These tests run in a sandbox cwd with the DB/embed env scrubbed: they exercise
// the REAL materialization path the writer calls, and can never touch the dev DB
// or the repo's real web/public/commentaries tree.
//
// RED-PROOF: (a) run against the pre-fix register-writer — fails: materializeShelf/
// shouldMaterializeShelf absent and the static write ungated (see the source scan
// below); (b) SEED: make shouldMaterializeShelf return `true` unconditionally →
// the first test goes RED (staged ingest rewrites the chapter file). Both runs
// captured in docs/evidence/register-writer-gates-2026-09-07/.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codeOnly } from '../scripts/lib/source-scan.mjs';
import {
  materializeShelf,
  shouldMaterializeShelf,
  type RegisterWork,
} from '../src/ingest/register-writer';

const REPO = process.cwd();
const ENV_KEYS = ['DATABASE_URL', 'DEEPINFRA_API_KEY', 'NEON_BRANCH', 'REGISTER_MATERIALIZE_STAGED_SHELF'];
let sandbox: string;
let savedEnv: Record<string, string | undefined>;

beforeAll(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'shelf-gate-'));
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.chdir(sandbox);
});
afterAll(() => {
  process.chdir(REPO);
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(sandbox, { recursive: true, force: true });
});

const work = (publish: boolean): RegisterWork => ({
  slug: 'test-shelf-gate-work',
  title: 'Shelf Gate Test', author: 'Test Author', year: 1850,
  sourceType: 'commentary', register: 'prose', tradition: 'test', era: 'test',
  license: 'Public Domain', url: 'https://example.org/t', edition: 't', publish,
  sections: [{
    heading: 'On Genesis 1:1',
    body: 'In the beginning the test author discourses at sufficient length to be a real entry.',
    anchors: [{ verseIdStart: 1001001, verseIdEnd: 1001001 }],
  }],
});

// A chapter file as it exists on disk, carrying ANOTHER work's published entry.
const seedChapterFile = (): string => {
  mkdirSync('web/public/commentaries/gen', { recursive: true });
  const content = JSON.stringify({
    book: 1, chapter: 1,
    entries: [{ verseStart: 1, verseEnd: 1, author: 'Kept Author', work: 'kept-work', text: 'already published' }],
  });
  writeFileSync('web/public/commentaries/gen/1.json', content);
  return content;
};

describe('the static shelf gate (H-4 / LAUNCH_BLOCKERS §17)', () => {
  it('a work landing STAGED does not touch the shelf file at ingest', () => {
    const before = seedChapterFile();
    const written = materializeShelf(work(false));
    expect(written).toBe(0);
    expect(readFileSync('web/public/commentaries/gen/1.json', 'utf8')).toBe(before);
  });

  it('a work landing PUBLISHED materializes its shelf entries at ingest (nothing else writes them)', () => {
    seedChapterFile();
    const written = materializeShelf(work(true));
    expect(written).toBe(1);
    const j = JSON.parse(readFileSync('web/public/commentaries/gen/1.json', 'utf8')) as { entries: Array<{ work: string }> };
    expect(j.entries.map((e) => e.work).sort()).toEqual(['kept-work', 'test-shelf-gate-work']);
  });

  it('REGISTER_MATERIALIZE_STAGED_SHELF=1 preserves the runbook staged-materialization flow, explicitly', () => {
    process.env.REGISTER_MATERIALIZE_STAGED_SHELF = '1';
    try {
      const before = seedChapterFile();
      const written = materializeShelf(work(false));
      expect(written).toBe(1);
      expect(readFileSync('web/public/commentaries/gen/1.json', 'utf8')).not.toBe(before);
    } finally {
      delete process.env.REGISTER_MATERIALIZE_STAGED_SHELF;
    }
  });

  it('shouldMaterializeShelf: publish, or the explicit flag — never neither', () => {
    expect(shouldMaterializeShelf(true)).toBe(true);
    expect(shouldMaterializeShelf(false)).toBe(false);
    process.env.REGISTER_MATERIALIZE_STAGED_SHELF = '1';
    try {
      expect(shouldMaterializeShelf(false)).toBe(true);
    } finally {
      delete process.env.REGISTER_MATERIALIZE_STAGED_SHELF;
    }
  });

  it('writeRegisterWork gates its static shelf write behind the publish decision (source scan)', () => {
    // SEED: revert register-writer to the ungated `for (const [k, entries] of byChapter)`
    // inline write -> RED (no shouldMaterializeShelf call anywhere).
    const src = codeOnly(readFileSync(path.join(REPO, 'src/ingest/register-writer.ts'), 'utf8'));
    expect(src, 'the static shelf write is ungated — a staged ingest materializes shelf entries')
      .toMatch(/shouldMaterializeShelf\(\s*work\.publish\s*\)/);
  });
});
