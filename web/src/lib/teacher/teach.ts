import 'server-only';
import type { TeacherResponse } from '@/contract/types';
import type { Violation } from '@/verifier/types';
import { verifyV1 } from '@/verifier/v1';
import { embedQuery, compose } from './deepinfra';
import { retrieveCommentary, type RetrievedChunk } from './retrieve';
import { buildCorpusLookup } from './corpus';
import { buildSystemPrompt, buildUserPrompt } from './prompt';

export type TeacherResult =
  | { kind: 'composed'; response: TeacherResponse; retrieval: RetrievedChunk[] }
  | { kind: 'fallback'; retrieval: RetrievedChunk[]; violations: Violation[] }
  | { kind: 'empty'; reason: string };

const MAX_RETRIES = 2;

// Full teacher pipeline: retrieve → compose → verify → retry-with-feedback →
// fallback. The verifier gates every composed answer; a failed generation is
// never returned as `composed`. Callers render `fallback` as raw retrieval.
export async function teach(query: string): Promise<TeacherResult> {
  const queryVec = await embedQuery(query);
  const retrieval = await retrieveCommentary(queryVec, 6);
  if (retrieval.length === 0) {
    return { kind: 'empty', reason: 'No relevant sources found for this question.' };
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, retrieval);
  const corpusLookup = buildCorpusLookup(retrieval);
  const retrievalContext = {
    sectionIds: retrieval.map((_, i) => i + 1),
    traditions: [...new Set(retrieval.map((r) => r.metadata.tradition ?? 'unknown'))],
  };

  let lastViolations: Violation[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n--- PREVIOUS ATTEMPT REJECTED ---\nViolations found:\n${lastViolations
            .map((v) => `- [${v.check}] ${v.message}`)
            .join('\n')}\n\nFix these violations and respond again with valid JSON.`;

    let raw: string;
    try {
      raw = await compose(systemPrompt, prompt);
    } catch (e) {
      lastViolations = [{ check: 'llm_error', message: (e as Error).message }];
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
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
