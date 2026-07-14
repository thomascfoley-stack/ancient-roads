import { describe, expect, it } from 'vitest';
import { teach } from '../src/teacher/teacher';
import type { RankedRow } from '../src/retrieval/types';

// Two retrieved commentary chunks. The teacher maps these to section_id 1 and 2
// and builds its verifier corpus lookup from them: a voice citing section_id 1
// must quote verbatim from CYRIL_BODY and attribute to Cyril, etc.
const CYRIL_BODY =
  'And the Word was made Flesh. He shows here that the Word became man, not by ' +
  'a change of nature, but by assuming our flesh, remaining what He was.';

const JFB_BODY =
  'was made flesh--BECAME MAN, in man\'s present frail, mortal condition, denoted ' +
  'by the word "flesh," yet not thereby ceasing to be what He was before.';

function retrieved(): RankedRow[] {
  return [
    {
      sourceId: 'commentary:jhn:1:14-14:Cyril of Alexandria',
      score: 0.93,
      content: CYRIL_BODY,
      metadata: {
        author: 'Cyril of Alexandria',
        year: 444,
        tradition: 'patristic',
        sourceTitle: 'Commentary on the Gospel of John',
        sourceUrl: null,
        verseId: 43001014,
        verseEnd: 43001014,
        model: 'BAAI/bge-large-en-v1.5',
      },
    },
    {
      sourceId: 'commentary:jhn:1:14-14:JFB',
      score: 0.79,
      content: JFB_BODY,
      metadata: {
        author: 'Jamieson, Fausset & Brown',
        year: 1871,
        tradition: 'presbyterian',
        sourceTitle: "Jamieson, Fausset & Brown's Commentary",
        sourceUrl: null,
        verseId: 43001014,
        verseEnd: 43001014,
        model: 'BAAI/bge-large-en-v1.5',
      },
    },
  ];
}

// A contract-valid response citing the two retrieved sources verbatim.
function validJson(): string {
  return JSON.stringify({
    contract_version: '1.1',
    teacher: 'qwen',
    blocks: [
      { type: 'framing', text: 'The following sources speak on the Word made flesh.' },
      {
        type: 'voice',
        section_id: 1,
        attribution: {
          author: 'Cyril of Alexandria',
          work: 'Commentary on the Gospel of John',
          tradition: 'patristic',
          origin: 'corpus',
        },
        quote: 'the Word became man, not by a change of nature, but by assuming our flesh',
        summary: 'Cyril states the Word became man by assuming flesh, not by a change of nature.',
        anchors: [{ start: 43001014, end: 43001014 }], // Cyril is commenting on John 1:14
      },
      {
        type: 'voice',
        section_id: 2,
        attribution: {
          author: 'Jamieson, Fausset & Brown',
          work: "Jamieson, Fausset & Brown's Commentary",
          tradition: 'presbyterian',
          origin: 'corpus',
        },
        quote: 'BECAME MAN, in man\'s present frail, mortal condition',
        summary: 'JFB gloss "made flesh" as becoming man in a frail, mortal condition.',
        anchors: [{ start: 43001014, end: 43001014 }], // JFB is commenting on John 1:14
      },
      { type: 'passages', items: [{ start: 43001014, end: 43001014, translation: 'web' }] },
    ],
  });
}

describe('teacher orchestration', () => {
  it('returns composed when generation passes the verifier', async () => {
    const result = await teach('the Word became flesh', {
      retrieve: async () => retrieved(),
      generate: async () => validJson(),
      corpusLookup: undefined as never,
    });
    expect(result.kind).toBe('composed');
    if (result.kind === 'composed') {
      expect(result.response.blocks.filter((b) => b.type === 'voice')).toHaveLength(2);
      expect(result.retrieval).toHaveLength(2);
    }
  });

  it('retries with violation feedback, then succeeds', async () => {
    let calls = 0;
    const prompts: string[] = [];
    const result = await teach('the Word became flesh', {
      retrieve: async () => retrieved(),
      generate: async (userPrompt) => {
        prompts.push(userPrompt);
        calls++;
        // First attempt: a fabricated quote the verifier rejects.
        if (calls === 1) {
          const bad = JSON.parse(validJson());
          bad.blocks[1].quote = 'Wine is the devil in a bottle and must be shunned';
          return JSON.stringify(bad);
        }
        return validJson();
      },
      corpusLookup: undefined as never,
    });
    expect(calls).toBe(2);
    expect(result.kind).toBe('composed');
    // The retry prompt must carry the violation feedback.
    expect(prompts[1]).toContain('PREVIOUS ATTEMPT REJECTED');
    expect(prompts[1]).toContain('quote_verbatim');
  });

  it('falls back to raw retrieval when all attempts fail', async () => {
    const result = await teach('the Word became flesh', {
      retrieve: async () => retrieved(),
      generate: async () => JSON.stringify({ contract_version: '1.1', teacher: 'q', blocks: [{ type: 'framing', text: 'x' }] }),
      corpusLookup: undefined as never,
      maxRetries: 1,
    });
    expect(result.kind).toBe('fallback');
    if (result.kind === 'fallback') {
      expect(result.retrieval).toHaveLength(2);
      expect(result.violations.length).toBeGreaterThan(0);
    }
  });

  it('treats non-JSON generation as a violation and falls back', async () => {
    const result = await teach('the Word became flesh', {
      retrieve: async () => retrieved(),
      generate: async () => 'I think the answer is that Jesus is both God and man.',
      corpusLookup: undefined as never,
      maxRetries: 1,
    });
    expect(result.kind).toBe('fallback');
    if (result.kind === 'fallback') {
      expect(result.violations.some((v) => v.check === 'json_parse')).toBe(true);
    }
  });

  it('accepts extractive voices with no summary (quotes over paraphrase)', async () => {
    const extractive = JSON.parse(validJson());
    // Strip summaries — the composer is extractive; summary is optional.
    for (const b of extractive.blocks) if (b.type === 'voice') delete b.summary;
    const result = await teach('the Word became flesh', {
      retrieve: async () => retrieved(),
      generate: async () => JSON.stringify(extractive),
      corpusLookup: undefined as never,
    });
    expect(result.kind).toBe('composed');
    if (result.kind === 'composed') {
      const voices = result.response.blocks.filter((b) => b.type === 'voice');
      expect(voices.every((v) => v.type === 'voice' && v.summary === undefined)).toBe(true);
    }
  });

  it('returns empty when retrieval finds nothing', async () => {
    const result = await teach('unrelated query', {
      retrieve: async () => [],
      generate: async () => {
        throw new Error('generate should not be called when retrieval is empty');
      },
      corpusLookup: undefined as never,
    });
    expect(result.kind).toBe('empty');
  });
});
