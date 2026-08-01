// PROPERTY: the served-assets COUNT ratchet refuses a directory that is present but carries
// fewer files than the committed baseline, and refuses equally when it cannot tell.
//
// DEPLOY_PREFLIGHT §2 named the gap after the presence check landed: "it is a PRESENCE check,
// not a COUNT check." A half-empty corpus directory - an interrupted rm, a partial restore -
// passes `missingServedAssetDirs`, exits 0, and fails silently in the UI, because `fetchJson`
// returns null on a non-ok response and blank panels look like sparse content. These fixtures
// exist for the same reason the corpus-manifest ones do: the failures the ratchet is for cannot
// be produced on demand against the real ~600MB of web/public, and a ratchet that has only ever
// been watched on a tree that happened not to trip it is a ratchet nobody has seen work.
//
// THE CASE THAT DRIVES THE DESIGN is the missing/garbled baseline. A comparison against nothing
// is vacuously green, and this repo's documented failure mode is precisely the check that
// quietly finds nothing to check - so an unusable baseline must REFUSE, never skip.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SERVED_ASSETS_BASELINE,
  servedAssetCountRatchet,
  servedAssetDirs,
  servedAssetFileCounts,
} from '../scripts/lib/served-assets.mjs';

const scratch: string[] = [];
afterAll(() => {
  for (const d of scratch) rmSync(d, { recursive: true, force: true });
});

/** A web/public stand-in: `{ bible: 3 }` → `bible/` holding 3 files. */
function makePublic(dirs: Record<string, number>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'served-assets-public-'));
  scratch.push(root);
  for (const [dir, n] of Object.entries(dirs)) {
    mkdirSync(path.join(root, dir), { recursive: true });
    for (let i = 0; i < n; i += 1) writeFileSync(path.join(root, dir, `${i}.json`), 'x');
  }
  return root;
}

function makeBaseline(content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'served-assets-baseline-'));
  scratch.push(dir);
  const p = path.join(dir, 'served-assets-baseline.json');
  writeFileSync(p, content);
  return p;
}

const baselineOf = (counts: Record<string, number>) =>
  makeBaseline(JSON.stringify({ comment: 'fixture', counts }));

describe('a decrease refuses; an increase reports', () => {
  it('refuses a directory with fewer files than the baseline, naming it and both counts', () => {
    const pub = makePublic({ bible: 3, lexicon: 2 });
    const r = servedAssetCountRatchet(pub, baselineOf({ bible: 5, lexicon: 2 }));
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toContain('bible');
    expect(r.failures[0]).toContain('3');
    expect(r.failures[0]).toContain('5');
  });

  it('passes exact counts, and reports an increase without refusing', () => {
    const pub = makePublic({ bible: 6, lexicon: 2 });
    const r = servedAssetCountRatchet(pub, baselineOf({ bible: 5, lexicon: 2 }));
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.increases).toHaveLength(1);
    expect(r.increases[0]).toContain('bible');
  });

  it('counts recursively - shard subdirectories hold files, not structure to skip', () => {
    // bible/ is sharded per translation; a counter that stopped at the top level would read
    // 22,590 files as a couple dozen directories and refuse every honest deploy.
    const pub = makePublic({ bible: 2 });
    mkdirSync(path.join(pub, 'bible', 'kjv'));
    writeFileSync(path.join(pub, 'bible', 'kjv', '1.json'), 'x');
    expect(servedAssetFileCounts(['bible'], pub).counts.bible).toBe(3);
  });
});

describe('an unusable baseline REFUSES - it never skips', () => {
  it('refuses on a missing baseline file', () => {
    const pub = makePublic({ bible: 5 });
    const r = servedAssetCountRatchet(pub, path.join(pub, 'no-such-baseline.json'));
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/baseline missing/);
  });

  it('refuses on a garbled (unparseable) baseline', () => {
    const r = servedAssetCountRatchet(makePublic({ bible: 5 }), makeBaseline('{"counts": ['));
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/not parseable/);
  });

  it('refuses a baseline that names no directories - the vacuously green comparison', () => {
    const r = servedAssetCountRatchet(makePublic({ bible: 5 }), makeBaseline('{"counts":{}}'));
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/vacuously green/);
  });

  it('refuses a non-integer baseline count instead of comparing against it', () => {
    const r = servedAssetCountRatchet(
      makePublic({ bible: 5 }),
      makeBaseline('{"counts":{"bible":"5"}}'),
    );
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toContain('bible');
    expect(r.failures[0]).toMatch(/not a non-negative integer/);
  });
});

describe('absence stays distinguishable from an undercount', () => {
  it('reports a baseline directory absent from disk as ABSENT, not as fewer files', () => {
    // Inside the gate the presence check refuses absence first with its own message; the
    // ratchet still refuses standalone (a hole is not a pass) but under a separate finding,
    // so the two checks never blur into one report.
    const pub = makePublic({ lexicon: 2 });
    const r = servedAssetCountRatchet(pub, baselineOf({ bible: 5, lexicon: 2 }));
    expect(r.ok).toBe(false);
    expect(r.absent).toEqual(['bible']);
    expect(r.failures).toEqual([]);
  });
});

describe('the committed baseline is usable and complete', () => {
  it('parses, and names exactly the directories the client serves', () => {
    // Derived-vs-imported cross-check: the served set comes from the client's own fetches, the
    // counts from the committed baseline. A newly served directory fails here (and at the gate)
    // until someone records it deliberately - no hand-maintained list to forget.
    const committed = JSON.parse(readFileSync(SERVED_ASSETS_BASELINE, 'utf8')) as {
      counts: Record<string, number>;
    };
    expect(Object.keys(committed.counts).sort()).toEqual(servedAssetDirs());
    for (const n of Object.values(committed.counts)) {
      expect(Number.isInteger(n) && n > 0).toBe(true);
    }
  });
});
