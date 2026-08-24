// D46 (DEEP_SWEEP) — the `retrieved` event the reader sees was computed from ALL of retrieval
// (RETRIEVE_K = 6) while the composer and verifier only ever see `voices` (COMPOSE_VOICES = 5).
//
// Two consequences, both of them attribution claims the answer cannot honour:
//   · "across N traditions" counted a tradition present ONLY in the dropped 6th chunk;
//   · the sources preview showed that chunk's full text as a "source" the answer can never cite,
//     because the composer was never shown it.
//
// The 2026-08-18 fix made the displayed count case-normalized "the way the verifier counts" and
// stopped one layer short: it normalised the number but kept computing it over the wrong set.
//
// Asserted as SELF-CONSISTENCY rather than a hardcoded 5, so the test does not depend on
// selectVoices' internals and survives a change to either constant.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { teach } from '@/lib/teacher/teach';

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  compose: vi.fn().mockResolvedValue(JSON.stringify({ ok: true })),
  composeModel: 'test-model',
}));

vi.mock('@/lib/teacher/retrieve', () => ({
  // Six chunks, six DISTINCT traditions — so a count over retrieval and a count over voices
  // cannot coincide by luck. Built inline: vi.mock factories are hoisted above any helper.
  retrieveCommentary: vi.fn().mockResolvedValue(
    ['Reformed', 'Lutheran', 'Patristic', 'Anglican', 'Methodist', 'Orthodox'].map((tradition, i) => ({
      sourceId: `s${i + 1}`,
      content: `Commentary text number ${i + 1}, long enough to verify.`,
      score: 1 - i / 100,
      metadata: {
        author: `Author ${i + 1}`, sourceTitle: `Work ${i + 1}`, tradition,
        book: 'John', chapter: 1, verseStart: 1, verseEnd: 1,
      },
    })),
  ),
  retrieveSongVerse: vi.fn().mockResolvedValue([]),
  retrieveSermonLane: vi.fn().mockResolvedValue([]),
  retrieveTheologyLane: vi.fn().mockResolvedValue([]),
  retrieveHistorianLane: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/teacher/normalize-contract', () => ({ normalizeContract: (p: unknown) => p }));
vi.mock('@/verifier/v1', () => ({ verifyV1: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('@/lib/teacher/routing', () => ({ hasPassageCoverage: vi.fn().mockReturnValue(true) }));
vi.mock('../../bible/pericopes', () => ({ resolveIntent: () => ({ inject: [], floor: [] }) }));
vi.mock('../../bible/verse-id', () => ({ formatVerseId: () => 'John 1:1' }));

type Retrieved = { stage: string; traditions: number; sources: { tradition?: string }[] };

async function retrievedEvent(): Promise<{ ev: Retrieved; metaTraditions: number; metaVoices: number }> {
  const events: Retrieved[] = [];
  const { meta } = await teach('what is grace', {
    onEvent: (e: unknown) => {
      const ev = e as Retrieved;
      if (ev.stage === 'retrieved') events.push(ev);
    },
  });
  return { ev: events[0]!, metaTraditions: meta.traditions, metaVoices: meta.voices };
}

describe('D46 — the reader is told about the voices the answer can actually cite', () => {
  beforeEach(() => { process.env.DEEPINFRA_API_KEY = 'test-key'; });

  it('the sources preview lists exactly the composed voices, not the whole retrieval set', async () => {
    const { ev, metaVoices } = await retrievedEvent();
    expect(ev.sources).toHaveLength(metaVoices);
    expect(ev.sources.length, 'six chunks were retrieved; the composer saw fewer').toBeLessThan(6);
  });

  it('the announced tradition count matches the composed voices, not the dropped chunk', async () => {
    const { ev, metaVoices } = await retrievedEvent();
    expect(ev.traditions).toBe(metaVoices); // six distinct traditions in, so voices == traditions
    expect(ev.traditions, 'a tradition only in the dropped chunk must not be announced').toBeLessThan(6);
  });

  it('no previewed source is one the composer never saw', async () => {
    const { ev } = await retrievedEvent();
    const previewed = new Set(ev.sources.map((s) => s.tradition));
    expect(previewed.size).toBe(ev.traditions);
  });
});
