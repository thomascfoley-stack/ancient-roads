// Coverage floor (B2) at the SHIPPED seam: teach() must report kind:'empty' when the
// query confidently names a passage the corpus does not cover, instead of composing
// over off-passage chunks. Regression guard for the Song of Solomon hole
// (docs/evidence/part4/sos-fallback-verification.txt): retrieveCommentary has no
// relevance floor, so a zero-coverage book returned six NON-covering chunks and the
// answer was only caught downstream, incidentally, by the verifier.
//
// The pipeline deps (embedding, compose, retrieval) are mocked; resolveIntent runs FOR
// REAL, so this exercises the real query -> floor -> coverage wiring, not a lookalike.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveIntent } from '@/bible/pericopes';

// teach.ts (and its transitive imports) begin with `import 'server-only'`, which throws
// under the vitest node runtime (no react-server condition). Neutralize it for this test.
vi.mock('server-only', () => ({}));

const compose = vi.fn(async () => JSON.stringify({ contract_version: '1.1', teacher: 'q', blocks: [] }));

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: vi.fn(async () => new Array(1024).fill(0)),
  compose: (...args: unknown[]) => compose(...(args as [])),
}));

// A pool that CANNOT contain Song of Solomon commentary — exactly the evidence's shape.
function offPassagePool() {
  const mk = (author: string, sourceTitle: string, verseId: number, score: number) => ({
    sourceId: `commentary:${verseId}:${author}`,
    score,
    content: `${author} on a New Testament passage. Not Song of Solomon.`,
    metadata: { author, year: 1870, tradition: 'protestant', sourceTitle, sourceUrl: null, verseId, verseEnd: verseId, model: 'bge' },
  });
  return [
    mk('Albert Barnes', 'Barnes on the New Testament', 45_008_001, 0.012), // Romans 8
    mk('John Wesley', 'Wesley Explanatory Notes (NT)', 46_013_004, 0.009), // 1 Cor 13
    mk('John Chrysostom', 'Homilies on John', 43_010_011, 0.007), // John 10
    mk('Augustine', 'Exposition on Psalm 45', 19_045_001, 0.005), // Psalm 45
  ];
}

// One on-passage chunk (Song of Songs 2:1) mixed into the pool.
function onPassagePool() {
  const pool = offPassagePool();
  pool.unshift({
    sourceId: 'commentary:22002001:Gill',
    score: 0.41,
    content: 'John Gill on the Song of Songs, chapter 2.',
    metadata: { author: 'John Gill', year: 1760, tradition: 'baptist', sourceTitle: 'Exposition of the Whole Bible', sourceUrl: null, verseId: 22_002_001, verseEnd: 22_002_001, model: 'bge' },
  });
  return pool;
}

let poolFactory: () => ReturnType<typeof offPassagePool> = offPassagePool;

vi.mock('@/lib/teacher/retrieve', () => ({
  retrieveCommentary: vi.fn(async () => poolFactory()),
  retrieveSongVerse: vi.fn(async () => []),
  retrieveSermonLane: vi.fn(async () => []),
  retrieveTheologyLane: vi.fn(async () => []),
}));

// The canonical KJV name now resolves to a high-confidence floor (Song of Songs 2) via
// the B2b multi-word scan; before it, "Song of Solomon" parsed to nothing and this whole
// hole was invisible. End-to-end proof that B2a (the gate) + B2b (the parser) close it.
const SOS_QUERY = 'Song of Solomon 2, I am the rose of Sharon and the lily of the valleys';

describe('coverage floor (B2) at the shipped teach() seam', () => {
  beforeEach(() => {
    poolFactory = offPassagePool;
    compose.mockClear();
  });

  it('the query resolves to a high-confidence floor range (self-check of the fixture)', () => {
    expect(resolveIntent(SOS_QUERY).floor.length).toBeGreaterThan(0);
  });

  it('reports kind:empty (no composing) when the confidently-asked book is absent', async () => {
    const { teach } = await import('@/lib/teacher/teach');
    const result = await teach(SOS_QUERY);
    expect(result.kind).toBe('empty');
    if (result.kind === 'empty') expect(result.reason).toMatch(/Song of Songs/i);
    expect(compose).not.toHaveBeenCalled(); // the gate is BEFORE compose — no wasted generation
  });

  it('does NOT fire when a retrieved chunk is on the asked passage', async () => {
    poolFactory = onPassagePool;
    const { teach } = await import('@/lib/teacher/teach');
    const result = await teach(SOS_QUERY);
    expect(result.kind).not.toBe('empty'); // coverage present -> proceed to compose/verify
  });
});
