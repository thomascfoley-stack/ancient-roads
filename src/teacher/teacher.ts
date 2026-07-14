import type { TeacherResponse } from '../contract/types';
import type { RankedRow } from '../retrieval/types';
import type { CorpusLookup, RetrievalContext, Violation } from '../verifier/types';
import { verifyV1 } from '../verifier/v1';
import { resolveIntent } from '../bible/pericopes';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import type { TeacherResult } from './types';

export interface TeacherConfig {
  retrieve: (query: string) => Promise<RankedRow[]>;
  generate: (userPrompt: string, systemPrompt: string) => Promise<string>;
  corpusLookup: CorpusLookup;
  maxRetries?: number;
}

export async function teach(query: string, config: TeacherConfig): Promise<TeacherResult> {
  const maxRetries = config.maxRetries ?? 2;

  const retrieval = await config.retrieve(query);
  if (retrieval.length === 0) {
    return { kind: 'empty', reason: 'No relevant sources found for this query.' };
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, retrieval);

  const retrievalContext: RetrievalContext = {
    sectionIds: retrieval.map((_, i) => i + 1),
    traditions: [...new Set(retrieval.map((r) => r.metadata.tradition ?? 'unknown'))],
    // Verse ranges the query itself named — the passages_grounded screen treats these
    // (plus any voice-block anchor) as the only legitimate grounds for a passage.
    queryRanges: resolveIntent(query).inject,
  };

  const corpusLookup = buildRetrievalCorpusLookup(retrieval);
  let lastViolations: Violation[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n--- PREVIOUS ATTEMPT REJECTED ---\nViolations found:\n${lastViolations.map((v) => `- [${v.check}] ${v.message}`).join('\n')}\n\nFix these violations and respond again with valid JSON.`;

    let raw: string;
    try {
      raw = await config.generate(prompt, systemPrompt);
    } catch (e) {
      lastViolations = [{ check: 'llm_error', message: (e as Error).message }];
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (process.env.DEBUG) console.error('RAW LLM OUTPUT:\n', raw.slice(0, 500));
      lastViolations = [{ check: 'json_parse', message: 'Response is not valid JSON' }];
      continue;
    }

    const result = await verifyV1(parsed, corpusLookup, retrievalContext);
    if (result.ok) {
      return { kind: 'composed', response: parsed as TeacherResponse, retrieval };
    }

    lastViolations = result.violations;
  }

  return { kind: 'fallback', retrieval, violations: lastViolations };
}

function buildRetrievalCorpusLookup(retrieval: RankedRow[]): CorpusLookup {
  const sections = new Map(
    retrieval.map((r, i) => {
      const id = i + 1;
      return [
        `corpus:${id}`,
        {
          id,
          body: r.content,
          origin: 'corpus' as const,
          source: {
            id,
            author: r.metadata.author,
            title: r.metadata.sourceTitle,
            tradition: r.metadata.tradition ?? 'unknown',
          },
        },
      ];
    }),
  );

  return {
    async getSection(sectionId, origin) {
      return sections.get(`${origin}:${sectionId}`) ?? null;
    },
    async getSource(sourceId) {
      const s = sections.get(`corpus:${sourceId}`);
      return s ? { id: s.id, author: s.source.author, title: s.source.title } : null;
    },
    async getTranslation(slug) {
      if (slug === 'web') return { slug: 'web', isActive: true, licensedForDisplay: true };
      return null;
    },
    async verseExists(_slug, _verseId) {
      return true;
    },
  };
}
