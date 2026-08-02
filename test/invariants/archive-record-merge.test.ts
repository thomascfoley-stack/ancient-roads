// A TARGETED ARCHIVE RUN MUST NOT EAT THE FULL RECORD — 2026-08-02.
//
// This is not a hypothetical. `scripts/archive-sources.mts` wrote its manifest as
// `files: <this run's records>`. The full run produced 131 checksums and 26 unrecoverable
// findings. The very next command — `--fetch --slug=thayers-lexicon`, a routine single-work
// re-fetch — considered one work, wrote ONE record, and silently destroyed the other 130 plus
// every unrecoverable finding. The provenance for a 272MB archive was gone, the tool said
// "wrote manifest.json (1 file record(s))", and exited 0.
//
// The repo already knew: `quarantine-served-corpus` carries a test for exactly this shape, whose
// own comment reads "the case that silently eats the first run's entries". The lesson was written
// down and reintroduced one tool over. So the merge is a function now, and this is its red-proof.

import { describe, expect, it } from 'vitest';
import { mergeArchiveRows, fileKey } from '../../scripts/lib/archive-record-merge.mjs';

const f = (slug: string, artifact: string, sha = 'x') => ({ slug, artifact, sha256: sha });

describe('mergeArchiveRows', () => {
  it('carries forward every row this run did not consider', () => {
    // SEED: `return freshRows` instead of merging -> RED. This is the exact defect.
    const prior = [f('alpha', 'a.xml'), f('beta', 'b.xml'), f('gamma', 'c.txt')];
    const fresh = [f('beta', 'b.xml', 'new')];
    const out = mergeArchiveRows(prior, fresh, new Set(['beta']), fileKey);

    expect(out.map((r) => r.slug)).toEqual(['alpha', 'beta', 'gamma']);
    expect(out.find((r) => r.slug === 'beta')!.sha256, 'the in-scope row was not refreshed').toBe('new');
    expect(out.find((r) => r.slug === 'alpha')!.sha256, 'an out-of-scope row was altered').toBe('x');
  });

  it('REPLACES rows for works this run did consider, so a dropped file cannot linger', () => {
    // The other half, and the reason this is not simply "append if absent": if a work is
    // re-archived and now yields one artifact instead of three, the two stale ones must go. A
    // manifest that still claims bytes the archive no longer holds is worse than one that is short.
    const prior = [f('beta', 'one.xml'), f('beta', 'two.xml'), f('beta', 'three.xml')];
    const fresh = [f('beta', 'one.xml', 'new')];
    const out = mergeArchiveRows(prior, fresh, new Set(['beta']), fileKey);

    expect(out.map((r) => r.artifact)).toEqual(['one.xml']);
  });

  it('a full run (everything in scope) keeps exactly what it measured', () => {
    const prior = [f('alpha', 'a.xml'), f('beta', 'b.xml')];
    const fresh = [f('alpha', 'a.xml', 'n1'), f('beta', 'b.xml', 'n2')];
    const out = mergeArchiveRows(prior, fresh, new Set(['alpha', 'beta']), fileKey);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.sha256.startsWith('n'))).toBe(true);
  });

  it('handles a first run, with no prior manifest at all', () => {
    expect(mergeArchiveRows(undefined, [f('alpha', 'a.xml')], new Set(['alpha']), fileKey)).toHaveLength(1);
    expect(mergeArchiveRows(undefined, [], new Set(), fileKey)).toEqual([]);
  });

  it('sorts by the caller\'s key, so the committed file does not churn on re-runs', () => {
    // The manifest is version-controlled; a stable order is what keeps its diffs meaningful.
    const out = mergeArchiveRows(
      [f('zulu', 'z.xml'), f('alpha', 'b.xml'), f('alpha', 'a.xml')],
      [],
      new Set(),
      fileKey,
    );
    expect(out.map(fileKey)).toEqual(['alpha/a.xml', 'alpha/b.xml', 'zulu/z.xml']);
  });

  it('works for the skipped-row shape too, which has no artifact', () => {
    // unrecoverable/refused rows are keyed by slug alone; the default keyOf must handle them.
    const prior = [{ slug: 'alpha', kind: 'sword', reason: 'no url' }];
    const fresh = [{ slug: 'beta', kind: 'github', reason: 'no commit' }];
    const out = mergeArchiveRows(prior, fresh, new Set(['beta']));
    expect(out.map((r) => r.slug)).toEqual(['alpha', 'beta']);
  });
});

describe('the archiver actually uses it', () => {
  it('archive-sources.mts merges rather than assigning this run\'s rows', async () => {
    // SEED: change `files: mergedFiles` back to `files: files` -> RED.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../scripts/archive-sources.mts', import.meta.url), 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*mergeArchiveRows[^}]*\}\s*from\s*'\.\/lib\/archive-record-merge\.mjs'/);
    expect(src, 'the writer assigns this run\'s rows directly').not.toMatch(/^\s*files: files,/m);
    expect(src).toMatch(/files: mergedFiles/);
    // All three record lists must be merged, not just `files` — the unrecoverable findings were
    // destroyed by the same bug and are just as much a part of the record.
    expect(src).toMatch(/unrecoverable: mergeArchiveRows\(/);
    expect(src).toMatch(/refused: mergeArchiveRows\(/);
  });
});
