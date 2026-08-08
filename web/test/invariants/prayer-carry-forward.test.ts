// PR1a — THE CARRY-FORWARD RUNS ONCE, KEEPS ITS SOURCE, AND CANNOT BREAK THE JOURNAL.
//
// Exit tests for the `N4` migration ruling as absorbed into `PR1a` (owner, 2026-08-08): "existing
// objects migrate into the prayer journal as entries; nothing user-created gets hidden or dropped",
// with the block's three constraints — runs once, best-effort, does NOT delete its localStorage
// source in this release.
//
// This is the riskiest code in the block, and every one of its failure modes is silent:
//   - run twice -> the reader's words are duplicated, and they cannot tell which is real
//   - throw on a malformed key -> the whole prayer journal fails to open, for a stale value
//   - carry the seed sections -> "Channels" appears as a prayer for readers who never used it
//   - delete the source -> a half-completed run is permanent data loss
// None of those show up in a typecheck or a browser pass on a clean profile.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARRY_FORWARD_MARKER,
  CARRY_FORWARD_MAX,
  collectCarryForward,
  runCarryForward,
  studySectionsKey,
} from '../../src/lib/prayer-carry-forward';

/** A minimal Storage double. Records writes so the ordering assertions can read them back. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const removed: string[] = [];
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => { removed.push(k); map.delete(k); },
    map,
    removed,
  };
}

const SEED_ONLY = JSON.stringify([
  { id: 'channels', kind: 'channels', name: 'Channels', items: [] },
  { id: 'partners', kind: 'group', name: 'Study Partners', items: [] },
]);

describe('PR1a carry-forward — what counts as user-created', () => {
  it('carries nothing for a reader who never touched the sidebar', () => {
    // SEED: drop the SEED_SECTION_IDS check -> RED. Every reader gets "Channels" and
    // "Study Partners" whether they used the feature or not, so carrying them puts furniture
    // in the prayer journal of someone who created nothing.
    expect(collectCarryForward(SEED_ONLY)).toEqual([]);
  });

  it('carries every named item the reader made', () => {
    const raw = JSON.stringify([
      { id: 'channels', kind: 'channels', name: 'Channels', items: [{ id: 'a', name: 'Romans study' }] },
      { id: 'mine', kind: 'group', name: 'Family', items: [{ id: 'b', name: "Mum's surgery" }] },
    ]);
    const out = collectCarryForward(raw).map((e) => e.body);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe('Romans study');            // seed section: no context suffix
    expect(out[1]).toBe("Mum's surgery\n\n(from Family)"); // reader's own section: context kept
  });

  it('carries a section the reader made and left empty', () => {
    // The ruling is "nothing user-created gets dropped" — an empty group they named is still
    // something they made.
    const raw = JSON.stringify([{ id: 'mine', kind: 'group', name: 'Advent', items: [] }]);
    expect(collectCarryForward(raw).map((e) => e.body)).toEqual(['Advent']);
  });

  it('never throws on absent, malformed, or wrong-shaped storage', () => {
    // SEED: replace the JSON.parse try/catch with a bare parse -> RED on the third case. That
    // exception propagates out of the journal's mount effect.
    for (const raw of [null, '', 'not json', '{}', '[null]', '[{"items":"nope"}]', '[{"items":[{"name":42}]}]']) {
      expect(() => collectCarryForward(raw), `threw on ${JSON.stringify(raw)}`).not.toThrow();
      expect(collectCarryForward(raw)).toEqual([]);
    }
  });

  it('is bounded — a pathological payload cannot spray the API', () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: `p${i}` }));
    const raw = JSON.stringify([{ id: 'mine', kind: 'group', name: 'Big', items }]);
    expect(collectCarryForward(raw).length).toBe(CARRY_FORWARD_MAX);
  });
});

describe('PR1a carry-forward — the three constraints', () => {
  const raw = JSON.stringify([{ id: 'mine', kind: 'group', name: 'Family', items: [{ id: 'b', name: 'Grace' }] }]);

  it('CONSTRAINT 1: runs once — a second launch creates nothing', async () => {
    // SEED: delete the marker check -> RED, and the reader's prayers are duplicated on every
    // single visit to /prayers. This is the failure that matters most.
    const store = fakeStorage({ [studySectionsKey('u1')]: raw });
    const posted: string[] = [];
    const post = async (b: string) => void posted.push(b);

    expect(await runCarryForward('u1', post, store)).toBe(1);
    expect(await runCarryForward('u1', post, store)).toBe(0);
    expect(await runCarryForward('u1', post, store)).toBe(0);
    expect(posted).toEqual(['Grace\n\n(from Family)']);
  });

  it('CONSTRAINT 1: a half-completed run is not retried', async () => {
    // The tab dies after some posts landed. We cannot tell which, and a duplicated prayer is
    // worse than a missed one — safe only because the source is still on disk (constraint 3).
    const store = fakeStorage({ [studySectionsKey('u1')]: raw, [CARRY_FORWARD_MARKER]: 'started' });
    const posted: string[] = [];
    expect(await runCarryForward('u1', async (b) => void posted.push(b), store)).toBe(0);
    expect(posted).toEqual([]);
  });

  it('CONSTRAINT 1: the marker is written BEFORE the first post, not after', async () => {
    // Ordering is the whole guard. If the marker were written after the loop, a crash mid-loop
    // would re-run everything from the top on the next launch.
    const store = fakeStorage({ [studySectionsKey('u1')]: raw });
    let markerAtFirstPost: string | null = null;
    await runCarryForward('u1', async () => { markerAtFirstPost = store.getItem(CARRY_FORWARD_MARKER); }, store);
    expect(markerAtFirstPost, 'marker was not set before the first post').toBeTruthy();
  });

  it('CONSTRAINT 2: best-effort — a failing API is swallowed and returns 0', async () => {
    // SEED: remove the outer try/catch -> RED, and a 500 from /api/prayers takes down the mount
    // effect of the page the reader came to use.
    const store = fakeStorage({ [studySectionsKey('u1')]: raw });
    await expect(runCarryForward('u1', async () => { throw new Error('503'); }, store)).resolves.toBe(0);
  });

  it('CONSTRAINT 3: the localStorage source is never deleted in this release', async () => {
    // SEED: add `storage.removeItem(studySectionsKey(userId))` after the loop -> RED. That line
    // is the one that turns every failure mode above from "a miss" into permanent data loss.
    const store = fakeStorage({ [studySectionsKey('u1')]: raw });
    await runCarryForward('u1', async () => {}, store);
    expect(store.map.get(studySectionsKey('u1')), 'the source key was modified').toBe(raw);
    expect(store.removed, 'something was removed from storage').toEqual([]);
  });

  it('CONSTRAINT 3: no removal of the source anywhere in the module source', () => {
    // The behavioural test above only sees the path it drives. This one reads the file, because
    // the constraint is "not in this release", not "not on the happy path".
    const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
    const src = readFileSync(path.join(SRC, 'lib/prayer-carry-forward.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src, 'the carry-forward must not delete or clear its own source this release')
      .not.toMatch(/removeItem|\.clear\(/);
  });
});
