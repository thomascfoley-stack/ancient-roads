// H-2 wiring (deep-audit 2026-09-07): the attribution boundary must cover EVERY
// writer of the `sections` store, not only the CCEL adapter.
//
// Six write paths (gutenberg, helloao, topical-index, whitefield, the two
// bridges, and ccel itself) share one choke point — writeRegisterWork — so the
// hold runs inside it and those paths are covered by construction. The four
// bespoke section writers (ingest-historian, ingest-sermon, repoint-sections-work,
// migrate-sections-slice) do NOT traverse it (verified 2026-09-07: no shared
// choke point exists across all ten paths); each calls the hold at its own
// pre-destructive point.
//
// Like reingest-guard-wiring.test.ts, the caller list is DERIVED from the tree,
// not trusted as typed: a new sections writer without the hold turns this red on
// the commit that adds it.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeOnly } from '../../scripts/lib/source-scan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => codeOnly(readFileSync(path.join(REPO, rel), 'utf8'));

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.mts') ? [p] : [];
  });

// Every src/ file that writes the sections store, derived.
const SECTION_WRITERS = walk(path.join(REPO, 'src'))
  .filter((p) => /INSERT INTO sections\b/.test(codeOnly(readFileSync(p, 'utf8'))))
  .map((p) => path.relative(REPO, p))
  .sort();

describe('the attribution boundary covers every sections writer (H-2)', () => {
  it('the derived writer set is exactly the five known writers (the scan is not vacuous)', () => {
    expect(SECTION_WRITERS).toEqual([
      'src/ingest/ingest-historian.ts',
      'src/ingest/ingest-sermon.ts',
      'src/ingest/migrate-sections-slice.ts',
      'src/ingest/register-writer.ts',
      'src/ingest/repoint-sections-work.ts',
    ]);
  });

  it.each(SECTION_WRITERS)('%s runs the attribution boundary hold', (rel) => {
    // SEED: delete the attributionBoundaryHold call from any one writer -> RED.
    expect(read(rel), `${rel} writes sections without the attribution boundary`).toMatch(/attributionBoundaryHold\(/);
  });

  it('writeRegisterWork runs the hold BEFORE any DB/env side effect', () => {
    // SEED: move the hold below the pg.Client construction -> RED.
    const code = read('src/ingest/register-writer.ts');
    const hold = code.indexOf('attributionBoundaryHold(');
    const db = code.indexOf('new pg.Client');
    expect(hold, 'writeRegisterWork never calls the hold').toBeGreaterThan(-1);
    expect(hold, 'the hold runs after the DB connection — a held work has already side-effected').toBeLessThan(db);
  });

  it('every writeRegisterWork caller is covered by construction (the hold is inside it)', () => {
    // The six-to-seven register paths the audit named all funnel through the one
    // function that now holds. Derived so a new caller can never bypass it: any
    // writeRegisterWork call is behind the hold by definition.
    const callers = walk(path.join(REPO, 'src'))
      .filter((p) => {
        const code = codeOnly(readFileSync(p, 'utf8'));
        return /writeRegisterWork\s*\(/.test(code) && !p.endsWith('register-writer.ts');
      })
      .map((p) => path.relative(REPO, p))
      .sort();
    expect(callers).toEqual([
      'src/ingest/adapter-ccel.ts',
      'src/ingest/adapter-gutenberg.ts',
      'src/ingest/adapter-helloao.ts',
      'src/ingest/ingest-topical-index.ts',
      'src/ingest/ingest-whitefield-works.ts',
      'src/ingest/reference-register-bridge.ts',
      'src/ingest/sword-register-bridge.ts',
    ]);
  });
});
