// H-2 (deep-audit 2026-09-07): the attribution boundary guarded only the CCEL
// adapter. Gutenberg — the catalogue class's REAL provenance path — and nine
// other write paths into the same store had no boundary. The fix runs
// attributionBoundaryHold inside writeRegisterWork itself, the choke point every
// register write path (gutenberg / helloao / topical-index / whitefield /
// reference-bridge / sword-bridge / ccel) traverses, so those paths are covered
// by construction; the four bespoke section writers call it at their own
// pre-destructive point (pinned by test/invariants/attribution-boundary-wiring).
//
// HOLD ON STRONG FINDINGS ONLY. Weak findings ride along as a report (owner
// decision #4 is open) — asserted below.
//
// SAFETY: this file scrubs DATABASE_URL / DEEPINFRA_API_KEY / NEON_BRANCH and
// chdirs into a sandbox before touching any write path, so no test here can
// reach the dev DB (web/.env.local exists in real checkouts) or the repo's real
// caches. A CLEAN work that passes the boundary then fails on the missing DB
// env — that failure IS the proof it passed.
//
// RED-PROOF: run against the pre-fix tree — writeRegisterWork performs no sweep,
// so the held-work tests fail with the env error instead of the hold reason, and
// `attributionBoundaryHold` is absent from register-writer (import error).
// Captured in docs/evidence/register-writer-gates-2026-09-07/.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  attributionBoundaryHold,
  writeRegisterWork,
  type RegisterWork,
} from '../src/ingest/register-writer';
import { acquireGutenberg } from '../src/ingest/adapter-gutenberg';

const REPO = process.cwd();
const ENV_KEYS = ['DATABASE_URL', 'DEEPINFRA_API_KEY', 'NEON_BRANCH'];
let sandbox: string;
let savedEnv: Record<string, string | undefined>;

beforeAll(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'boundary-'));
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

// A machine word index bound into the work — the exact shape that carried 929
// index rows into published Schaff volumes (ADR-029 addendum 2). STRONG.
const INDEX_UNIT = {
  heading: 'Latin Words and Phrases',
  body: 'Index of Latin Words and Phrases\nAdhuc sub judice lis est:\n1\nArmorum superi:\n1\nCertatur:\n1',
};
const VERSE_UNIT = (n: number) => ({
  heading: `Meditation ${n}`,
  body: 'The word was in the beginning, and the word was with God, and the word was God; the same was in the beginning with God.',
});

const work = (sections: Array<{ heading: string; body: string }>): RegisterWork => ({
  slug: 'test-boundary-work',
  title: 'Boundary Test', author: 'Test Author', year: 1850,
  sourceType: 'theology', register: 'prose', tradition: 'test', era: 'test',
  license: 'Public Domain', url: 'https://example.org/t', edition: 't',
  publish: false,
  sections,
});

const HELD_SECTIONS = [INDEX_UNIT, VERSE_UNIT(1), VERSE_UNIT(2), VERSE_UNIT(3)];
const CLEAN_SECTIONS = [VERSE_UNIT(1), VERSE_UNIT(2), VERSE_UNIT(3), VERSE_UNIT(4)];

describe('the attribution boundary at the writeRegisterWork choke point (H-2)', () => {
  it('HOLDS a work with a strong finding — before any env read or DB touch', async () => {
    // Env is scrubbed, so reaching the hold (rather than dying on the env check)
    // proves the hold precedes every write-stage side effect.
    await expect(writeRegisterWork(work(HELD_SECTIONS))).rejects.toThrow(/held — non-authorial matter/);
  });

  it('a clean work PASSES the choke point (it fails only later, on the scrubbed DB env)', async () => {
    await expect(writeRegisterWork(work(CLEAN_SECTIONS))).rejects.toThrow(/^DATABASE_URL and DEEPINFRA_API_KEY required$/);
  });

  it('weak findings are reported but do NOT hold (owner decision #4 stays open)', async () => {
    const weakSections = [
      ...CLEAN_SECTIONS,
      { heading: 'An Account of the Inquisition — The Life of William Gardiner', body: 'William Gardiner was born at Bristol, received a tolerable education, and was placed at a merchant\'s office.' },
    ];
    const hold = attributionBoundaryHold(weakSections, 'Test Author');
    expect(hold.held).toBe(false);
    expect(hold.matter.weak).toBeGreaterThan(0);
    await expect(writeRegisterWork(work(weakSections))).rejects.toThrow(/^DATABASE_URL and DEEPINFRA_API_KEY required$/);
  });
});

