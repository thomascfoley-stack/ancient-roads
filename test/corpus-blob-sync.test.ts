import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { planSync, walkDisk, CACHE_SECONDS, DEFAULT_ROOTS } from '../scripts/corpus-blob-sync.mjs';

// The sync planner's contract (CORPUS_CDN_DESIGN A1). The load-bearing case is DELETION
// PROPAGATION: quarantine unserves by MOVING files out of the serving root, so a manifest
// entry with no disk file MUST plan a CDN delete — an orphaned blob keeps serving quarantined
// text, which is licensing failing open. Red-proof shape: every case here fails if hash-skip,
// change detection, or delete detection is broken or inverted.

type DiskMeta = { sha256: string; size: number; full?: string };
const disk = (entries: Record<string, string>): Map<string, DiskMeta> =>
  new Map(Object.entries(entries).map(([rel, sha]) => [rel, { sha256: sha, size: 1 }]));

describe('planSync', () => {
  it('uploads new files, skips unchanged, re-uploads changed (hash, not mtime)', () => {
    const plan = planSync(
      disk({ 'bible/kjv/gen.json': 'aaa', 'bible/kjv/exo.json': 'bbb', 'commentaries/henry.json': 'ccc' }),
      { 'bible/kjv/gen.json': { sha256: 'aaa' }, 'bible/kjv/exo.json': { sha256: 'CHANGED' } },
    );
    expect(plan.uploads).toEqual(['bible/kjv/exo.json', 'commentaries/henry.json']);
    expect(plan.unchanged).toBe(1);
    expect(plan.deletes).toEqual([]);
  });

  it('LICENSING: a file gone from disk (quarantine moved it) plans a CDN delete', () => {
    const plan = planSync(
      disk({ 'commentaries/kept.json': 'aaa' }),
      { 'commentaries/kept.json': { sha256: 'aaa' }, 'commentaries/quarantined.json': { sha256: 'bad' } },
    );
    expect(plan.deletes).toEqual(['commentaries/quarantined.json']);
    expect(plan.uploads).toEqual([]);
  });

  it('an empty manifest (first run) uploads everything and deletes nothing', () => {
    const plan = planSync(disk({ 'bible/a.json': '1', 'original/b.json': '2' }), {});
    expect(plan.uploads).toEqual(['bible/a.json', 'original/b.json']);
    expect(plan.deletes).toEqual([]);
  });

  it('a prefix scopes BOTH uploads and deletes — the quarantine weld touches only its paths', () => {
    const plan = planSync(
      disk({ 'commentaries/a.json': 'NEW', 'bible/x.json': 'NEW' }),
      { 'commentaries/gone.json': { sha256: 'z' }, 'bible/gone-too.json': { sha256: 'z' } },
      'commentaries/',
    );
    expect(plan.uploads).toEqual(['commentaries/a.json']);
    expect(plan.deletes).toEqual(['commentaries/gone.json']);
  });
});

describe('walkDisk + policy constants', () => {
  let dir: string;
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('hashes real bytes and normalizes paths to forward slashes', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'cdn-sync-'));
    mkdirSync(path.join(dir, 'bible', 'kjv'), { recursive: true });
    writeFileSync(path.join(dir, 'bible', 'kjv', 'gen.json'), '{"v":1}');
    const files = walkDisk(dir, ['bible']);
    expect([...files.keys()]).toEqual(['bible/kjv/gen.json']);
    const meta = files.get('bible/kjv/gen.json')!;
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.size).toBe(7);
    // Same content on a re-walk = same hash (the skip path's whole premise).
    expect(walkDisk(dir, ['bible']).get('bible/kjv/gen.json')!.sha256).toBe(meta.sha256);
  });

  it('commentaries carry the SHORT ttl — the quarantine backstop is policy, not accident', () => {
    expect(CACHE_SECONDS.commentaries).toBeLessThanOrEqual(3_600);
    expect(CACHE_SECONDS.bible).toBeGreaterThan(CACHE_SECONDS.commentaries);
    expect(DEFAULT_ROOTS).toEqual(['bible', 'commentaries', 'original']);
  });
});
