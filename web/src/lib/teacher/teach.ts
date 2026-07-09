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

// A safe-to-stream preview of a retrieved source. This is CORPUS text (never
// model output), so it can be shown to the user before/while composing.
export interface SourcePreview {
  sourceId: string;
  author: string;
  sourceTitle: string;
  tradition: string | null;
  content: string;
  score: number;
}

// Progress events emitted as the pipeline runs. The ONLY payloads that carry
// text to the client are `retrieved` (corpus) and the final `done` result
// (verifier-passed for `composed`). Raw model output is never emitted.
export type TeacherEvent =
  | { stage: 'retrieving' }
  | { stage: 'retrieved'; sources: SourcePreview[]; traditions: number }
  | { stage: 'composing'; attempt: number }
  | { stage: 'verifying'; attempt: number }
  | { stage: 'rejected'; attempt: number }
  | { stage: 'done'; result: TeacherResult };

const MAX_RETRIES = 2;

// Full teacher pipeline: retrieve → compose → verify → retry-with-feedback →
// fallback. The verifier gates every composed answer; a failed generation is
// never returned (or emitted) as `composed`. `onEvent` streams pipeline STAGES
// (not tokens): callers render progress + the safe retrieved sources during the
// wait, then the verified result on `done`.
export async function teach(
  query: string,
  opts: { onEvent?: (e: TeacherEvent) => void } = {},
): Promise<TeacherResult> {
  const emit = opts.onEvent ?? (() => {});
  const finish = (result: TeacherResult): TeacherResult => {
    emit({ stage: 'done', result });
    return result;
  };

  emit({ stage: 'retrieving' });
  const queryVec = await embedQuery(query);
  const retrieval = await retrieveCommentary(queryVec, 6);
  if (retrieval.length === 0) {
    return finish({ kind: 'empty', reason: 'No relevant sources found for this question.' });
  }

  const traditions = new Set(retrieval.map((r) => r.metadata.tradition ?? 'unknown'));
  emit({
    stage: 'retrieved',
    traditions: traditions.size,
    sources: retrieval.map((r) => ({
      sourceId: r.sourceId,
      author: r.metadata.author,
      sourceTitle: r.metadata.sourceTitle,
      tradition: r.metadata.tradition,
      content: r.content,
      score: r.score,
    })),
  });

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, retrieval);
  const corpusLookup = buildCorpusLookup(retrieval);
  const retrievalContext = {
    sectionIds: retrieval.map((_, i) => i + 1),
    traditions: [...traditions],
  };

  let lastViolations: Violation[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) emit({ stage: 'rejected', attempt: attempt - 1 });
    emit({ stage: 'composing', attempt });

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

    // The verifier runs server-side here, BEFORE any `done` event is emitted.
    emit({ stage: 'verifying', attempt });
    const result = await verifyV1(parsed, corpusLookup, retrievalContext);
    if (result.ok) {
      return finish({ kind: 'composed', response: parsed as TeacherResponse, retrieval });
    }
    lastViolations = result.violations;
  }

  return finish({ kind: 'fallback', retrieval, violations: lastViolations });
}