// ── through the GUTENBERG path (the catalogue class's real provenance) ──────
// Runs the REAL acquireGutenberg: quarantine mouth → cached fetch → boilerplate
// strip → profile scoping → unit split → RegisterWork → writeRegisterWork. The
// cache is seeded inside the sandbox cwd, so no network and no repo pollution.
const FAKE_EBOOK = 999000001;
const kebleEntry = {
  slug: 'keble-christian-year', title: 'The Christian Year', author: 'John Keble',
  year_written: 1827, source_type: 'poetry', tradition: 'anglican', era: 'romantic',
  license: 'Public Domain', serve: true,
  provenance: { acquire: { ebook_id: FAKE_EBOOK }, url: 'https://example.org/keble', year: 1827 },
};
const POEM_BLOCK = (n: number) =>
  `Hymn ${n}\nThe morning light breaks o'er the eastern hills,\nAnd every valley answers to the song,\nOf birds that wake the world with their sweet trills,\nAnd all creation praises God all day long.`;
const seedGutenbergCache = (blocks: string[]) => {
  mkdirSync('data/raw/gutenberg', { recursive: true });
  writeFileSync(
    `data/raw/gutenberg/${FAKE_EBOOK}.txt`,
    `header\n\nMORNING.\n\n\n${blocks.join('\n\n\n')}\n\n\n*** END OF THE PROJECT GUTENBERG EBOOK ***\n`,
  );
};
const INDEX_BLOCK =
  'Latin Words and Phrases\nIndex of Latin Words and Phrases\nAdhuc sub judice lis est:\n1\nArmorum superi:\n1\nCertatur:\n1\nConsilium est:\n1';

describe('the attribution boundary through the GUTENBERG path', () => {
  it('HOLDS a composite/indexed volume at acquire time — nothing is written', async () => {
    seedGutenbergCache([INDEX_BLOCK, POEM_BLOCK(1), POEM_BLOCK(2), POEM_BLOCK(3), POEM_BLOCK(4), POEM_BLOCK(5)]);
    await expect(acquireGutenberg(kebleEntry as never, { write: true })).rejects.toThrow(/held — non-authorial matter/);
  });

  it('a clean volume PASSES the whole path up to the (scrubbed) DB write', async () => {
    seedGutenbergCache([POEM_BLOCK(1), POEM_BLOCK(2), POEM_BLOCK(3), POEM_BLOCK(4), POEM_BLOCK(5), POEM_BLOCK(6)]);
    await expect(acquireGutenberg(kebleEntry as never, { write: true })).rejects.toThrow(/^DATABASE_URL and DEEPINFRA_API_KEY required$/);
  });
});

// ── through a BRIDGE path (reference-register-bridge) ───────────────────────
// The bridge is a top-level main() with no exports, so this spawns the real
// script against a fixture JSONL. The hold fires inside writeRegisterWork before
// any env read, so the scrubbed-env subprocess can never reach the DB.
describe('the attribution boundary through the reference bridge path', () => {
  it('HOLDS a reference work carrying a machine word index', () => {
    const fixture = path.join(sandbox, 'bridge-fixture.jsonl');
    const lines = [
      JSON.stringify({ key: 'Latin Words and Phrases', text: 'Index of Latin Words and Phrases\nAdhuc sub judice lis est:\n1\nArmorum superi:\n1\nCertatur:\n1' }),
      ...Array.from({ length: 110 }, (_, i) =>
        JSON.stringify({ key: `Entry ${i + 1}`, text: `A substantive lexicon article for entry number ${i + 1}, with enough text to pass the floor.` })),
    ];
    writeFileSync(fixture, lines.join('\n'));
    const r = spawnSync('npx', ['tsx', 'src/ingest/reference-register-bridge.ts', `--jsonl=${fixture}`, '--slug=isbe'], {
      cwd: REPO,
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !ENV_KEYS.includes(k))) as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 120_000,
    });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/held — non-authorial matter/);
  }, 180_000);
});
